# Surface editor experiment

This is an unpackaged development extension for the Elnor Spike 004. It uses
native VS Code diagnostic, completion, definition, rename and formatting providers, backed
by the existing Surface engine in a persistent worker. It is not an LSP implementation or
a distributable extension. Keep it inside this repository: it imports
`../../src/language-service.mjs` and uses the project's local TypeScript dependency.

Surface analysis uses the [fixed TypeScript profile](../../docs/mvp/TYPESCRIPT-CONFIGURATION.md),
shared with the checker. It does not load `tsconfig.json`; VS Code's ordinary TS
extension may use different options for `.ts` diagnostics. Run `npm run config`
from `elnor` to inspect the profile. This does not change editor settings.

## Reproduce the editor experiment

To edit a Surface file with live diagnostics on Windows, start a VS Code
Extension Development Host with this extension loaded. From the project folder
that contains `elnor`:

```powershell
code --new-window --extensionDevelopmentPath="$PWD\elnor\editors\vscode" .
```

Open the `.eln` file in that window. The language indicator should show
**Surface**. Hover over an underline or open **Problems** with
`Ctrl+Shift+M` to read the diagnostic. The extension needs a workspace folder
and the repository's installed dependencies. An ordinary window without the
development extension loaded cannot show Surface diagnostics.

For an isolated exercise, open its own folder so the extension indexes that
folder's Surface files. Use the full extension path from the checkout and
open the specific file in the development window:

```powershell
$extension = Join-Path $PWD 'elnor\editors\vscode'
$workspace = 'H:\path\to\participant'
$file = Join-Path $workspace 'SubscribedRemoteTitles.eln'
code --new-window "--extensionDevelopmentPath=$extension" $workspace --goto "${file}:10"
```

Keep the edited file under the opened folder. If VS Code opens the folder in
Restricted Mode, diagnostics become available after you trust that exercise
folder and reload the window.

Install the root dependencies with `npm ci`, then run from the `elnor` folder:

```sh
npm run verify:mvp
```

The default command (alias `verify:headless`) runs the full gate in Linux
Docker/Xvfb with no host-monitor window. Its native evidence is separate from Windows; see the
[headless setup and retained results](../../docs/mvp/HEADLESS-VERIFICATION.md).
Only the explicit `npm run verify:windows` or focused `npm run test:editor`
opens the desktop editor on Windows; neither is an automatic fallback.

The direct desktop launcher uses an existing local VS Code executable. On Windows it checks
the normal per-user installation path; set `VSCODE_EXECUTABLE` to an absolute
executable path for a different installation. It downloads no editor, installs
no global extension and does not change the user's normal VS Code settings.
It now starts a persistent development host without `--extensionTestsPath`.
An isolated, guarded activation runs the same fifteen tasks and closes that
application after discarding dirty fixture buffers. Two consecutive autonomous
runs passed; see the [native validation record](../../docs/mvp/NATIVE-VALIDATION.md).

Fixtures, the separate editor profile, extension directory and per-run results
are stored under the local `.elnor/spikes/004` directory. The fixture
workspace is `editor-workspace`, containing generated `Badge.eln`, `Screen.eln`,
`Other.eln`, `AliasOrigin.eln`, `AliasConsumer.eln`, `TypeConsumer.eln` and
`Model.mts`, `DiskConsumer.eln`, `DiskModel.mts` and `DiskLeaf.mts` files. A temporary
`AliasView.eln` file symlink is created and unlinked during the alias tasks.
The ten source fixtures are reset on each run;
do not use that directory for other work. No project examples are edited.

When the test host opens in Restricted Mode, review its Workspace Trust panel
and trust **only `editor-workspace`** if you approve those fixtures. The suite
starts only after trust is granted. The
launcher never changes trust or adds trusted paths programmatically. VS Code's
former extension-test mode used temporary trust storage. The current persistent
launcher omits that mode; the approved isolated profile retains its trust
decision. New/revoked profiles may still need the normal human trust decision.

## What the test actually does

The test runner executes inside VS Code, through its real provider commands:

1. Complete `Badge la`, verify an Elnor-produced replacement span and apply it.
2. Introduce an unknown prop and verify its exact diagnostic range, then fix it
   without saving and wait for diagnostics to clear.
3. Navigate from a component use to the original `.eln` declaration.
4. Apply a three-file prop rename, including a consumer initially closed in the
   editor. Verify local references and both consumers.
5. Remove a closing brace, navigate during recovery, repair it, then break and
   repair a single-line UI string. Verify the component contract and an intact
   sibling reference without restarting the service.
6. Restart the worker, dispatch real diagnostics, service a host timer and edit
   before the old batch completes. Verify stale results are discarded and the
   unsaved renamed contract is replayed instead of disk contents.
7. Open distinct URI tabs through a file symlink, preserve divergent text, show
   a conflict diagnostic, block rename and reconcile the views explicitly.
8. Apply rename to both open alias URI documents and their consumer without saving.
9. Revert and close an alias tab, retain the surviving dirty view through restart,
   then reopen and reconcile the alias. Tab closure is observed separately from
   disposal of its potentially cached `TextDocument`.
10. Edit an imported TypeScript interface without saving, verify the exact Surface
    type diagnostic and recovery, and retain the dependency's disk source.
11. Navigate into unsaved TS text after a Unicode prefix and explicitly reject
    a rename that would edit its TypeScript declaration.
12. Change TS text during worker analysis, discard stale results, replay the dirty
    dependency after restart and restore saved types when its buffer is discarded.
13. Request formatting on an unsaved Surface buffer, verify the request itself
    changes nothing, then apply returned edits and check source/diagnostics.
    Passed in the 2026-11-11 fifteen-task native run.
14. Change a saved transitive TS interface that was never opened, observe a real
    watcher event and automatically published exact Surface error, then recover.
15. Delete/recreate the unopened direct TS module and verify missing-module,
    changed-type and restored diagnostics through the real watcher.
    Tasks 14 and 15 passed in that same native run.

It checks that all ten source fixtures retain their original disk contents after
restoring deliberate dependency mutations. A successful process exit alone is
insufficient: the launcher requires a current-suite/current-run `result.json`,
all fifteen task records, trust and fixture preservation as well as `passed: true`.
See the [manual validation guide](../../docs/mvp/NATIVE-VALIDATION.md).
Per-request and whole-task timings are recorded separately;
these are small-workspace observations, not a benchmark or cold-start metric.

## Scope and limits

The adapter now also registers a Surface document-formatting provider backed by
the [versioned formatter](../../docs/mvp/VERSIONED-FORMATTING.md). It returns
edits against the current unsaved buffer, refuses distinct open URI aliases and
does not save or change formatting settings. This provider has Node tests with
an API double/real worker; the twelve native tasks below predate it and do not
validate native formatting. The subsequent
[fifteen-task run](../../docs/mvp/NATIVE-VALIDATION.md) validates formatting and
watcher behavior in the bounded fixture. The operator launched it and the test harness
reviewed files without screen observation/control.

- Twelve tasks passed on Windows with VS Code 1.145.3 and its Node 24.22.1
  extension host, including the [alias follow-up](../../docs/spikes/004/EDITOR-ALIASES.md).
  The three additional TS-buffer tasks are documented in the
  [TypeScript buffer follow-up](../../docs/spikes/004/TYPE-BUFFERS.md).
- Only the first local workspace folder is handled. Restricted, virtual and
  remote workspace support has not been demonstrated.
- The adapter indexes `.eln` files, including initially closed consumers, and
  syncs open Surface and TypeScript buffers. Saved changes to never-opened TS
  dependencies now have [Node/API-double coverage](../../docs/mvp/DISK-INVALIDATION.md);
  native watcher validation passed on 2026-11-11 in the bounded fixture. Full project discovery
  remains unimplemented. This is a small-workspace strategy.
- Diagnostics use a 100 ms debounce and refresh open Surface documents. TS and
  Surface analysis run in a persistent worker. Version tokens guard all responses;
  source edits clear markers pending fresh analysis. Cancellation drops work or
  responses but cannot interrupt a running synchronous TS call.
- A failed worker rejects its pending requests. A new request replays current
  sources, including unsaved changes; old requests are not retried automatically.
  See the [asynchronous experiment](../../docs/spikes/004/ASYNC.md).
- A rename snapshot is checked again after asynchronously opening its targets.
  The editor applies edits; the adapter does not mutate the service or save
  files before real document-change events.
- Rename targets must belong to the caller's versioned document store. An import
  discovered only from disk in the worker is not sufficient authority to edit it.
- Saved aliases are indexed once per physical source. Distinct open URI views
  retain their text; divergence is diagnosed and requires reconciliation before
  semantic requests. Rename expands to the reconciled open views. Clean cached
  models are released when their last tab closes; dirty tabless targets remain.
- Generic word completion is not accepted as evidence: Elnor suggestions carry
  `detail: "Elnor Surface"`, which the test explicitly checks.
- Arbitrary malformed input, complete symbol capture safety, syntax highlighting,
  formatting, auto-imports and exceptional human DX are not established.

See [the experiment results](../../docs/spikes/004/RESULTS.md) for evidence and
the remaining technical uncertainty.
