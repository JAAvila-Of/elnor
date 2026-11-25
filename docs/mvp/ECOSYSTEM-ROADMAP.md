# Ecosystem compatibility and proposed roadmap

Snapshot: 2026-11-18. Current support is derived from parser, compiler, module
planner and the [implemented subset](../surface/MVP-SUBSET.md). Roadmap stages
below are proposals with exit criteria, not implemented capabilities or dates.

The [styling DX contract candidate](STYLING-DX-CONTRACT.md) now compares direct
classes, semantic CSS and named class values, with security, execution and
authoring acceptance criteria. Its string-valued DOM class boundary is now
[experimentally implemented](TYPED-DOM-CLASSES.md); adapters and human authoring
acceptance remain open.

## Compatibility boundaries

| Integration | Current evidence | Work still needed |
| --- | --- | --- |
| Plain CSS | External stylesheet works in the preview and Task desk | Component style contract, distribution and asset handling |
| Tailwind | Compiled CSS can follow the existing stylesheet route; no Tailwind end-to-end test | Build/watch integration, source detection and utility-aware editor support; typed DOM class expressions are now experimental |
| StyleX | No Elnor adapter | StyleX transform and CSS extraction, package resolution, class/style application and source maps |
| Ordinary JS/TS logic | Typed relative local ESM imports work in the bounded graph | npm/package resolution, browser exports, assets and production bundling |
| DOM libraries | No general user ref/lifecycle integration contract | Mount/update/dispose boundary and exclusive DOM ownership |
| React or Svelte components | No direct component interoperability | Explicit host adapter or separate island; runtime, event, styling and cleanup costs need measurement |
| Web Components | No general custom-element integration | Custom tags, properties versus attributes, custom events and disposal tests |

The parser preserves simple `.name` container classes and now supports
experimental `class=(stringExpression)` on its existing DOM tags, including
multi-token strings and named values. Arbitrary attributes and DOM prop spreads
remain absent. Class application does not establish Tailwind extraction or
build/watch integration; CSS prebuilt elsewhere is still a manual path.

[Tailwind scans source as text](https://tailwindcss.com/docs/detecting-classes-in-source-files)
and needs complete class tokens; a useful adapter must preserve those tokens
and include component-library sources. [StyleX installation](https://stylexjs.com/docs/learn/installation/)
requires its runtime and build integration. Its
[`props` API](https://stylexjs.com/docs/api/javascript/props/) yields class/style
properties; Elnor would need a typed, controlled way to apply equivalent output.
JS-authored styling does not inherently require React, but it still needs an
integration designed for Surface.

## A component library for Elnor

A native kit would normally expose Surface components with typed props, events
and slots. Its logic can be ordinary TypeScript, and CSS/tokens/icons need not
be written in Surface. Existing React component implementations cannot simply
be imported as Surface tags. An adapter is a separate option, not a native kit.

[HeroUI's React introduction](https://heroui.com/en/docs/react/getting-started)
describes Tailwind and React Aria components, and explicitly permits its CSS on
plain HTML. Reusing visual styles does not transfer React behavior, focus
management or accessibility guarantees to Elnor. A mature equivalent requires
keyboard interaction, semantics, focus restoration, overlays and packaging,
not only button appearance.

## Multiline follow-up

[Native textarea binding](TEXTAREA-BINDING.md) is now experimental and Task
desk descriptions use it. Typed attributes, generic ARIA/data and
automatic native-default restoration/submission data remain separate contracts; stage 1 is still incomplete.

## First typed DOM property

[Boolean disabled](DOM-DISABLED.md) now works experimentally on button/input/
textarea. It does not establish arbitrary attributes, ARIA/data, URL/style or
event spreading. The later editor follow-up adds bounded property-name
completion; optional-value ergonomics and broader recovery remain explicit DX
work, and stage 1 stays open.

## Accessible state follow-up

[Two boolean ARIA states](DOM-ARIA-STATES.md) now expose Task desk toggle
filters and the current task through native buttons. Generic ARIA/data, roles,
screen-reader acceptance and broad accessibility audits remain open; stage 1
is still incomplete.

## DOM authoring follow-up

[Host-specific property completion and bounded recovery](DOM-EDITOR-COMPLETION.md)
now cover the current DOM prefixes. Optional values, broader syntax recovery
and human authoring acceptance remain open; stage 1 stays incomplete.

## Checkbox integration

[Native boolean checkbox binding](CHECKBOX-BINDING.md) is now experimental in
the public local implementation and Task desk uses it for High priority during
creation. Control/caption order is normalized across renderers, and native editor,
browser and exact-transfer gates pass. Direct-state-only binding remains explicit
DX friction; nested/controlled bindings and broader form contracts remain open.
Stage 1 is still incomplete. The [initial study](CHECKBOX-CONTRACT.md) is historical.

## Select integration

[Native single select](SELECT-BINDING.md) now edits Task desk priority with static
string options and typed union writes. Three renderer browser flows, mapped editor
checks and the exact public transfer pass. Dynamic options, multiple selection,
nested/controlled binding and automatic native-default restoration remain open; stage 1 is incomplete.

## Native form submission

[Native form submission](FORM-SUBMISSION.md) now lets Task desk create tasks
with Enter and native submit buttons, with one action on the form. Three renderer
browser flows passed in that revision. The later [submit composition work](SUBMIT-COMPOSITION.md)
adds reusable buttons and rendered slot placement checks, with 40 native editor
tasks. Orphan submit buttons are valid and inert.

The later [managed reset increment](FORM-RESET.md) adds `on reset() => clear()`
and native reset buttons, with 45 native editor checks. Click, keyboard and
`form.reset()` invoke the explicit state action after cancelling native defaults.
Task desk clears its draft and validation error without changing stored tasks.
Automatic native-default restoration, submission data and general form attributes
remain open.

## Text composition follow-up

[Native composition and selection checks](TEXT-COMPOSITION.md) now cover input
and textarea on three renderers, including provisional state, commit/cancellation,
Unicode selection and caret preservation. The core is unchanged. Chromium
protocol evidence is separate from human OS-IME and assistive-technology
acceptance; external writes during composition and async races remain open.

## Async operations follow-up

Keep async operation management explicit in the application-pilot backlog.
Actions already use native async/await, while loading/error state, concurrency,
stale responses and cancellation remain application responsibilities under the
[runtime contract](../surface/MVP-CONTRACTS.md). Evaluate those together with
unmount behavior, representative API/storage flows, DX and runtime cost before
choosing an operation API. The [explicit async search study](ASYNC-OPERATIONS.md)
now verifies latest-wins, error/loading, Cancel, reset invalidation and host-owned
abort with controlled promises and a browser pilot. It preserves the core and
exposes the lifecycle/guard boilerplate. The later
[component disposal increment](COMPONENT-DISPOSAL.md) adds a synchronous
`on dispose() => cancel()` hook and verifies conditional/keyed retirement without
a host lifetime prop. Invocation policies remain explicit: latest-wins reads do
not imply serialized/idempotent writes. The
[controlled write study](ASYNC-WRITES.md) now verifies per-instance single-flight,
frozen intent snapshots, explicit same-key retry, later-draft preservation and
abort without remote rollback. Provider replay is an explicit test contract,
not an Elnor server guarantee. The
[local typed operation helper](OPERATION-HELPER.md) now extracts controllers and
invocation guards with explicit latest/single-flight policies, snapshot publication
and synchronous owned commits. It is an example-local prototype with delivery/DX
tradeoffs, not a stable SDK or new language declaration. Stable operation ergonomics,
the production API/storage contract and independent human acceptance remain open.
The [persistent recovery fixture](RECOVERY-JOURNAL.md) now verifies a journal
written before HTTP, SQLite atomic results, same-key replay, stable ledger epoch,
status-first recovery and terminal acknowledgement across reload/process restart.
Its browser journal assumes one writer; authentication, multi-tab coordination,
retention operations and persistent Task desk integration are not established.
[Action groups](ASYNC-POLICY.md#action-groups) now run `single-flight` and
`latest` in the general runtime and expose typed reactive state. Retirement
never interrupts cleanup: awaited `finally`, `await using` and `for await`
complete their cleanup after an invocation is retired.

The [async policy guide](ASYNC-POLICY.md) closes the initial technical evaluation
and separates demonstrated operation policies from the persistent application
pilot and stable-API acceptance criteria. This does not complete stage 5.

The [Task desk persistence contract](TASK-PERSISTENCE-CONTRACT.md) now bounds
the first slice to versioned editing of an existing task. An internal SQLite
model verifies conflict/replay/rollback semantics; HTTP, journal/UI integration
and authenticated deployment are separate acceptance work. Stage 5 stays open.

The [local persistent Task desk variant](PERSISTENT-TASK-DESK.md) now connects
versioned editing, scoped journal, HTTP and SQLite. Six browser phases verify
reload/restart, conflict/review, outage/retry and changed-history blocking. It
edits existing tasks only; full persistent CRUD, authenticated deployment,
multiwriter coordination and human acceptance remain open. Stage 5 is incomplete.

The [local persistent CRUD increment](TASK-CRUD.md) now adds creation and
versioned logical deletion to the separate Task desk variant. Journal identities,
terminal results, tombstones and old-ledger migration have HTTP/SQLite/browser
evidence. The local CRUD workflow is technically demonstrated; independent human
authoring/recovery feedback, authenticated deployment and multiwriter coordination
remain open, so stage 5 is not complete.

The [current Surface authoring exercise](TASK-DX-EXERCISE.md) is prepared on an
owned copy of the persistent pilot. Its automated readiness found and verified a
[CLI action-line correction](CHECKER-ACTION-LINES.md). Human behavior-change,
error-recovery and data-flow observations are still pending; preparation does not
close authoring acceptance or stage 5.

## Owner-requested capability backlog: DX throughout

On 2026-11-18 the owner requested that the capabilities below remain mapped for
work when appropriate, explicitly adding Server Components and Server Actions.
Exceptional developer experience applies to every capability, from first setup
and everyday authoring to debugging, recovery and deployment. This extends the
existing DX-first priority; it does not schedule implementation, select syntax,
adopt React's protocols or broaden the implemented subset.

The IDs below are stable planning references. All rows are pending design and
validation; existing building blocks are not completion of the broader capability.

| ID | Capability and current boundary | Questions and dependencies to resolve | Demonstration required before acceptance |
| --- | --- | --- | --- |
| CAP-01 | Reactive composition and effects: local `state`, `calc`, `action` and disposal exist. Two Task desk forms share an isolated TypeScript validation helper with independent operation lifetimes | Define a public composition contract, ownership, automatic dependency tracking, effect timing, async cleanup and error handling; distinguish derivation from external synchronization | Reuse behavior in two instances; changing inputs updates the right work; disposal cleans subscriptions; readable errors map to original source without repeated lifecycle boilerplate |
| CAP-02 | Shared state and scope: isolated Task desk pilots compare projection and selection lifetimes, exercise request-owned state with session grants, and partition and remove browser snapshots by synthetic account | Evaluate authoring and define a public composition contract, real authenticated account lifecycle and production cache boundaries; verify persistence without implicit process-wide user state | Two consumers share selected state predictably; unrelated consumers avoid unnecessary updates; independent apps/requests/users remain isolated; logout retires session data |
| CAP-03 | Remote data and mutations: an isolated HTTP/SQLite read probe demonstrates retirement on workspace switch, revision continuity, and explicit refresh after failure | Resource identity across provider changes, freshness, deduplication, invalidation, concurrency, cancellation, optimistic changes, errors and confirmed data versus drafts; builds on CAP-01/02 | A small app loads, changes and refreshes related data with understandable pending/error/stale states, no stale response overwrites or hidden duplicate writes, and a clear recovery path |
| CAP-04 | Persistent state and recovery: journal/HTTP/SQLite pilot with epoch recovery, a 30-day receipt window, an opt-in local batch schedule, durable retired keys, and isolated browser-tab coordination for snapshots and Surface CRUD | Storage adapters, broader schema migration and eviction, production retention scheduling and marker lifecycle, and authenticated account isolation; coordinate CAP-02/03/09 | Reload/restart restores the intended state; migration/corruption/conflict paths are explainable; explicit retry preserves intent; switching users does not expose previous data |
| CAP-05 | A bounded Task Desk plan generated from checked Surface drives initial HTML and DOM verification. The host adapter preserves the draft and reports source lines, including for a nested panel with its own lifetime | A general Surface renderer and hydration ownership for arbitrary component trees, server-compatible bindings and validation across supported controls; coordinate CAP-02/03/09 and server boundaries in CAP-07/08 | Server HTML becomes interactive without duplicate work or lost input; mismatch and serialization errors identify actionable source locations; concurrent requests stay isolated |
| CAP-06 | Development refresh and HMR: a successful source build reloads the preview, CSS-only edits apply in place, and an opt-in replacement path preserves eligible state | Broader replacement across component trees, async ownership and human evaluation of save-to-feedback; coordinate CAP-10 | Save-to-feedback works in a small real app; failed edits recover clearly; compatible state survives replacement; incompatible state resets predictably without leaked work |
| CAP-07 | Server Components: absent | Define Elnor's server-executed component model, server/client composition, client entry boundaries, allowed imports, async data, serialization/transport, streaming and deployment constraints; coordinate CAP-05/09/10 | A representative page composes server data and interactive client UI; server-only dependencies/secrets stay out of client output; invalid crossings produce original-source diagnostics; developers can explain where code executes |
| CAP-08 | Server Actions: absent; Surface `action async` currently runs as ordinary application code where mounted | Explicit remote invocation, argument/result schemas, authentication and per-operation authorization, request-origin/CSRF protection where applicable, error transport, pending/cancel semantics, duplicate submissions/retry and cache invalidation; coordinate CAP-03/09/10 | A typed form mutation reaches an authorized server handler; malformed/unauthorized calls fail safely; lost replies and retries have a defined outcome; pending/errors and post-mutation data updates require little repeated glue |
| CAP-09 | Runtime schemas and validation: Task desk create/edit drafts use an inferred shared schema and associated field errors on native text inputs, textareas and selects. The persistent client and HTTP host reuse the same field definitions for wire values, and SQLite retains transactional rejection and replay. Isolated spikes also exercised Zod via prebundled ESM | Storage/SSR schema boundaries, schema versioning, a direct dependency integration path and validation feedback across larger forms; evaluate the API and delivery cost before choosing a general library | One schema supplies inferred types and consistent boundary validation; a form exposes actionable field errors; invalid remote/persisted data has a recovery path; no requirement to schema every internal variable |
| CAP-10 | Bundler independence and adapters: own CLI emits local ESM; no validated Vite adapter or general npm bundling | Stable compiler integration boundary, module resolution, source maps, assets/CSS, server/client outputs and development hooks; narrow Vite spike first if selected | A clean project checks/builds/previews through an adapter with accurate diagnostics; an additional host demonstrates that application source need not depend on one bundler; document adapter-specific limits |

Server Components and Server Actions are separate capabilities. A server
component executes component logic on the server; a server action exposes a
controlled remote operation. Neither follows automatically from SSR, and neither
is established by local async actions or the Task desk HTTP fixture. Their names
describe investigation areas, not a promise to reproduce another framework's API.

### DX acceptance for every capability

Before promoting an API, compare concrete authoring alternatives using the same
small application: first setup, ordinary edit, composition/reuse, deliberate
error and repair, and lifecycle/recovery where relevant. Show the proposed source
and editor feedback before settling syntax. Record concepts to learn, repeated
glue, duplicated configuration, diagnostic quality and any remaining friction.
Completion, navigation, types and original-source diagnostics belong to the
feature's delivery rather than a later polish phase.

Keep common paths concise and advanced policies discoverable. Developers must
be able to determine ownership, execution environment and data lifetime without
guessing hidden behavior. Reducing visible code alone is insufficient if it
makes errors, concurrency or recovery harder to understand. Security boundaries
and measured performance requirements remain in force alongside DX.

Automated checks establish technical behavior; independent human authoring and
recovery observations establish the human part of acceptance. Assisted examples
must retain their assistance status. Report costs and friction before integration;
do not call a capability complete merely because a demo works.

### Priority order for remaining work

This working order starts with observed authoring friction, then follows the
dependencies of larger capabilities. Revisit it when pilot feedback or a
dependency changes the cost of the next increment.

The [development preview](PROJECT-DEVELOPMENT.md) reloads the whole page after
a successful source build and shows failure status on the existing page.
An explicit CSS-only edit updates the stylesheet in place and preserves the
mounted application. The opt-in Surface replacement experiment preserves root
state and tracks child state by collection and key in eligible lists. Broader component
trees, nested lists and async ownership remain open.

The persistent Task desk uses [field errors](../surface/MVP-SUBSET.md#experimental-field-errors)
for title, assignee, description and priority. The shared schema supplies the
messages as a typed object with one property per field. The action controls
when to show them. Both Task desk pilots opt
in to [focusing the first invalid field on submit](../surface/MVP-SUBSET.md#focus-on-invalid-submit).
Persistent Task desk also renders validated field issues from a rejected
receipt while the open draft still matches the attempt and field value.
An isolated Standard Schema comparison ran the same Task desk composer with
the local schema and Valibot. The adapter handles both path shapes and
discards intermediate values on failure. The external package needs a local
ESM entry with the current packaging contract.
A follow-up kept the nested input paths and the transformed submit output
typed independently using the existing TypeScript projection.
Two mounted copies also verified independent reset and remount. Submitting
reads the draft directly so an input changed in the same turn is validated.
The Task desk creation and editing forms and Persistent Task desk use the
[experimental TypeScript form schema helper](../surface/MVP-SUBSET.md#experimental-form-schema-helper).
Form-wide and group issues with no exact control binding can use a native
[output status region](../surface/MVP-SUBSET.md#experimental-form-and-group-feedback).
Two HTTP validation pilots handle retries, cancellation and obsolete replies.
The editor checks submission arguments and points to incompatible success
callbacks. [Local and HTTP validation examples](../surface/EXAMPLES.md#check-a-validated-draft-over-http)
Larger forms and validation of stored and server-rendered data remain open
under priority 3.

The [formatter](FORMATTER.md) now expands compact action statements and object
fields and indents explicit multiline state and calc initializers. Long,
already parenthesized declarations can wrap using whitespace edits. Persistent
Task desk includes the revision check and long action conditions as formatted
examples. Long `if` and `guard` conditions can wrap around their existing
parentheses and at top-level logical operators. Broader
expression wrapping and human evaluation of the resulting layout remain open
under priority 1.

`guard` has an experimental implementation under priority 1. See the
[implementation design](#guard-implementation-design) for the prototype scope,
compatibility decision and acceptance cases.

| Priority | Work | First result to verify |
| --- | --- | --- |
| 1. Surface authoring | Expand formatting beyond indentation, keep examples readable, and finish the Task desk authoring and recovery evaluation. Improve diagnostics and editor assistance where that workflow exposes friction. | Format the same Task desk file twice with the second pass producing no changes. Preserve comments, literals and behavior. Observe a person editing and recovering from an error. |
| 2. Day-to-day development | Validate the alpha's implemented save-to-feedback loop in a desktop authoring session. Keep reload, experimental replacement and text composition behavior easy to verify (CAP-06). | A person can follow the included guide, recover from an invalid edit, and save during text composition in a system IME. Measure the delay on a representative project. |
| 3. DOM, forms and validation | Fill the gaps a real form needs in bindings, attributes and accessibility. Prototype schemas at form/API/storage boundaries (CAP-09). Compare interoperability with a native validator before choosing an API. | Finish one accessible form with validation errors tied to fields and types inferred from its schema. |
| 4. Reactive composition and application data | Define reuse, effects and lifecycle (CAP-01), then scoped shared state (CAP-02). Use Task desk to study remote resources and writes (CAP-03), then storage, migrations and recovery (CAP-04) together with CAP-09. | Demonstrate scoped sharing and a complete read/edit/recovery flow, including isolation across app instances and clear behavior when a write response is lost. |
| 5. Packaging and stateful HMR | Define the compiler adapter boundary and exercise dependency resolution, npm, CSS/assets and source mapping (CAP-10). Use Vite as the first candidate. Complete stateful HMR once replacement and cleanup can be verified (remaining CAP-06). | Build one app through Vite and another host. Verify that an edit preserves compatible state and that replacement cleans up the previous instance. |
| 6. Server integration | Define request ownership and the server/client boundary together. Prototype SSR and hydration (CAP-05), Server Actions (CAP-08) and Server Components (CAP-07) as separate increments using that boundary. | Render and hydrate a page, verify an authorized typed mutation with retry semantics, then compose server-rendered data with interactive client UI and verify the client output excludes server-only dependencies. |
| 7. Ecosystem and release readiness | Grow styling integrations, accessible component kits, deployment and release tooling as the required contracts mature. Scope routing against a concrete application. | An independent project consumes the documented packages and verifies the supported build, browser and deployment workflows. |

Security and performance checks run throughout. Keep the existing regression
matrix, measure representative end-to-end latency and delivery, and continue
the [competitive performance work](PERFORMANCE-TARGET.md) alongside application
DX. Server and persistence work must demonstrate isolation and authorization at
the relevant boundaries before their acceptance.

### Guard implementation design

**Experimental Surface syntax.** A guard names an exit condition. Evaluate it
once. The earlier `// @surface-guard` marker can be removed from prototype
files. Surface still accepts it on the first line for compatibility.
A false value continues the action. A true value runs the optional `then`
block, then returns from the current action when that block finishes normally.
An exception propagates and an explicit `await` in an async action retains its
normal behavior. Start with statements directly in an action body and actions
without value returns. Diagnose a value return in that action at its source
location. Returns inside nested functions are outside that restriction.

```surface
guard (pending || retired)

guard (
  kind === "delete" &&
  (!selected || !deleting || creating || deleted || status.phase !== "empty")
);

guard (kind === "save" && (deleting || deleted));

guard (kind === "save" && (!selected || title.trim().length < 5)) then {
  error = "Use at least 5 characters for the title";
}
```

The short form is `guard (condition)`. A semicolon is optional when the
statement ends at a line break or the action's closing brace. The block form is
`guard (condition) then { ... }`. Require braces after `then` and diagnose
`then;` with a source range and guidance to add a block or remove `then`.
Require `then` on the line of the closing parenthesis.

A standalone one-argument `guard(condition)` has the same spelling as a
TypeScript call. In a direct action statement, Surface treats it as a guard.
The checker and editor resolve `guard` in that scope. If a value has that name,
`ELN-GUARD-CALL` points to the keyword and the build refuses the ambiguous
source. Rename the function binding or call it through an explicit receiver
such as `policy.guard(condition)`. Calls used inside expressions or made
through a receiver remain TypeScript. The ambiguity check applies with or
without the semicolon.

1. **Parse and lower in one place.** Recognize the two forms at action statement
   boundaries, using lexical or TypeScript AST boundaries rather than a global
   text replacement. Read a balanced condition and an optional balanced block.
   Record the full guard, condition, keyword and block spans in original UTF-16
   offsets. Preserve copied condition, block and surrounding TypeScript as source
   segments. Lower to `if (condition) { /* block */ return; }` with synthetic
   control-flow segments. Parse the resulting TypeScript strictly to validate
   the action and use the normal function scope when checking for value returns.
   Keep strings, template expressions and comments outside guard recognition.
2. **Share the projection.** The checker and editor should consume the same
   copied and synthetic segments as the lowered action source. The checker
   currently maps a contiguous action body and the editor copies it verbatim.
   Use segment mapping for guarded bodies so diagnostics, completion and rename
   can point at the original condition, block or following statements. Give
   missing condition and `then` body their own source diagnostics. Mark
   inserted syntax as synthetic. When a complete condition is followed by
   a bare `then` at the end of a line or by `then;`, the editor highlights `then`
   and keeps completion and diagnostics in the following statements. It treats
   the missing block as having no control-flow effect and keeps nullable
   values nullable until the guard is complete. A direct guard with a missing
   closing parenthesis can also recover in a single-line or indented multiline
   condition. The editor points to the opener and keeps completions in the
   condition as well as diagnostics below it. For multiline input, recovery
   needs a clear indentation boundary and TypeScript must recognize the
   preceding lines as one expression or an expression unfinished at its end.
   The repair preserves original offsets and only applies when the surrounding
   action parses with a direct statement at that position. Check and build
   reject the incomplete source. Ambiguous boundaries and additional placements
   retain the normal parser diagnostic.
3. **Use the existing emitter.** Pass the lowered function to the normal
   compiler. For the first prototype, rely on the general renderer when regional
   analysis rejects the lowered conditional control flow. Measure the coverage
   and cost of that fallback before adopting guards in public examples.
4. **Format the source form.** The formatter uses an equally wide TypeScript
   representation of the action to apply whitespace edits at original offsets.
   Keep `then` on the closing-parenthesis line and its opening brace on the
   same line. Preserve literals and comments and require an empty second
   format pass.

Accept the prototype when the four Task desk guards match their existing gates,
including no request on early exit and the title error before returning. A
separate `guard (!task);` case should narrow `task` in the following
statement. Verify that ordinary member calls still typecheck, that ambiguous
standalone calls are reported before the project emits code, and that an async
guarded branch returns correctly. Verify that malformed syntax, including
`then;`, receives an actionable original-source diagnostic. Ask a reader to
predict what `guard (pending);`
does before explaining the syntax. Use that feedback to assess the exit polarity
and whether the shorthand pays for an additional language construct.

### When to take up this backlog

The priority order sets no dates. Preserve the current
bounded MVP and its outstanding human feedback. Select a capability when a real
workflow demonstrates its need, required contracts are ready, and a small spike
can test alternatives with explicit exit criteria. Scope, representative example,
DX questions, correctness/security checks and runtime/delivery costs must be
stated before implementation.

CAP-01/02 underpin reusable ownership; CAP-03/04/09 should be explored together at
data boundaries. CAP-10 can enable CAP-06 incrementally. Review CAP-05/07/08
together before fixing server/client contracts, while allowing separate small
experiments. These are dependency guides, not a demand to finish one entire
subsystem before learning about another. Keep this map current when a capability
is selected, split, demonstrated or rejected, linking its contract and evidence.
The existing ecosystem stages below remain separate acceptance tracks.

## Proposed sequence and completion criteria

| Stage | Scope | Exit criterion |
| --- | --- | --- |
| 1. DOM and forms | Typed DOM attributes/properties/events, ARIA/data attributes, dynamic classes, textarea/select/checkbox and binding semantics | Task desk uses real form controls; type errors map correctly; keyboard, composition/input and teardown behavior verified |
| 2. Styles and modules | Narrow bundler adapter (Vite is a candidate), npm browser resolution and exports, CSS/assets; Tailwind first | A clean fixture imports a real JS package and builds/rebuilds Tailwind styles with source maps and restrictive preview policy intact |
| 3. Styling adapters | Explicit StyleX pipeline and style application contract | Static, conditional and dynamic styles run in a real browser without forcing React or bypassing security policy |
| 4. Component-library foundation | Surface component packaging, themes/tokens, controlled/uncontrolled conventions; refs/lifecycle, overlays and focus where required | Independently consumed small kit with accessible Button, Field, Checkbox, Select and Dialog; exports, types, CSS and cleanup verified |
| 5. Broader application pilot | Persistent tasks through an explicit storage/API contract, async errors/loading, routing as separately scoped needs | Repeatable representative workflows and independent human authoring/recovery feedback |
| 6. Release hardening | Stable package contracts, browser matrix, docs/templates, compatibility/version policy, startup/memory/delivery characterization | Published acceptance checklist satisfied before any production-readiness claim |

Stages may overlap where contracts permit; do not build a large component kit
before proving its underlying DOM, accessibility and package boundaries. A
small distribution spike can start alongside stages 1–2. External component
islands are optional migration work, not a prerequisite for native Elnor apps.
No package installation or adapter implementation is authorized merely by this
proposal.

Keep the accepted broad performance matrix as a regression guard for affected
core changes. Integrations must report their own bundle/runtime costs rather
than inheriting the core's benchmark claim. Rust is not needed to solve the
currently observed interoperability gaps.

See [current architecture diagrams](ARCHITECTURE.md) and
[Task desk findings](TASK-DESK-PILOT.md). Human DX acceptance remains open.
