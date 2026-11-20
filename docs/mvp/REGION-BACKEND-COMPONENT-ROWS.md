# Region backend: component roots in keyed rows

This extends [components inside native rows](REGION-BACKEND-COMPOSED-ROWS.md)
in the same private backend. A keyed row may now consist directly of an eligible
component invocation. Its actual native root is moved and removed by the row
frame, preserving child state and editable inputs for a reused key. Surface
syntax, checking and public compiler/runtime sources remain unchanged.

## Construction and root transfer

The general Elnor generator already distinguishes two component-row cases.
A child with one native container root and only plain native descendants is
constructed detached. A child with internal structural or composed content is
constructed in a fragment. The region analyzer now follows that same syntactic
proof rather than choosing a different construction phase for optimized mounts.

The owned helper keeps its existing disposer return and stage callback. The
component instruction obtains the staged child frame and, after successful
construction, copies its roots into the parent part when the component itself
occupies that part's root position. The parent owns a separate root array; child
cleanup can clear its own refs without losing the row's DOM removal boundary.
Cancellation checks prevent root forwarding after the parent has retired.

Detached rows retain the original single-element, detached-parent validation and
`ELN-RUNTIME-003` error. Fragment rows retain their actual node snapshot, including
injected fragment siblings. The existing keyed map and LIS reconciler move the
captured roots. No new native wrapper or row comment markers are introduced.

Props remain deferred primitive readers. Item replacement updates the existing
row slot and child subscriptions; it does not recreate that key's component
state. Root removal disposes child scopes, reactions and native listeners before
removing owned nodes. The previously established target-release and inactive
callback guards remain part of this lifetime contract.

Svelte's `each.js` was inspected for the separation of item value, row lifetime
and movement. Root transfer here uses Elnor's existing staged frames, module
helpers and construction contract. No Svelte source was copied.

## Selection limits

The row contains one component invocation and its helper must have the already
proven single native container root. Multiple row roots, unsupported child root
shapes, exclusive lists and structural statements at the row level remain
general fallback. Child internal scopes retain their existing coverage. Opaque
or reference-valued props, unproven initializers and slots/events remain fallback.
No application annotation or syntax change is required.

## Validation

Private revision `region-backend/review-v13` retains source snapshots, producers,
failed attempts and final controls:

- 260 backend tests pass, including 19 added here, together with 71 unchanged
  public compatibility tests.
- 37 checked/built scenarios pass in sandboxed headless Edge across 396 recorded
  DOM stages and 592 lifecycle cycles. Seventeen use sequential construction and
  twenty use blueprints. Thirty-six compare with the frozen renderer; the
  existing keyed-range regression keeps its explicitly corrected general control.
- 33 GC mount controls and ten additional lifetime controls pass with 43 disposers
  retained. The two component-root controls confirm collection of seven removed
  nodes across detached and fragment rows while their parents, disposers and four
  old callbacks remain live. A focused compiled-source probe verifies the same
  controls before the full browser/GC cohort.

The new scenarios exercise stateful roots, edited inputs, nested child scopes,
item replacement, movement, removal and remounting. Tests compare native
construction/insertion/cleanup traces and queued rounds with the general path.
Adversarial controls cover root-parent observations, callbacks, external cells,
failed staging, partial insertion, duplicate keys, premature detached-root
attachment, injected fragment siblings, cancellation and fallback boundaries.

The first red run demonstrates the missing component-root selection. A retained
migration run exposes an outdated fallback control: its replacement used a pure
text row already eligible for the closed blueprint path. The final control uses
an opaque text row, preserving the fallback assertion it actually needs to test.
Both failed attempts remain retained.

All 54 expensive Windows Jobs are serial: 52 pass and the two red/migration test
attempts remain retained. Every Job verifies CPU10%, commit768MiB, 24 processes,
host-free4GiB, kill-on-owner-close and zero owned processes after cleanup. Node
heap is192MiB; browser wall/idle limits are45/12 seconds and offline60/60.
The browser cohort uses an inventory and ten build batches whose checksummed
manifests cover every case.

Final producers are `run-component-rows.py`, `run-native.py`,
`run-regressions.py`, `run-retention.py` and
`run-component-root-retention.py` in the private revision. Earlier revisions
remain frozen under `revisions/v1` through `revisions/v12` with their original
seals. Public compiler/runtime hashes remain 70abd192/ae44708c.

No CPU benchmark or full release gate ran. These checks establish behavior and
lifetime coverage, not CPU speed, heap size, allocation throughput or Svelte
parity. Compiler/editor, delivery, broad performance and public-promotion gates
remain open together with the selection limits above.

The subsequent [exclusive native cleanup extension](REGION-BACKEND-EXCLUSIVE.md)
adds bounded bulk-clear coverage. Counts and selection limits above describe the
retained v13 revision.
