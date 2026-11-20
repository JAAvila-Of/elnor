# Experimental boolean disabled property

Integrated locally: 2026-11-17. `button`, `input` and `textarea` now accept
`disabled=(booleanExpression)` before their existing caption/label. Task desk
uses it on Clear filters when the search and filter are already clear.

```eln
component Controls() {
  state busy = false;
  state draft = "";
  action toggle() { busy = !busy; }
  ui {
    section {
      button "Toggle" => toggle()
      button class=("action") disabled=(busy) "Save" => toggle()
      input disabled=(busy) "Name" <-> draft
      textarea disabled=(busy) "Notes" <-> draft
    }
  }
}
```

`class=(...)` and `disabled=(...)` can appear in either order. Duplicate
properties, unsupported hosts and other DOM property names are rejected at
their prefix. Child-component props retain their existing separate contract.
This does not introduce a generic attribute setter or prop spread.

## DX and compatibility boundaries

This follows the implemented class prefix and component configuration position.
Some destination-spec examples put properties after positional text; this
increment does not implement that ordering or claim stable grammar. Long
headers can still obscure UI structure: use an ordinary named calc when it
improves readability, without a mandatory extraction layer.

TypeScript completion and rename work inside the disabled expression, with
diagnostics mapped to the original expression. Native editor formatting keeps
the prefix intact. The later [editor follow-up](DOM-EDITOR-COMPLETION.md) adds
host-specific property names and single-line outer-expression recovery; broader
incomplete-prefix recovery remains open. The contract is deliberately boolean: optional boolean
values require an explicit fallback such as `busy ?? false`. That is an
authoring cost compared with permissive optional-prop APIs, not a completed
human DX acceptance result.

## Native semantics and execution

False enables a control; the string `"false"` is rejected by the checker and
by a runtime guard if `any` bypasses checking. The property targets the actual
input/textarea, not its generated label. Browser controls own disabled click
suppression and tab order; Elnor does not simulate either with event handlers.
Programmatic `dispatchEvent` and state writes are not authorization boundaries.
Application validation remains necessary; the Task desk change preserves its
existing click-to-validate form flows.

Literal booleans are construction metadata. Dynamic booleans use existing
owned effects/tasks, writing only when the result changes. Conditional removal
cancels queued property writes and removes callbacks. The native owned child
builder accepts disabled bindings. A sixth regional capability prunes unused
disabled branches and imports from production output. Unbundled runtime source
still includes the added constructor/property support; there is no universal
zero-cost claim for every import mode.

The local Svelte contrast was
`packages/svelte/src/internal/client/dom/elements/attributes.js` at checkout
`0156c5fe38b53b72675e2a7f04535de015fdeed1`, SHA256
`5a20e747d9090d2e4de20a562131e2d63b928e33fa45497b3a86bfa3d3f0c4ca`.
It separates native setters from attribute operations and handles broader
hydration/custom-element cases. Elnor uses one fixed guarded property through
its own existing ownership/region architecture; this does not import those
other Svelte capabilities.

## Validation and provenance

All retained runs below are under `elnor/.elnor/mvp/dom-disabled/`.

| Gate | Result | Evidence |
| --- | --- | --- |
| Full isolated candidate check/build | 672 passed in 60 test files; zero failed, cancelled or skipped | `full-2af0a0e6e8d244c6b733f81a7fa43e1a` |
| Actual public transfer | Byte-identical source/tests, check/build and 15 feature/app checks passed | `promotion-4d996d57177346508d51d0c120afa7b4` |
| Native VS Code | 15 original tasks plus 4 disabled tasks in serial sessions | `native-complete-05cbcb6e05194a3e95cef8afe0f06ee0` |
| Real browser | General, blueprint and sequential routes: boolean literals/updates, click suppression, tab order, identity and drafts | `browser-8ba766674dec4effbbe4b04638d64def` |
| Task desk browser | Clear filters enable/disable, plus existing multiline create/save/discard/draft/keyboard/mobile flow | `app-browser-9e8d307c15bc4dd1b2562009726e51af` |
| Existing production workloads | Nine bundle builds and bound-identifier structural comparisons passed | `cost-9ccc9d28f0334036b4d32a8e2a0c5a6d`, `proof-56496432c9c7451998645433627741da` |

The full 672-case gate ran on the exact isolated candidate. It was not rerun
from the public path; public check/build and the 15 feature/application checks
ran after transfer. The existing regression bodies are preserved apart from
additional Task desk assertions. The fake DOM clone now retains disabled
metadata, matching browser cloning; native interaction claims come from the
real browser, not a fake click implementation. The browser build also verifies
the emitted owned child module itself imports the native owned constructor,
rather than finding its exported symbol in shared runtime code.

Native tasks cover expression member completion, applied state rename,
exact-range TS2345 diagnostics and formatting. Workspace Trust remains enabled
and trusted, and owned containers are removed. Windows jobs retain CPU 10%,
768 MiB aggregate commit, Node heap 192 MiB, 24 processes, host-free floor and
the existing time limits. Only the dedicated editor container uses the approved
1 GiB ceiling, CPU 10%, no swap/network, reviewed sandbox and disposable
settings. Its hard cap is 256 Linux tasks including threads; the separate
24-process policy is sampled every 25ms, not a kernel process quota. This
isolated gate does not establish a normal-editor memory budget.

## Unused-feature delivery comparison

| Workload | Baseline gzip bytes | Candidate gzip bytes | Delta |
| --- | ---: | ---: | ---: |
| counter | 3023 | 3024 | 1 |
| form | 6533 | 6527 | -6 |
| composition | 2274 | 2274 | 0 |
| localized | 5042 | 5042 | 0 |
| keyed | 10910 | 10911 | 1 |
| form-wide | 15921 | 15920 | -1 |
| composition-deep | 2472 | 2472 | 0 |
| localized-wide | 19761 | 19761 | 0 |
| lifecycle | 7097 | 7095 | -2 |

Bound-identifier normalization preserves AST structure, global names, property
and export names, and literals; normalized programs are never executed. Small
byte changes can follow minification/compression. This is an unused-feature
cost and structural guard, not new CPU timings against Svelte or React.

ARIA/data, generic attributes, URL/style/event contracts, readOnly, native
select/checkbox and form submission/reset remain separate work. Independent
human DX and broader accessibility/browser acceptance remain open. Stage 1 of
the ecosystem roadmap is still incomplete; Tailwind and StyleX still require
their own build integrations.

The later [native checkbox integration](CHECKBOX-BINDING.md) adds the same
typed property boundary to checkbox, with its own source and native/browser evidence.
