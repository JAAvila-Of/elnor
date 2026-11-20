# Current Elnor architecture

Implementation snapshot: 2026-11-16. This describes the public source, not the
full proposed Surface specification. See [integration evidence](CORE-REGION-INTEGRATION.md)
and [ecosystem roadmap](ECOSYSTEM-ROADMAP.md).

## Compilation and tooling

```mermaid
flowchart TD
  A[Surface .eln components] --> B[Parser and binding analysis]
  T[Local TypeScript and ESM modules] --> G[Module graph]
  B --> G
  G --> C[Surface contracts and virtual TypeScript]
  C --> D[TypeScript checker]
  D --> E[Diagnostics mapped to Surface]
  D --> F[Checked compiler input]
  F --> H[Region eligibility and lowering]
  H --> I[JavaScript ESM and runtime modules]
  I --> J[Owned build generation and entry manifest]
  J --> K[Local preview with explicit props and CSS]
  A --> L[Editor projection and source maps]
  T --> L
  L --> M[Language engine and versioned editor adapter]
  M --> E
```

`parser.mjs` recognizes the bounded Surface grammar. `binding-analysis.mjs`
preserves TypeScript binding identity for transformations. `checker.mjs` checks
virtual TypeScript contracts, while the editor projection and language engine
map supported language operations to original source positions. These are
related tooling paths, not an assertion that the strict build parser is a
complete incremental editor parser.

`module-plan.mjs` packages a bounded relative local ESM graph. `compiler.mjs`
emits JavaScript and asks `region-compiler.mjs` for eligible optimized plans.
Project build/preview retain checked generations and a last valid build rather
than executing a partially emitted project. The preview is development tooling,
not a production application server.

## Runtime updates

```mermaid
flowchart TD
  A[Browser event] --> B[Generated action]
  B --> C[Write instance state slot]
  C --> D[Ordered subscribers for that source]
  D --> E[Shared microtask scheduling]
  E --> F[Recompute affected derived values and tasks]
  F --> G[Update existing DOM nodes]
  F --> H[Reconcile keyed lists or conditional regions]
  I[Unmount or branch removal] --> J[Dispose owned tasks and listeners]
  J --> K[Detach subscriptions and retire DOM resources]
```

The regional backend uses instance frames, indexed state, task dependency
tracking and ordered per-source subscriber sets. Eligible owned views receive
generated native DOM construction. Other eligible views use region descriptors;
unsupported shapes retain the general renderer. The general renderer also uses
reactive cells/effects and direct DOM operations.

There is no general virtual DOM tree rebuilt and diffed for each update.
Descriptors are execution plans, not a per-update virtual DOM. Lists still need
keyed reconciliation; direct DOM updates do not remove that work. Dependency
tracking, scheduling and lifetime cleanup still have runtime costs.

## Ownership and composition

```mermaid
flowchart LR
  A[Parent component instance] -->|Typed props| B[Child component instance]
  A -->|Default and named slots| B
  B -->|Declared event payload| A
  A --> C[Owned branches and keyed rows]
  C --> D[Child instances and DOM]
  A -->|Dispose| E[Retire owned resources]
  E --> C
  E --> B
```

Ownership makes cleanup explicit internally without adding disposal bookkeeping
to ordinary component authors. Props, events and slots form checked boundaries.
Deep mutation tracking, general user lifecycle hooks, DOM refs, arbitrary DOM
attributes and third-party component adapters are not established by this
diagram.

## Distinctive combination and limits

Elnor combines explicit Surface declarations (`state`, `calc`, `action`, typed
events and slots), TypeScript semantics with original-source feedback,
compiler-selected direct DOM execution, and owned cleanup. These individual
ideas have precedents. The product hypothesis is that their combination makes
authoring and maintenance clearer while preserving competitive execution.
Independent human evaluation must still establish that DX advantage.

Direct DOM compilation is also used elsewhere, including Svelte; it is not by
itself Elnor's unique advantage. Current differentiation is the Surface contract
and tooling approach. Bounded majority CPU parity is measured; universal speed
superiority, ecosystem maturity and production readiness are not established.

Source anchors: [compiler](../../src/compiler.mjs),
[region compiler](../../src/region-compiler.mjs),
[regional runtime](../../src/region-runtime.mjs),
[general runtime](../../src/runtime.mjs), [checker](../../src/checker.mjs),
[projection](../../src/language-projection.mjs),
[module planner](../../src/module-plan.mjs).
