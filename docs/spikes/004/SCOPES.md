# Lexical bindings and readonly assignments

The subsequent [generated-name follow-up](HYGIENE.md) addresses the helper-name
capture risk left open by this increment.

## Question and result

Do the TypeScript projections and generated execution agree when action bodies
or UI expressions introduce nested bindings with component names?

The initial 21-case corpus passed three cases and failed eighteen. Some failures
were explicit shadowing restrictions; others were silent execution differences.
For example, `((label: string) => label)("Inner")` returned the component's
`"Outer"` prop, and a nested function called with `4` returned `2` instead of `5`
because its `count` reference was rewritten to the component state. An object
destructuring assignment also lost its default value during rewriting.

The generator now resolves references through TypeScript lexical symbols before
rewriting component props, state, calcs and UI locals. Shadowed names retain their
local meaning. The former `ELN-SHADOW` guard is removed; valid lexical shadowing
no longer requires renaming a local variable to satisfy the generator.

Readonly writes exposed a second mismatch: the projections used ordinary
function parameters for props, allowing writes that generated modules applied
to the caller's props object. Shared `ELN-READONLY` diagnostics now reject direct
assignment to props and calcs in CLI checking, editor diagnostics and generation.
This enforces the existing proposed readonly contract; it introduces no new
Surface grammar. State remains writable and reactive.

## Implementation

`binding-analysis.mjs` creates a small in-memory TypeScript program without file
reads, library loading or execution. The generator binds each fragment against
synthetic component/UI declarations, then transforms only references to those
declarations. TypeScript resolves nested parameters, destructuring, block locals,
catch variables and function names. Object keys retain their property meaning;
computed keys and shorthand values still resolve references. Assignment shorthand
preserves its default initializer.

Shared component validation binds the mapped editor projection and identifies
the original prop/calc symbols. It checks assignment targets, updates and
`for...of`/`for...in` targets, including nested destructuring. Source-map ranges
report the original UTF-16 identifier; duplicate visits emit one diagnostic.
Writes to a shadowing local remain valid. This is shallow binding immutability,
not freezing or deep object immutability.

The CLI and editor still have separate type-checking projections. Reusing the
mapped projection for this shared write check does not establish complete
diagnostic parity. The parser and runtime are unchanged.

## Evidence

`tests/scope-parity.test.mjs` contains 29 tests comparing CLI/editor acceptance
with generated modules executed using the existing fake DOM:

- Nested function and arrow parameters, destructuring and defaults, catch and
  block bindings, function names, class member keys, computed keys and shorthand.
- Object and array assignment to state, default assignment values, and state
  updates that refresh dependent calcs and rendered text.
- Direct, compound, logical, destructuring and loop assignments to readonly
  props, plus calc updates and a UI event expression. Diagnostics retain exact
  original identifiers after Unicode/CRLF and disappear after in-memory repair.
- A lambda shadowing an `each` binding, local writes that preserve the outer
  prop, and applied rename introducing local shadowing followed by execution.

The previous acceptance tests now check that their formerly rejected shadowing
programs are accepted and that rename preserves the surrounding prop reference.

Validation on Windows: `npm run check` checks four components; `npm test` builds
successfully and passes 113/113 Node tests. The native VS Code host was not rerun;
the six native tasks in [ASYNC.md](ASYNC.md) remain earlier evidence.

## Limits and next uncertainty

This bounded corpus does not prove support for arbitrary TypeScript action
bodies. At this revision, generated helper-name hygiene, runtime/type-only import
handling and initialization order needed separate evidence. Helper-name captures
are subsequently addressed in [HYGIENE.md](HYGIENE.md). State initializers still
need an independent dependency/order corpus, and import execution remains open.

Binding programs are rebuilt per rewritten fragment and per component validation.
No large-workspace latency or production performance claim follows from these
tests. Human DX, general recovery, browser execution and native-host behavior
at this revision remain unverified.
