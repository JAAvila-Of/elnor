# A first Surface authoring exercise

**Purpose:** edit a small application and understand how source, checking,
generation and preview relate. The first task intentionally changes the counter
from increments of one to increments of two. Opening the initial preview alone
does not perform that change.

The exercise uses the existing compiler/runtime and a fixed local helper. It
does not generate a general project, install an extension, launch an editor or
browser, or inspect a screen. The original examples remain separate.

## Which folder does what?

| Folder | Use |
|---|---|
| `elnor` | Run the npm commands here; it contains the package.json with the `authoring` script |
| `elnor/.elnor/mvp/authoring-workspace` | Edit the exercise's `Counter.eln`, `App.eln` and `style.css` here |
| `elnor/examples/authoring` | Starter templates copied on first setup; later template edits do not update an existing exercise |
| The workspace's `.elnor-authoring-output` | Generated preview/check files; edit source files above rather than generated modules |

The helper uses the repository root. Its
output prints the absolute source and command directories. A new checkout can
use a different root; `--workspace <directory>` selects another exercise folder.

## Start the preview: terminal A

Open PowerShell. For the checkout used in this exercise:

```powershell
Set-Location '.'
npm run authoring -- setup
npm run authoring -- preview
```

Use your checkout's `elnor` path if different. Dependencies must already be
installed. Setup creates missing starter files and preserves existing files and
edits; there is no automatic reset. Preview checks and builds the two components,
then serves them locally at `http://127.0.0.1:4184` by default. Open the URL
yourself. Keep terminal A running; `Ctrl+C` stops its server. A different `PORT`
can be supplied through the normal environment if needed.
The URL printed by the running server is authoritative. The initial exercise
used 4190, which the [Fetch port-blocking table](https://fetch.spec.whatwg.org/#port-blocking)
lists as blocked; new sessions use 4184 without
changing any browser security setting. An already running manual session is not
restarted by installing this helper change.

Initially, clicking **Increment** advances `Clicks` and `Last event` by one.
`Counter` changes its local state and emits the new value. `App` handles that
event and stores the latest value. This initial behavior is expected.

## Task 1: change the behavior, then rebuild

Open the editable workspace's `Counter.eln` and change:

```typescript
count++;
```

to:

```typescript
count += 2;
```

Save the file. Open a **second PowerShell terminal**, terminal B:

```powershell
Set-Location '.'
npm run authoring -- check
npm run authoring -- build
```

Refresh the browser page. Its counter resets to zero on reload; click
**Increment** and expect `Clicks: 2` and `Last event: 2`, then 4, then 6.
The server reads generated files on each request; no restart is required after
a successful build. There is no HMR or automatic rebuild/reload.

After rebuilding with this helper revision, the preview also displays its source
folder and last successful build time. This helps identify which copy is active.

If it still increments by one, the preview may be serving an earlier build.

With the updated helper, reloading the page also displays a
[build-status notice](PREVIEW-BUILD-STATUS.md). It lists saved Surface/CSS inputs
that are not in the preview and reminds you to build, then reload. A server
started before this helper update must be restarted to show the notice. The
notice does not rebuild automatically or read unsaved editor text.

For the saved-input details in the terminal, run this in terminal B:

```powershell
npm run authoring -- status
```

The result lists the absolute editable files and compares saved Surface/CSS
inputs with the last successful build:

- `no-build-record`: no compatible build record exists; build the exercise.
- `saved-files-changed`: the listed saved inputs differ or are missing; check
  and build again after fixing them.
- `matches-last-successful-build`: those saved inputs match the recorded build.
  Confirm the intended source actually contains `count += 2;`, save any editor
  buffer and refresh the correct preview URL.

Status reads disk, not an editor's unsaved text. It does not establish freshness
for all transitive TypeScript dependencies or the browser's current DOM. A prior
build made with an earlier helper may have no build record even while its
preview is still available.

## Task 2: introduce and repair a checked error

In the editable `App.eln`, replace `Counter label="Clicks"` with
`Counter missing="Clicks"`. Save and run `npm run authoring -- check` from
terminal B. Expect a `TS2353` diagnostic naming the original `App.eln` and line.
The CLI's position detail is its existing line-oriented contract.
The [terminal recovery output](AUTHORING-ERROR-RECOVERY.md) now includes that
original source line, says that check did not rebuild the preview and explains
the save/build/reload recovery steps. A failed build distinguishes retained
preview files from an exercise that has never built successfully.

Restore `label`, save, check, build and refresh. A successful build is required
to update the preview. If a source has errors, build fails and leaves the last
successful preview in place; seeing the old page does not mean the error was
accepted or the build succeeded.

## Feedback to record

Describe what happened in text; screenshots are unnecessary:

1. Could you locate the command folder and editable files without assistance?
2. Did the difference between saving, checking, building and refreshing make
   sense? Which step felt unnecessary or easy to miss?
3. Was it clear how `emit.changed` in Counter reaches `record` in App?
4. Could you locate and repair the deliberate prop error from its diagnostic?
5. What formatting would you expect the editor to handle automatically?

An assisted successful task is useful feedback, but not proof of exceptional DX
or independent discoverability. The [feedback log](AUTHORING-FEEDBACK.md)
separates observations from assumptions. The [formatter contract](FORMATTER-CONTRACT.md)
now has a [first indentation implementation](FORMATTER.md) with check/print
commands; it does not save files or format the editor automatically.

## Helper limits

The helper reads the App entry and its Surface imports, checks with the existing
TypeScript-backed checker, and emits using the existing graph emitter. It does
not evaluate user initializers during checking. The generated directory must be
owned by this exercise; source files are never replaced by setup or build.
Existing generated files are not comprehensively garbage-collected and writes
are not an atomic filesystem transaction. The helper is for this trusted local
exercise, not a filesystem sandbox or production project lifecycle.

Automated coverage in `tests/authoring-session.test.mjs` checks preservation,
edited behavior/events/disposal with the fake DOM, original source diagnostics,
failure retaining a previous preview, non-execution during checking, saved-input
status, CLI paths with spaces and real HTTP/CSP serving. No new browser/editor
automation is needed to conduct the person's authoring exercise.
