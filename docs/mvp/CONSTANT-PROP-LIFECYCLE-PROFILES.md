# Constant-prop lifecycle profiles and cleanup work

**Diagnostic only. No runtime change, new CPU gain or framework ranking.**

This follows the private [constant-prop specialization](CONSTANT-PROP-CAPTIONS-STUDY.md),
whose normal-frame observations favored localized mounting but not unmounting.
Those observations did not establish a code-caused CPU difference. This study
investigates source work rather than assuming cleanup or GC explains that signal.

## Cleanup obligations remain

A separate instrumented copy of the exact checked generated applications counts
native cleanup registrations, callback executions, effect stops, subscription
edges removed, caption activation flags and native click-listener removals.
Both variants use the same runtime before instrumentation. The census uses fake
DOM and supplies no CPU or engine allocation-byte measurement.

Per application parent:

| App / variant | Cleanup callbacks | Effect stops | Caption flags | Subscription edges removed | Click listeners removed |
|---|---:|---:|---:|---:|---:|
| Localized baseline | 97 | 48 | 25 | 24 | 24 |
| Localized candidate | 97 | 24 | 49 | 24 | 24 |
| Composition baseline | 13 | 3 | 9 | 2 | 1 |
| Composition candidate | 13 | 2 | 10 | 2 | 1 |

The same relationships pass at 16 parents. All registrations execute during
disposal; output signatures match and roots become empty. The extra static
captions replace effect cleanup callbacks with activation-flag callbacks, leaving
the callback total, live subscription removals and listener removals unchanged.
The initial effect reduction therefore does not imply fewer lifetime callbacks.

The current captionActive helper returns a boolean after calling owner.own. Its
flag supports synchronous cancellation during registration. After that return,
the retained callback writes a flag that this caption no longer reads. This is a
specific opportunity to investigate transient registration obligations. It does
not justify skipping foreign-owner registration, ignoring overridden own methods,
reading new owner properties, changing LIFO/error behavior or assuming a CPU gain.
The existing [owner regression](LITERAL-CAPTION-STUDY.md) and
[supported activation contract](CAPTION-INITIALIZATION-STUDY.md) still apply.

## Exact-source browser profiles

The native diagnostic rebuilds minified, externally source-mapped export bundles
from the checked baseline/candidate outputs retained by the preceding study.
Compiler identities remain 70abd192 / eb255d3b and both runtimes remain ae44708c.
Maps are retained offline and are not served. Four mapping controls pass; every
profile, map, runtime source, case and worker hash is verified.

There are 16 fresh-browser cases: composition/localized, baseline/candidate,
one/16 parents and two passes. The second pass reverses the full case order.
Each case has two warmups and four captures of eight synchronous mount/unmount
cycles. Maximum active localized panels is 384; each large localized capture
constructs/disposes 3,072 panels. Composition observations count root application
instances, not all nested components, and are not pooled with panel counts.

Sampling interval is requested at 100 microseconds, not guaranteed. Small cases
are sparse. Sixteen-parent localized cases provide these counts across four
captures each:

| Variant / pass | All samples | Runtime leaf samples | GC samples |
|---|---:|---:|---:|
| Baseline / 1 | 194 | 72 | 24 |
| Candidate / 1 | 193 | 67 | 19 |
| Baseline / 2 | 213 | 71 | 26 |
| Candidate / 2 | 206 | 69 | 15 |

Source-mapped leaf frames include component prop adaptation, literal button
construction, text binding callbacks, element construction, ownership and effect
disposal. The effect-disposer line receives six/six leaf samples in the two large
baseline passes and five/three in the candidate. These sparse counts do not
measure CPU or prove that disposal is cheaper. GC samples also cannot establish a
GC-time improvement or explain the previous unmount observations.

Captures include construction and disposal together. They do not isolate the
earlier unmount CPU window. Native engine work may be charged to a JavaScript call
site, and engine/protocol/unmapped samples remain separate. Self frames and
overlapping inclusive stacks are reported separately; inclusive counts are not
summed as a cost total. Wall timeDeltas and sample counts are not converted to CPU.

Normal per-cycle frame waits are absent inside the synchronous batch. Explicit
GC, frame settlement, checks and listener probes are outside requested capture
work; natural GC and incidental engine activity can occur inside the profile.
This diagnostic therefore does not replace normal application measurements.

All 64 post-capture checks restore DOM/listener counts to baseline. Detached
buttons cannot change retained output after disposal. All 18 serial Windows Jobs
pass: one map/bundle build, 16 native profile cases and one offline census. Limits
remain CPU10%, commit768MiB, 24 processes, host-free4GiB, kill-on-owner-close and
browser wall/idle45/12 or offline60/60 seconds. Each cleanup leaves zero owned
processes. An initial offline analyzer assertion failed because a local case key
was overwritten by a hash-field variable. The failed producer is retained; the
corrected analyzer reuses the same captures without rerunning or editing them.

Read-only Svelte contrast remains commit 0156c5fe38b53b72675e2a7f04535de015fdeed1,
internal/client/reactivity/effects.js: teardown is optional and is executed when
present. This informs examining which obligations need to survive until disposal;
it is not a claim of equivalent ownership semantics or a copied implementation.

The source census identifies a concrete remaining obligation; the profiles do
not establish a causal explanation for the earlier unmount signal. Keep the
candidate private and investigate registration lifetime with its owner contract
intact. Public src/tests/dist and Surface remain unchanged; the historical
610-test/check/build gate is not rerun or replaced.

Private evidence: `constant-prop-lifecycle-profiles/run-c04f711b9255498fa4a15c22004e72b0/review`
and `counts-897fc23e024e4057b64b09669f6cd549`. Exact raw source frames, inclusive
stacks, profiles, instrumentation and audit identities are retained.
