# Experimental native select binding

Integrated locally: 2026-11-17. Task desk uses a native select for its existing
priority edit draft. This is single selection with static string options.

```eln
component Priority() {
  state priority = "normal";
  state locked = false;
  ui {
    section {
      select class=("priority") disabled=(locked) "Priority" <-> priority {
        option "Normal" => "normal"
        option "High" => "high"
      }
    }
  }
}
```

## Authoring and typing

Labels and option values are double-quoted literals. Duplicate values and
non-option children are rejected. An empty option block is allowed. Class and
disabled prefixes apply to the actual select; the generated native label wraps
a caption span followed by the control on all three renderers.

A binding reads a string and writes the union of available option values.
Ordinary string state needs no extra annotation. A narrowed union must accept
every option; numbers and string-or-undefined fail at the binding reference.
An any escape receives a runtime string guard, without implicit coercion.
An unmatched string selects nothing (selectedIndex -1) and leaves state intact.
A change with no selected option does not write an empty fallback.

Only direct mutable local state identifiers are supported. Binding task.priority,
component props or controlled fields remains outside this increment. This is
explicit DX friction. Task desk already owns a priority edit draft, so the native
control replaces its two priority buttons and setter action without new shadow
state. Human authoring acceptance remains open.

Editor coverage includes mapped diagnostics, original definitions, rename,
formatting, class/disabled property names and TS suggestions in empty property
snippets. Incomplete source retains strict compile diagnostics and rename refusal.
This is bounded recovery rather than a general error-tolerant grammar.

## Runtime and browser behavior

Options exist before the initial selection is applied. Selection uses native
selectedIndex and change, with no unchanged selectedIndex writes. Text controls
retain value/input and checkboxes retain checked/change. Labels use textContent,
including HTML-looking strings. Conditional removal cancels pending work, removes
listeners and makes retired callbacks inert. Both regional variants use their
own selection metadata and a ninth prunable capability; general rendering uses
an owned constructor. No dependency or custom dropdown is introduced.

Native label focus, keyboard selection, tab order, disabled state, node identity,
literal labels and removal were exercised on general, blueprint and sequential
renderers in sandboxed headless Edge. The restrictive preview CSP remains active.
Programmatic events are not an authorization boundary.

Task desk's browser flow changes the priority union, saves it and discards a
subsequent change on cancel. Existing creation, checkbox, multiline description,
draft protection and ARIA flows pass, including a mobile overflow check.

## Validation and provenance

Evidence is retained under `elnor/.elnor/mvp/select-integration/`:

| Gate | Result | Evidence |
| --- | --- | --- |
| Complete candidate check/build and Node suite | 748 tests across 64 files | `full-recovery-2cbfee76e23d4ac6ae9507997bc791c8` |
| Native VS Code in Docker/Xvfb | 15 original + 5 DOM editor + 5 checkbox + 5 select | `native-complete-b6c25d8ce56b493e84624fd0ae20c5b6` |
| Three forced browser renderers | Native selection, keyboard, label, cleanup and CSP | `browser-ee266b4b15374ae6ac303ab56676fd3a` |
| Task desk browser workflow | Save/cancel priority and existing app flows | `app-browser-10d0572d659e4a1e84886b92ce34be81` |
| Nine existing graphs | Bundle size and bound-identifier-normalized AST comparison | `cost-b6106221bce84eec9c1226a407b7811e`, `proof-e8c0bf5e56634ab590904e204ebe587f` |
| Exact local public transfer | Check/build and 73 select/app/checkbox/editor/worker tests | `promotion-8a76509fdc6740d88b8407c5f1809f01` |

The complete gate retains successful files from its first run and re-executes
failed files against identical source hashes. Initial mutex contention, host
memory pressure and timeouts are retained as failed evidence, not counted as
passing. No tests are removed. Native checks verify payload hashes and owned
container removal. The public transfer archives its previous and candidate files
and verifies the exact tested hashes. No remote publication is implied.

## Delivery cost

| Existing graph | Previous gzip bytes | Candidate gzip bytes | Delta |
| --- | ---: | ---: | ---: |
| counter | 3025 | 3027 | 2 |
| form | 6531 | 6531 | 0 |
| composition | 2273 | 2272 | -1 |
| localized | 5041 | 5041 | 0 |
| keyed | 10911 | 10910 | -1 |
| form-wide | 15938 | 15938 | 0 |
| composition-deep | 2470 | 2469 | -1 |
| localized-wide | 19762 | 19761 | -1 |
| lifecycle | 7098 | 7098 | 0 |

All nine generated programs match after bound local identifier normalization;
external/property names, syntax and strings are preserved. This is structural
evidence, not a new CPU benchmark or universal zero-cost claim. Earlier Svelte
and React performance evidence retains its own source revision and scope.

The application comparison replaces priority buttons with a native select,
so it is a delivery comparison, not a controlled latency or CPU comparison:

| Delivery | Previous Task desk | Native priority select | Delta |
| --- | ---: | ---: | ---: |
| JS bytes | 21061 | 22745 | 1684 |
| JS gzip bytes | 6603 | 6844 | 241 |
| CSS bytes | 3130 | 3168 | 38 |
| CSS gzip bytes | 1161 | 1174 | 13 |

Gzip uses level 9; JS and external CSS are measured separately. Unbundled runtime
source grows by 994 bytes. Evidence: `app-cost-aaee67a12de24d5c9b4f11df8a6a4479`.

## Svelte contrast and remaining scope

The local Svelte select binding was inspected at
`src/internal/client/dom/elements/bindings/select.js`, SHA256
`3d513ede7700dc944a2a3c6c688c986a8346ad4bad44b0387c9dc8f2f86f69bf`.
It also clears selection for unmatched values, and supports broader contracts
including reset, dynamic options and multiple selection. Elnor uses its own
ownership and compilation architecture with a narrower string-only boundary.
Static options need no mutation observer. No source implementation was copied.

Dynamic options, option groups, disabled options, multiple selection, object
values, nested/controlled bindings, form reset/submission, SSR and hydration
remain outside this increment. The DOM/forms roadmap remains incomplete.
