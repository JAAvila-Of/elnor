# Region backend: exclusive native row cleanup

This extends [component-root row coverage](REGION-BACKEND-COMPONENT-ROWS.md)
within the same private backend. Sequential lists occupying a native container
alone can now retain the general renderer's bulk clear path when every row has
one plain native root. Surface syntax and public compiler/runtime sources remain
unchanged.

## Selection and actual DOM geometry

The compiler records the same exclusivity boundary as the general generator: an
`each` is the sole child of a native container. This flag alone does not authorize
clearing the container. The runtime also requires committed live rows, no staged
rows, the original parent and anchor, each owned root at that parent, and an exact
child count. Foreign siblings, relocated roots or a relocated anchor select the
existing individual cleanup path. Eligibility is checked again for each clear.

This extension is limited to plain native row bodies. Their cleanup consists of
compiled reactions and native listeners, with no child component or structural
DOM scopes. Exclusive composed/structural rows retain whole-root fallback until
their descendant-removal policy is demonstrated. Closed blueprint plans keep
their existing path.

## Resource cleanup before bulk DOM removal

Before clearing, each row captures its owned roots. An internal token disposes
its subscriptions and listeners while leaving that root in place. Once every
row has retired, one `replaceChildren(anchor)` removes the roots together. The
snapshots and committed map are then released. Empty lists do not perform a
replacement.

The same path is available during list disposal. Captured roots remain available
if listener cleanup or replacement throws, allowing the existing individual
reset to finish DOM cleanup. Cleanup and replacement errors preserve both causes.
A local bulk-depth guard handles reentrant disposal during resource retirement.
Retained native subtrees keep their DOM contents, while retired callbacks remain
inactive and no longer observe parent state.

Svelte's controlled-each removal path was inspected as contrast. Elnor preserves
its own native-only cleanup proof, actual-geometry checks, staged rows and error
recovery contract. No Svelte source was copied; transitions and hydration are
outside this change.

## Validation and remaining gates

Private revision `region-backend/review-v14` retains source snapshots, producers,
failed attempts and final controls:

- 284 backend tests pass, including 24 added here, together with 71 unchanged
  public compatibility tests.
- 40 checked/built scenarios pass in sandboxed headless Edge across 442 recorded
  DOM stages and 640 lifecycle cycles. Twenty use sequential construction and
  twenty use blueprints. Thirty-nine compare with the frozen renderer; the
  existing keyed-range regression keeps its explicitly corrected general control.
- 36 GC mount controls and twelve additional lifetime controls pass with 48
  disposers retained. The exclusive clear controls collect six removed nodes
  while parents, disposers and two old callbacks remain live. A focused
  compiled-source probe independently exercises the same controls.

Three new scenarios cover native captions, shared input bindings and an exclusive
list owned by a child component. Tests verify one replacement after listener
cleanup, zero individual row removals on that path, unchanged retained subtrees,
foreign siblings, relocated anchors/roots, regained eligibility, empty lists,
staged failures, replacement errors before/after mutation, combined errors,
reentrant parent disposal, inactive callbacks and conservative fallback.

The first red run demonstrates missing selection. A retained extended run applied
the private inactive-callback assertion to a raw listener from the frozen
renderer, which predates that guard. Final controls compare DOM dispatch on both
paths and assert the raw retired-callback guard on the private path. Both failed
attempts remain retained.

All 58 expensive Windows Jobs are serial: 56 pass and the two red/extended test
attempts remain retained. Every Job verifies CPU10%, commit768MiB, 24 processes,
host-free4GiB, kill-on-owner-close and zero owned processes after cleanup. Node
heap is192MiB; browser wall/idle limits are45/12 seconds and offline60/60.
The browser cohort uses an inventory and ten checksummed build batches covering
all scenarios.

Final producers are `run-exclusive.py`, `run-native.py`, `run-regressions.py`,
`run-retention.py` and `run-exclusive-retention.py` in the private revision.
Earlier revisions remain frozen under `revisions/v1` through `revisions/v13`
with their original seals. Public compiler/runtime hashes remain
70abd192/ae44708c.

No CPU benchmark or full release gate ran. These checks establish behavior and
lifetime coverage, not CPU speed, heap size, allocation throughput or Svelte
parity. Selection coverage on the real workload matrix and its execution cost
must be assessed before choosing further optimization scope. Broad
compiler/editor, delivery, performance and public-promotion gates remain open.
