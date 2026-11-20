# Direct scalar dispatch and static runtime entry selection

This is a private continuation of the [region backend](REGION-BACKEND-DESIGN.md),
following the real-workload selection and CPU audits. Surface syntax, public
compiler/runtime and the public `renderOwned` contract are unchanged. This slice
does not establish parity with React or Svelte.

## Why this change

The real-workload audit found that only counter and localized panels selected
regions among five benchmark families. The other three retained the general
backend. Correctness fixtures therefore did not imply broad execution coverage.
The first CPU screen found no global win, while region bundles were much larger
than general-backend bundles.

The scalar flush tested dependency masks on every binding, even for an isolated
state change. Also, scalar modules imported a generic region mount entry, making
the bundler retain structural/list/task machinery they could never use.

## Integrated private mechanism

The compiler inverts scalar binding dependencies into state-to-binding-word
invalidation masks. A state write ORs the relevant masks into pending binding
words. Flush visits set bits in binding order, evaluates each affected binding
once and preserves the original binding error aggregation. It scans binding
words, not unrelated binding descriptors. Initial mounting still evaluates all
bindings in order. Double buffers preserve writes scheduled during a binding.

Scalar descriptors no longer serialize the old per-binding dependency masks.
The compiler selects `mountScalarRegion` statically for eligible scalar plans.
Structural and sequential plans retain the existing general region entry and
task scheduler. The original public-owner fallback remains available in both
paths. No workload source is rewritten to force eligibility.

The local Svelte compiler's template-effect generation was a read-only contrast:
it reinforced selecting generated work and runtime helpers from compiler
knowledge. Elnor's dependency inversion, dirty binding words, ordered error
handling and owner fallback are independently implemented. No Svelte source was
copied or language semantics imported.

## Delivery and CPU evidence

The authoritative comparison is
`cost-dispatch-ef509359cc6640c39a441a1ecee2fb69` under the internal region directory.
Its baseline is **regions v14**, not the public/general backend or another
framework. Both arms use the same ordinary private runtime and original Surface
sources, with the same esbuild settings, driver, CSS and containment limits.

| Workload bundle | v14 raw | New raw | v14 gzip-9 | New gzip-9 |
| --- | ---: | ---: | ---: | ---: |
| Counter | 21,890 B | 7,442 B | 7,717 B | 3,043 B |
| Localized panels | 36,805 B | 22,235 B | 9,777 B | 5,070 B |

These mount entries use the same external measurement driver. The reduction is
approximately 61% and 48% compressed. They remain larger than the previously
measured general-backend entries; these are different comparison baselines.

The additional CPU screen uses lots of **32 independent instances**, two warmup
rounds, seven measured rounds, AB/BA orders, AA controls and renderer ThreadTime.
The table reports medians of order-specific medians for the whole lot in ms:

| Action | Counter v14 | Counter new | Panels v14 | Panels new |
| --- | ---: | ---: | ---: | ---: |
| Mount | 2.117 | 2.145 | 20.888 | 19.748 |
| Update | 1.678 | 1.754 | 4.381 | 4.147 |
| Unmount | 0.995 | 1.007 | 2.908 | 2.816 |

Panels favor the new slice in both orders: mount -9.3/-1.6%, update -9.3/-1.5%,
unmount -2.4/-3.9%. Counter results remain mixed or within AA variability.
Some panel differences are also small relative to AA, so this is descriptive
evidence, not an established stable speedup or statistical significance.
ThreadTime includes shared browser/driver/rendering work. Operation wall time
and frame-window time are separate retained fields. No cold startup or
allocation-throughput claim follows from this screen.

The earlier dispatch-only candidate is retained in
`cost-dispatch-cbdd8dc1af6742bc92a297fa480bb287`. It reduced binding visits but
slightly increased delivery size and did not establish a CPU win. Static helper
selection is part of the final slice; that earlier candidate is not promoted
separately.

## Validation and remaining gates

The dispatch controls require that one isolated update among 65 bindings visits
only its affected descriptor. They also cover compiler emission across state
and binding word boundaries (including bits 31/32/64), overlapping dependencies,
ordered deduplication, unobserved writes, setter-triggered writes, disposal during
an update, and continued execution after multiple binding failures. Native
repair, opaque tracking, scoped lifetimes and mixed schedulers remain covered
by the complete backend suite.

The review validator checks the final 291 backend tests, 71 existing compatibility
tests, 40 checked native browser cases (442 DOM stages and 640 lifecycle cycles),
and the existing retention controls with 48 disposers held. CPU screens add DOM
identity/schema checks, GC node/listener controls and 384 explicitly checked host
disposals per screen. A batch wrapper cannot conceal incomplete disposal.

The retained history includes the initial snapshot setup failure, the genuine
v14 red controls and a test assertion corrected to inspect its instrumented fake
DOM value. They are not counted as passing. Review v15 verifies all 79 expensive
Jobs: 76 pass and those three failures remain retained. All Jobs run serially
under CPU 10%, 768 MiB aggregate commit, at most 24 processes and a 4 GiB host-free
memory floor. Node heap is 192 MiB. Browser wall/idle limits remain 45/12 seconds;
offline limits remain 60/60. Cleanup leaves zero owned processes.

Revision v14 was archived and verified before edits. The exact current source,
producers, test history, comparison samples, native cohort, retention results and
source hashes are retained by `review-v15/audit.json` and its seal.

Selection still covers two of the five real workload families. Form expressions,
parameterized actions, reference props, slots/events and other unsupported cases
still fall back. Full compiler/editor, startup, allocation, release and public
promotion gates remain open. Next work should cover a real fallback workload
without sacrificing DX and retain delivery/CPU checks alongside correctness.
