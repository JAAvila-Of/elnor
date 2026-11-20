# Region action arguments

The private region backend can lower synchronous actions with plain identifier
parameters and button calls with arguments from its proven expression subset.
Surface syntax and the public compiler/runtime are unchanged.

Previously, `action set(value: number) { count = value; }` and
`button "Set" => set(count + 1)` forced whole-component fallback. The candidate
passes evaluated arguments to the compiled action through indexed parameters.
Calls without arguments retain their existing generated action shape.

Arguments are read when the event occurs, in source order, before the action
body runs. Missing values keep JavaScript's `undefined` behavior. Extra arguments
are evaluated even when the action ignores them, including reactive reads made
inside an enclosing general effect. Native listeners retain the existing owner
and disposal model. No event delegation or new scheduling policy is introduced.

Default and rest parameters, names that shadow component state/calc/props,
spread arguments, and opaque argument expressions retain conservative fallback.
This is an incremental admission extension, not general action support.

Validation includes 327 private backend tests, of which 10 exercise the new
lowering and fallback boundaries. The new cases first exposed four expected
failures against v17. Four checked browser fixtures cover scalar and keyed-row
arguments in blueprint and sequential modes, comparing the general baseline
and region candidate through eight mount/update/dispose cycles per backend.
All 64 cycles preserve output, native DOM schema, root identity and cleanup
under the existing CSP and sandbox. Public compatibility checks remain separate.

The shared real keyed-list workload still falls back. It also requires support
for external model initialization/updates, collection provenance, opaque
action bodies, and child event boundaries. This change does not establish a
performance improvement or replace the previously recorded v17 comparison with
React and Svelte.

The local Svelte event transformer was used as a contrast: event expressions
become handlers at compilation, while delegated and native events have separate
paths. Elnor keeps its own region descriptors and ownership model.

The [external action expression follow-up](REGION-BACKEND-OPAQUE-ACTIONS.md)
subsequently admits external RHS calls in supported state assignments. External
model initialization, open collections, default parameters and child event
boundaries remain separate admission work.
