# Region backend: fixed composition

This extends the same private region backend described in
[the first slice](REGION-BACKEND-FIRST-SLICE.md). It is functional architectural
evidence, not a performance result or production adoption.

## Integrated behavior

The project graph proves fixed child instances and closed primitive prop
expressions. The compiler assigns distinct state slots to every child instance,
substitutes proven prop reads, and carries their dependency masks into the same
region plan. Nested children share the blueprint, queued job and lifetime.
State initialization preserves component declaration and mounting order. A child
state initialized from a prop captures its initial value; a direct prop caption
continues to update. Child actions read current props and write only local state.
No Surface syntax or user configuration changes are required.

External root props, opaque expressions, callbacks, slots, derived state and
structural nodes retain the general path for the whole root. Recursive graphs,
expansion budgets and forward initializer dependencies also retain that path.
The public child mount and foreign `renderOwned` protocol remain available.
Mounting inside an actively tracked effect uses the general path to preserve
existing initialization subscriptions. These boundaries are checked rather than
inferred from TypeScript annotations.

Svelte's local component visitor was studied as a contrast: reactive props use
getters, and certain calculated props use memoized expressions before invoking
the child. Elnor's demonstrated closed graph instead carries primitive
dependencies across fixed component instances in one region plan. This is an
independent implementation with narrower proven coverage; no source was copied.

## Validation

- 30 backend tests: the original 20 plus 10 composition and boundary tests.
- 71 unchanged compatibility tests covering compiler/build, captions, owners,
  dependency tracking, scheduling, batching and recovery.
- Seven Surface scenarios checked and built for both backends, then exercised
  in headless sandboxed Edge: static content, counter, independent fields,
  editor, siblings, prop-seeded inputs and nested children. Both backends match
  across 46 recorded DOM stages and 112 mount/update/dispose cycles, including
  native input values and retained callback checks after disposal.
- Four GC controls retain the returned disposer while confirming mounted DOM
  is live and disposed root/button nodes are collectable. This establishes
  those lifetime cases, not browser heap size or allocation throughput.

All expensive work uses serial contained Windows Jobs: CPU10%, commit768MiB,
24 processes, host-free4GiB, kill-on-owner-close; browser wall/idle45/12 seconds,
offline60/60, and Node heap192MiB. No CPU benchmark or full release gate ran.

Private evidence lives in `region-backend/review-v2` and its referenced runs.
The original first slice is frozen under `region-backend/revisions/v1`;
its original root seal describes that archived revision, not current helpers.
Public compiler/runtime remain unchanged (70abd192/ae44708c).

## Remaining architectural work

Pure derived dependency ordering is now integrated; see
[the derived report](REGION-BACKEND-DERIVED.md). This composition revision is
frozen under `region-backend/revisions/v2` with its original seal.

Continue this backend with conditional and keyed
child lifetimes, and independent opaque tracking. Preserve current semantic
counterexamples and compiler/editor diagnostics. Measure broad application CPU,
compilation, delivery and memory only after meaningful coverage; parity with
Svelte or React remains unestablished for this backend.
