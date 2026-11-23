# External calls in region action assignments

The private region compiler now accepts external expressions on the right-hand
side of supported state assignments in synchronous actions. For example,
`action change(value: number) { count = Math.max(count, value); }` can use a
sequential region instead of forcing whole-component fallback. The expression
does not need to be pure: external calls retain their ordinary JavaScript effects.

The compiler reuses its TypeScript binder and expression transformer. It binds
state reads to indexed region reads and action parameters to indexed arguments,
then emits direct region writes. Generated context names exclude source names
and decoded Unicode escapes. No runtime interpreter, extra cell accessors,
event delegation, or scheduling policy is introduced. Both runtime source files
are unchanged from the preceding action-argument revision.

Supported assignment operators are `=`, `+=`, `-=`, and `*=`. The RHS runs once;
compound assignments read their old value before evaluating it. A thrown RHS
does not write its target. Existing action statement order, external method
receivers, general-effect dependencies and owner disposal remain intact.
Closures, `this`, `arguments`, nested assignments, direct calls through state,
derived values or action parameters, and references to other actions retain
fallback. Closed-collection mutation rules and action signature restrictions
are unchanged.

The new parameter lowering exposed an object-literal edge case. Rewriting
`{__proto__}` as `{__proto__: value}` changes an own data property into prototype
initialization. The private expression rewriter now emits a computed key for
that shorthand, retaining the original property semantics. Explicit prototype
initializers keep their original meaning. This fix has not been promoted to
the public compiler.

Validation covers 347 backend tests, including 20 focused action tests. Controls
include shorthand and escaped names, external receivers, errors and retries,
compound assignment reentry, external cell dependencies, disposal during a
call, and conservative fallback. Six typechecked fixtures compare the general
baseline and candidate in Edge under the existing CSP and sandbox. They cover
imported functions, parameterless actions, keyed rows, compound assignments and
the prototype property case through 96 mount/update/dispose cycles.
The separate public compatibility suite also passes all 71 tests.

Five original workloads (counter, form, composition, localized updates and keyed
lists) were rebuilt with both the immediately preceding revision and this
candidate. Their selection decisions are unchanged. With esbuild identifier
mangling disabled and only exact absolute build-root strings normalized, their
emitted executable sources are identical. Raw production bundles remain
preserved: diagnostic paths differ across isolated builds and can also change
esbuild's frequency-based identifier names. Raw byte equality was therefore an
invalid initial comparison criterion. This check is a code stability control,
not a new performance measurement.

The real keyed-list workload still uses the general backend. It also requires
external model initialization, open collection handling, default action
parameters and component event boundaries. This extension establishes semantic
coverage rather than a measured CPU improvement. The v17 React/Svelte timings
remain historical measurements of that revision.

The local Svelte assignment transformer provided a contrast: it distinguishes
assignment targets and transforms reads and writes during compilation. Elnor
keeps its own indexed region plan, expression binder and ownership model.

The [state initializer follow-up](REGION-BACKEND-STATE-INITIALIZERS.md) also
admits external initial state values. Open collections, default parameters and
component event boundaries remain separate admission work.

## General synchronous action bodies

A later change admits general synchronous action bodies in sequential regions.
An action that the statement-level proof cannot lower no longer sends the
component to the general renderer when its body stays within this subset:

- local declarations, `if`, loops, `try`, `catch` and `finally`;
- calls to props;
- nested functions and closures, and local names that shadow state.

The compiler keeps the body as written. Each state or calc the action names
becomes an accessor created by the region runtime's `regionCell`, and root
props are captured when the action starts. Reads, writes, compound assignments
and updates inside closures go through the region while the instance is
mounted.

An accessor belongs to the part of its slot's group that was open when the
action started. When that part closes, for example on unmount or when an `if`
branch closes, the runtime freezes the accessor before it clears the slot. A
closure that outlives its instance then keeps reading and writing its own last
value, as a general-renderer cell does, and never reaches a later instance that
reuses the slot. The runtime reuses one accessor per slot and part across
actions.

These bodies still keep the general fallback: async actions, calls to other
actions, `emit`, `this`, `arguments`, `super`, `new.target`, writes to closed
collections, and prop reads in an inlined child instance.

`tests/region-general-actions.test.mjs` checks the selection and runs eight
action shapes against the same expected views as the general renderer.

`tests/region-general-actions.test.mjs` also compares the region with the
general renderer for closures used after unmount and after an `if` branch
closes and reopens.

The 19 components under `examples/` select the same backend as before. Each
of them is rejected first by another rule, such as `on dispose`, a root with
more than one container, opaque state, slot or event boundaries, or calls
between actions.
