# Acceptance parity: optional props and generator boundaries

This records the historical acceptance increment. The subsequent
[lexical binding follow-up](SCOPES.md) replaces its shadowing restriction with
TypeScript symbol resolution and adds shared readonly-write diagnostics.

## Question and result

Do editor diagnostics, CLI checking and generated execution agree about optional
props, default values and action shadowing?

Before this increment, the CLI required optional props that the editor allowed
consumers to omit. Both checkers accepted action shadowing that code generation
later rejected. The parser and projections accepted default prop initializers,
but code generation did not implement them.

The bounded result is:

- CLI prop contracts now preserve optional markers and readonly properties,
  matching the editor's exported contract.
- Existing generator shadowing restrictions are shared by CLI/editor diagnostics
  and direct generation through `src/component-validation.mjs`.
- Default prop initializers produce `ELN-PROP-DEFAULT` in all three paths, with
  the initializer's exact original range. They remain a proposed language feature.

## Default values: decision and DX impact

The proposed specification says a default is evaluated when an instance is
created. Silently omitting that behavior is incorrect, even when a checker accepts
the source. This increment reports an explicit unsupported-feature error rather
than implementing a new runtime default contract without its own evidence.

For example, `component Badge(label: string = "Ready")` now fails checking and
generation instead of producing code that ignores `"Ready"`. The same applies
when the type is inferred from the initializer, or a consumer supplies the prop.

An executable workaround is `component Badge(label?: string)` with
`span label ?? "Ready"`. This is an ordinary reactive expression: it is **not**
equivalent to evaluating an arbitrary default expression once at construction.
The diagnostic is a temporary spike limitation, not the intended Surface DX.

Alternatives considered:

1. Keep accepting defaults while ignoring them: hides incorrect execution.
2. Remove the syntax from Surface: confuses a prototype limitation with the
   intended language.
3. Implement defaults now: requires a separate corpus for initialization order,
   dependencies, side effects, undefined transitions, reactive updates and lifetime.

The parser's accepted grammar and the proposed specification are unchanged.
The parser only gains initializer-span metadata. This semantic guard narrows
what the experimental compiler claims to execute; it does not establish default
support or change the intended once-per-instance requirement.

## Evidence

`tests/acceptance-parity.test.mjs` adds thirteen tests:

- Omitted and supplied optional props are accepted by both checkers.
- Wrong prop types and missing required props remain rejected by both.
- Optional props execute with omitted, undefined and supplied values.
- Composition preserves getter-based reactivity through undefined/value
  transitions, and disposal removes the rendered nodes.
- Typed and inferred default initializers are diagnosed before generation.
- Action parameters and local variables shadowing props/state have matching
  CLI/editor errors, exact UTF-16 ranges after Unicode/CRLF, and generation errors.
- Repairing an action removes its diagnostic; unrelated locals still execute.
- A rename introducing generator-prohibited shadowing is rejected without edits.

The initial eleven-test corpus had eight failures before the change, including
the omitted optional prop and missing early diagnostics. Two additional tests
cover composition/reactivity and rename preflight.

On Windows, `npm run check` passes for four existing components. `npm test`
builds successfully and passes **84/84 Node tests**. Generated modules run with
the existing fake DOM; this is not browser execution evidence. The native VS Code
host was not rerun for this increment; the six tasks in [ASYNC.md](ASYNC.md) are
evidence from the preceding native revision.

## Remaining uncertainty

This does not implement a general scope-aware rewrite. The shared shadowing check
preserves the existing direct action-parameter and identifier-variable rules;
nested function parameters and destructuring need an independent scope corpus.
Readonly exported prop contracts do not prove enforcement of immutability within
component bodies. The two TS projections remain separate, and full diagnostic
parity, default execution, human DX and large-workspace behavior remain unproven.

The next compiler/tooling risk is scope correctness: compare TS symbol bindings
with generated execution for nested functions, destructuring and assignments,
before claiming support for arbitrary TypeScript action bodies.
