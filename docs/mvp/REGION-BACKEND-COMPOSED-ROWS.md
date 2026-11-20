# Region backend: components inside stable native rows

This extends [sequential component frames](REGION-BACKEND-OPAQUE-COMPOSITION.md)
within the same private backend. A keyed row with one stable native container
root may contain eligible child components. Their state, inputs and nested
conditional scopes survive movement and item replacement for a reused key.
Surface syntax, checking and public compiler/runtime sources are unchanged.

## Construction and ownership

The compiler distinguishes a plain native detached row from a native row that
contains components. Elnor's existing general generator constructs the latter
in a document fragment. The sequential plan now preserves that choice: its root
is attached to the fragment before child instructions run. Opaque child reads
therefore observe the same `parentNode`, live host and construction phase.

After construction, the row captures the fragment's actual nodes, including
injected fragment siblings. The existing keyed map and LIS reconciler move those
captured nodes together. No additional row comment markers are introduced. A
stable native root keeps future nested conditional DOM inside the owned subtree;
the row does not need to rescan or reconstruct that subtree when it moves.

Primitive item fields and parent slots reach child frames through the existing
deferred prop getters. Actual-read tracking records the owning row or parent
frame, while child state remains private to that component invocation. Reusing
a key updates its item slot; removing it releases child frames, reactions and
listeners before removing captured DOM. A newly created instance of the same
key does not share state or callbacks with its retired predecessor.

The staged row owns its fragment during partial construction. Build, duplicate
key, cleanup and partial insertion failures retire committed and staged frames
and retain the parent list task for retry. Returned or retained child button/input
callbacks cannot write after their activation has retired.

Task frames also release their raw mounting target after construction and on
disposal. Deferred activation helpers share a lexical scope with retained event
callbacks; leaving a child frame's target there kept its removed parent row alive
even after refs and listeners were cleared. Updates use indexed refs and anchors,
so the target is no longer needed after construction. The GC control keeps the
old input/button callbacks, parent and disposer alive while checking weak
references to four removed nodes.

Svelte's `each.js` was inspected for the separation of item value, row lifetime
and movement. Elnor preserves its own fragment construction, indexed frames,
deferred getter contract and LIS reconciler. No Svelte code was copied.

## Selection limits

The row must have one native container root. A component directly at the row
root, multiple row roots, structural statements outside that root's child
components, and exclusive lists remain general fallback. Child components may
contain their already supported internal conditional scopes. Props still require
primitive provenance; complete record/array escape, opaque prop expressions,
unproven initializers, slots/events and unsupported child shapes remain fallback.
Applications do not need a new annotation or syntax change.

## Validation

Private revision `region-backend/review-v12` retains source snapshots, producers,
failed attempts and final controls:

- 241 backend tests pass, including 19 added here, together with 71 unchanged
  public compatibility tests.
- 35 checked/built scenarios pass in sandboxed headless Edge across 366 recorded
  DOM stages and 560 lifecycle cycles. Fifteen use sequential construction and
  twenty use blueprints. Thirty-four compare with the frozen renderer; the
  existing keyed-range regression keeps its explicitly corrected general control.
- 31 GC mount controls and eight additional lifetime controls pass with 39
  disposers retained. A removed composed row collects while its parent, disposer
  and old input/button callbacks remain live. A focused compiled-source repro
  independently verifies collection of its four nodes with both callbacks held.

The two new scenarios cover editable child state, item replacements, keyed
movement, parent updates, removals, remounts and nested child conditional scopes.
Adversarial tests compare native construction/insertion/cleanup traces and queued
rounds, including 30 mixed parent/item/child batches. They cover fragment observers,
injected fragment siblings, retained callbacks, external cells, staged failure,
partial insertion, duplicate keys, cleanup errors, cancellation, enclosing scopes
and fallback guards.

The first red test run requires the previously missing selection. An initial
native cohort passed behavior, then its GC control exposed the captured-target
retention. The focused repro first failed to resolve TypeScript because its
producer omitted the existing `NODE_PATH`; that producer was corrected. All
attempts remain retained. After the runtime fix, the functional, browser,
compatibility and full GC gates ran again against the final sources.

All 100 expensive Windows Jobs are serial: 97 pass and the three failed test,
retention and repro-setup attempts remain retained. Every Job verifies CPU10%,
commit768MiB, 24 processes, host-free4GiB, kill-on-owner-close and zero owned
processes after cleanup. Node heap is192MiB; browser wall/idle limits are45/12
seconds and offline60/60. The two browser cohorts use nine build batches each,
with checksummed inventory/part manifests covering every scenario.

Final producers are `run-composed-rows.py`, `run-native.py`,
`run-regressions.py`, `run-retention.py` and `run-row-retention.py` in the
private revision. Earlier revisions remain frozen under `revisions/v1` through
`revisions/v11` with their original seals. Public compiler/runtime hashes remain
70abd192/ae44708c.

No CPU benchmark or full release gate ran. These checks establish semantic and
lifetime coverage, not CPU speed, heap size, allocation throughput or Svelte
parity. Broad compiler/editor, delivery, performance and public-promotion gates
remain open together with the selection limits above.

The subsequent [component-root row extension](REGION-BACKEND-COMPONENT-ROWS.md)
removes the optimization's native row-container requirement for eligible child
helpers. Counts and selection limits above describe the retained v12 revision.
