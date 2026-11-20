# Region backend: opaque keyed row reads

This extends the same private backend's [sequential scopes](REGION-BACKEND-SCOPED.md)
to keyed rows containing opaque captions. Surface syntax, checking and the public
compiler/runtime sources remain unchanged. This is optimization coverage, not a
new user annotation or a production performance result.

## Construction and row ownership

An eligible row has one plain native container root. Its native instructions
execute in order with the root detached, using the original global document
factory. Rows finish construction before reconciliation inserts them. Unlike the
closed blueprint path, this path does not clone opaque row trees or add row
boundary comments: callbacks observing `childNodes` see the general renderer's
existing anchors and construction phase. A callback that attaches the detached
root prematurely retains the original `ELN-RUNTIME-003` error.

The existing Elnor keyed map and LIS reconciler manage identity and movement.
Each row uses an indexed frame with its own item slot, actual-read reactions and
parent slot subscriptions. A reused key writes the new item into its existing
frame; sibling rows do not share an item context. Opaque lowering uses the existing
symbol-aware TypeScript rewriter with explicit local slot mappings, preserving
shadowed names, property names, Unicode escapes and prop callback receivers.

Sequential tasks reuse their subscription handles as tickets in the existing
shared scheduler. The scheduler captures each ticket with ordinary effects at the
same microtask boundary. This prevents an already queued row frame from consuming
a different caption invalidated later during reconciliation. Both parent-dependent
keys and batched parent/row writes retain the general renderer's observation
rounds and insertion order. Closed blueprint plans keep one job per frame. This
does not reintroduce general effects or per-state cells for indexed reads.

List controllers join the scope's reverse-order cleanup records alongside
bindings and listeners. Removed and staged rows release subscriptions and native
listeners before their roots are removed. Errors in construction, duplicate keys
and partial insertion reset committed and staged rows while retaining the list
task for retry. Retired callbacks cannot write into the parent frame.

## Selection and escape limits

Collections must retain closed literal provenance, including all action writes.
Opaque calls may receive scalar items or proven own primitive record fields.
Passing the array or a complete record, including through shorthand, arrays or
escaped identifiers, retains the general renderer: unknown code could otherwise
mutate the private collection and invalidate the compiler's proof.

Multiple row roots, structural row bodies, opaque keys and opaque component
composition remain fallback. An opaque `each` that occupies its container alone
also remains fallback until the general renderer's exclusive bulk cleanup is
preserved. Public `renderOwned` and mounting inside an active general reaction
retain the original path. Closed blueprint lists keep their existing coverage.

Svelte's `each.js` was read for contrast: keyed reconciliation, item updates and
row lifetime are related but separate responsibilities. Elnor retains its own
LIS reconciler, indexed task frames, detached native instructions and cleanup
records. No Svelte source was copied, and no transition or hydration support is
implied.

## Validation

Private revision `region-backend/review-v9` retains sources, producers, failed
attempts and the final controls:

- 190 backend tests pass, including 26 added for this extension; 71 unchanged
  public compatibility tests also pass.
- 29 checked/built scenarios pass in sandboxed headless Edge, with 290 recorded
  DOM stages and 464 mount/dispose cycles. Nine use sequential construction and
  twenty use blueprints. Twenty-eight compare with the frozen renderer; the
  existing keyed-range regression retains its explicitly corrected general
  control.
- 25 GC mount controls and six additional lifetime controls pass with 31
  disposers retained. The new row control confirms removed opaque row DOM
  collects while the parent, old callback and disposer remain live.

The 26 tests cover row identity, replacements, shared inputs, queue rounds,
native construction/insertion/cleanup traces, scope nesting, sibling alias
isolation, external reads, escape guards, failed staging/insertion, duplicate
keys, disposal, callback retirement, parent-dependent keys and mixed action
batches. A retained red control demonstrates the scheduler-round difference
that motivated task tickets. Earlier selection and hygiene failures are retained
as well; they are not counted as passing attempts.

Both browser cohorts and all offline workers run serially: 68 Windows Jobs,
65 passing and three retained failing test attempts. Each verifies CPU10%,
commit768MiB, 24 processes, host-free4GiB, kill-on-owner-close and zero owned
processes after cleanup. Node heap is192MiB; browser wall/idle limits are45/12
seconds and offline60/60. Final producers are `run-opaque-each.py`,
`run-native.py`, `run-regressions.py` and `run-retention.py` in that revision.

Earlier revisions are frozen under `revisions/v1` through `revisions/v8` with
their original seals. Public compiler/runtime hashes remain 70abd192/ae44708c.
These are semantic and lifetime checks, not CPU timings, heap-size or allocation
throughput measurements. No CPU benchmark or full release gate ran. Broad
performance, compiler/editor, delivery, opaque composition, exclusive/structural
row coverage and public-promotion gates remain open. No new framework ranking,
Svelte parity or production-readiness result is established.

The subsequent [sequential composition extension](REGION-BACKEND-OPAQUE-COMPOSITION.md)
adds child frames with deferred primitive prop readers. The evidence above
describes the retained v9 revision.
