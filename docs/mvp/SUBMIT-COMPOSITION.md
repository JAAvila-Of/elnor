# Reusable submit components and rendered form placement

Integrated locally: 2026-11-17. A submit button may now be authored in its own
Surface component and associated with the form that contains it in the DOM.
Task desk uses the new SubmitButton component in its existing composer.
The form still owns the one action; the reusable button receives no handler.

```eln
component SubmitButton(label: string, disabled: boolean) {
  ui {
    submit disabled=(disabled) label
  }
}
```

```eln
import SubmitButton from "./SubmitButton.eln";

component Composer() {
  state title = "";
  action create() { title = ""; }
  ui {
    form => create() {
      input "Title" <-> title
      SubmitButton label="Create" disabled=(false)
    }
  }
}
```

This example uses explicit props. Existing optional-prop/fallback conventions
remain available; there is no new automatic default or controlled-field API.
Class/disabled typing, native caption text, prop definitions, cross-component
rename and formatting use the existing component/editor contracts.

## Native association and the intentional contract change

The parser no longer requires submit to be in the same file/component as form.
There is no JavaScript form context, action prop, generated form ID, duplicate
click handler or MutationObserver. The button uses native HTML form association.

A submit outside any form is now valid and inert: it has no implicit Elnor
action and does not navigate in the tested isolated preview. This replaces the
earlier ELN-FORM-CONTEXT rejection intentionally. Moving a reusable button under
a form gives it that form's native association; ordinary button remains type
button. Association with foreign host HTML, explicit form IDs and portals are
not new Elnor APIs in this increment.

The existing form handler still prevents default synchronously, including before
an async action awaits. Error/loading state, concurrent requests, stale results
and cancellation remain application responsibilities. The separate async
operation follow-up remains open.

## Rendered form topology

The old conservative test treated any form in a component and any form in its
slot content as nested. The new validator follows actual component and slot
placement. A callee's own form and a provided form may be siblings when the slot
is outside that callee form. Providing that same form to a slot inside the callee
form is rejected with ELN-FORM-NESTING.

Default and named slots carry the caller's lexical imports and slot bindings,
while inheriting the callee's rendered DOM ancestry. Forwarded slots retain that
continuation. The same component is checked separately for each form context;
a safe occurrence cannot hide a later invalid occurrence. Diagnostics map to
the original caller component reference or supplied form tag, including CRLF
and UTF-16 source offsets.

This is static structural analysis. All conditional branches remain considered;
arbitrary TypeScript conditions are not executed to prove mutual exclusion.
Expansion is bounded at 64 component/slot levels and 12000 visited nodes per
analyzed root. Unproven recursive form placement reports ELN-FORM-TOPOLOGY rather
than silently accepting a graph. Unrelated recursion without forms is excluded
from this analysis. The check does not establish all HTML nesting rules, dynamic
component selection, portals, shadow-DOM form association or SSR/hydration.

## Renderer scope and pilot

A component whose root is a submit button works through the existing general
fallback. It does not need a wrapper to function. The current region analyzer's
container-root boundary is unchanged; this increment does not claim new region
eligibility for a button-root component. The browser fixture separately uses a
container-root submit component on blueprint and sequential routes, and a
button-root component on the general route.

Those three forced routes verify button.form, inert orphan activation, implicit
Enter, click/Space, requestSubmit, disabled behavior, textarea newline retention,
one action per submit, no navigation and disposal. A separate general-renderer
slot fixture verifies two sibling forms with independent actions and native
Enter/requestSubmit, plus retirement of both forms. Task desk retains its existing
native composer flow while consuming the reusable button.

The browser runs are sandboxed headless Edge with restrictive preview CSP and no
observed page errors. Composition followed by commit/Enter retains the previous
bounded protocol scope; it is not human OS-IME or screen-reader acceptance.

## Evidence and delivery cost

Evidence is retained under elnor/.elnor/mvp/submit-composition/:

| Gate | Result | Revision |
| --- | --- | --- |
| Complete candidate | Check/build, 787 tests in 66 files | full-ea1213c8ec4a42abb557481e8934ff09 |
| Native VS Code, Docker/Xvfb | 15 original and five checks each for DOM, checkbox, select, form and reusable submit | native-complete-16f213ae32bd46679e878c39d178d808 |
| Three forced renderer flows | General button-root child; blueprint/sequential container-root child | browser-811300dd855646219a173b5d013e742b |
| Slot-rendered sibling forms | Independent actions, no navigation and disposal | slots-28d6909cff8143508c2346a494c0cadb |
| Task desk | Existing Enter, validation, checkbox, edit/save/cancel and draft flows | app-browser-9e8ab2c4c1fa4a1d8c262b46291d2f30 |
| Nine existing graphs | All nine minified bundles are byte-identical within this paired run | cost-d8d9cff35e2147d898caa589594743f2, proof-5d43d363d3dd474cb2b4eda67127ddfb |
| Exact public transfer | Check/build and 112 tests | promotion-5d1c63df1cab47deaa20f8ef6a687195 |

The 15 new Node cases cover reusable/orphan submit, prop typing, default/named/
forwarded slots, lexical imports, repeated contexts, transitive nesting, analysis
bounds, UTF-16 diagnostics, editor rename and compiled behavior. The previous
form test now retains nesting/prefix rejection while accepting native orphan
semantics. No regression case was removed to hide an implementation failure.

Runtime and region-runtime sources, and both code generators, are byte-identical
to the previous public revision. This is a parser/semantic-validation change with
a pilot component extraction. It adds no form observer, context registry or
runtime lookup. New runtime CPU or editor latency measurements are not asserted.
The topology pass itself is compiler/editor work and has the limits above.

| Task desk delivery | Inline submit | Reusable SubmitButton | Delta |
| --- | ---: | ---: | ---: |
| JS bytes | 21826 | 23050 | 1224 |
| JS gzip bytes | 6879 | 6957 | 78 |
| CSS bytes | 3168 | 3168 | 0 |
| CSS gzip bytes | 1174 | 1174 | 0 |

Gzip is level 9 and JS/CSS are measured separately. The component abstraction
changes the application graph, so this is a delivery comparison, not controlled
CPU or latency evidence. app-cost-caa06a36a2ca4676b042e6847934bf48 retains exact inputs and output hashes.

Candidate/public hashes, native payloads, owned container cleanup, old files and
complete revisions are retained by the promotion manifest. Existing failed red
cases remain in the internal history. No remote publication is implied.

## Svelte contrast and remaining scope

The inspected Svelte RegularElement visitor validates native ancestor placement
and stops that particular ancestry walk at component/snippet boundaries. Local
source: src/compiler/phases/2-analyze/visitors/RegularElement.js, SHA256
d7d00f3b2f82d0f3ee98e49e5865bcd3a8fd7cd97d330b0f5fa94f2b001093c1.
Elnor uses its own bounded expansion of known Surface components and lexical
slot continuations for this form-only check. This comparison does not claim
equivalence to Svelte's broader HTML validation or behavior across every boundary.
No implementation was copied.

Automatic native-default restoration/data serialization, external form IDs, controlled fields, broader
attributes and independent human DX/IME acceptance remain open. The DOM/forms
roadmap is still incomplete.

The later [managed reset increment](FORM-RESET.md) adds a typed `on reset()`
action and native reset buttons, including reusable components and slots. It
passes 45 native editor checks. The form cancels native defaults and runs the
explicit state action; automatic native-default restoration remains outside scope.
