# Styling contract: DX, security and execution

Status: design recorded 2026-11-16; the string-valued DOM class boundary was
[integrated experimentally](TYPED-DOM-CLASSES.md) on 2026-11-17. This contract
does not establish Tailwind/StyleX integration. It continues the
[ecosystem roadmap](ECOSYSTEM-ROADMAP.md). The owner requires explicit reporting
of authoring friction, alongside security and performance evidence.

The first [isolated container-class prototype](STYLING-CLASS-PROTOTYPE.md) now
executes the candidate in both renderers. It does not change public support;
element coverage, editor recovery and performance costs remain explicit gates.
The [second revision](STYLING-ELEMENT-PROTOTYPE.md) adds controls/text and
targeted language-service recovery with native-owned class construction for
eligible children. The [integration report](TYPED-DOM-CLASSES.md) supersedes
those prototype support statuses and records bounded native/browser/cost
evidence. Human DX and adapter acceptance remain open.

## Authoring assessment

Long utility strings can obscure the structure of `ui`; extracting every small
style to a distant name can also make changes harder to follow. Neither an
inline-only policy nor a mandatory naming layer is a satisfactory default.
Judge both using actual editing tasks, not a universal class-count threshold.

| Candidate | Authoring benefit | Cost or failure mode | Disposition |
| --- | --- | --- | --- |
| Short direct class expression | Local and familiar; little indirection | Large conditional strings obscure structure | Keep as a proposed escape route, not the only authoring model |
| Semantic CSS class | Existing concise `.panel` form; ordinary CSS tools | Naming and navigating to CSS; no automatic utility completion | Preserve the working baseline |
| Named class values in ordinary TS | Reusable meanings, property completion and rename | Cross-file navigation; property typing does not validate utility names | Candidate for reusable utility compositions |
| New Tailwind-specific Surface block | Could keep classes close to components | A second styling language, extractor/formatter/editor work, vendor coupling | Do not introduce before testing simpler integration |
| Mandatory wrapper component for every styled element | Centralized visual API | Component/prop overhead and too much ceremony for local layout | Reserve components for meaningful reusable behavior |
| Mandatory `@apply` aliases for all utilities | Clean UI and CSS tooling | Moves every edit into CSS; can duplicate declarations and obscure variants | Optional CSS technique, not universal lowering |

The Tailwind adapter must not decide the language's styling model. CSS,
Tailwind and StyleX should share a typed DOM class/property boundary where
their semantics match. Adapter-specific compilation remains separate.

## Concrete alternatives

The following Surface shape already works; Task desk uses this approach:

```eln
component TaskPanel() {
  ui {
    section .task-panel {
      h2 "Tasks"
    }
  }
}
```

An ordinary external stylesheet can define `.task-panel`. A future Tailwind
build could process this optional author-owned CSS source:

```css
/* Requires a Tailwind build; not directly served as finished browser CSS. */
@import "tailwindcss";
.task-panel {
  @apply rounded-xl border border-slate-200 bg-white p-6;
}
```

This preserves the existing `ui` shape. It does not provide complete Tailwind
ergonomics, styling of every element kind or component isolation by itself.

For reusable utility compositions, compare ordinary TypeScript values:

```ts
// appearance.ts: ordinary source data, not a new styling DSL.
export const appearance = {
  panel: 'rounded-xl border border-slate-200 bg-white p-6',
  compactPanel: 'rounded-xl border border-slate-200 bg-white p-3',
} as const;
```

Experimental Surface use, now implemented for the documented DOM tags:

```eln
import { appearance } from "./appearance.js";

component TaskPanel(compact: boolean) {
  calc panelClasses = compact ? appearance.compactPanel : appearance.panel;
  ui {
    section class=(panelClasses) {
      h2 "Tasks"
    }
  }
}
```

The same experimental `class=(expression)` boundary accepts a direct string
for a small local case. Naming is optional. The current implementation covers
the existing DOM element kinds, including input/button, with parser, formatter
and native editor evidence. This is not a stable or general DOM attribute
contract and does not change component prop syntax. The existing `.name`
shorthand remains valid.

There are real limitations to communicate: `appearance.missing` can receive a
TypeScript property diagnostic; misspelling a Tailwind token inside a string
does not become a TypeScript error automatically. Completion, CSS inspection
and navigation into utility definitions need their own editor integration.
Keep complete utility tokens in the registered source files. Constructing
`bg-${tone}-500` is not a supported extraction strategy.

## Security contract

- Class application uses DOM class APIs, not HTML interpolation, `innerHTML`,
  evaluated strings or a generic spread of unvalidated DOM properties.
- The initial expression contract is a string. Objects, callable styling
  records and arbitrary spreads are separate designs, not implicit coercions.
- Static CSS is emitted as an explicit same-origin asset with ownership and
  manifest rules. Never weaken CSP to make an adapter pass.
- Dynamic inline styles are a separate contract. StyleX class-only success
  cannot establish compatibility for its dynamic style properties. Test exact
  CSSOM/attribute operations in a real browser with CSP enforcement; distinguish
  `style` attributes, `cssText` and individual property writes.
- Build adapters and dependencies are trusted executable tooling, not a
  sandbox. Constant analysis must not execute user modules or Tailwind config
  merely to discover a class expression. A requested external build tool has
  an explicit execution boundary.
- CSS is not automatically harmless: URLs, imports and global selectors need
  asset/network/isolation rules. This contract is not a sanitizer for arbitrary
  third-party CSS or JavaScript. Merely assigning a class does not guarantee
  confidentiality or safe dependency behavior.

## Execution contract

Emit static class values during construction where proven without executing
user code. Do not allocate a new style registry for every component instance.
Start constant analysis with literal-only supported forms; unproven imported
values retain ordinary module/runtime semantics. Do not promise zero runtime
cost for arbitrary TypeScript functions.

Dynamic expressions participate in ordinary dependency tracking. Update the
existing element only when the resulting class string changes; changing a
class must not remount children, lose input focus or create a second scheduler.
Avoid a general runtime style engine for static utilities. Do not silently add
Tailwind class-conflict merging: class order is not an override contract.

Measure generated JS/CSS size, dependency invalidation, update work and retained
resources separately. Aliases and `@apply` can change CSS size and build cost;
concise source is not proof of faster execution. Preserve the fixed broad core
matrix for affected runtime/compiler changes.

## Implementation sequence and acceptance

1. Isolated fixture for typed static/dynamic DOM classes, preserving `.name`.
   Integrate parser ranges, TS projection, diagnostics, formatting, general
   runtime and region eligibility without silent semantic differences.
2. Verify initial/change/unchanged class, keyed identity, focused input,
   branch removal, unmount and dead callbacks in both applicable backends.
   Malformed syntax and non-string expressions must report original sources.
3. Run a real browser CSP/DOM pilot with named and direct forms. Check no
   remounts, no unsupported policy exception and no residual listeners.
4. Add the external CSS/Tailwind build boundary with a real package fixture,
   registered library sources and saved-source rebuild/error recovery. No
   claim of Tailwind support until this complete route passes.
5. Compare authoring tasks: find an element's styles, change responsive spacing,
   add a selected state, reuse a variant and recover from a typo. Report
   indirection, clutter and tooling gaps; automated checks do not certify DX.

This is a bounded contract-design increment. No new grammar, packages, runtime
behavior or performance results were introduced while writing it.

References: [Tailwind source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files),
[`@apply`](https://tailwindcss.com/docs/functions-and-directives),
[CSP style attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr),
[current subset](../surface/MVP-SUBSET.md).
