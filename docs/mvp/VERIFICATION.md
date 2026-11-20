# Reproducible technical MVP verification

From the `elnor` command directory, run:

```sh
npm run verify:mvp
```

The default is the [Docker/Xvfb headless launcher](HEADLESS-VERIFICATION.md).
`verify:headless` is an alias for that same launcher. Neither opens a window on
the host monitor or falls back to the desktop if Docker fails. Inside the
container, the platform runner executes these existing commands serially:

1. `npm run check`: check the four original components.
2. `npm test`: run its existing pretest build and the complete Node regression suite.
3. `npm run test:editor`: run the fifteen native tasks in the persistent isolated
   VS Code development host, retaining Workspace Trust.

`npm run verify:windows` separately invokes the local platform runner and opens
the Windows editor. It is reserved for an explicit desktop-test request; it is
not an automatic follow-up to headless verification. The container invokes the
runner directly with its known npm executable, avoiding recursive Docker runs.

This is a technical regression gate for the implemented subset. It does not
rerun the historical real-browser pilot, measure performance, prove human DX or
declare the whole MVP/Surface v0.3 complete. The Node suite includes existing
HTTP and fake-DOM tests, which remain distinct from real-browser evidence.

## Evidence and failure behavior

Default invocations create `elnor/.elnor/headless/runs/run-*`, with the
headless report, image/container logs and copied gate/native records. The local
Windows runner retains `elnor/.elnor/mvp/verification-runs/run-*`. The nested
platform report has separate `check.log`, `node.log` and `editor.log` files. The
terminal reports phase progress and the report path. A report records its UUID,
start/finish times, exact commands, exit codes, per-phase outcomes and the native
evidence paths. Failed phases retain their logs and prevent later phases from
running. Overall success requires every phase to pass; an unfinished report
does not claim success.

The editor phase must create exactly one new native run during that phase.
Its report must match the current suite and host run UUID, include all fifteen
completed tasks, preserve fixture sources and establish enabled/granted trust
and completed host execution. Missing, partial, stale, malformed or ambiguous
evidence fails the gate even if a child process exits successfully. The native
launcher independently validates its own report before returning successfully.
This is completeness/correlation checking, not tamper-resistant attestation.

The gate rejects unknown arguments and has no skip flags. Individual commands
remain available for focused work; their results must not be described as a
complete gate. Run gates/native suites serially because they share generated
fixtures and the isolated editor profile. Interrupting or failing a gate does
not erase an earlier successful report, but that earlier report cannot satisfy
the new invocation.

## Headless scope

Check and the Node corpus run without a graphical interface, including the
HTTP, fake-DOM, real-worker and adapter/API-double cases. The Windows native
phase currently opens a real VS Code development window; it is automated but
not headless. Hiding that window would not turn it into a headless test.

The [official CI guide](https://code.visualstudio.com/api/working-with-extensions/continuous-integration)
uses Xvfb for native VS Code extension tests on headless Linux CI machines.
That is a virtual graphical display and a separate platform from Windows.
The [Docker/Xvfb command](HEADLESS-VERIFICATION.md), `npm run verify:headless`,
now runs this path without a window on the host monitor and has passed 394 Node
cases plus fifteen real native tasks. `verify:mvp` now uses that same headless
launcher by default. The separate `verify:windows` command retains its graphical
editor phase and must not be described as headless.

The headless gate opens its editor only in the container's virtual display;
the explicit Windows runner uses the desktop. A new/untrusted profile can require a human
trust decision; it never grants one automatically. See the
[native launcher contract](NATIVE-VALIDATION.md).

## Verification of the gate

Seven [orchestration regressions](../../tests/verify-mvp.test.mjs) use disposable
directories and synthetic native records to test ordering, failures/exceptions,
evidence freshness/completeness, trust checks, ambiguity and rejected skip flags.
These unit tests do not establish an actual native pass. The complete Node suite
now has 394 cases; real combined-run evidence is retained separately in the
verification directory above.

The first real combined run passed on 2026-11-11:
`verification-runs/run-D1aBqw/result.json`, UUID
`5f9c047b-017c-40fb-9a98-205a1a4700a2`. All three phases exited with code 0;
the Node log records 388/388 and its new native evidence is
`editor-runs/run-L6iiDm/result.json` plus `host.json`, with fifteen completed
tasks. The scripted the full command without delegating terminal commands
or trust actions to the person and without screen observation/control.

After the headless/clean-output corrections, Windows verification
`run-MLlMbg` passed 394/394 Node cases and fifteen native tasks in
`editor-runs/run-6Ew4Ce` on 2026-11-11. The matching Linux result is recorded in
the headless guide; neither platform result replaces the other.
