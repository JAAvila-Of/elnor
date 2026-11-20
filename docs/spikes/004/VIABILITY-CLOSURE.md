# Viability closure and MVP recommendation

**Decision: bounded technical GO for a small Surface MVP on the current JS/TS
implementation.** The composition and tooling questions exercised by Spikes 003
and 004 have a workable implementation route. This closes that bounded technical
investigation; it does not validate all of Surface v0.3 or production readiness.

## Finite closure scope

The agreed closure package has three deliverables:

1. Complete the outstanding native TypeScript-buffer tasks.
2. Exercise one integrated application, including effective browser CSP and
   small local timing observations.
3. State the GO/NO-GO, limitations and MVP backlog without turning every remaining
   risk into another mandatory spike.

All three now have evidence. No compiler/runtime implementation change was
needed for the browser pilot. The existing UserEditor was reused rather than
adding a new product surface or expanding the proposed grammar.

## Evidence

| Area | Observed result | Boundary |
|---|---|---|
| Regression baseline | `npm run check`: four components; `npm test`: build and 287/287 Node cases | Existing fake-DOM cases remain fake-DOM evidence |
| Native authoring integration | `run-8qpKqr`: 12/12 tasks, VS Code 1.145.3, host Node 24.22.1, trusted/passed/sourceFilesUnchanged true | Automated development extension; one local folder |
| Real application source workflow | UserEditor probe completes a prop, maps an error, navigates and applies a cross-component rename in memory; disk text unchanged | In-process real-source probe, complementary to native synthetic tasks |
| Browser composition | Edge 157.0.4341.42 passes search, child selection, validation, async save, cancel and confirm-delete | Three fixture users and local mock persistence |
| Text rendering | An image/event-handler-shaped name is displayed as text; no image node or marker execution | One explicit payload, not a general XSS audit |
| Effective CSP | Inline script, inline handler, `eval`, `Function` and `fetch` probes are blocked; violation events observed | The preview policy, tested on this browser |
| Local timings | Three check/build samples and one retained browser navigation/workflow sample | No performance budget, percentile, scale or comparative conclusion |

The browser pilot's five checks all passed with no `pageerror` and no observed
nonlocal requests. Its CSP probes intentionally produce security console errors.
The initial CLI open also logged blocked local favicon fetches; those did not
prevent the application workflow. A clean console was not substituted for
checking the actual violation events and execution markers.

Evidence retained locally:

- `elnor/.elnor/spikes/004/editor-runs/run-8qpKqr/result.json`.
- `elnor/.elnor/spikes/004/pilot-runs/run-yuHUx6/pipeline.json`.
- The same pilot directory's `tooling.json` and `browser.json`.

These are repository-local experiment records, not public artifact revision IDs.

## Assessment against the priorities

**Developer experience comes first.** The evidence supports precise original
source feedback, bounded incomplete editing, unsaved buffers and native edit
application. The pilot also exercises the existing composition/preview route.
It does not establish that people find Surface exceptional. A developer workflow
study belongs at the start of the MVP, alongside a documented supported subset
and formatting. The current lack of a formatter is an MVP gap, not a reason to
claim the full destination specification is supported.

**Security requires explicit boundaries.** Type analysis does not execute the
imported application modules. The native tasks do not save source files, and
Workspace Trust was granted manually rather than bypassed. The browser ran the
generated modules under the restrictive preview CSP. These are useful concrete
properties, not authorization, sanitization, dependency-supply-chain or server
security certification. SSR, nonces and sealed transport remain separate work.

**Performance remains a measurement question.** On Windows x64, Node 24.21.0,
AMD Ryzen 5 5600G, the three same-process observations were:

| Sample | Check | Build, including another check |
|---|---:|---:|
| 1 | 558 ms | 390 ms |
| 2 | 304 ms | 353 ms |
| 3 | 244 ms | 333 ms |

The retained Edge navigation completed at 52.3 ms, with first contentful paint
at 48 ms. The four functional task groups took 44, 53, 41 and 89 ms in automation;
the security probe took 6 ms. Those values include automation behavior and use
local mock operations. They are not human task times or evidence of acceptable
large-project latency. A first check is not a complete cold process startup
measurement, and check/build samples are not independent workloads.

There is no measured reason here to require Rust before the MVP. Keep the
current implementation as the behavioral reference, define interfaces between
Surface parsing, transformations, emission and TS projections, and consider
selective ports only against a measured requirement and equivalence tests.

## GO, conditions and backlog

Proceed to a small MVP that makes the demonstrated path usable and repeatable.
Do not present this as a GO for every syntax feature in the v0.3 design draft,
all symbol categories, all workspaces or production deployment.

The first MVP scope is recorded in [the MVP task](../../../tasks/005-mvp.md):
supported-subset contracts, developer workflow feedback/formatting, and a
predictable project/dependency lifecycle. It is planning scope, not completed
implementation or a request to start all features simultaneously.

Defer complete error recovery, never-registered TS disk dependency invalidation,
tsconfig parity, cross-language rename, multiple roots, remote editors, native
junction/multi-group cases, broader packaging and scale testing until prioritized
against that MVP. Keep their present limitations visible. Rust migration,
SSR, general authorization, nonces and cryptographic transport are not closure
requirements and are not implicitly authorized implementation work.

A structural failure in the MVP can justify reopening a specific technical
question with a bounded experiment. Adding every remaining edge case to this
closed spike is not the default continuation.

## Reproduce the browser pilot

After dependencies and the normal checks are available:

1. Run `npm run preview -- UserEditor` in one shell; it builds the local preview.
2. In another shell run `node scripts/probe-viability.mjs`. It records the local
   pipeline samples and writes a test-only external CSP probe to generated dist.
3. Run `playwright-cli -s=elnor-pilot open http://127.0.0.1:4183 --browser=msedge`.
4. Run `playwright-cli -s=elnor-pilot run-code --filename=scripts/pilot-browser.js`.
   Require its result's `passed: true`; CLI process exit alone is insufficient.
5. Close only `elnor-pilot`, stop the owned preview and rebuild normally to remove
   the test-only generated probe. Do not publish that probe as application code.

The script requires an existing Playwright CLI and browser; it does not install
them. The native reproduction remains `npm run test:editor`, with manual review
of the generated fixture workspace if trust is requested.
