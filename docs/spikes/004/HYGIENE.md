# Generated-name hygiene

The subsequent [initialization follow-up](INITIALIZATION.md) compares state/calc
dependencies and records a remaining indirect early-read gap.

## Question and result

Can user declarations capture generated references or runtime imports even when
the compiler correctly resolves the original TypeScript symbols?

Yes. Before this increment, seventeen of twenty new execution tests failed,
although both CLI and editor accepted their source. The preceding 113-test suite
passed. Examples included:

- A local `__props` changed a prop read from `"Outer"` to `"Captured"`.
- Locals `__s` and `__d` replaced state/calc reads with unrelated values.
- Actions named `text`, `cell`, `computed` or `element` captured runtime calls.
- Actions named `__s`, `__d` or generated node names could produce invalid modules.
- List lambdas and event parameters captured inserted references; slot callback
  parameters and child import aliases hid user actions.
- Rename to `__props` remained valid in the projections but changed execution.

The generator now assigns fresh internal names per component. The initial twenty
cases pass after the change. A reinforced 25-test corpus also covers the new
prefix, successive suffixes, escaped identifiers, template expressions and event
emission. This removes the demonstrated collisions without introducing a list of
reserved user names.

## Implementation and alternatives

A deterministic allocator chooses a candidate absent from the original Surface
source and from previously allocated names. It normalizes `\uXXXX` and
`\u{...}` escapes first, so an escaped identifier cannot disguise a collision.
Substring exclusion deliberately over-reserves: comments, strings, property
names and types may cause an unnecessary suffix. This is acceptable for internal
names and avoids relying on parsing Surface as TypeScript to discover identifiers.

The allocator covers props/state/calc storage, the emitter, mount parameters,
runtime import aliases, child import aliases, generated nodes, list/conditional
callbacks, slot callbacks and generated value/rest parameters. Symbol-based
fragment rewriting receives the allocated storage and emitter references.
User identifiers, property keys and literals are not textually renamed.

The exported `mount` API and runtime module exports remain unchanged. No parser,
runtime or Surface grammar change is required. The source absence check assumes
the parsed IR and its original source correspond, as they do in current callers.

Alternatives rejected:

1. Reserve current helper names: imposes an implementation detail on authors and
   does not cover future helpers.
2. Use another fixed prefix: recreates the same failure with different names.
3. Rename text after generation: risks changing user bindings and literal text.

## Evidence

`tests/name-hygiene.test.mjs` compares CLI/editor acceptance with generated module
execution using the existing fake DOM. It covers local and nested captures,
runtime imports, duplicate declarations, lists with state updates, slots, child
composition, typed events, applied rename, Unicode escapes and repeated generation
of identical output. Disposal is exercised alongside rendering.

On Windows, `npm run check` checks four components and `npm test` builds and
passes 138/138 Node tests. The native VS Code host was not rerun; previous native
tasks remain historical evidence. These are generated-module/fake-DOM results,
not browser or human DX evidence.

## Remaining uncertainty

This corpus does not prove arbitrary TypeScript compatibility or full diagnostic
parity. Dynamic source construction such as direct `eval` is outside this
lexical name-allocation experiment. TypeScript may introduce its own lowering
helpers for syntax outside the tested ES2022 cases; those need separate evidence.

Initialization order and value/type import execution remain independent open
questions from [SCOPES.md](SCOPES.md). The next useful experiment compares state
and calc initialization dependencies with the two TypeScript projections and
actual generated execution. Allocation and fragment binding are not benchmarked
for large workspaces.
