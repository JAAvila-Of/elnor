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
