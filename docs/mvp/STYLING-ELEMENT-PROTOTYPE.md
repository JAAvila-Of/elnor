# Typed classes across controls and text

Status: second private prototype, 2026-11-16. This extends the
[container-only experiment](STYLING-CLASS-PROTOTYPE.md). Public `src`, the
supported subset and the running Task desk build remain unchanged. The examples
below are experimental syntax, not a public compatibility promise.

The later [promotion assessment](STYLING-PROMOTION-ASSESSMENT.md) records the
649-case complete Node gate, conditional capability emission, delivery proof
and new class-specific CPU screen. Native-editor completion remains open.

## Consistent authoring boundary

The private candidate uses `class=(stringExpression)` immediately after a
supported DOM tag:

```eln
section class=(appearance.panel) {
  h2 class=(tone) "Tasks"
  input class=(appearance.field) "Draft" <-> draft
  button class=(appearance.button) "Save" => save()
}
```

Direct string literals and ordinary named TS values use the same boundary.
The class on an input belongs to the actual input element; its generated label
and caption are preserved. Label/wrapper styling is not implicitly exposed by
this contract. Existing unstyled statements and container `.name` shorthand
retain their behavior. Combining shorthand and an expression remains rejected.

Class extraction now reads balanced delimiters instead of trying to isolate
the full expression with a greedy regular expression. Quoted `class=(...)`,
arrow-like text and object braces inside the expression retain original ranges.
This still uses the bounded Surface scanner; it does not establish complete
TypeScript lexical support or multiline UI expressions.

## DX findings addressed

The first constraint projection used `satisfies string`. TypeScript could anchor
its error to generated constraint text, leaving the editor to highlight the
component name. That was poor error recovery for the author. The candidate now
checks the copied expression as a typed function argument in virtual TS only.
TS2345 maps to the offending source expression; this introduces no runtime call.

A missing closing parenthesis initially reported a later closing brace. The
delimiter scanner now retains opening positions and identifies the expected
closer. A regression requires the class opening parenthesis and the expected
`)` in the message. The improvement applies to the private scanner's error
path; it does not change accepted well-formed grammar.

The in-process language service now has explicit class-expression checks for
member completion, partial-member recovery, state rename, exact error ranges
and formatting. Actual native-editor interaction has not been rerun. Missing
parentheses are diagnosed; arbitrary incomplete edit recovery is not promised.
Tailwind utility-token validation/completion remains a separate integration.

## Runtime and specialization

Both general and regional code generation apply classes to returned elements
without replacing them. Region input construction preserves literal classes
on its real control. Text, button caption/action and input binding ranges remain
separate from the class expression.

The specialized native-owned builder now admits class bindings for the same
otherwise eligible stateless child shape. Tests require emitted native-owned
construction and execute reactive parent-to-child class updates. A child with
styled text and an emitted button event also runs in the real browser. This
removes the previous class-only eligibility limitation for that bounded shape;
it does not make every component eligible or prove a speed improvement.

Static literals avoid reactive class tasks. Dynamic assignments compare strings
before writing, reuse the existing scheduler and reject non-string values that
escape typing. Class data is not HTML or a style attribute. No runtime style
engine, class-merging policy or weakened CSP was added.

## Validation and retained evidence

Final-source offline gate: 21 focused prototype cases, 45 existing language/
formatter cases and 36 existing acceptance/import cases. These 102 cases are
a selected regression gate, not the complete public suite. Prior initialization
and scope results belong to the earlier source revision and are not added here.

Evidence is retained under `elnor/.elnor/mvp/style-classes/`:

| Evidence | Run |
| --- | --- |
| Final 21 focused cases | `run-3133f568a7b44fb7bab10285eb5cd74e` |
| Final 45 language/formatter cases | `run-dd887cd022034a07add58a130d67403d` |
| Final 36 acceptance/import cases | `run-efa0d6ef50d84970b2aecd0740a02324` |
| Final browser builds/flows | `browser-32574f0bc9a34a638cbaec2f1ba4b04b` |

The browser gate checks two manifest-based project builds with local TS class
values and a child component. Sandboxed headless Edge verifies controls/text,
child events, focus, draft, DOM identity, computed external CSS and guarded class
writes. It checks restrictive CSP, page errors and markup-like class text.
Temporary browser sessions/servers close after the gate.

Integrity review: `review-720d8df41de443bea1e2aa878b888d67/audit.json` in the
same internal directory. It verifies the exact source against all four final
evidence runs and retains the checked candidate archive and producers.

The red runs, fixture corrections and launcher mistakes are retained. In
particular, the first native-selection assertion accidentally tested a parent
that inlined its child; external initial props were added to exercise the
existing owned-child path. A temporary duplicate test variable caused a syntax
failure. The browser harness initially looked outside the owned generation for
components; it now derives their directory from the returned entry path.
The misplaced type error and delimiter error were implementation findings and
were corrected, not waived. No resource limit was raised or case skipped.

All jobs keep CPU 10%, aggregate commit 768 MiB, Node heap 192 MiB, 24 processes,
4 GiB host-free floor and offline 60/60s / browser 45/12s limits. A new integrity
review archives the exact candidate, fixtures and producers. Public source hashes
must still equal the pre-prototype baseline.

## Before public integration

No new CPU or bundle-size measurements exist. Measure affected workloads and
delivery before claiming performance neutrality, then run the required public
correctness/editor gates before promotion. Tailwind extraction/build/watch,
StyleX, npm resolution, scoped CSS and generic DOM attributes remain separate.
Independent human authoring feedback is still needed to judge whether named
styles improve maintenance in practice.
