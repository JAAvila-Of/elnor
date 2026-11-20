# Isolated typed-class prototype

Status: private prototype, 2026-11-16. The public compiler/runtime and the
running Task desk build remain unchanged. This is the first bounded execution
step for the [styling contract candidate](STYLING-DX-CONTRACT.md), not general
DOM styling or Tailwind support.

This report preserves the first revision. The
[second private revision](STYLING-ELEMENT-PROTOTYPE.md) extends classes to
controls/text, corrects diagnostics and admits otherwise eligible native-owned
class bindings. The first revision's limits and counts below are historical.

## Implemented in the private candidate

Selected container tags accept `class=(expression)` as an alternative to the
existing `.name` shorthand. A string expression can be direct or refer to an
ordinary imported TypeScript value. The two forms cannot be combined on one
node in this cut. Types are checked using TypeScript `satisfies string`;
original expression spans enter the editor projection and formatter.

```eln
import { appearance } from "./appearance.js";

component Panel(compact: boolean) {
  calc panelClasses = compact ? appearance.compactPanel : appearance.panel;
  ui {
    section class=(panelClasses) {
      h2 "Tasks"
    }
  }
}
```

This code describes the private candidate only. An imported object of literal
class strings is ordinary TypeScript; no Elnor-specific utility DSL or per-instance
style registry is introduced. Missing-property diagnostics and utility-token
validation are distinct: string typing alone cannot catch misspelled utilities.

Literal string classes enter DOM construction without a reactive class task.
Dynamic values use the existing dependency/scheduling machinery and a guarded
class property assignment. Equal class strings do not cause another assignment.
Non-string values that escape static checking are rejected at runtime; failed
mounts clean up. Class strings are never parsed as HTML.

## Evidence

- 12 new targeted cases pass: source ranges, syntax refusals, preserved
  shorthand, string diagnostics, mapped projection, formatting idempotence,
  static construction, named imports, unchanged writes, runtime rejection,
  keyed identity, reactive updates and disposal across the two renderers.
- 60 existing initialization/scope cases pass. Their combined run also contains
  a failed formatter-file load because the isolated workspace initially lacked
  the original examples. The missing examples/scripts were copied unchanged;
  all 26 original formatter cases then passed separately. No case was skipped.
- Two project builds pass using an actual local TypeScript appearance module.
  The general route is selected by an existing unsupported regional root tag,
  not by disabling runtime guards or editing generated code.
- Sandboxed headless Edge passes both routes: external CSS changes from 24px
  to 8px padding, input focus/draft/node identity survive, exactly one parent
  class mutation occurs, unrelated input does not rewrite that class, and
  markup-like class text does not create executable HTML. No page errors or CSP
  violations were observed. The restrictive policy is unchanged.
- Public `src` hashes still match the source captured before the prototype.
  All expensive jobs retain CPU 10%, 768 MiB commit, Node 192 MiB, 24 processes,
  4 GiB host-free floor and original offline 60/60s / browser 45/12s limits.

Retained internal evidence under `elnor/.elnor/mvp/style-classes/`:

| Evidence | Run |
| --- | --- |
| Initial red parser/feature gate | `run-eb5b838e958c443bbe68189c9011e700` |
| Final 12 targeted cases | `run-cdea90f2da1c4572877f514219301ae4` |
| 60 scope/initialization passes and retained formatter setup failure | `run-0f32ce57fa6e4545b4293c35c3721159` |
| Recovered 26 formatter passes | `run-65f5e647da3e4b02a2b0814f90b7ef7b` |
| Checked builds and two browser routes | `browser-db87e5d21b79413386fb3e58e0a1c678` |

The producer scripts, fixture, logs and source hashes remain in that directory;
`seal.py` retains an integrity-checked candidate archive and producer snapshot.
These 98 successful cases are targeted prototype evidence, not a fresh run of
the complete public suite. Browser sessions and temporary servers were closed.

## DX and performance limits before integration

Only containers receive the new class expression. A style API that excludes
buttons, inputs and text elements is not a satisfactory final authoring
contract; extending it consistently is the next step. Incomplete-edit recovery,
completion/rename through class expressions and full native editor behavior
still require explicit evaluation. No independent human DX result is inferred.

The current specialized native-owned builder declines dynamic class bindings
and retains the existing descriptor-based regional route. This preserves
behavior but has an unmeasured execution/delivery cost. Static literals remain
eligible where the surrounding program qualifies. No CPU, bundle-size or
performance-neutrality claim is made. Broader performance checks become
necessary before promoting shared compiler/runtime changes.

There is no installed Tailwind package, extraction pipeline, StyleX adapter,
dynamic inline-style contract, scoped CSS or general attribute spread in this
increment. The live public app does not yet accept the new syntax.
