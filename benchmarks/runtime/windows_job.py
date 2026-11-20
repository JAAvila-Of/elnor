"""Windows-only process containment for diagnostic benchmark runs (no Rust work)."""
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import subprocess
import time
import uuid
import traceback

import win32api
import win32con
import win32event
import win32job
import win32process


class CpuRate(ctypes.Structure):
    _fields_ = [("flags", wintypes.DWORD), ("rate", wintypes.DWORD)]


kernel = ctypes.WinDLL("kernel32", use_last_error=True)
kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
kernel.QueryInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p]


def cpu_rate(job, rate=None):
    value = CpuRate(5, rate or 0)  # ENABLE | HARD_CAP, rate in hundredths of a percent.
    if rate is None:
        ok = kernel.QueryInformationJobObject(int(job), 15, ctypes.byref(value), ctypes.sizeof(value), None)
    else:
        ok = kernel.SetInformationJobObject(int(job), 15, ctypes.byref(value), ctypes.sizeof(value))
    if not ok:
        raise ctypes.WinError(ctypes.get_last_error())
    return {"flags": value.flags, "rate": value.rate}


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2), encoding="utf-8")
    temporary.replace(path)


def contained(command, directory, *, timeout=45, idle_timeout=12, memory_mib=768,
              cpu_percent=10, max_processes=24, min_free_mib=4096, cwd=None):
    """Assign a suspended child, verify limits, then resume; never adopt other PIDs."""
    if not (0 < timeout <= 60 and 0 < idle_timeout <= timeout and 32 <= memory_mib <= 1024
            and 1 <= cpu_percent <= 10 and 1 <= max_processes <= 24):
        raise ValueError("Diagnostic limits exceed the allowed envelope")
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=False)
    report = {"kind": "elnor-contained-diagnostic-v1", "command": command,
              "cwd": str(Path(cwd).resolve() if cwd else directory),
              "startedAt": time.time(), "passed": False, "limitsVerified": False}
    job = process = thread = output = mutex = None
    held = False
    started = time.monotonic()
    try:
        mutex = win32event.CreateMutex(None, False, 'Local\\ElnorDiagnostic-v1')
        acquired = win32event.WaitForSingleObject(mutex, 0)
        if acquired not in (win32event.WAIT_OBJECT_0, win32event.WAIT_ABANDONED):
            raise RuntimeError('Another Elnor diagnostic is active; child was not launched')
        held = True
        if win32api.GlobalMemoryStatusEx()["AvailPhys"] < min_free_mib * 1024**2:
            raise RuntimeError("Insufficient host free memory; child was not launched")
        job = win32job.CreateJobObject(None, 'Local\\ElnorDiagnostic-' + uuid.uuid4().hex)
        limits = win32job.QueryInformationJobObject(job, win32job.JobObjectExtendedLimitInformation)
        basic = limits["BasicLimitInformation"]
        basic["LimitFlags"] = (win32job.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                               | win32job.JOB_OBJECT_LIMIT_JOB_MEMORY
                               | win32job.JOB_OBJECT_LIMIT_ACTIVE_PROCESS)
        basic["ActiveProcessLimit"] = max_processes
        limits["JobMemoryLimit"] = memory_mib * 1024**2
        win32job.SetInformationJobObject(job, win32job.JobObjectExtendedLimitInformation, limits)
        cpu_rate(job, cpu_percent * 100)
        actual = win32job.QueryInformationJobObject(job, win32job.JobObjectExtendedLimitInformation)
        actual_cpu = cpu_rate(job)
        if (actual["BasicLimitInformation"]["LimitFlags"] != basic["LimitFlags"]
                or actual["JobMemoryLimit"] != limits["JobMemoryLimit"]
                or actual["BasicLimitInformation"]["ActiveProcessLimit"] != max_processes
                or actual_cpu != {"flags": 5, "rate": cpu_percent * 100}):
            raise RuntimeError("Kernel limit readback did not match the requested policy")
        report.update(limitsVerified=True, limits={"cpuPercent": cpu_percent,
                      "jobCommitBytes": actual["JobMemoryLimit"], "maxProcesses": max_processes,
                      "timeoutSeconds": timeout, "idleTimeoutSeconds": idle_timeout,
                      "minHostFreeMiB": min_free_mib, "killOnOwnerClose": True})
        atomic_json(directory / "supervisor.json", report)
        # The job owner handle is not inheritable. No shared browser session is used.
        import win32file
        import pywintypes
        security = pywintypes.SECURITY_ATTRIBUTES()
        security.bInheritHandle = True
        output = win32file.CreateFile(str(directory / "worker.log"), win32con.GENERIC_WRITE,
                                     win32con.FILE_SHARE_READ, security, win32con.CREATE_NEW, 0, None)
        startup = win32process.STARTUPINFO()
        startup.dwFlags = win32con.STARTF_USESTDHANDLES
        startup.hStdOutput = startup.hStdError = output
        startup.hStdInput = None
        process, thread, pid, _ = win32process.CreateProcess(
            command[0], subprocess.list2cmdline(command), None, None, True,
            win32con.CREATE_SUSPENDED | win32con.CREATE_NO_WINDOW | 0x00004000,
            dict(os.environ), report['cwd'], startup)
        try:
            win32job.AssignProcessToJobObject(job, process)
        except BaseException:
            win32api.TerminateProcess(process, 125)  # Still suspended and exclusively ours.
            raise
        report["pid"] = pid
        atomic_json(directory / "supervisor.json", report)
        win32process.ResumeThread(thread)
        thread.Close()
        thread = None
        last_progress = time.monotonic()
        last_size = 0
        with (directory / "telemetry.jsonl").open("x", encoding="utf-8", buffering=1) as log:
            while True:
                ended = win32event.WaitForSingleObject(process, 500) == win32event.WAIT_OBJECT_0
                accounting = win32job.QueryInformationJobObject(job, win32job.JobObjectBasicAccountingInformation)
                usage = win32job.QueryInformationJobObject(job, win32job.JobObjectExtendedLimitInformation)
                host = win32api.GlobalMemoryStatusEx()
                elapsed = time.monotonic() - started
                log.write(json.dumps({"elapsedSeconds": elapsed, "hostFreeBytes": host["AvailPhys"],
                          "hostCommitAvailableBytes": host["AvailPageFile"],
                          "jobPeakCommitBytes": usage["PeakJobMemoryUsed"],
                          "activeProcesses": accounting["ActiveProcesses"],
                          "jobCpuSeconds": (accounting["TotalKernelTime"] + accounting["TotalUserTime"]) / 1e7}) + "\n")
                if ended:
                    report["exitCode"] = win32process.GetExitCodeProcess(process)
                    break
                progress = directory / "progress.jsonl"
                size = progress.stat().st_size if progress.exists() else 0
                if size != last_size:
                    last_size, last_progress = size, time.monotonic()
                reason = ("host-memory-pressure" if host["AvailPhys"] < min_free_mib * 1024**2
                          else "wall-timeout" if elapsed > timeout
                          else "progress-timeout" if time.monotonic() - last_progress > idle_timeout else None)
                if reason:
                    report["terminationReason"] = reason
                    break
        report["passed"] = report.get("exitCode") == 0 and not report.get("terminationReason")
    except BaseException as error:
        report["error"] = traceback.format_exc()
        report["passed"] = False
    finally:
        if job is not None:
            try:
                win32job.TerminateJobObject(job, 124)
                deadline = time.monotonic() + 5
                while True:
                    count = win32job.QueryInformationJobObject(job, win32job.JobObjectBasicAccountingInformation)["ActiveProcesses"]
                    if count == 0 or time.monotonic() >= deadline:
                        break
                    time.sleep(.05)
                report["activeProcessesAfterCleanup"] = count
                if count:
                    report["passed"] = False
            except BaseException as error:
                report.update(passed=False, cleanupError=str(error))
        for handle in (thread, process, output, job):
            if handle is not None:
                handle.Close()
        if held:
            win32event.ReleaseMutex(mutex)
        if mutex is not None:
            mutex.Close()
        report.update(finishedAt=time.time(), elapsedSeconds=time.monotonic() - started)
        atomic_json(directory / "supervisor.json", report)
    return report
