# Native MVP validation

**Current retained baseline:** the scripted Linux/Xvfb headless gate at
`elnor/.elnor/headless/runs/run-4gbXg7` passed 463 Node cases and all fifteen
native tasks on 2026-11-11, with enabled trust and unchanged fixture sources.
It includes native unsaved-buffer formatting. See the
[readiness review](MVP-READINESS.md) for scope and remaining evidence gaps.

## Historical Windows evidence

All fifteen tasks passed on 2026-11-11 in VS Code 1.145.3 with Node v24.22.1,
including formatting and both disk-watcher tasks. The person launched the suite;
the review examined saved files without observing or controlling the screen.
Evidence: `elnor/.elnor/spikes/004/editor-runs/run-4UxeIa/result.json`, suite
`elnor-native-mvp-15-v1`, run ID `6af56817-1447-416d-8898-2777c57897cc`.
The report records trust, all fifteen completed checks and restored fixture
sources; `editor.log` records extension-host exit code 0. The Node baseline
at the persistent-launcher increment had 371 passing cases. This is bounded fixture evidence, not full project
support, broad performance validation or proof of exceptional human DX.

## Run the suite

The [combined verification gate](VERIFICATION.md), `npm run verify:mvp`
(alias `verify:headless`), includes this suite after check and Node tests in
Linux Docker/Xvfb. This is the default, run by the verification script, with no
host-monitor windows or desktop fallback. No preview server is needed.

### Explicit desktop-only alternative

Direct `npm run test:editor` remains available for an explicitly requested
desktop run. Run this alternative when validating the Windows editor host.

In a PowerShell terminal, run:

```powershell
Set-Location '.'
npm run test:editor
```

This command opens a separate VS Code Extension Development Host. It does not
capture the screen, install a global extension or modify normal editor settings.
If Workspace Trust is requested, review only the generated `editor-workspace`.
The launcher never grants trust or changes the security setting. Leave the
terminal running until it reports the result. No preview server is needed.

### Persistent launcher and trust

The former launcher used `--extensionTestsPath`. VS Code's
[storage implementation](https://github.com/microsoft/vscode/blob/main/src/vs/platform/storage/electron-main/storageMainService.ts)
selects in-memory storage during extension tests. Consequently, reusing the
`editor-profile` directory does not establish persistent trust across these test
runs. Repeated manual grants are an observed limitation of this launch mode,
not evidence that the person failed to trust the fixture previously.

The current launcher omits that flag and opens `Screen.eln` in a normal isolated
Extension Development Host. Surface activation schedules the same suite after
returning its API. This preserves normal application storage instead of the
test-mode in-memory store. A development-mode/environment guard restricts this
entry point to the exact fixture workspace, per-run report directory and UUID.
Ordinary activation never runs tests or quits the editor.

The suite refuses disabled Workspace Trust. It records `trustEnabled` and trust
state in `host.json`, discards only dirty fixture documents, closes its isolated
application and validates the current report/host records. The launcher runs the
authorized test route autonomously; if a profile has no trust decision, or trust is revoked,
the normal human decision may still be required. No code grants trust, rewrites
trust storage or disables the control. Run this shared fixture/profile serially.
See also the
[official testing guide](https://code.visualstudio.com/api/working-with-extensions/testing-extension#testing-workspace-trust-behavior).

Two consecutive scripted persistent runs passed all fifteen tasks on
2026-11-11 and exited successfully: `run-9wNeiy` and `run-gkPjp5`, under the same
`editor-runs` directory as the earlier result. Both have `launchMode: persistent`,
matching run UUIDs, `host.completed: true`, `trusted: true`, `trustEnabled: true`
and restored fixture sources. They required no request to the person to run a
command or interact with trust. No screen observation/control was used. This
establishes repeatability in the current isolated profile, not every machine or
future trust state.

The launcher resets ten generated fixtures under
`elnor/.elnor/spikes/004/editor-workspace`. Do not use that directory for
personal edits. The separate `mvp/authoring-workspace`, including the user's
edited counter, is not touched.

## What the new tasks establish

13. Request formatting for unsaved Surface text through the native provider,
    verify that requesting edits changes nothing, apply them and check the
    resulting source/diagnostics without saving.
14. Keep both TypeScript dependencies unopened, change the saved transitive
    interface from string to number and back, then wait for the real watcher
    and its automatically scheduled Surface diagnostics. Verify the exact error
    range and recovery.
15. Delete the directly imported TS module, verify its missing-module diagnostic,
    recreate it with a different type, then restore it and verify recovery.

Tasks 14 and 15 must observe a disk event and a publication at the current epoch.
They do not call the manual diagnostic-refresh hook after a disk mutation.
Mutated generated dependencies are restored even if a task fails. Original
fixture contents are checked before claiming success.

## Review the evidence

The terminal prints the run directory under
`elnor/.elnor/spikes/004/editor-runs/run-*`. Its `result.json` contains the
suite identifier, unique run ID, editor/Node versions, trust state, ordered task
records, timings and fixture-preservation result. `editor.log` contains editor
output. Persistent runs additionally retain `host.json` with start/finish times,
trust-control state and completion/error status. Keep failed results as evidence;
a failure is not a native pass.

The launcher requires a successful process exit and a report for this exact run
and suite, all fifteen completed task records, explicit trust, no recorded error
and restored fixture sources. A bare `passed: true`, an older twelve/thirteen-task
report or a missing report is insufficient. The report contract is a completeness
check, not tamper-resistant attestation. Timings are observations for this small
fixture, not a performance benchmark.

Five [Node report-validator tests](../../tests/editor-report.test.mjs) exercise
acceptance and rejection using synthetic report objects. They do not launch VS
Code and provide no native integration evidence. The native result above is
separate evidence from an actual Extension Development Host run.
Seven [persistent-host regressions](../../tests/persistent-editor-host.test.mjs)
separately cover development/workspace/report guards, run identity, one-shot
execution, enabled trust, failures, application exit and launch-mode mismatch.
