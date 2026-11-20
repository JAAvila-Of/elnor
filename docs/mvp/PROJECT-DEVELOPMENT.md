# Local development command

From the `elnor` command directory:

```sh
npm run dev:project -- path/to/App.eln --out path/to/generated
```

This command checks/builds the saved entry, starts the local preview and rebuilds
when watched source content changes. Open the preview once. A successful source
build then reloads the page automatically. It opens no browser or editor. The default URL is
`http://127.0.0.1:4185`; `--port <number>` selects another port and `--port 0`
prints an available port. Stop the command to stop development. No source files
are written; owned output generations and internal checker scratch are retained.

Optional inputs are explicit, as in [preview:project](PROJECT-PREVIEW.md):

```sh
npm run dev:project -- src/App.eln --out generated --watch-dir . --props preview-props.json --css preview.css
```

`--out` is required. Relative paths resolve from the command directory. JSON
props default to `{}`. The later [input-revision increment](PREVIEW-INPUTS.md)
now rereads the selected props/CSS on navigation. Saved CSS-only changes also
update the open page in place. Save props and reload without restarting.
Invalid pairs retain the last valid pair with a notice. Changing the
selected paths still requires restart. There are no root event mocks, inferred
assets. [Type-checked preview props](TYPED-PREVIEW-PROPS.md) now reuse the last
successful development build's checker snapshot, with typed field diagnostics
and fallback revalidation when a new build changes the contract.

## Watch scope

The watch scope defaults to the physical entry's parent directory. Select a
broader existing directory with `--watch-dir` when local imports live beside that
directory. The scope must contain the entry. Both the terminal and page show it.
Only saved `.eln`, `.ts`, `.mts`, `.js`, `.mjs` files (including declarations) and
`package.json` within this tree trigger builds. The subsequent
[observed-dependency increment](OBSERVED-DEPENDENCIES.md) additionally watches
concrete local paths read/searched by the checker and module planner, even
outside this tree. Other JSON, CSS, editor buffers, unobserved imports,
`node_modules` and `.git` remain outside the contract. This does not prove
complete project freshness. The explicit stylesheet is refreshed separately from
source builds. The fixed TS profile still ignores `tsconfig.json`.

The controller hashes paths/content every 500 ms and requires two consecutive
matching changed snapshots before building. It detects additions, deletion,
recreation, same-mtime edits and ordinary atomic-save replacement. A burst of
changing snapshots is coalesced; no build is launched for each intermediate
poll. Builds run serially and synchronously, so a long build delays polling and
HTTP responses. Edits made during a build are detected by subsequent scans.
There is no whole-project frozen input transaction or latency guarantee.

Output and explicitly owned checker scratch subtrees are excluded, preventing
rebuild loops. Linked paths inside the scope are refused, not traversed; the
scope itself must not traverse links/junctions. An unreadable/deleted tree or
link pauses builds with a scan-error status, retaining output. Scanning retries;
fix/remove the problem to resume. Generated directories cannot contain the watch
scope. The CLI allocates its checker scratch under
`elnor/.elnor/mvp/project-dev-runs/run-*`. The API requires an explicit owned
scratch directory. `start()` is idempotent; `stop()` or server close/error stops
its timer.

## Failure and preview behavior

The [builder](PROJECT-BUILD.md) preserves the last published manifest on failure.
Original-source diagnostics/context appear in the terminal. Failed source
snapshots are not retried continuously; a saved watched change triggers another
attempt. The process remains available after an initial source error. With no
verified build, navigation returns an HTML HTTP 503 recovery page. Saving a
fix lets that page reload automatically once a valid build can be served.

After later errors, navigation displays the previous verified application with
a visible build-failure notice. It names the watch scope and explains that the
last successful build is being shown. If this session has never built, the notice
says so. With typed props enabled, a successful checked contract from this
session is required before an earlier output can be used; initial errors show
the recovery page until a build succeeds. The preview independently verifies
its manifest and refuses another entry's output.
Foreign output ownership is a startup error. The controller does not adopt or
delete foreign files.

An external development script polls a same-origin status route every 500 ms.
After a failed build, the page keeps the mounted application and its state and
shows the build failure notice. Once a new build and its preview inputs can be
served, the browser performs a full reload. Component-local state starts over
on that reload.

In the Persistent Task desk authoring exercise, an incomplete `guard` and a
mistyped phase comparison both leave the editable task draft on screen. The
first valid save reloads the preview. Reopening the task then shows the
title supplied by the client. [Task desk guard workflow](../../examples/persistent-task-desk/README.md#use-the-pilot)

When `--css` is set, the open page checks for updates to that stylesheet. The
server pairs the new CSS with the current validated props. The browser applies
it when those props match the ones mounted in the page. It keeps the previous
stylesheet until the replacement loads. CSS-only updates keep focus, the DOM,
and application state and leave the build manifest untouched. If the props have
changed, reload to apply the new pair. File reads use the same explicit path and
regular-file checks as initial navigation. Stylesheets keep the preview's existing
content policy.

### Experimental Surface replacement

Add `--experimental-hot` to opt in. The compiler uses its closed region proof
to qualify the UI and synchronous actions. An eligible root has scalar state
and no external props or lifecycle work. It can also own keyed `each` blocks
whose direct children have scalar state. Each block uses a distinct root state
collection, a closed array of scalars or records. Keep the collection binding, key expression,
child identity, prop bindings, state declarations, initializers, calculations
and actions unchanged to try a presentation edit in the root or child.

Eligible development builds use the general renderer to capture state and seed
the new mount. Child state follows its collection and row key, including if the
lists themselves move. Reusing one collection in two blocks triggers full reload
because the collection alone cannot identify the owner. Removing
a row disposes its owner and drops its snapshot so a later row with the same key
starts fresh. For a root text input or textarea, replacement restores focus and
selection when a unique field with the same binding, kind and value remains.
Both replacement and automatic reload wait while the focused field in a view
eligible for experimental replacement is composing text. When the composition
ends, the preview uses the latest ready build. Ambiguous bindings and
other controls use the browser's normal focus behavior after remounting.

The client stages the new mount, disposes the old listeners and reactive work,
then attaches the replacement. It loads only the verified entry for the new
build. Changed contracts, changed preview props or unsupported components
use full reload. The compatibility check compares the props mounted by the
current page. A stylesheet change can accompany a compatible Surface
edit and is applied through the live stylesheet path. A replacement failure
also falls back to navigation. Nested
lists, other component layouts and in-flight async work are outside this
experiment.

After an automatic reload in experimental mode, the preview explains which
part of the compatibility check triggered it. It distinguishes dependency,
preview props, state, list, event, calculation and component changes. It also
reports when the new version is outside the supported subset or the replacement
failed in the browser. The notice uses tab session storage for the transition
and clears on a manual refresh or successful replacement.

Experimental development builds address local ESM by a revision of the emitted
dependency graph. The revision uses the sorted module paths and byte checksums.
Editing Surface keeps those URLs when the graph is unchanged; editing any
emitted dependency gives the graph a new URL. The preview serves the shared
URLs only after verifying the build manifest and module bytes. URLs from
already published revisions remain readable while the server runs. Standard
builds continue emitting relative imports for filesystem output.

Experimental builds also analyze emitted local helper modules without executing
them. The first subset covers named synchronous functions in declaration-only
modules, local bindings and a few read-only operations such as `filter`, `map`,
`trim`, `toLowerCase` and `includes`. The proof assumes plain JSON data and
unmodified built-ins. It excludes writes, global reads, imports inside helper
modules, recursion and unknown calls. A module or export outside the proof
still builds normally. The development status reports the analysis result.

Reading Room can use experimental replacement with its checked JSON preview
props. The compiler verifies the named import used by `visibleBooks`, the
read-only render expressions, and synchronous actions that write only root
state. It also checks the keyed list in the stateless child and the direct
connections between child events and root actions. A compatible edit remounts
the view, recomputes the list from the preserved root data and retires the old
event listeners. Changes to the dependency revision or state, key, and event
contracts trigger full reload. More general derived ownership, stateful children
in this shape and async handlers remain outside this experiment.

This preview uses `connect-src 'self'` for the status request. Regular
`preview:project` keeps `connect-src 'none'`. Both retain the loopback Host,
method and module checks and external scripts. The client displays status as
plain text. Each poll observes the latest completed server work. Browser polling
and saved-source polling both contribute to the time between save and feedback.

## Evidence and remaining risk

The automatic reload increment passes 59 focused development, preview and
build tests. A headless Edge run in
`elnor/.elnor/mvp/project-dev-pilot/auto-reload-dd2d3bda7fcd494bbc69bb1abde29a81`
verifies recovery from an initial failed build, a later failed edit retaining
the displayed counter, and a valid save triggering reload and resetting that
counter. No CSP violations were recorded in the mounted pages. Two observations
on this small local fixture measured approximately 1.42 s and 1.45 s from save
to the start of a new navigation. These are fixture observations rather than a
latency target.

The original twelve Node regressions cover startup/build coalescing, output exclusion,
last-good-build retention, initial failure/recovery, missing-import creation,
transitive ESM edits, same-mtime and atomic saves, deletion/recreation, scan-error
recovery, explicit broader scope, foreign output refusal, escaped page status,
timer cleanup and the real CLI save/rebuild loop. Tests use owned temporary
sources and no desktop applications. The initial test run failed before the
implementation. The previous nine project-preview cases passed as a baseline.

This reduces the manual command steps exposed by the assisted authoring exercise.
It does not establish independent human DX. Broad scopes can be expensive to
scan and every relevant change emits another retained generation. Watch
dependency discovery, incremental performance, retention/collection and stateful
module replacement need separate evidence and prioritization.

The full `npm run verify:headless` gate passed on 2026-11-11 at
`elnor/.elnor/headless/runs/run-k0zaqF`: 433/433 Node cases, zero skips,
the four-component check and all fifteen native editor tasks, Linux/Xvfb,
exit code 0. Image: `sha256:c78863dcb1623897db4df4c9b56a6872623e92a82cc859c5cf992bb773e06cab`.
Workspace Trust remained enabled and native fixture source files unchanged.
No Windows desktop editor gate ran.

A headless Edge 157 pilot at
`elnor/.elnor/mvp/project-dev-pilot/run-20261111a` verified the full saved-error/
retained-preview/saved-fix/reload loop with real clicks and child events. It also
checked explicit props/CSS and blocked inline-script/fetch probes under the same
CSP. The harness saved edits to owned example copies; it invoked no rebuild
command after startup. Browser session, server and timer were closed afterward.
No screenshot, user source edit or user-server control was involved.
