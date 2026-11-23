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

The compiler keeps the body as written and runs it against an instance handle
from the region runtime's `regionInstance`. There is one handle per component
instance: the part of the instance's group that was open when its first action
started. States and calcs become accessors of the handle, other actions become
stable references of the handle, and root props come from it. Reads, writes,
compound assignments, calls and closures go through the region while the
instance is mounted.

A closure keeps its handle. When the instance's part closes, for example on
unmount or when an `if` branch closes, the handle freezes every slot of the
group before the region clears or reuses it. A closure that outlives its
instance then keeps reading and writing its own last values, and calling its
own actions, as with general-renderer cells. It never reaches a later instance
that reuses the slots.

A component in which any action calls another lowers all of its actions this
way, so that every call shares the caller's handle.

These bodies still keep the general fallback: async actions, `emit`, `this`,
`arguments`, `super`, `new.target`, writes to closed collections, and prop
reads in an inlined child instance.

`tests/region-general-actions.test.mjs` checks the selection and runs eight
action shapes against the same expected views as the general renderer.

`tests/region-general-actions.test.mjs` also compares the region with the
general renderer for closures used after unmount and after an `if` branch
closes and reopens. `tests/region-action-calls.test.mjs` does the same for
calls with arguments, defaults and return values, recursion, an action passed
as a value, its stable identity, and closures that call other actions.

The 19 components under `examples/` select the same backend as before. Each
of them is rejected first by another rule, such as `on dispose`, a root with
more than one container, opaque state, slot or event boundaries, or calls
between actions.

## Disposal hooks

`on dispose` no longer sends a component to the general renderer when the
component uses a sequential region. The hook expression is lowered like a
general action body and registered as a cleanup of its instance's part at the
point where the general renderer registers it: after state, calcs and actions,
before the UI. Cleanups run in reverse registration order, so a child's hook
runs before its parent's and the UI cleanups of an instance run before its own
hook. The hook runs with the instance handle, reads and writes the live state,
and the handle freezes afterwards. A throwing hook does not skip the other
cleanups, and the failures are reported together as in the general renderer.

`tests/region-disposal-hooks.test.mjs` compares the hook order, the state read
and written by hooks, hooks that call actions and a throwing hook at unmount
with the general renderer. The comparison builds the same components with
`buildSurfaceProject(entry, {regionBackend: false})`, which compiles every
component with the general renderer.
