# Competitive performance without losing Surface DX

**Product requirement, clarified by the project owner on 2026-11-11:** Elnor
must deliver performance at least on par with Svelte and React on comparable
workloads, with the ambition of materially outperforming them, while preserving
the human-oriented Surface syntax and developer experience.

This is a product requirement, not an optional optimization afterthought. It
complements the existing DX-first priority; that priority does not waive the
performance requirement. Security boundaries remain in force. This document
records the owner's direction, not a benchmark result or a claim of parity.

On 2026-11-16 the owner selected a CPU margin of up to 10% above Svelte for a
fixed broad runtime matrix. The [majority acceptance rule](BROAD-PARITY-ACCEPTANCE.md)
requires two independent cohorts of the same source and reports all phase
exceptions. This bounded Svelte target does not establish complete product
parity or replace the other dimensions below.

## What must be compared

The owner's global-impact clarification now requires the
[expanded workload matrix](EXPANDED-PERFORMANCE-MATRIX.md) alongside the list
studies. It adds small stateful components, six-field forms/validation, deep
props/events/slots and 24 independent child states, plus separate lifecycle,
delivery, startup and checked-build observations. The complete cohort has 40
browser phases, 45 preflight checks, 1260 action samples, 36 startup samples and
96 memory cycles. This establishes broader synthetic coverage, not a
representative application or product parity. Initial startup wall observations
remain explicitly labeled as the provisional original collection.

The [controlled startup follow-up](CONTROLLED-STARTUP.md) now passes visibility
checks across 24 pairs/336 fresh-context starts with unchanged app bytes. It
keeps A/A, both orders and all first starts. A localized identical-code pair
still shows 60.880/215.226 ms wall medians with similar CPU, so foreground
control does not resolve every delay and no startup wall ranking is accepted.
CPU observations remain separate and descriptive; this is collector hardening,
not a new core optimization or a product-parity verdict.

The subsequent [phase diagnostics](STARTUP-PHASE-DIAGNOSTICS.md) preserve 144
instrumented starts with unchanged app bytes. They locate distinct pre-request,
accessibility-lifecycle and animation-frame waits across the expanded matrix.
Those intervals are not one confirmed universal cause, pure framework CPU or
normal timing samples. Retain the startup wall restriction; target core CPU and
resource work with cross-family evidence rather than removing readiness or
accessibility work to improve a synthetic score.

For future optimizations, assess affected families, both controls and A/A,
memory/lifecycle, delivery, tooling and preserved DX/correctness. A win on the
1000-row case alone does not justify changing the core. No global score,
post-hoc tolerance or blanket no-regression percentage is chosen here.

The [2026-11-12 functional core closure](CORE-READINESS.md) retains fixture
`run-RuBGXZ`, with scheduler and disposal corrections. Its 550-test gate and
browser checks establish functional behavior; no new comparative timing cohort
or parity verdict is supplied by that closure.

The subsequent [current-core comparison](CURRENT-CORE-COMPARISON.md) now measures
that exact fixture against both frameworks, with 16 action-interleaved pairs,
1568 samples, two sizes, reversed orders and contemporaneous A/A controls.
At 1000 rows Elnor uses less CPU than React in six operations in both orders,
and more for creation. Against Svelte, creation, append and clear use more CPU
in both orders; update, select and remove have mixed directions. A/A differences
span -6.92% to +6.02% in this cohort. These are descriptive observations, not an
accepted parity threshold or proof of a general runtime improvement.
Absolute medians also differ from earlier cohorts for the controls; do not
attribute cross-cohort drops to Elnor code changes. The cumulative old/new-core
pairs remain mixed or small and do not establish an overall CPU speedup.

Compare against **both Svelte and React**, with named versions and equivalent
behavior. Establish the workload, metrics and parity tolerances before deciding
whether Elnor meets the target. The 10% margin above applies to the bounded
Svelte runtime comparison; no product-wide speedup has been accepted.
Do not substitute beating one baseline for measuring the other,
select only favorable cases, or hide material regressions behind one average.

Keep these dimensions separate:

| Dimension | Evidence needed |
|---|---|
| Runtime interaction/rendering | Equivalent initial mounts, state updates, child events, keyed list creation/update/reorder/removal, and disposal; include browser rendering where relevant |
| Delivery/startup | Comparable production output, compressed transfer size and browser parse/evaluate/mount costs, with the same application behavior and assets |
| Memory/lifecycle | Comparable retained memory and repeated mount/update/dispose behavior, with sampling/GC methodology declared |
| Development DX | First startup, saved-change feedback, error/recovery and editor responsiveness; disclose whether typechecking and automatic browser updates are included |

Run comparisons on the same equipment/browser and configurations, preserve raw
samples and report variation. Do not compare Elnor's full checked publication
with a competitor's transpile-only HMR time as if they performed identical work.
Distinguish functional correctness, latency and human usability. Validate the
candidate implementations before comparing their speed.

## DX preservation is part of the requirement

Optimize compilation, generated code, runtime work and tooling without forcing
authors to abandon Surface's readable syntax or manually manage low-level DOM
operations, invalidation or memory just to achieve benchmark parity. Preserve
the supported typing, component/event behavior, original-source feedback,
formatting and understandable error/recovery flows. A performance win that
requires worse authoring ergonomics does not satisfy this combined target.

Any proposed grammar or authoring tradeoff must be explicit, justified and
evaluated against this requirement. Passing compiler/runtime regressions alone
does not establish preserved human DX. A Rust implementation may be considered
when profiling identifies a suitable bottleneck and a measured benefit; its
implementation language is not itself evidence of a faster application.

## Current status and next evidence

**Product parity is not yet demonstrated.** The
[shared runtime protocol and contained reconciliation study](../../benchmarks/runtime/README.md)
now retain equivalent synthetic list operations for Elnor, React and Svelte.
The original uncapped comparison was interrupted by host responsiveness problems.
A later CPU-capped, GPU-disabled study reproduced the Elnor baseline and measured
an optimization that removes unnecessary keyed-row DOM movements. It materially
improves several updates, while creation/clear costs and run-to-run variation
remain open. These diagnostic conditions and the small workload do not establish
production acceptance. No numeric parity margin has been agreed.

The lifecycle follow-up retained a staging-fragment retention fix and rejected
broader text/cleanup/prop-adapter trials with mixed timing results. Historical
CDP duration tables use elapsed `timeTicks`; newer CPU studies explicitly record
`threadTicks` and keep frame-window wall time separately. These clock domains
must not be mixed or described as the same metric. The follow-up does not close
the remaining creation/disposal or representative-workload performance gaps.

The subsequent [independent region design](REGION-OPTIMIZATION.md) retains shared
generated ownership, verified exclusive-list clearing and persistent Text nodes.
In the completed four-run CPU study, the 1000-row update median falls from
4.031 to 3.210 ms and clear from 4.684 to 3.075 ms. Svelte remains ahead at
3.113 and 2.431 ms respectively; creation also remains behind both controls.
These figures concern this synthetic list under the contained diagnostic
protocol. The full operation matrix and the additional bundle cost are recorded
in the runtime protocol; no general parity or isolated text-effect benefit is
inferred. Check/build and 480 Node tests pass, as does the browser preflight.

The next creation investigation rejected two additional implementations rather
than treating the studied techniques as mandatory. Single-node DOM cloning
increased warmed creation/append costs. Direct prop-descriptor installation
showed a creation win in one study, failed to confirm it in another and repeated
a small-list clear regression. Their complete matrices and the separate first
row-creation protocol are recorded in the runtime README. Runtime/compiler were
restored byte-for-byte to the previously retained variant. The final restored
implementation passes check/build and 487 Node tests; these experiments do not
constitute an additional retained runtime speedup or a reason to infer a Rust
benefit. Profiling and the remaining representative-workload gaps stay open.

The following [profiling/direct-root investigation](DIRECT-ROOT-STUDY.md) retains
statically proven single-root row construction and direct owner teardown for
verified exclusive clear. The four-process study reduces 1000-row creation
from 19.769 to 18.882 ms CPU and clear from 3.329 to 3.032 ms. Independent
confirmation also improves both (19.420 to 16.939 and 2.951 to 2.820 ms).
Magnitudes and rankings against framework controls vary; first-use medians
change direction in two cold studies. No general cold win or product parity is
inferred. Check/build, 508 tests and browser preflight pass. Memory observations
return to 12 DOM nodes after unmount and three additional cycles; this is not
peak memory or general leak proof. The comparison bundle costs 126 extra gzip
bytes. Earlier inline-dependency and shared-run trials are recorded as rejected.

The [repeatability investigation](REPEATABILITY-STUDY.md) subsequently finds
double-digit apparent differences between identical Elnor fixtures in an A/A
control. Separate empty-window calibration has small costs, while expanded
traces identify roughly 40–42 ms of accessibility lifecycle CPU in creation
captures for all three frameworks. This explains substantial work in those
captures, without establishing the trigger or accounting for every A/A
difference. Historical untraced cohorts do not establish matching accessibility
conditions. Future comparisons need contemporaneous controls and explicit
accessibility observations; total renderer cost remains visible.

A subsequent [scheduler correctness fix](REACTIVE-SCHEDULER.md) preserves
independent queued updates after a reaction failure and removes a duplicate
empty flush in cascades. Six regressions, check/build, 516 Node tests and browser
preflight pass. Its correctness fixture is `run-ukbjyh`; the earlier comparative
timing tables remain historical. No CPU speedup or parity is inferred from it.

Further [structural recovery hardening](STRUCTURAL-RECOVERY.md) releases failed
each/when regions while preserving retry anchors, and avoids empty notification
microtasks without subscribers. Its correctness fixture is `run-BknsXh`;
check/build, 533 tests, normal browser preflight and a separate native-DOM error
recovery fixture pass. The bundle adds 15 gzip bytes versus the scheduler fix.
No comparative CPU result is inferred from this correctness work.

The subsequent [paired investigation](PAIRED-MEASUREMENT.md) completes 16 pairs
with A/A, previous/current core and framework controls, isolated contexts in one
browser per pair, reversed order and post-timing accessibility traces. Identical
code still shows double-digit differences in some actions; the technique does
not yet establish reliable small-change acceptance. Runtime/compiler remain
unchanged. Complete per-pair results, validation and limitations are retained.

A further [text-write/interleaving study](TEXT-WRITE-GUARD.md) uses an exact
Svelte source review as design inspiration, retaining Elnor's own actual-node
comparison and independent effects. It reduces 1000-row update text records
from 202 to 100 and swap from 2 to 0 with unchanged effect counts. Fixture
`run-9EYGTh` passes check/build, 539 tests, preflight and native DOM checks;
the bundle adds 9 gzip bytes. Sixteen action-interleaved pairs still show
substantial A/A variation in some operations. This establishes less redundant
DOM work, not an accepted CPU speedup or product parity.

The [notification snapshot study](NOTIFICATION-SNAPSHOTS.md) subsequently
removes a subscriber-array copy while preserving the executing flush snapshot.
It observes 101 fewer snapshot expressions for update1000 with unchanged
notifications/enqueue attempts. Bounded browser microbenchmarks and confirmation
favor the direct loop in isolated write/coalesced-flush scenarios, with A/A
reported separately. Application timing stays mixed and is not interpreted as
a general speedup. Fixture `run-sPU8kb` passes check/build, 543 tests, preflight
and native DOM recovery; the bundle is 5 gzip bytes smaller.

The subsequent [Range clear evaluation](RANGE-CLEAR-STUDY.md) profiles the current
core and rejects an isolated native deletion alternative. A complete retry
shows mixed, small changes for 1000-row clear, more CPU for 100-row clear in both
orders, and additional mutation records/bundle bytes. The first cohort timed
out and remains explicitly failed. Current runtime/compiler are unchanged;
there is no new speedup or framework comparison from this negative result.

The following [native listener study](NATIVE-LISTENER-STUDY.md) rejects shared
AbortController cleanup before runtime integration. Two isolated cohorts retain
14 browser cases/336 CPU phase windows, A/A, both orders and GC probes. The
registration cost outweighs the small or mixed release benefit; summed native
phases use more CPU in all four large comparisons. This is not a whole-app
slowdown ratio. The validated runtime/compiler remain unchanged; neither
listener delegation nor cancellation machinery is introduced.

Next work must investigate the remaining costs and variability, expand the
representative workloads and agree acceptance margins. Continue measuring
runtime/delivery/memory separately from the development loop. Keep product parity
claims pending. No existing spike result is rewritten as comparative proof,
and the completed viability investigation is not reopened. The
[MVP readiness review](MVP-READINESS.md) must now track this competitive target
explicitly alongside human DX and latency characterization; a bounded technical
GO does not imply the product performance requirement has been met.

The [literal caption study](LITERAL-CAPTION-STUDY.md) subsequently evaluates
compiler/runtime specialization across four small workloads and both list sizes.
It removes zero-dependency effects and reduces mounted heap in the small apps,
but grows delivery, produces mixed CPU and breaks a supported foreign owner.
The candidate is rejected and the validated core is restored. The regression
is retained as a test; this study does not add a speedup claim.

The subsequent [caption initialization study](CAPTION-INITIALIZATION-STUDY.md)
retains a compatible ownership-registration variant and skips binding rewrites
for proven primitive captions. It passes 570 Node tests/check/build and native
global/list checks. Effects and mounted heap fall in the four small workloads;
the global check also detects and removes a roughly 32 KiB list penalty in an
intermediate variant. Delivery grows slightly and CPU remains mixed. This
changes the active core; prior statements about unchanged source are historical.
No new competitive CPU ranking or accepted performance margin follows.

The [separate-helper follow-up](SPLIT-CAPTION-HELPERS.md) restores the original
four-argument dynamic helpers while retaining literal initialization through
distinct compiler entrypoints. Constructor and ownership work stay unchanged;
delivery improves in three mixed entries and the static/dynamic delivery
controls, with a 2-byte gzip increase in the form entry. The 572-test gate and
global/list native cohorts pass. CPU and its composition follow-up remain mixed;
the target and its acceptance margin are still open.
