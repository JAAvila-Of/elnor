# Indexed reads and graph-selected runtime capabilities

This private continuation of the [region backend](REGION-BACKEND-DESIGN.md)
reduces internal accessor work and the delivery cost of sequential forms.
The public compiler/runtime and Surface syntax remain unchanged. CPU results
are descriptive and mixed; this is not a demonstrated global speedup or parity
with Svelte/React.

## Indexed expression lowering

The existing TypeScript binder still determines which identifiers refer to
component state, calcs, props and row locals. State/calc/local replacements can
now construct indexed read calls directly in the AST. Property names, literals,
shorthand values, computed keys and Unicode-escaped identifiers retain their
original resolution. Props retain their existing deferred getter contract.

Generated sequential descriptors declare indexed readers and no longer serialize
named context metadata. Such frames do not create the old state/calc/local
accessor maps. The real form creates **zero named state/calc accessors instead
of eight**. Manually constructed internal plans without that declaration retain
the original generic context support.

This changes neither the actual dependency collector nor queue semantics.
Eager calc initialization, cached reads, equality suppression, setter-triggered
writes, mixed scheduler rounds, ownership, failure aggregation and cancellation
remain covered. Direct reactive call receivers retain the fallback introduced
in the [form slice](REGION-BACKEND-FORM.md).

## Runtime selection from one source

The compiler computes the union of list, owned-component and blueprint needs
across **all eligible public mounts and required owned helpers** in an emitted
graph. It does not inspect only the entry component. Separately callable mounts
therefore retain their required machinery.

A single maintained runtime source declares capability constants. During owned
runtime emission, the compiler binds those symbols and substitutes boolean AST
literals at their references. Helpers annotated with an Elnor capability are
removed as function declarations when that capability is absent. Unknown tags
or missing capability symbols stop emission. Generated runtime metadata records
the capability union, pruned helper names, full-source SHA-256 and emitted-source
SHA-256. No application source or minified bundle is rewritten to force a result.

Two incomplete attempts remain retained: capability constants alone did not
eliminate enough code, and literal substitution alone left recursive helper
declarations. Both builds fail the explicit check for keyed-list code in the
form bundle. Their passing behavioral tests are not presented as passing
delivery gates. The final AST helper removal passes both gates.

The local Svelte compiler's generated template-effect/update code was a read-only
contrast for using compiler knowledge. Elnor's symbol-aware indexed lowering,
graph capability union, helper annotations and provenance are its own design;
no Svelte implementation was copied.

## Delivery and CPU evidence

Final selection audit: `selection-audit-9409836cc23d4cd3a70cad7bdcea415b`.
The five original workload families and fourteen modules still select counter,
localized panels and form; composition/events and the shared keyed list retain
general fallback. Selection remains **three of five**, not an adoption rate for
arbitrary applications.

The form's minified mount-only bundle falls from v16's **29,928 raw / 9,292
gzip-9 bytes** to **20,475 / 6,297**, about **32% less gzip**. It remains larger
than the general-backend entry measured in the final audit: **6,503 / 2,210**.
This is delivery evidence, not a cold-start or parsing-time measurement.
Scalar counter/panel delivery is essentially unchanged at this scale.

The indexed-only screen is retained separately as
`cost-form-v16-782bbc5f358846b09c8d6270098960ad`. It does not establish a global
CPU win. The final combined screen is
`cost-form-v16-38e26ed3a2ac4480ba8f06485b0b8b65`.
Both use frozen **regions v16** as baseline, the same ordinary runtime, original
form source, original matrix driver/CSS and matching minification options.
They are not fresh comparisons against the public/general renderer or another
framework.

Each screen has two warmups, seven measured rounds, AA controls and AB/BA orders,
with 336 samples across four serial browser workers. The following numbers are
medians of order-specific renderer ThreadTime medians, in ms, for normal
individual form actions:

| Action | v16 | Combined candidate |
| --- | ---: | ---: |
| Mount | 1.248 | 1.249 |
| Edit one field | 1.033 | 1.089 |
| Edit all six fields | 1.192 | 1.133 |
| Invalid email | 1.069 | 1.028 |
| Recover | 1.148 | 1.117 |
| Unmount | 0.823 | 0.791 |

Edit-all favors the candidate by 4.9/5.0% across orders, comparable to AA
variation. Edit-one is more costly by 4.9/6.0%, while AA reaches 10.8%.
Other actions are mixed or small relative to the controls. No statistical
significance, stable global advantage or causal CPU attribution is established.
ThreadTime includes shared driver/browser/rendering work; frame-window wall time
also includes frame waits. The memory rows return to their own post-GC
node/listener baselines over eight cycles per arm. These are not allocation
throughput or universal leak proofs.

## Validation and retained evidence

Final validation passes **317 private backend tests**, **71 unchanged public
compatibility tests**, and a fresh cohort of **43 checked native browser cases**
with **476 recorded DOM stages / 688 lifecycle cycles**. The same native assets
are served with the existing CSP and browser sandbox; no security exceptions or
interactive browser sessions are introduced.

New controls cover zero named accessors, symbol-preserving indexed lowering,
capability provenance, separately callable blueprint mounts in a mixed graph,
list machinery retention and owned helper retention. The final validator also
checks runtime capabilities and helper absence in all 43 emitted artifacts.
The real-form bundle excludes keyed-list and blueprint clone paths. Existing
branch/row recovery, general-cell bridges, init failures, reactive receivers,
native factory ordering, retained callbacks and disposal controls still pass.

Retention checks retain **52 disposers** across the existing controls and 39
mounted fixtures, including the eager calc/external-source control. DOM collects
after disposal while required live references remain held.

The complete retained history has **78 serial expensive Windows Jobs**: 74 pass;
the indexed red controls, capability red controls and two incomplete delivery
builds remain failed. Every Job verifies CPU 10%, 768 MiB aggregate commit,
24-process maximum, a 4 GiB host-free-memory floor, kill-on-owner-close and zero
owned processes after cleanup. Node heap remains 192 MiB. Browser wall/idle
deadlines remain 45/12 seconds; offline limits remain 60/60.

Revision v16 was archived and verified before edits. `review-v17/audit.json` and
its seal retain the final sources, failed attempts, independent/combined CPU
samples, selection audits, native outputs, runtime provenance, retention results
and exact producers. This is a private integration based on verified work and
delivery reductions, not public performance promotion.

Execution cost remains open. The next experiment should measure and reduce the
remaining task-dispatch/construction overhead against a concrete alternative,
with the same eager queue, ownership and failure contracts. Broad editor,
startup, allocation, release and public-promotion gates remain open.
