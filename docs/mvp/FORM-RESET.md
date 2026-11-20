# Explicit managed form reset

Surface supports a native reset button whose containing form declares the state
transition explicitly:

```surface
action clear() {
  title = ""
  error = ""
}

ui {
  form => send() {
    on reset() => clear()
    input "Title" <-> title
    submit "Send"
    reset "Clear draft"
  }
}
```

`on reset()` takes no event parameter. Its expression uses the existing typed
action path, including definitions, rename and mapped TypeScript diagnostics.
Only this native event is accepted directly inside a form, at most once.
The form still declares its submit action. `reset` accepts `class` and `disabled`
and generates a native `button` with `type="reset"`.

## State and event policy

The form prevents the native reset default synchronously, then invokes the
declared action once. Bound state remains the source of truth. Elnor does not
restore DOM defaults, snapshot mounting state, or reevaluate state initializers.
The action chooses values and can also clear validation errors. An async action
starts after default prevention; pending state, cancellation and competing
operations remain application responsibilities.

Mouse activation, Space, Enter on the reset button, and `form.reset()` use this
same policy. A disabled reset button cannot activate; it does not disable the
form's programmatic `reset()` method. Reset does not submit. Enter in a text
field still submits, and Enter in a textarea remains multiline.

A reset event already cancelled before Elnor's handler runs invokes no action.
A later listener cannot undo an action already invoked. Disposal removes both
form handlers; captured retired callbacks are inert.

## Composition and diagnostics

A reset rendered inside a form requires that form's `on reset()` declaration.
Otherwise `ELN-FORM-RESET` points to the reset tag or original component use.
This check expands known components and lexical slot continuations, preserving
the nested-form validation and its existing traversal bounds. Each use is
checked in its own enclosing form. A reset outside any form is valid and inert.

Reusable reset components use the existing renderer fallback where necessary;
container roots retain blueprint/sequential support. Reset uses the existing
prunable forms capability rather than introducing a new capability or a global
field registry.

Task desk reuses `clear()` after successful submission and from **Clear draft**.
Clearing blanks the composer fields, unchecks priority and clears its validation
error without changing the task collection or the selected task's edit draft.

## Svelte contrast

The inspected Svelte source is `src/internal/client/dom/elements/misc.js`, SHA256
`67343880905ec434762146fc06aa3acf64ab0a992bbfd6a15a11d74d705f9438`.
Its document capture reset listener waits a promise turn and, unless cancelled,
lets bindings read the browser's reset values. Elnor instead owns a per-form
listener and an explicit typed state action, cancelling native defaults. This
is a deliberate policy difference; no implementation was copied.

## Retained verification

| Gate | Result | Internal evidence |
|---|---|---|
| Complete candidate | Check/build; 813 tests in 67 files | full-9e17f2bc8b604f76a73770566d2f22e3 |
| Browser renderers | General, blueprint and sequential; native and programmatic reset | browser-053090600d9c43b7b40c0baafaa9b826 |
| Slots | Independent enclosing form policies and retirement | slots-09f3ec6c1bb447d789c6af71240a0413 |
| Task desk | Clear draft, errors, existing CRUD/ARIA/mobile flows | app-browser-06a6075bf30b4dbcb20172fe9437cb24 |
| Native editor | 45 checks; Docker/Xvfb, Workspace Trust intact | native-complete-e43b035e37da4432a23b121c342402ea |
| Existing delivery graphs | Nine structurally equivalent bundles; unchanged raw/gzip sizes | proof-e048cf13f7c5403b911bb93132598ad5 |
| Task desk delivery | JS +1169 bytes, +127 gzip-9 bytes; CSS unchanged | app-cost-b6388f1c40e043049a1857e41225a869 |
| Exact public transfer | Check/build; 138 tests | promotion-0bf371208ee844d0b1fe067a0d44bf11 |

Evidence is retained under `elnor/.elnor/mvp/form-reset/`. The promotion
manifest retains before/candidate archives and exact source hashes. All test
cases passed without skips or cancellations. The native suite uses the existing
1 GiB limit, CPU/pids limits and owned-container cleanup. No desktop editor was opened.

DX friction: every containing form must declare its reset action; reset does
not infer initial values. This keeps application state and validation policy
explicit. The general fallback for a component whose root is a reset button
remains the existing component fallback. Independent human acceptance is pending.

This increment covers managed reset. Automatic restoration of native defaults,
FormData/names, external form IDs, controlled bindings, broader attributes and
independent human DX/IME acceptance remain open. Bundle equivalence is a
regression check, not a new CPU-performance claim.
