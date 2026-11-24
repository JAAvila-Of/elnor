# Surface MVP subset: implemented baseline

**Status:** implementation-derived baseline for the first MVP, not a new grammar
or a production support promise. The technical investigation is closed; the
[MVP plan](../../tasks/005-mvp.md) now uses this inventory to bound further work.

The [v0.3 specification](SPECIFICATION.md) remains the destination design. Its
support criterion includes formatting. A first conservative indentation
formatter now exists, but full layout and verified native formatting remain absent. Accordingly,
"baseline" below means implemented and exercised within the stated evidence;
it does not mean every destination support requirement has been met.

## How to read the statuses

| Status | Meaning |
|---|---|
| Baseline | Present in parser/checker/generation/runtime and exercised in the cited corpus; preserve this behavior while building the MVP |
| Experimental | An implementation route or bounded corpus exists, with material limits on usage or integration |
| Explicit rejection | A tested diagnostic or operation refusal exists for the stated case; this is a current boundary, not necessarily a permanent language rule |
| Deferred | Outside this MVP baseline; do not assume either support or comprehensive rejection merely because the parser accepts or rejects a particular example |

This document describes the baseline. [Operational contracts](MVP-CONTRACTS.md)
describe the compiler, editor and runtime boundaries. Neither document expands
the accepted syntax or approves every feature in the design draft.

## Component and declaration baseline

One `.eln` file contains import declarations followed by one
`component Name(props) { ... }` and one `ui { ... }` block. The current parser is
bounded, not a complete error-tolerant Surface grammar. Use ASCII identifiers
for Surface declaration names and uppercase local aliases for component tags;
Unicode filenames and Unicode within TypeScript strings/ranges have separate
evidence and do not imply Unicode Surface identifiers.

| Form | Baseline behavior | Evidence |
|---|---|---|
| `component Badge(label: string)` | Typed named props, checked across Surface consumers | [composition tests](../../tests/spike.test.mjs) |
| `label?: string` | Omission and explicit `undefined` are accepted; use an explicit fallback expression | [acceptance tests](../../tests/acceptance-parity.test.mjs) |
| `state count = 0;` or `state count: number = 0;` | Per-instance mutable binding; initializer runs once | [initialization tests](../../tests/initialization-parity.test.mjs) |
| `calc doubled = count * 2;` | Derived binding tracked through the runtime's cells/effects; direct reassignment is rejected | [scope tests](../../tests/scope-parity.test.mjs), [initialization tests](../../tests/initialization-parity.test.mjs) |
| `action increment() { count++; }` | TypeScript parameters/body, lexical locals and tested shadowing preserved | [scope tests](../../tests/scope-parity.test.mjs), [name hygiene](../../tests/name-hygiene.test.mjs) |
| `action async save() { await persist(); }` | Async action execution and state updates in tested flows | [composition tests](../../tests/spike.test.mjs) |
| `action group editing(id) single-flight` with `action async save() in editing { ... }` | Experimental. Concurrency policy per owner: `single-flight`, `latest`, `keep-latest`, `queue`, with `timeout` and `debounce`; `durable "name"` stores each call as an intent that survives a reload and resumes the body after its first `await`. Browser acceptance of `durable` has not run | [policies](../mvp/ASYNC-POLICY.md#action-groups), [groups](../../tests/action-groups.test.mjs), [durable intents](../mvp/ASYNC-POLICY.md#durable-intents), [durable groups](../../tests/durable-groups.test.mjs) |
| `event changed(value: number)` / `event closed()` | One named payload parameter or none; `emit.changed(value)` calls an optional supplied handler | [composition tests](../../tests/spike.test.mjs), [graph validation](../../tests/semantic-parity.test.mjs) |

The selected prop forms use simple names, with types or optional markers as
shown. Destructured/default/rest component props and generic component headers
are not added to the baseline just because some parameter text can be parsed by
TypeScript. Default prop initializers are explicitly rejected.

State and calc declarations require a terminating semicolon. For a multiline
initializer, put `= (` at the end of the declaration line and close the expression
with `);`. The expression inside the parentheses can use nested TypeScript
expressions, and the checker and editor map their diagnostics to original lines.
Action bodies can span lines. The current Surface action
header does not implement an explicit return-type annotation after its parameter
list. TypeScript fragments reuse TypeScript parsing and symbols, but the Surface
boundary scanner does not establish compatibility with every TypeScript lexical
form. Calcs are intended for derivation; general purity enforcement is absent.

## UI baseline

Use one UI statement per line, with nested block closing braces on their own
lines. Blank lines and line comments can separate statements. These are the
current parser's UI forms, not a claim of arbitrary HTML or JSX:

| Form | Accepted shape and limit |
|---|---|
| Containers | `section`, `main`, `article`, `header`, `div`, `ul`, `li`, `footer`, `nav`, optionally followed by one `.class-name`, then `{ ... }` |
| Text | `h1`, `h2`, `h3`, `p`, `strong`, `small`, `span`, followed by a TypeScript expression; output uses `textContent` |
| Live status | Experimental `output message`; native HTML output with an optional class and a text expression |
| Button | `button "Increment" => increment()`; a text expression and click expression, not a general DOM event/attribute system |
| Text input | `input "Name" <-> draftName`; a double-quoted label and a single state identifier; no nested-path binding or automatic numeric/checkbox conversion |
| Boolean checkbox | `checkbox "Completed" <-> completed`; direct mutable boolean state, native checked/change, optional class/disabled; no nested/controlled binding. See [evidence](../mvp/CHECKBOX-BINDING.md) |
| Native select | `select "Priority" <-> priority {` with literal `option "Normal" => "normal"` lines; direct string state, option-union writes, optional class/disabled. See [evidence and limits](../mvp/SELECT-BINDING.md) |
| Native form | `form => create() { ... }` with `submit "Create"`; one action on native submit, synchronous navigation prevention, optional class and submit disabled; reusable submit components/slots and inert orphan buttons; [limits and evidence](../mvp/SUBMIT-COMPOSITION.md) |
| Component cleanup | One `on dispose() => release()` in the component body; synchronous void expression, instance retirement, conditional/keyed/slot placement and UI rollback. Regional fallback is explicit. The editor warns with `ELN-UNOWNED-WORK` when an interval, listener, subscription, connection or observer is never released. [Contract and evidence](../mvp/COMPONENT-DISPOSAL.md) |
| Managed reset | `on reset() => clear()` directly inside a form and `reset "Clear draft"`; explicit typed state action, native defaults prevented, reusable components/slots, class/disabled and inert orphan buttons. [Contract and evidence](../mvp/FORM-RESET.md) |
| Conditional | `if expression { ... }`; an `else` form is outside this baseline |
| Repetition | `each item in items by item.id { ... }`; array input, explicit stable key, tested reuse/reordering |
| Child component | `Badge label="Ready"` or `Badge label=(expression) { ... }`; the uppercase local name must come from a Surface import |
| Child event | `on changed(value) => handle(value)` or `on closed() => handleClose()` inside a child-component block |
| Default slot | Child content fills `slot` in that child |
| Named slot | `fill actions { ... }` fills the child's `slot actions` |

Component prop names use the current identifier form. Simple values can follow
`=` directly; expressions containing spaces should use a parenthesized value.
This does not establish multiline UI expressions, spreads or arbitrary DOM
attributes. `on` and `fill` belong to child components, not standalone DOM nodes.
Unknown slots, duplicate fills/handlers and tested payload arity errors are
checked in the [graph validation corpus](../../tests/semantic-parity.test.mjs).
An unknown tag is not implicitly an available component.

The [composition corpus](../../tests/spike.test.mjs) exercises all these node
kinds. The [real Edge pilot](../spikes/004/VIABILITY-CLOSURE.md) exercises the
UserEditor composition path, not every node/argument variation in a browser.
CSS is currently the external preview stylesheet; component-local `style`
blocks or automatic CSS isolation are not in this baseline.

## Experimental DOM classes

`class=(stringExpression)` may follow any supported DOM container, text tag,
button or input before its existing payload. It accepts literal or dynamic
strings, including imported named values. The input itself receives the class;
the generated label does not. Keep `.name` or the expression on a container,
not both. Other DOM attributes and style objects remain outside this contract.
See [usage, tests and native/browser evidence](../mvp/TYPED-DOM-CLASSES.md).

## Native control groups

Use a `fieldset` block to group related controls. An optional `legend` takes
a text expression and names the group. Place it first and directly inside its
fieldset. Both elements accept the usual `class=(...)` prefix.
On `fieldset`, `disabled=(booleanExpression)` uses the browser's native
group behavior. Use it when related controls share an enabled state.

```elnor
fieldset disabled=(busy) {
  legend "Contact preferences"
  input "Email address" <-> email
  checkbox "Send updates" <-> updates
}
```

## Experimental multiline text binding

`textarea "Description" <-> draft` uses a local mutable string state and a
native labelled textarea. Optional `class=(stringExpression)` precedes its
label. The checker verifies both string reads and arbitrary string writes;
props, calcs and nested paths are rejected. See [contract and current evidence](../mvp/TEXTAREA-BINDING.md).

## Experimental disabled property

`button disabled=(busy) "Save" => save()`, `input disabled=(busy) "Name" <-> draft`
and `textarea disabled=(busy) "Notes" <-> draft` accept boolean expressions.
The same disabled prefix also works on the experimental native checkbox.
Optional class and disabled prefixes may appear in either order. The actual
control receives the native boolean property. See [contract, DX limits and evidence](../mvp/DOM-DISABLED.md).

## Experimental field errors

`input`, `textarea` and `select` accept an `error=(...)` string expression.
An empty string clears the error. A nonempty string appears as plain text next
to the control. The control receives `aria-invalid="true"` and an
`aria-describedby` reference to the message, which is in a polite live region.
The original label still names the control. The action owns validation and
submission. The editor suggests the prefix and typechecks the value at its
source location. Components using this prefix use the general renderer for now.

```elnor
textarea error=(descriptionError) "Description" <-> description
select error=(priorityError) "Priority" <-> priority {
  option "Normal" => "normal"
  option "High" => "high"
}
```

### Focus on invalid submit

A form can opt in with a boolean expression using `focus-invalid=(...)`.

```elnor
form focus-invalid=(true) => save() {
  input error=(titleError) "Title" <-> title
  textarea error=(descriptionError) "Description" <-> description
  submit "Save"
}
```

The form reads the flag on submit and waits for the resulting reactive DOM
updates. It focuses the first invalid, focusable control belonging to that
form in DOM order. Corrections update messages without moving focus. Reset or
disposal cancels a queued focus move.

Use this for validation performed during submission. A later server response
can update field messages without initiating a focus move. The option uses
the general renderer.

### Experimental text input callbacks

`input` and `textarea` accept `on-input=(callback)` alongside a local
`<->` binding. The editor suggests the prefix and typechecks the expression
as `(value: string) => void`.

```elnor
input error=(emailError) on-input=(emit.changed) "Email" <-> email
textarea on-input=(updatePreview) "Notes" <-> notes
```

Each native `input` event writes the bound state and then calls the callback
synchronously with the new text. Initialization and programmatic assignments,
including resets, only update the binding. This lets a child publish edits to
the parent before a submit in the same turn. The prefix keeps this behavior on
the field and saves authors a separate Apply action or a nested event block.

Components using the callback use the general renderer. The experimental
state-preserving hot replacement falls back to regular live reload for them.

### Experimental form schema helper

The [TypeScript helper](../../src/form-schema.ts) accepts Standard Schema v1
validators. Use `bindFormSchema(schema, ["title", "description"])` for flat
fields whose names match the validated output. Use `bindFormPaths(schema, {
requester: ["requester", "name"] })` to type explicit input paths separately
from transformed output. The path variant requires the schema's input type
metadata and accepts up to four path segments, using string keys for
objects and numeric indices for arrays. A numeric index is distinct from
a string key with the same spelling.

For repeated controls, construct the validation input and the path
bindings from the same row order. Use a stable row ID for the binding
name and the Surface `each` key. The array index identifies where a field
was validated, and the row ID identifies the control that owns its message.

`validate(input)` returns the checked output or the original issues. An
issue list takes precedence over a partial value. `fieldErrors(result)`
returns the first message for each exact bound path, or an empty string.
`unboundIssues(result)` returns issues without a matching bound path in
their original order and shape. It includes form-wide issues and group
paths that have no exact binding. A parent path does not match a field below
it. The caller decides when each result is visible.

The helper runs synchronously and reports an error if validation returns a
promise. It operates independently of Surface syntax and leaves draft
ownership, reset and submission timing with the form. See the
[Task desk schema binding](../../examples/task-desk/task-draft-form.ts) and
[creation form](../../examples/task-desk/TaskComposer.eln).

### Experimental form and group feedback

Keep `output` mounted and use an empty string until there is a message.
Surface creates a native HTML `output` element, which exposes a polite
status region. The browser can announce text updates without moving focus.
Use `error=(...)` for a message attached to an individual field and
`output` for feedback that applies more broadly.
[HTML Accessibility API Mappings](https://www.w3.org/TR/html-aam-1.0/#el-output)

```elnor
calc summary = form.unboundIssues(showErrors ? draft : undefined).map(issue => issue.message).join(" ");
```

```elnor
output class=("form-feedback") summary
```

## Experimental boolean ARIA states

Buttons accept `aria-pressed=(active)` and `aria-current=(current)` boolean
prefixes alongside class/disabled, serializing both true and false as tokens.
Other ARIA names, roles and non-boolean values remain outside this subset.
See [semantics, DX limits and current evidence](../mvp/DOM-ARIA-STATES.md).

## Experimental DOM authoring assistance

The editor suggests supported property names by host, inserts value snippets,
and recovers one unfinished outer property expression for reading/completion.
Strict compilation and invalid-workspace rename refusal are unchanged.
See [authoring behavior and evidence](../mvp/DOM-EDITOR-COMPLETION.md).

## A baseline example

```eln
component Counter(label?: string) {
  event changed(value: number)
  state count = 0;
  calc caption = `${label ?? "Counter"}: ${count}`;

  action increment() {
    count++;
    emit.changed(count);
  }

  ui {
    section .counter {
      h2 caption
      button "Increment" => increment()
    }
  }
}
```

An optional prop uses an explicit fallback, an action changes a state binding,
and the derived caption observes that binding. This example describes component
source; it does not imply the current fixed-layout CLI can create a new project
or supply preview fixtures for a new entry automatically.

## Imports: keep types and executable modules distinct

| Import use | Status and current boundary | Evidence |
|---|---|---|
| Surface component | Baseline: one default import such as `import Badge from "./Badge.eln";`, used as a component tag | [import tests](../../tests/import-parity.test.mjs) |
| Type-only declarations | Baseline corpus resolves ordinary TS types at original source locations and erases type-only runtime edges | [import tests](../../tests/import-parity.test.mjs) |
| Executable ordinary ESM | Experimental: relative `.mjs`, `.js`, `.mts`, `.ts` static dependencies, including transitive edges; `.js`/`.ts` need ESM package context | [local ESM tests](../../tests/local-esm.test.mjs) |
| Surface identity | Baseline corpus distinguishes same-named sources and maps source files to separate outputs/contracts | [identity tests](../../tests/surface-identity.test.mjs) |
| Physical aliases | Experimental: real paths, file symlinks and directory junctions coalesce in the tested engine/compiler cases | [physical identity tests](../../tests/physical-identity.test.mjs) |
| Open TS editor buffers | Experimental native integration: `.ts`, `.tsx`, `.mts`, `.cts` are synchronized; typed `.ts`/`.mts`/`.cts` cases and a native `.mts` flow are exercised | [adapter tests](../../tests/editor-alias.test.mjs), [native evidence](../spikes/004/TYPE-BUFFERS.md) |

Synchronizing a `.cts` type buffer is different from packaging CommonJS code.
Likewise, synchronizing `.tsx` text does not establish JSX execution or JSX
configuration. No general npm/package bundling, tsconfig compatibility or
JavaScript-buffer editing promise follows from this table.

## Tested refusals and deferred design

| Boundary | Current response / classification |
|---|---|
| Prop default such as `label = "Ready"` | Explicit `ELN-PROP-DEFAULT`; optional prop plus fallback remains available |
| Direct writes to a prop or calc binding | Explicit `ELN-READONLY` in the tested assignment forms; object contents are not thereby deeply immutable |
| Two-way input bound to a prop/calc | Explicit state-binding rejection; only state identifiers qualify |
| More than one event payload parameter | Explicit event arity rejection |
| Multiple components or UI blocks in one source | Current strict parser rejects the tested/recognized trailing or repeated declarations; auxiliary declarations from v0.3 are not implemented |
| Non-default Surface import, rendering a type-only import, or calling a component import as an ordinary function | Explicit `ELN-IMPORT-FORM`, `ELN-IMPORT-TYPE` or `ELN-IMPORT-USAGE` in the tested forms |
| Executable bare package/URL/unsupported extension, missing implementation, CommonJS, dynamic import or `import.meta` | Explicit module-planner diagnostics; see [module boundaries](../spikes/004/LOCAL-ESM.md) |
| Rename reaching an ordinary TypeScript declaration | Explicit operation refusal; no cross-language edit is returned |
| Rename from incomplete, stale, conflicting or unversioned state | Explicit operation refusal in the tested engine/client/adapter flows |
| `page`, `query`, `command`, `watch`, `load`, `fetch`, `resolve`, `match`, forms, server blocks, sealed transport | Deferred Surface design constructs; ordinary TS expressions with similar names do not implement these declarations |
| Conservative indentation formatter | Experimental pure API/read-only CLI; [selected rules and refusals](../mvp/FORMATTER.md) |
| General DOM attributes/events, raw HTML, scoped styles, SSR/hydration, HMR, JSX, auto-imports and full formatting/editor integration | Deferred or absent integration; not a current support claim |

An unsupported program need not receive a specialized diagnostic for every
possible spelling. Parser acceptance alone is not evidence of correct emission,
runtime behavior, safe editing or destination-spec support.

## Evidence snapshot and next work

The subset definition was verified with **287/287 Node cases**. The current suite
passes **463/463**, including 21 authoring-helper, 26 pure formatter and
nineteen versioned-formatting/provider cases, and `npm run check`
checks four example components. The [current native result](../mvp/NATIVE-VALIDATION.md) has fifteen passing tasks; the
retained browser pilot has five checks. The original subset definition was
documentation-only. Later formatter and adapter changes are reported separately,
including the distinction between current Node/API-double coverage and earlier
native/browser evidence.

An assisted [authoring workflow](../mvp/AUTHORING-WALKTHROUGH.md) is now under
evaluation, and the [formatter](../mvp/FORMATTER.md) provides conservative pure
indentation and a read-only CLI. The [versioned adapter](../mvp/VERSIONED-FORMATTING.md)
is implemented with Node/API-double evidence and a bounded native formatting pass.
The [disk invalidation increment](../mvp/DISK-INVALIDATION.md) covers saved local
TS dependencies without editor-buffer adoption.
The [project checker](../mvp/PROJECT-CHECK.md) accepts a saved local entry and
its imported Surface graph outside the fixed examples.
The [project builder](../mvp/PROJECT-BUILD.md) emits checked entries into an explicit
owned output, with generation and entry manifests. The separate
[project preview](../mvp/PROJECT-PREVIEW.md) consumes those manifests with explicit
props/CSS and reload-based generation changes; it has nine Node cases and a
headless Edge pilot. The subsequent [development command](../mvp/PROJECT-DEVELOPMENT.md)
rebuilds saved sources in an explicit scope, retains the last valid build and
reports status on reload; twelve additional Node cases cover that loop. A later
[dependency observation increment](../mvp/OBSERVED-DEPENDENCIES.md) adds polling
of concrete local checker/planner inputs and resolution probes outside the scope,
with ten further cases. Eight later [preview-input cases](../mvp/PREVIEW-INPUTS.md)
cover props/CSS updates on navigation and last-pair retention in dev:project.
Nine subsequent [typed-props cases](../mvp/TYPED-PREVIEW-PROPS.md) validate JSON
against the published build's captured TS contract, including changed-contract
fallback refusal. Standalone preview remains untyped.
This is not complete project freshness. The initial
[configuration contract](../mvp/TYPESCRIPT-CONFIGURATION.md) fixes and exposes
the shared TS profile; loading user tsconfig options and complete project
freshness remain deferred. The priorities and deferred scope remain in
[the MVP task](../../tasks/005-mvp.md); the completed spikes are not reopened by
this inventory.
