# Clear-region phase calibration

The production core is unchanged. This diagnostic separates the eligibility guard,
the owner-cleanup region, and the synchronous native replaceChildren call using
private runtime copies. It does not supply a new framework ranking or a speedup.

For 1,000 rows, enabled-probe medians in both ordering seeds are about **0.1 ms
guard**, **0.9 ms owner cleanup**, and **1.3–1.4 ms DOM removal**. These are synchronous
elapsed spans from performance.now, not pure CPU. Native work, GC and preemption
can occur inside them. They cannot be subtracted from CDP CPU totals. Owner cleanup
includes its bookkeeping/error-collection region; DOM removal excludes deferred
style/layout work. The result does not prove all DOM time is unavoidable.

## Setup and semantics

The baseline rebuild is byte-identical to the frozen `run-ZZn7ZX/site/elnor.mjs`.
Both variants bundle the same frozen generated graph with the existing production
esbuild options. Only the private probe runtime differs. Enabled and disabled
probes load the **same bundle bytes**, controlled after load. Original driver,
HTML, CSS, normal scheduling, two frame callbacks, geometry read, sandbox and
accessibility remain unchanged. These private bundles are not normal fixtures.

The probe uses six clock reads per eligible clear, with no per-row timestamps.
It records only counts/booleans/times, not owners or DOM references. The original
guard is wrapped; owner cleanup still precedes DOM removal in finally. Twenty-one
private semantic checks cover native eligibility, custom-owner fallback, throwing
guard, falsey owner errors, owner-before-DOM and DOM-finally error priority in
baseline, disabled and enabled modes. Held row buttons are clicked after each
browser clear; they remain inert and verification still passes.

An initial source-matcher setup rejected CRLF before tests or bundling. Its evidence
is preserved, not green. Only the diagnostic transformation was normalized; the
baseline and production source bytes were preserved. The corrected build passed.

## Controls: CPU windows remain separate

Two warmups precede seven measured clear operations per label. Initial order AB/BA
is reversed on alternate rounds; each pair uses fresh isolated pages/browser.
Each measured clear follows a verified ordinary create. There are 12 browser
phases and 168 measured clear windows, plus one successful setup phase.

A/A = baseline versus baseline. Wrapper = baseline versus probes disabled.
Clock = probes disabled versus enabled. Cells below are medians in milliseconds.
Variation and changes from wrappers/JIT/clock collection cannot be isolated into
a universal constant overhead or subtracted to manufacture corrected timings.

| Control | Rows | Order | A Task CPU | B Task CPU | A Thread CPU | B Thread CPU |
|---|---:|---|---:|---:|---:|---:|
| aa | 100 | AB | 1.290 | 1.261 | 1.384 | 1.398 |
| aa | 100 | BA | 1.443 | 1.337 | 1.572 | 1.433 |
| aa | 1000 | AB | 4.904 | 5.007 | 5.010 | 5.163 |
| aa | 1000 | BA | 4.447 | 3.937 | 4.518 | 4.076 |
| wrapper | 100 | AB | 1.409 | 1.389 | 1.497 | 1.486 |
| wrapper | 100 | BA | 1.718 | 1.590 | 1.819 | 1.699 |
| wrapper | 1000 | AB | 3.234 | 3.693 | 3.315 | 3.767 |
| wrapper | 1000 | BA | 3.648 | 3.430 | 3.748 | 3.501 |
| clock | 100 | AB | 1.213 | 1.271 | 1.297 | 1.346 |
| clock | 100 | BA | 1.422 | 1.191 | 1.488 | 1.277 |
| clock | 1000 | AB | 4.324 | 4.025 | 4.441 | 4.107 |
| clock | 1000 | BA | 3.594 | 3.488 | 3.674 | 3.571 |

## Synchronous phase spans

Each cell shows median (min–max), followed by the number of measured zeros out of
seven. Zeros mean below/at the observed clock granularity, not no work. Back-to-back
clock controls are retained for each page. Approximately 0.1-ms clock steps make
the 100-row guard especially unresolved; no tiny-percent improvement is inferred.
The per-sample sums and CPU windows must not be equated or combined across clocks.

| Rows | Order | Guard ms; zeros | Owner region ms; zeros | Native DOM call ms; zeros |
|---:|---|---:|---:|---:|
| 100 | AB | 0.000 (0.000–0.100); 6/7 | 0.100 (0.100–0.200); 0/7 | 0.100 (0.100–0.200); 0/7 |
| 100 | BA | 0.000 (0.000–0.100); 5/7 | 0.200 (0.000–0.200); 1/7 | 0.200 (0.100–0.200); 0/7 |
| 1000 | AB | 0.100 (0.000–0.200); 1/7 | 0.900 (0.800–1.600); 0/7 | 1.400 (1.300–2.300); 0/7 |
| 1000 | BA | 0.100 (0.000–0.200); 1/7 | 0.900 (0.700–1.200); 0/7 | 1.300 (1.100–1.400); 0/7 |

## Outcome and evidence

The guard is small in these captures. Owner cleanup and native DOM removal both
matter; a generic callback count is not the same as measured callback self-time.
The [previous trace budget](CREATION-CLEAR-TRACE-BUDGET.md) remains a separate
instrumented CPU-event classification, and the [current core comparison](CURRENT-CORE-COMPARISON.md)
remains the normal comparative baseline. No core optimization ships in this study.

Evidence: `clear-phase-study/run-1d0cf958de334f3eb1a58a67e0ec8cf7`, with setup `build-574eb06be9264dbb9b752c21220e451d` and the
initial rejected setup `build-d4c5f42ea0af4d08acfb9b2647beca21`. Original/revised sources, collector,
all samples, empty clock controls, semantic results, hashes and exact report
revision are retained. Thirteen phases passed and one setup was rejected by its
source guard. All were serial, with CPU10%,768MiB commit,24 processes,host-free
>=4GiB,kill-on-owner-close; browser45s wall/12s idle, setup60s/60s. Every phase
ended with zero owned processes. No limits or coverage were lowered. The last
complete core gate remains 581 tests/check/build; production source is unchanged.
