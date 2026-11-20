# Action parameter defaults

The private sequential region backend now admits supported defaults in plain
identifier parameters, including `dispatch(action: string, id = 0)`. Existing
Surface syntax and signatures without defaults are unchanged.

The compiler evaluates supplied arguments before entering the action. Inside
the action it completes missing or explicitly undefined values in parameter
order, then executes the body. Each default runs only when needed, on each
invocation. `null`, `0`, `false` and an empty string retain their own values.
Generated checks use `void 0` so an application binding named `undefined`
cannot change the guard.

Defaults may use earlier parameters, current state, props and supported
external expressions. The existing TypeScript binder lowers those reads with
fresh context names. Actual reads retain the enclosing general effect's
dependencies; a skipped default does not add dependencies. A thrown default
prevents the body from executing. No reactive task, cell accessor, queue or
runtime helper is introduced. Both runtime source files and the general
compiler are unchanged from the preceding initializer revision.

Self and forward parameter references retain conservative fallback, including
escaped identifiers. Rest/destructuring parameters, unsupported lexical
captures and closures retain their existing fallback. Parameter mutation and
general action bodies remain outside this admission extension.

Validation includes 387 backend tests: the prior 365 and 22 focused controls.
They run in two serial Windows Jobs with the existing resource limits and
60-second ceiling per Job. No test files or assertions are omitted. A previous
negative test for literal defaults now checks a self-referencing default, and
literal defaults have positive differential coverage. Controls also cover
external call order, retry after errors, state snapshots, conditional tracking,
disposal, Unicode references and `__proto__` shorthand.

Five typechecked fixtures compare the general baseline and candidate in Edge
under the existing CSP and sandbox, through 80 mount/update/dispose cycles.
They exercise chained defaults, current-state defaults, falsy values and
undefined, imported model reducers, and input/reset actions.

This extension removes an admission barrier. It does not establish a CPU
improvement or a new comparison with React/Svelte. Open collections and
component event/cleanup boundaries remain separate work for the shared real
keyed-list workload.

The local Svelte function-declaration visitor was reviewed as a contrast for
maintaining function scope while transforming expressions. Elnor retains its
own indexed argument lowering and region ownership model.

The fresh five-workload audit still selects counter, form and localized updates
(3/5). The real keyed-list app now passes its default action signature and
reaches `sequential-exclusive-cleanup-not-proven` for component rows. Composition
retains its child-event boundary fallback. This is an emission/admission audit,
not a new runtime CPU measurement. The separate public compatibility suite
passes all 71 tests.

The [component cleanup follow-up](REGION-BACKEND-COMPONENT-CLEANUP.md) admits
exclusive rows with proven native component trees. Open collections and child
event boundaries remain separate work.
