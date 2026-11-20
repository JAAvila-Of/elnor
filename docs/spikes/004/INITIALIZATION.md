# State and calc initialization

This records the historical initialization increment. The subsequent
[runtime guard follow-up](INITIALIZATION-GUARDS.md) replaces its generic indirect
access failures with `ELN-INIT` errors; static indirect-read diagnostics remain open.

## Question and result

Do the two TypeScript projections and generated execution agree about state/calc
initialization dependencies?

Only within a bounded set. The preceding suite passed 138 tests, but a new
16-case corpus reproduced five failures: both projections accepted earlier-state
dependencies that crashed when the generated component mounted. The generator
constructed every state cell inside one object literal; reading an earlier state
therefore accessed the storage variable before that variable was initialized.

The generator now creates the storage object first and assigns each state cell
sequentially. This repairs direct dependencies, state chains, reads through actions
or immediately invoked lambdas, and once-per-instance state snapshots. The initial
sixteen cases pass after the change. Parser, runtime and type projections are
unchanged.

The reinforced corpus has 21 tests, including **three tests documenting remaining
failures**: an action can hide an early read of a later state/calc from both
projections. Mounting those programs still throws. Passing these observation tests
does not establish support or static diagnostics for those programs.

## Existing initialization phases

Both projections and the generator currently group declarations into phases:

1. Props are supplied by the caller.
2. States initialize once per instance, in state declaration order.
3. Calcs initialize in calc declaration order; their runtime effects subsequently
   track state and calc dependencies.
4. The event emitter is initialized and UI rendering begins. Action function
   declarations are hoisted, so an initializer may call an action earlier.

This is the current spike behavior, not a new specification of Surface's final
ordering semantics. In particular, a state textually below a calc is still
initialized before that calc. A state directly referencing a calc is rejected by
the projections because all calcs follow the state phase. The compiler does not
topologically reorder declarations or solve cycles.

Direct early reads of a later state/calc, a self-referencing state and the tested
state cycle produce TypeScript `TS2448` diagnostics in both projections. Editor
ranges identify the original UTF-16 token after Unicode/CRLF and clear after an
in-memory repair. This does not establish complete cycle detection or
interprocedural definite-assignment analysis.

## Evidence

`tests/initialization-parity.test.mjs` compares acceptance and generated execution:

- State initialization from props, earlier states, chains, actions and lambdas.
- Deferred closures reading a state after initialization has completed.
- Earlier calcs, action-based calc dependencies and textual interleaving of
  state/calc declarations.
- Direct forward references, state self-reference, a state cycle and a state
  reference to the calc phase, rejected by both projections.
- State initialization exactly once per instance, independent instances, snapshot
  state versus reactive calc chains, updates and disposal.
- An action updating already initialized state during initialization, and a cell
  whose initialized value is explicitly `undefined`.
- The three known indirect early-read failures described below.

On Windows, `npm run check` checks four components; `npm test` builds and passes
159/159 Node tests. The three known-gap tests assert runtime failure explicitly.
Generated execution uses the existing fake DOM. The native VS Code host was not
rerun, and no browser, human DX or production performance claim follows.

## Remaining indirect-read gap

For example, both projections accept this bounded compiler input:

```text
state first = readLater();
state later = seed;
action readLater() { return later; }
```

The function declaration is callable, but `later` has no initialized cell when
`first` calls it. Mounting throws a `TypeError`. The analogous calc-to-later-calc
case also throws; a state reading a calc through an action reaches the calc
storage before initialization and throws a `ReferenceError`.

No static diagnostic or explicit uninitialized-binding guard is implemented for
these indirect reads. General aliases, higher-order calls, conditional execution,
exceptions during initialization, resource cleanup after a failed mount and calc
purity still require independent evidence. `generate` alone is not a substitute
for checking a graph; it does not run all TypeScript diagnostics.

## Decision and alternatives

Publish the state storage before sequential cell initialization, preserving the
existing phases. This corrects a code-generation defect without adding language
restrictions or choosing new ordering semantics.

Alternatives rejected:

1. Keep a single object literal: preserves crashes in accepted programs.
2. Prohibit state dependencies: sacrifices DX to hide a generator defect.
3. Topologically sort or use one global textual order: changes semantics and
   requires evidence for effects, dependency analysis and cycles.

The next initialization experiment should address indirect early reads without
confusing a deferred closure with an eagerly executed call. Value/type import
execution remains the independent open question recorded in earlier increments.
