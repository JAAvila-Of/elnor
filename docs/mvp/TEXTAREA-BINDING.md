# Experimental textarea binding

Integrated locally: 2026-11-17. Task desk now uses native textareas to create
and edit descriptions. Saved descriptions display line breaks. No package or
global editor setting was installed or changed.

```eln
component Notes() {
  state draft = "First line\nSecond line";
  ui {
    section {
      textarea class=("description") "Description" <-> draft
      p draft
    }
  }
}
```

The class expression is optional. The double-quoted label wraps the actual
textarea, as with the existing input. Bind a local mutable state identifier
that can both produce and accept an arbitrary string. Number state and narrow
string-literal state are rejected by TypeScript. Engine diagnostics and rename
map back to the binding; an immutable textarea binding now points to that
identifier instead of the beginning of the file. Props, calcs and nested-path
bindings are not accepted.

## DX and behavior

Enter inserts a native line break. Ordinary input events publish the current
value, including intermediate composition input events. Elnor adds no key
interception, automatic trimming, debounce or submission shortcut. Task desk's
existing save action still trims outer whitespace. The Surface statement is
one line; its state value can contain newlines. Direct short classes and named
class strings remain optional alternatives, without an additional style DSL.

The general runtime has a separate tree-shakeable constructor. Regions reuse
their existing node/literal/event/task operations with the textarea tag. The
optimized input operation, input runtime function and regional runtime source
remain unchanged. Updates write only different values; tested unrelated style
updates preserve focus, selection and the same control. Removal and disposal
release the input handler. Text values are not parsed as HTML.

The local Svelte reference was `bind_value` in
`packages/svelte/src/internal/client/dom/elements/bindings/input.js`, checkout
`0156c5fe38b53b72675e2a7f04535de015fdeed1` (file SHA256
`25d8263cd3721080913590cc8b74f8e3485d112412edce11e69ab0ec96a01212`).
Its input-event read and equal-value write guard provided a semantic contrast.
Elnor does not acquire Svelte's reset, hydration, numeric input or async-batch
semantics through this change. The implementation extends Elnor's existing
ownership and region operations.

## Validation

Retained evidence under `elnor/.elnor/mvp/textarea/`:

- Final full candidate check/build and **659 passed in 59 test files**, zero
  failures, cancellations or skips: `full-576f6032a57a498ab66eb005f92a4b2e`. Nine new textarea cases cover
  syntax, types, mapping, rename, formatting, three construction routes and
  conditional disposal. Task desk's two existing cases now exercise multiline
  controls and saved values.
- Actual public check/build and **11 feature/application checks** after exact
  byte-for-byte transfer: `promotion-e72889c2be994ccfa6c84f2a24849cd3`. The complete 659-case gate ran on the
  identical isolated source; it was not repeated in the public path.
- Native VS Code: **15 original checks plus 4 textarea checks**, two serial
  sessions, `native-complete-be5353e2a22446b8b9eb0a5c26cab1b6`. Textarea cases verify class completion, applied binding
  rename, an exact-range string diagnostic and formatting. Workspace Trust is
  enabled and trusted; owned containers are removed.
- Real browser: `browser-a88cd58000ff49efa67aec2faf54893c`, covering general, blueprint and sequential routes
  with native labels, Enter, multiline values, identity, focus, selection,
  external CSS, state reset and no HTML interpretation. No observed page or CSP
  errors. Composition events are synthetic, not an operating-system IME test.
- Task desk browser: `app-browser-2cc3466f623c430d9232bd13c06408d2`, covering create/edit/save/discard, protected
  multiline drafts, displayed line breaks, Tab order and no horizontal overflow
  at 390px. Desktop/mobile screenshots are retained as test evidence.
- Delivery: `cost-7cc330b01bfc4247b63c1bae38bfa393` and structural proof `proof-e00a82d3df6447f5bce9e45abfac1825`, all nine existing graphs.

Windows jobs retain CPU 10%, aggregate commit 768 MiB, Node heap 192 MiB,
24 processes, 4 GiB host-free floor and existing offline/browser time limits.
Only the dedicated native editor uses the owner-approved 1 GiB ceiling, no
swap/network, CPU 10%, disposable profile and reviewed sandbox. Its hard cap is
256 Linux tasks including threads; a separate 24-process policy is sampled
every 25ms, not enforced as a kernel process quota. No user Trust database is
edited. This is an isolated correctness gate, not a normal-editor memory budget.

## Unused-feature delivery cost

| Workload | Baseline gzip bytes | Candidate gzip bytes | Delta |
| --- | ---: | ---: | ---: |
| counter | 3020 | 3020 | 0 |
| form | 6529 | 6529 | 0 |
| composition | 2271 | 2271 | 0 |
| localized | 5038 | 5038 | 0 |
| keyed | 10905 | 10906 | 1 |
| form-wide | 15919 | 15916 | -3 |
| composition-deep | 2466 | 2468 | 2 |
| localized-wide | 19758 | 19758 | 0 |
| lifecycle | 7092 | 7092 | 0 |

All nine bound-identifier structural comparisons pass while preserving AST
structure, globals, exports, properties and literals. Normalized programs are
never executed. This checks unchanged bundled behavior and unused-feature cost;
it is not a new CPU benchmark or a textarea comparison against Svelte/React.
Unbundled preview runtime includes the additional constructor.

## Remaining boundaries

Rows/placeholder, generic DOM attributes, ARIA/data properties, textarea form
reset/submission, select and checkbox remain outside this increment. Real IME,
other browsers, independent human authoring and a broad accessibility audit
remain open. Tailwind build/watch and StyleX still require their own adapters.
The next increment should choose a typed DOM/property contract before adding
arbitrary attribute spreading.
