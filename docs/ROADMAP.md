# Elnor roadmap

Status on 2026-11-25. This page is the single entry point to the plan. The
[goals](../GOALS.md) say why Elnor exists and what it must not trade away, the
[vision](VISION.md) says what makes it different, and the
[capability backlog](mvp/ECOSYSTEM-ROADMAP.md#owner-requested-capability-backlog-dx-throughout)
keeps the detail of each capability. Progress notes from before this map are
in the [phase log](mvp/PHASE-LOG.md).

## Direction

Elnor makes asynchronous work declarative: every operation has an owner, a
policy, a lifecycle and a destination, and the compiler checks the guarantees
that follow from them. Developer experience comes first, then security and
performance, and the correct way to solve a problem wins over a cheaper one.
Rendering performance must stay on par with Svelte and React, but it is not
what Elnor competes on.

Work is chosen by what the applications below need, not by what would make
Elnor look different.

## Rules for using this map

- Every change runs against the application matrix. A regression shows up as
  the application that broke.
- A capability arrives with the application that needs it, or makes an
  existing one simpler. A capability that no application needs waits.
- A change of direction gets an entry in the [direction log](#direction-log)
  before the work starts: what changes, why, what is set aside, and which
  applications show the reason.
- Every capability passes the [DX budget](#dx-budget) before it is promoted.

## Application matrix

Each kind of application Elnor must support has one application in
`examples/`, or names the capability that blocks it. "Gate" is how the
application is checked today. The browser matrix (`npm run test:browser`)
runs in CI on Linux, Windows and macOS; its flows are in `tests/browser/`.

| Application | Example | Gate today | Blocked by |
| --- | --- | --- | --- |
| Client-rendered single-page app | `task-desk`, `components`, `authoring` | Node tests with a fake DOM; browser matrix | Nothing |
| Single-page app with a local host that owns the database | `persistent-task-desk` | Node tests; browser matrix | Nothing (loopback fixture without real accounts) |
| App whose writes survive a reload | `durable-save` | Node tests; browser matrix | Nothing (Experimental) |
| Component mounted in a page that is not Elnor's | `embedded-widget` | Browser matrix | Nothing (no stable entry for the host page yet) |
| App that uses npm packages, web fonts and icon libraries | none | none | Packages and assets (phase 2) |
| Component library consumed by another project | none | none | Packages and assets (phase 2) |
| Single-page app with routes | none | none | Routing (phase 3) |
| Multi-page app | none | none | Routing and multiple entries (phase 3) |
| App whose BFF owns the database, through server actions | none | none | Server actions (phase 4) |
| App whose BFF sits in front of another API | none | none | Server actions (phase 4) |
| Server-rendered app with hydration | none | none | Server rendering (phase 5) |
| Static site rendered at build time | none | none | Server rendering and routing (phase 5) |
| App composed of server components and client components | none | none | Server components (phase 6) |

## Phases

The order was agreed on 2026-11-25, chosen so that each phase unlocks the
next rows of the matrix. Each phase ends when its applications pass their
gate.

1. **Regression matrix.** Move the browser runs of the existing applications
   into the repository as repeatable headless runs with the restrictive CSP,
   add the component mounted in a foreign page, and run them in CI. Done
   when one command runs every application's browser flows and a deliberate
   regression in one application fails only that application.
2. **Packages and assets** (CAP-10). Bare npm imports, a Vite adapter, and
   CSS, fonts and icons from packages or CDNs. External origins are declared
   per kind in the project and produce the CSP of the preview, the build and
   the server; scripts from a CDN carry `integrity`. Done when an application
   with an npm package, a web font and an icon library builds through Vite and
   through Elnor's CLI, and another project consumes a packaged component
   library.
3. **Routing and pages**, with the shared state that pages need (CAP-02). Done
   when the routed single-page app and the multi-page app pass.
4. **Server actions** (CAP-08), with updating the data after a mutation
   (CAP-03). Done when both BFF applications pass: a typed mutation reaches an
   authorized handler, malformed and unauthorized calls fail safely, and a
   lost reply has a defined outcome. Durable intents become one option of a
   server action, not its center.
5. **Server rendering** (CAP-05). Done when the server-rendered app hydrates
   without a second render and the static site is generated at build time.
6. **Server components** (CAP-07). Done when the composed application passes
   and the client output contains no server-only code.

Throughout every phase:

- Surface authoring and the editor: formatting, diagnostics, completion.
- The development loop and stateful hot updates (CAP-06).
- Composition and effects (CAP-01), persistence (CAP-04) and schemas (CAP-09)
  advance when an application in the matrix needs them.
- The performance matrix stays the regression baseline for rendering.
- Security boundaries are shown before a capability is accepted.

Durable intents stay Experimental. They receive fixes, and new work only when
an application in the matrix needs it.

## DX budget

Each capability is measured on the application that needs it, against the same
application written by hand without the capability:

- the code the developer writes, in nonblank lines, including host wiring;
- the concepts the developer must learn, named one by one;
- the configuration needed for the common path, which should be none;
- whether mistakes are reported on the original source, with a fix to apply;
- whether the developer can say where each piece of code runs and who owns
  each piece of data.

A capability that needs more code or more concepts than the handwritten
version is simplified or rejected. The durable save example is the reference:
67 lines against 196 written by hand.

## Decided conventions

- Components live in `.eln` files and their logic is TypeScript.
- Server actions will live in `*.server.ts` modules; `*.server.eln` is
  reserved for server components. The browser receives only generated clients.
- Boundaries are validated with Standard Schema, as forms already are.
- External origins are declared per CSP directive in the project and are never
  widened automatically; Elnor suggests the missing line.
- The general renderer is the default; the region backend is an experiment.
- Public content is in English and commits follow Conventional Commits.

Requirements already decided for server actions (phase 4):

- Both a BFF that owns the database and a BFF in front of another API are
  supported. With its own database, the intent receipt is written in the
  handler's transaction. In front of another API, the intent key is forwarded
  as `Idempotency-Key`. An API without idempotency supports durable intents
  only as a declared at-most-once mode, where a lost reply is reported as
  unavailable and never sent again.
- A single-page app without a BFF uses the same declarations against an API
  that speaks the intent protocol.
- The editor reports writes over HTTP that do not go through a declared
  action, and a BFF serves the application with a restricted `connect-src`.
- Requests to the API behind the BFF use server credentials; the session is
  an `HttpOnly` cookie that never reaches application code.

## Direction log

| Date | From | To | Why |
| --- | --- | --- | --- |
| 2026-11-10 | Open technical spikes | A small MVP on the existing JS/TS implementation | The viability closure found no structural blocker and no measured need for Rust ([closure](spikes/004/VIABILITY-CLOSURE.md)) |
| 2026-11-11 | DX first, performance later | Performance on par with Svelte and React as a required target, DX still first | The owner made performance a pillar ([target](mvp/PERFORMANCE-TARGET.md)) |
| 2026-11-14 | Small runtime optimizations | An own compiler-to-runtime design, the region backend | No small change produced a consistent gain ([design](mvp/REGION-BACKEND-DESIGN.md)) |
| 2026-11-16 | Open-ended performance work | Bounded parity, 10% CPU over Svelte on a fixed matrix, then a DX phase | Majority parity was reached in two cohorts ([acceptance](mvp/BROAD-PARITY-ACCEPTANCE.md)) |
| 2026-11-18 | A local application pilot | A mapped backlog of state, data, server and tooling capabilities | The owner asked for every area to be mapped with DX throughout ([backlog](mvp/ECOSYSTEM-ROADMAP.md#owner-requested-capability-backlog-dx-throughout)) |
| 2026-11-22 | Asynchronous work as application patterns | Action groups in the language | Stale responses, double submits and work that outlives a component kept needing hand-written code ([policy](mvp/ASYNC-POLICY.md)) |
| 2026-11-23 | Region backend toward the default | General renderer as the default | Regions showed no CPU advantage and a runtime two to three times larger ([default](mvp/GENERAL-RENDERER-DEFAULT.md)) |
| 2026-11-23 | Rendering speed as the differentiator | Declarative asynchronous work as the differentiator | Speed alone would make Elnor one more framework ([vision](VISION.md)) |
| 2026-11-25 | Capabilities chosen by the vision | Capabilities chosen by the application matrix | Durable intents took a large share of the work without an application that needed them; this map |

Two patterns stand out. Plans lagged behind the turns, so the map was out of
date each time. Several turns came after a large investment that measurements
did not support, the region backend most clearly. Writing the entry before
starting is meant to show a new turn against the earlier ones while it is
still cheap.
