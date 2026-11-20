# Region backend: first implemented vertical slice

**Implemented in one experimental backend branch; not promoted to public src.
No CPU speedup or competitive parity claimed.** This implements the first slice
of [the region design](REGION-BACKEND-DESIGN.md), not an isolated helper candidate.
The same branch is intended to acquire the later architectural stages.

## Complete implemented path

The compiler analyzes the original component IR and emits an owned region or the
current general rendering path. An eligible region combines:

- A fixed programmatic DOM blueprint, cached per plan/document and deep-cloned
  per instance. Dynamic values and listeners never touch the shared prototype.
- Region-indexed primitive state, generated action writes and dependency masks.
  Multiword masks work beyond 32 states. Optimized text has no per-binding
  subscriber Set or effect/disposer closure.
- One region job in the existing scheduler. Dirty slots select affected bindings;
  unrelated bindings are not read. Returning to the old value before flush keeps
  its invalidation. General effects and regions share one scheduled flush.
- Native events, job cancellation, listener/resource disposal, DOM removal and
  reference release as one lifetime. Mount failures preserve prior host nodes.

The acceptance programs are a static section, counter, independent fields and
two-input editor, each with creation, updates, disposal and remounting. The proof
covers literal primitive initialization and bounded primitive-only action and UI
expressions over private state. Every source is checked by the existing project
checker before actual native execution.

Props, runtime imports, calcs, emitted events, slots, conditionals, loops, opaque
reads/calls and unsupported actions keep the whole component on the general path
for now, with recorded eligibility failures. These are optimization boundaries,
not new Surface restrictions. No user flag or annotation is required.

Public renderOwned remains the legacy path even in eligible modules. Foreign or
overridden owners, own-only proxies and cancellation remain supported. Only mount
of a proven closed component enters the owned region. Standalone generate without
the internal packaged-backend option also retains its general output.

## Contracts and security

Dirty dynamic text compares with the actual native node value, retaining external
text repair rather than copying Svelte's cached-text contract. Input comparison
preserves the pristine empty-input/default-value behavior. Independent state,
queued disposal, repeated disposal, rollback and cleanup/update failure isolation
are tested. Prototypes remain pristine across instances/documents, and module
import requires no document.

Blueprint construction uses createElement/createTextNode and cloning: no HTML
parsing, eval, Function or runtime HTML interpolation. Native verification keeps
the existing restrictive CSP. Svelte's combined template/update/lifetime model
and from_tree provide read-only contrast; no Svelte implementation or runtime
dependency is introduced.

Arbitrary DOM/intrinsic monkeypatches, custom elements/namespaces, hydration, all
error interleavings and every Surface program are not proven by this slice. The
conservative exclusions and general entry remain necessary. Earlier whole-tree
observability counterexamples are not waived.

## Verification

- 20 backend tests pass: complete lifecycles, pending disposal, return-to-old-value
  invalidation, selective reads, 65 states, foreign ownership, rollback, errors,
  pristine/cross-document trees, import without document, shared scheduling and
  fallback.
- 71 existing tests pass unchanged across captions/owners, dependencies,
  scheduler/batch consumption, structural recovery and project publication.
- Four native baseline/region pairs pass 12 normalized DOM/value stages per
  backend and 64 mount/dispose cycles in the authoritative cohort. Root identity
  and disposed-event non-resurrection are checked. These do not prove heap or
  native listener-count equivalence between backends.
- A Node GC control keeps the returned disposer alive: mounted instance DOM is
  reachable before disposal and collectable afterward. It uses 12 collections
  per phase and a live positive control, not CPU or allocation-byte measurement.

All 15 retained expensive Jobs are serial: 13 pass and two harness attempts fail.
The first rollback probe patched a prototype instance method that cloning did not
copy; the corrected probe intercepts registration on clones. The first input
probe checked pristine behavior after editing; the corrected cohort checks it
before editing. Failed producers/logs remain retained and no test is weakened.

Limits remain CPU10%, commit768MiB, 24 processes, host-free4GiB,
kill-on-owner-close and browser wall/idle45/12 or offline60/60 seconds. Every
cleanup leaves zero owned processes. Browser: sandboxed headless Edge157,
GPU disabled, existing CSP, no accessibility override. No performance benchmark,
full release gate, framework ranking or production adoption is performed.

## Continuation

The vertical path now executes actual generated Surface through the current
project publication pipeline. Public compiler/runtime remain 70abd192/ae44708c;
the branch lives in region-backend/region-project. The initialization-registration
helper experiment is not used.

Fixed component composition has since been integrated in the same backend; see
[the composition report](REGION-BACKEND-COMPOSITION.md). This first-slice report
and its original evidence remain historical, frozen in `revisions/v1`.

Next extend this same backend with component/owner provenance, derived dependency
ordering, conditional/keyed child regions and independent opaque tracking.
Retain the semantic counterexamples. Broad runtime/lifetime/delivery and
compiler/editor DX measurement follows meaningful architectural coverage.

Private evidence: `region-backend/tests-7e240aee58bc40eca29e49325ced86d3`,
`native-67cf617daff4427faa26071db03b3096`,
`regressions-e66b9ac269424a2aae734999ee417a67`,
`retention-37a23cb84c0840098b7f74a1f7c9e2cc` and final `region-backend/review`.
