# Reloadable development preview inputs

This document records the original navigation-based increment. The current
[development command](PROJECT-DEVELOPMENT.md) also applies CSS-only edits in
place when the mounted props still match.

`dev:project` can now adopt saved props/CSS files when the page reloads, without
restarting the server or compiling Surface again:

```sh
npm run dev:project -- src/App.eln --out generated --props preview-props.json --css preview.css
```

Both options remain explicit and optional. Relative paths resolve from the
command directory. Props default to `{}`; a selected file must contain a JSON
object. Save the selected files, then reload. Source changes still use the
existing automatic build loop; props/CSS are reread on navigation, not polled by
the browser. The standalone `preview:project` command keeps its startup-snapshot
contract and still requires restart for different props/CSS.

## Input revision and recovery

Each navigation reads and validates the selected pair before selecting it. Props
are parsed/serialized as JSON values, preserving keys such as `__proto__` without
turning the JSON into an object literal in generated JavaScript. CSS is read as
bytes from the selected regular file. A content revision identifies the normalized
props plus CSS bytes/presence; JSON whitespace alone does not change it.

Bootstrap URLs include both the compiled build ID and input revision. CSS URLs
include the input revision. Old URLs continue serving their original bytes while
the server runs. Changing props/CSS does not overwrite an open page's inputs or
compiled modules. Reload mounts a new page and resets its local runtime state.
Entry immutability is checked per compiled generation even when input revision
changes. Input updates alone do not write or replace the compiled manifest.

If either file is missing/unreadable/linked, props JSON is malformed, or its root
is not an object, the candidate pair is rejected together. Navigation keeps the
last valid props/CSS pair and displays an escaped `Preview inputs failed` notice;
the terminal reports it too. A CSS edit accompanying invalid JSON is not applied
until the pair validates. Save a fix and reload to recover; no restart is needed.
If no pair has ever validated, navigation returns an HTML HTTP 503 recovery page.
An initial invalid or missing selected file does not stop the development process.

Input validity is separate from compilation. A last verified application can use
a newly valid input pair while current Surface source still has build errors;
both statuses are shown independently. The experimental API accepts `propsFile`
and exposes `status().previewInputs`. Programmatic `props` remain a fixed fallback
when no file is selected. Changing selected paths/options requires restarting.

## Boundaries

The later [typed-props increment](TYPED-PREVIEW-PROPS.md) now checks development
props against the last published checker snapshot and revalidates fallback pairs
after contract changes. This remains TypeScript assignability, not runtime
invariant validation. Standalone preview remains untyped. CSS syntax,
imports and rendering errors are handled by the browser, not a CSS compiler.
The files are read sequentially: this is a validated observed pair, not an atomic
filesystem snapshot across simultaneous editor saves. Reload after both saves.

Input files and their ancestors must be regular/unlinked paths under the existing
preview policy. This is not a hostile filesystem race guarantee. The server only
serves generated bootstraps, allowlisted modules and versioned CSS; raw props/CSS
paths and metadata are not public routes. CSP remains unchanged, including
`connect-src 'none'`; no inline script/style, browser polling, HMR, sockets or
automatic page refresh is added. Selected props are intentionally available to
the preview application, so they are not a secret store.

Served revisions remain in memory until process shutdown. There is no revision
collection or production memory/latency guarantee. A selected input that also
matches the existing source/dependency watch rules (for example `package.json`)
can independently trigger a source build; ordinary props JSON/CSS need none.
This increment does not broaden Surface, assets, tsconfig or npm support.

## Regression evidence

Eight new Node cases cover paired updates with an unchanged build manifest,
retained old URLs, malformed JSON/last-pair recovery, invalid initial props,
missing/linked CSS and raw-route refusal, stable normalized JSON revisions,
literal special keys/escaped failure text, input fixes during source errors,
entry immutability across revisions, and the real CLI recovery/update path.
Six of the initial seven cases failed against the old controller; the original
entry-immutability case already passed. The eighth case exercises CLI behavior.
The focused preview/development suites pass 39 cases without skips.

The final `npm run verify:headless` gate passed on 2026-11-11 at
`elnor/.elnor/headless/runs/run-wynXdD`: 451/451 Node cases, zero skips,
the original four-component check and all fifteen native editor tasks,
Linux/Xvfb, exit code 0. Image:
`sha256:b8ee0b3677ab1add153e1b26c081470bad1ae57dd781811e65e0e133733995d3`.
Trust remained enabled and native fixture source files unchanged. No Windows
desktop editor gate ran. The earlier `run-vRy3lM` also passed before the final
status/terminal-text cleanup.

A headless Edge 157 pilot at
`elnor/.elnor/mvp/preview-input-pilot/run-20261111a` verified title/computed-color
updates after reload, old-page retention before reload, last-pair retention after
malformed JSON, and recovery without restart. Counter clicks and child events
worked throughout; inline-script/fetch CSP probes were blocked. All phases kept
the same compiled manifest/build ID. The pilot predates the text-only status
cleanup covered by the final full gate. Its named browser, owned server and timer
were closed. No screenshot, user-source edit or user-server control was involved.
