# External state initializers

The private sequential region backend now accepts supported external expressions
in state initializers, including `state model = initial()`. Initializers run in
declaration order once per component instance, before that component constructs
its native DOM. Capturing a prop or a conditional expression does not require
changing Surface syntax or wrapping the value in an artificial function call.

This is state initialization, not a calc reaction. An initializer captures its
result without installing a new reaction or rerunning when an external source
changes. Existing ambient tracking is retained where initialization happens
inside another tracked operation. The compiler reuses its TypeScript binder for
indexed reads and root/owned props. External functions keep their ordinary
evaluation and receiver behavior.

The compiler checks direct references to component bindings and rejects self,
forward-state and not-yet-initialized calc references. Closures, action captures
and the existing unsupported lexical constructs keep fallback. An externally
returned array is not considered a proven closed collection; using it in an
each block still requires separate admission support.

Sequential activation now checks ownership again after a state initializer
returns and before retaining its result. If it disposed its component or
parent, remaining initialization and native work stop. Initializer exceptions
preserve the mount boundary's existing host nodes and cleanup behavior.

Validation covers 365 private backend tests, including 18 initializer controls,
and the separate 71-test public compatibility suite. Six typechecked Edge
fixtures compare the general baseline and candidate through 96 mount/update/
dispose cycles under the existing CSP and sandbox. They cover an imported
object model with external reducer calls, scalar state, initial value capture,
conditional child recreation, input editing/reset and closed keyed lists.

The local Svelte state/source helpers were used as a contrast: initial value
evaluation is distinct from creating the reactive source. Elnor preserves its
own state semantics and region ownership model.

This change establishes admission and lifecycle behavior. It does not establish
a startup or update CPU improvement. The shared real keyed-list app still needs
default action parameters, open collections and child event boundaries before
it can use the region backend. The v17 React/Svelte comparison remains a
historical measurement of that revision.

The fresh five-workload emission audit still selects counter, form and localized
updates (3/5). Composition retains its child-event boundary fallback. The real
keyed list now passes external initialization analysis and reaches the next
rejection, its action signature with default parameters. This audit checks
selection and emitted bundles; it does not measure runtime CPU.

The [action default follow-up](REGION-BACKEND-ACTION-DEFAULTS.md) subsequently
admits supported default parameters. Open collections and component event/
cleanup boundaries remain separate work.
