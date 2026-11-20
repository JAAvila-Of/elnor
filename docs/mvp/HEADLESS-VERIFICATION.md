# Linux headless verification

From `elnor`, run `npm run verify:mvp` (alias: `npm run verify:headless`).;
no VS Code window is opened on the Windows desktop. Docker's Linux engine must
be available. The command builds an isolated image and executes the full
technical gate: component check, Node suite and the same fifteen real native
editor tasks. Xvfb supplies a private virtual display, following the
[VS Code CI approach](https://code.visualstudio.com/api/working-with-extensions/continuous-integration).
This is Linux evidence, complementary to the separate Windows gate.
There is no desktop fallback. The visible Windows route is available only as
the explicit `npm run verify:windows` command. The final run before this default
was corrected was a Windows desktop run after the earlier successful Linux run;
it must not be described as headless.

## Environment

The Dockerfile pins the Node 24 Bookworm image digest and VS Code 1.145.3.
The runtime uses user `node` (UID 1000), `--init`, no network, no published ports,
no host source bind mounts, no added capabilities and no privileged mode.
Sources are copied into the image; the person's authoring workspace is untouched.
No host-wide package, extension or editor is installed. Xvfb uses its own
authorization cookie and does not listen on TCP.

No `--no-sandbox` flag is used. The reviewed Playwright seccomp profile enables
Chromium's required namespace operations while retaining an ERRNO default; see
[the documented sandbox configuration](https://playwright.dev/docs/docker).
It is applied only to this container, not to the Docker daemon globally.

Two project-specific Docker volumes persist: generated fixture/report state and
the container user's home. The home matters because this VS Code version stores
shared trust under `~/.vscode-shared`, outside `--user-data-dir`. The wrapper does
not copy or edit trust databases. A fresh persistent session waits for an actual
Workspace Trust event before starting its engine.

For setup, the regular Manage Workspace Trust UI ran through
Playwright DOM interaction inside Xvfb, trusting only the copied `editor-workspace`
fixtures already approved by the person. No parent folders were trusted, no
trust setting was disabled and no screen was captured. Subsequent runs reuse
that decision. A new or revoked profile still requires its corresponding scoped
decision; the launcher has no automatic grant or bypass. The image's pinned
Playwright CLI can attach to the optional container-local DevTools port for that
setup. No port or display is exposed to the host.

## Evidence

Host runs are retained in `elnor/.elnor/headless/runs/run-*`: image build log,
container log, copied gate logs/report, copied native logs/report and `host.json`,
plus the top-level headless result. Success requires exit code 0, all gate phases,
the full native contract and completed/enabled trust. Invalid or missing evidence
fails. Export paths are restricted to generated run directories. The wrapper
removes only its own container after exporting records; persistent volumes remain.
Run shared profiles/fixtures serially.

The first combined headless run passed on 2026-11-11 at `runs/run-JDMfhn`:
**394/394 Node cases, zero skips, and 15/15 native tasks**, with both check and
the container exiting successfully. Its runtime records user `node`, network
`none`, no privileged mode and no added capabilities. It required no new UI or
trust interaction. Node was v24.22.2; the VS Code 1.145.3 host used v24.22.1.
This does not rerun the historical real-browser UserEditor pilot or establish
human DX, security certification or performance benchmarks.
The separate Windows gate also passed 394/394 and fifteen native tasks after
these changes (`verification-runs/run-MLlMbg`, native `run-6Ew4Ce`).

That Windows run was visible and was the last run before the person corrected
the default workflow. After the correction, `npm run verify:mvp` itself passed
headless at `runs/run-Gh6oyI` on 2026-11-11: 394/394 Node, zero skips and fifteen
native tasks, with `platform: linux`, display Xvfb and exit code 0. No Windows
gate was launched during this correction. The preceding failed default attempt
`run-jjddOz` was retained; it lacked npm's executable path in the container's
direct entrypoint, now explicitly configured, and was never reported as a pass.

## Failures found and preserved

The initial clean Linux gate failed one old TS probe test. That probe expected
legacy component-name projection files, which survived in the Windows checkout
but are no longer generated. It now uses the checker's physical-source hashes
and origin-based resolution, with a regression in a clean temporary directory.
The existing task retains exact identity, rename and completion checks; no test
was skipped or removed.

The initial native launch failed because Docker's default seccomp blocked
Chromium namespaces. Its log was retained; the reviewed profile fixed startup
without disabling the sandbox. The initial Xvfb PID-1 readiness issue was resolved
using Docker's init process. A fresh untrusted development host also needed to
wait for trust rather than return prematurely from activation. Separate tests
cover that event and the new wrapper's isolation, exported paths and evidence.

## Third-party profile

`scripts/headless/seccomp_profile.json` is the unmodified
[Microsoft Playwright profile](https://github.com/microsoft/playwright/blob/main/utils/docker/seccomp_profile.json),
retrieved 2026-11-11, SHA-256
`cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`.
Its Apache 2.0 license is retained in `scripts/headless/PLAYWRIGHT-LICENSE`.
The wrapper rejects a changed profile hash until the reviewed configuration is
updated explicitly.
