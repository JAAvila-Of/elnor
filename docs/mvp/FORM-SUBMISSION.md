# Experimental native form submission

Integrated locally: 2026-11-17. Task desk's new-task composer now uses native
form submission. This is a client-side state/action boundary, not HTTP form
serialization, a server action or a general DOM event system.

```eln
component Composer() {
  state title = "";
  state busy = false;
  action create() { title = ""; }
  ui {
    form class=("composer") => create() {
      input "Title" <-> title
      submit disabled=(busy) "Create"
    }
  }
}
```

## Authoring and DX boundaries

The form owns one submit expression. A submit button supplies a caption and
uses that form action, without a second click handler. A simple static class
may also use form .composer => create() followed by its block. The expression
is checked and mapped to the original source like existing button actions.
Definitions, rename and formatting retain the original form action reference.

Forms accept the existing string class boundary. Submit buttons accept class
and boolean disabled; existing buttons retain type button. Labels remain
textContent, and caption expressions may include literal arrow-like text.
Form action/method/URL attributes and arbitrary event or attribute spreading
remain unsupported.

The later [submit composition increment](SUBMIT-COMPOSITION.md) removes the
same-component restriction: a reusable submit button uses its native DOM form
association. Outside any form it is valid and inert. Form-owning components can
still emit typed events to parents; controlled fields remain separate work.

Nested forms remain rejected, including imported components and slot content.
The later [rendered topology analysis](SUBMIT-COMPOSITION.md) accepts sibling
forms in slots while rejecting real nesting, with explicit expansion limits.
Conditional branches do not establish an exception to this structural rule.
Validation/evidence below belongs to the original submission increment; this
document does not claim validity checking for every HTML nesting rule.

## Native behavior and asynchronous actions

The browser supplies implicit Enter submission from single-line controls,
activation of submit buttons and requestSubmit behavior. Elnor attaches no
global Enter listener. Enter in textarea keeps inserting a newline. A disabled
submit button follows native behavior. An ordinary button does not submit.

On submit, Elnor calls preventDefault synchronously, then invokes the form
expression exactly once. Default browser navigation is therefore prevented
before an async action reaches its first await. The existing restrictive CSP,
including form-action none, remains active. These are independent protections.

Loading/error state, duplicate-operation prevention, stale results, retries
and cancellation remain action/application responsibilities. Submission does
not create an async transaction or cancel a pending operation on unmount.
The form handler is removed on disposal; captured retired handlers cannot
invoke its action. Pending promises retain the existing runtime contract.

Native constraint validation precedes a native submit event; this increment
does not expose required/pattern or a validation API. HTMLFormElement.submit()
bypasses submit events and is not an Elnor action entry point. Automatic native-default reset,
FormData/names, external form association, multiple submitter payloads, server
submission and SSR/hydration remain outside this boundary.

## Architecture and Svelte contrast

General rendering uses an owned submit listener with an active guard. Both
regional modes lower form actions through the existing proven action/event
metadata and a tenth prunable forms capability. Native child-component events
also prevent default before emitting. Existing graph event paths retain their
previous behavior when forms support is pruned.

The inspected local Svelte legacy preventDefault wrapper calls preventDefault
before invoking its callback: src/internal/client/dom/legacy/event-modifiers.js,
SHA256 1586c18b35c9523ecbc5f4bf170547ccc07e2078eb432f727321b93ee60d7644.
This is a mechanism reference, not adoption of Svelte's legacy modifier API.
Elnor uses its own Surface form action and existing ownership/compiler paths.

## Validation and provenance

Evidence is retained under elnor/.elnor/mvp/form-submit/:

| Gate | Result | Evidence |
| --- | --- | --- |
| Complete isolated candidate | Check/build, 772 tests across 65 files | full-eaf80fa9f34b482eae69f3282f171553 |
| Native VS Code in Docker/Xvfb | 15 original, 5 DOM editor, 5 checkbox, 5 select and 5 form | native-complete-a74740b7e5c44f838e79ead44ff511b2 |
| Three forced browser renderers | Enter, click, Space, requestSubmit, disabled, textarea, no navigation and removal | browser-333cddc96eb341c5acf67acb158feb43 |
| Task desk | Creation via Enter plus existing validation, save/cancel and draft flows | app-browser-6645e75f670c4a0a81ee1b14556f1931 |
| Exact public transfer | Check/build and 97 form/control/app/editor/worker tests | promotion-fad180ea8a4445f3893355d4af5f8832 |
| Nine existing graphs | Delivery and bound-identifier-normalized structural equality | cost-6130a21b095545ccb9797e9c8142fc44 and proof-62da0d7cecc44e07a03abfb4cc927532 |

The new 24 Node cases include original-source spans, invalid nesting, type
errors, editor snippets, rename/formatting, async default prevention, component
emission, three-renderer ownership and repeated invocations. The fake DOM
explicitly delivers submit events; native Enter/click/Space are browser-tested.
Task desk's fake-DOM helper now dispatches submit for native submit buttons.

The browser also checks composing text does not submit until an explicit Enter
after protocol commit. That is not acceptance of an operating-system IME or its
candidate-confirmation Enter behavior. The separate composition report retains
its narrower protocol scope. No screenshots or desktop VS Code session are used.

Candidate and transfer hashes are checked, prior code and documentation are
archived, and native payloads/owned-container removal are verified. Initial
red tests and intermediate compiler/editor failures remain in the internal
run history. No remote publication is implied.

## Delivery cost

| Existing graph | Previous gzip bytes | Candidate gzip bytes | Delta |
| --- | ---: | ---: | ---: |
| counter | 3027 | 3027 | 0 |
| form | 6528 | 6528 | 0 |
| composition | 2275 | 2274 | -1 |
| localized | 5041 | 5041 | 0 |
| keyed | 10914 | 10914 | 0 |
| form-wide | 15911 | 15911 | 0 |
| composition-deep | 2472 | 2472 | 0 |
| localized-wide | 19761 | 19761 | 0 |
| lifecycle | 7101 | 7101 | 0 |

All nine existing generated programs match after normalizing bound local
identifiers, preserving syntax, strings and external/property names. This is
structural evidence; it is not a new CPU, latency or memory benchmark. Earlier
Svelte/React performance evidence retains its own revision and scope.

Task desk replaces its click-only composer with a native form:

| Delivery | Previous composer | Native form composer | Delta |
| --- | ---: | ---: | ---: |
| JS bytes | 21641 | 22762 | 1121 |
| JS gzip bytes | 6804 | 6920 | 116 |
| CSS bytes | 3168 | 3168 | 0 |
| CSS gzip bytes | 1174 | 1174 | 0 |

Gzip uses level 9 and measures JS separately from external CSS. Unbundled
runtime source changes by 274 bytes. Evidence: app-cost-038a03a77e3345298f1e739995ce02c9.

The DOM/forms roadmap remains incomplete, including automatic native-default restoration/submission data,
controlled fields, broader attributes and independent human authoring feedback.

The later [managed reset increment](FORM-RESET.md) adds a typed `on reset()`
action and native reset buttons, including reusable components and slots. It
passes 45 native editor checks. The form cancels native defaults and runs the
explicit state action; automatic native-default restoration remains outside scope.
