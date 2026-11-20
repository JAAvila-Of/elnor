"""Fault injection for job limits; no browser, build, or Rust runtime is started."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

import win32api
import win32con
import win32event

from windows_job import contained


def exited(pid):
    try:
        handle = win32api.OpenProcess(win32con.SYNCHRONIZE, False, pid)
    except Exception as error:
        if getattr(error, "winerror", None) == 87:
            return True
        raise
    try:
        return win32event.WaitForSingleObject(handle, 2000) == win32event.WAIT_OBJECT_0
    finally:
        handle.Close()


class ContainmentTests(unittest.TestCase):
    def test_wall_deadline_cannot_be_extended_by_progress(self):
        with tempfile.TemporaryDirectory(prefix="elnor-job-test-") as root:
            root = Path(root)
            probe = root / "probe.py"
            probe.write_text("from pathlib import Path\nimport time\n"
                             "while True:\n with Path('progress.jsonl').open('a') as f: f.write('{}\\n')\n time.sleep(.1)\n", encoding="utf-8")
            report = contained([sys.executable, str(probe)], root / "job", timeout=2, idle_timeout=2)
            self.assertEqual(report.get("terminationReason"), "wall-timeout", report)
            self.assertFalse(report["passed"])
            self.assertEqual(report["activeProcessesAfterCleanup"], 0)

    def test_watchdog_kills_descendants_and_preserves_unrelated_process(self):
        with tempfile.TemporaryDirectory(prefix="elnor-job-test-") as root:
            root = Path(root)
            sentinel = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(20)"], creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                probe = root / "probe.py"
                probe.write_text("import subprocess,sys,time,json\nfrom pathlib import Path\n"
                    "child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(20)'])\n"
                    "Path('descendant.json').write_text(json.dumps({'pid':child.pid}))\ntime.sleep(20)\n", encoding="utf-8")
                report = contained([sys.executable, str(probe)], root / "job", timeout=5, idle_timeout=2)
                self.assertTrue(report["limitsVerified"], report)
                self.assertEqual(report.get("terminationReason"), "progress-timeout", report)
                self.assertFalse(report["passed"])
                self.assertEqual(report["activeProcessesAfterCleanup"], 0)
                child = json.loads((root / "job/descendant.json").read_text())["pid"]
                self.assertTrue(exited(child))
                self.assertIsNone(sentinel.poll())
                self.assertTrue((root / "job/telemetry.jsonl").stat().st_size > 0)
            finally:
                sentinel.terminate()
                sentinel.wait(timeout=5)

    def test_kernel_refuses_allocation_above_job_memory_limit(self):
        with tempfile.TemporaryDirectory(prefix="elnor-job-test-") as root:
            root = Path(root)
            probe = root / "probe.py"
            probe.write_text("from pathlib import Path\ntry:\n x=bytearray(96*1024**2)\n"
                             "except MemoryError:\n Path('refused').write_text('yes')\n"
                             "else:\n raise RuntimeError('allocation escaped the limit')\n", encoding="utf-8")
            report = contained([sys.executable, str(probe)], root / "job", timeout=8, idle_timeout=5, memory_mib=64)
            self.assertTrue(report["passed"], report)
            self.assertEqual((root / "job/refused").read_text(), "yes")
            self.assertEqual(report["activeProcessesAfterCleanup"], 0)

    def test_owner_death_closes_job_and_terminates_child(self):
        with tempfile.TemporaryDirectory(prefix="elnor-job-test-") as root:
            root = Path(root)
            supervisor = root / "supervisor.py"
            supervisor.write_text("import sys\nfrom pathlib import Path\n"
                + "sys.path.insert(0," + repr(str(Path(__file__).resolve().parent)) + ")\n"
                + "from windows_job import contained\n"
                + "contained([sys.executable,'-c','import time;time.sleep(20)'],Path(sys.argv[1]),timeout=15,idle_timeout=12)\n", encoding="utf-8")
            owner = subprocess.Popen([sys.executable, str(supervisor), str(root / "job")], creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                deadline = time.monotonic() + 8
                child = None
                while time.monotonic() < deadline:
                    try:
                        child = json.loads((root / "job/supervisor.json").read_text())["pid"]
                        break
                    except (OSError, ValueError, KeyError):
                        time.sleep(.05)
                self.assertIsNotNone(child)
                refused = contained([sys.executable, '-c', 'raise RuntimeError("must not start")'], root / 'overlap')
                self.assertFalse(refused['passed'])
                self.assertFalse(refused['limitsVerified'])
                self.assertNotIn('pid', refused)
                self.assertIn('Another Elnor diagnostic is active', refused['error'])
                owner.kill()
                owner.wait(timeout=5)
                self.assertTrue(exited(child))
            finally:
                if owner.poll() is None:
                    owner.kill()
                    owner.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()
