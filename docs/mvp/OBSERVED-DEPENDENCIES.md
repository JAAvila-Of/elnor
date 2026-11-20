# Observed local development dependencies

`dev:project` now watches concrete local dependency paths observed during project
checking, in addition to its recursive source scope. No extra flag is required:

```sh
npm run dev:project -- src/App.eln --out generated
```

If `src/App.eln` imports `../shared/value.mjs`, editing the resolved local source
can trigger a rebuild without expanding `--watch-dir` to the parent tree.
The original source scope remains useful for new source discovery. The terminal
reports its location and the number of observed paths; the page reports file and
resolution-directory counts on reload. The experimental controller API exposes
copies of `{file, kind}` records through `status().dependencies`.

## Where observations come from

Surface discovery records each attempted component path, including absent files.
An optional observation callback wraps caller-owned TypeScript compiler/module
hosts' `readFile`, `fileExists` and `directoryExists`. This captures ordinary
local sources, declaration contracts, package context and resolution probes from
the real checker and bounded local ESM planner. It does not parse an alternative
import graph or modify TypeScript's resolver. The default checker, editor,
authoring and emitter behavior remains unchanged when no callback is supplied.

The development controller retains local source/declaration candidates and
`package.json` paths plus directory probes. It filters generated output, checker
scratch, `node_modules` and `.git`. Existing file contents are hashed; missing
files and directory/type presence have distinct states. Directory probes are
checked for existence/type, never recursively scanned or hashed by their listing.
If a missing directory appears, a new build can observe the newly available file
candidates. An earlier missing higher-priority source can also trigger resolution
again when created. A JavaScript runtime and its separate TypeScript declaration
are both observed through their respective consumers.

Observations form a union for the lifetime of the development process. They are
not discarded when a later parse/type error prevents traversal, or when an import
is removed. Restart resets the union. This favors recovery over reducing extra
rebuilds; editing a formerly imported path may still rebuild during that session.
Only newly observed records extend the input baseline, at first observation.
Already observed sources keep their pre-build baseline so subsequent polling
detects edits made around publication instead of silently accepting them.

## Boundaries

The original two-stable-snapshot/serial-build behavior and last-valid-manifest
retention remain in force. Observed paths must not traverse symlinks/junctions.
A newly linked tracked file pauses polling with a scan error; restoring a plain
file allows recovery. Observation callbacks perform no source writes or module
execution. These checks are not a hostile filesystem race defense.

This is bounded dependency-aware polling, not complete workspace freshness.
Unobserved paths, package installs under `node_modules`, arbitrary directory
contents, tsconfig/extends/plugins, unsaved buffers and dynamic imports are not
covered. The existing fixed TS and bounded local ESM contracts still apply.
Outside the recursive source scope, an unrelated neighboring source is not read
or watched merely because its directory contains an imported module.

The later [input-revision increment](PREVIEW-INPUTS.md) reloads selected props/CSS
on navigation; they are not dependency probes. Source rebuilds do not automatically
reload the page. Dependency observation changes neither CSP nor HTTP routes: observing a source
path does not serve it to the browser. There is no incremental compilation,
whole-project frozen snapshot, watch-set pruning, collection or performance SLA.

## Regression evidence

Eight initial cases failed against the previous scope-only controller. Ten new
cases now cover external Surface edits/deletion/recreation, transitive ESM edits with a
preserved mtime, unrelated neighbor exclusion, missing external directories,
external declarations, package-context changes, higher-priority source creation,
retention through a broken graph, link refusal/recovery, separate runtime/type
contracts and edits immediately after publication. The focused check/build/dev
suites pass forty cases, with no skips or desktop applications.

The full `npm run verify:headless` gate passed on 2026-11-11 at
`elnor/.elnor/headless/runs/run-pbmBZT`: 443/443 Node cases, zero skips,
four original checked components and all fifteen native editor tasks, Linux/Xvfb,
exit code 0. Image: `sha256:ffbb82da21cefc5267d49833e8433768b082eb77163cd1a93e6171a6935ab062`.
Trust remained enabled and native fixture source files unchanged. No Windows
desktop editor gate ran.

The retained headless Edge 157 pilot at
`elnor/.elnor/mvp/project-dependency-pilot/run-20261111a` edited only a shared
module outside the recursive `source/` scope. A type error triggered a failed
automatic build while the previous counter and child events remained usable.
Saving the external fix rebuilt automatically; reload cleared the failure notice
and the counter/event advanced by two. Literal props, explicit CSS and blocked
inline/fetch probes also passed. The harness used owned example copies and ran
no explicit rebuild after startup. Its named browser, server and timer were
closed; no screenshot or user-source/server control was involved.
