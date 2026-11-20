# Native listener cancellation investigation

**Investigated: 2026-11-12.** A shared AbortController is not adopted in
the Elnor runtime. This experiment tests the native primitive before
adding ownership/channel machinery. The active core remains byte-identical
to `run-RuBGXZ`; the compiler is unchanged.

## Question and bounded protocol

The earlier [clear profile](RANGE-CLEAR-STUDY.md) found native listener
removal samples. One shared signal could reduce explicit JS removal calls,
but registration, native abort work, lifetime and compatibility also matter.
API semantics were checked against the primary
[DOM Standard](https://dom.spec.whatwg.org/#add-an-event-listener).

This is an isolated native-operation study, not application rendering.
Buttons are detached; no Elnor effects, reconciliation or framework code
execute in the timing windows. Each transaction has four independent
groups of 100 or 1000 buttons: **400 or 4000 listeners per timed phase**.
Node/handler creation happens outside those windows. Signal registration
includes one controller and one reused options object per group. Release
uses four abort calls versus one removeEventListener per listener. This is
an optimistic primitive comparison, without production guard/adaptor costs.

Two warmup transactions precede seven measured transactions per label.
The initial label order is reversed in a second fresh browser case, and
alternates each round inside a case. A/A compares manual removal with
itself. Native callback receiver, successful registration and complete
release are checked outside every timing window. Explicit GC runs after
each round, outside all windows, bounding temporary allocation pressure.

Numbers are renderer TaskDuration CPU medians in ms using threadTicks.
The summed-phase median is computed from each round's registration plus
release CPU, not by adding separate medians. It excludes creation, clicks
used for verification, GC, DOM insertion/removal and browser presentation.
The phases use separate CDP windows and include their protocol overhead.

## CPU observations

A is manual removal. B is manual in A/A and signal-based in the signal
group. Positive delta means B used more CPU. Both initial orders and all
declared sizes remain visible; no tolerance is chosen from the results.

### Initial cohort

`diagnostics/listener-abort-7f1c907df99649dcb0354fddab2bc4e3`

| Group | Listeners per phase | Operation | AB: A | AB: B | Delta | BA: A | BA: B | Delta |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| aa | 400 | register | 0.361 | 0.363 | +0.55% | 0.296 | 0.285 | -3.72% |
| aa | 400 | release | 0.347 | 0.337 | -2.88% | 0.268 | 0.234 | -12.69% |
| aa | 400 | summed phases | 0.669 | 0.695 | +3.89% | 0.565 | 0.519 | -8.14% |
| aa | 4000 | register | 0.880 | 1.047 | +18.98% | 0.925 | 0.922 | -0.32% |
| aa | 4000 | release | 0.619 | 0.753 | +21.65% | 0.660 | 0.752 | +13.94% |
| aa | 4000 | summed phases | 1.484 | 1.867 | +25.81% | 1.723 | 1.674 | -2.84% |
| signal | 400 | register | 0.269 | 0.462 | +71.75% | 0.288 | 0.521 | +80.90% |
| signal | 400 | release | 0.258 | 0.297 | +15.12% | 0.233 | 0.332 | +42.49% |
| signal | 400 | summed phases | 0.511 | 0.819 | +60.27% | 0.513 | 0.900 | +75.44% |
| signal | 4000 | register | 0.830 | 2.675 | +222.29% | 0.807 | 2.600 | +222.18% |
| signal | 4000 | release | 0.836 | 0.783 | -6.34% | 0.851 | 0.932 | +9.52% |
| signal | 4000 | summed phases | 1.709 | 3.460 | +102.46% | 1.675 | 3.456 | +106.33% |

### Fresh-process confirmation

`diagnostics/listener-abort-646b51a9efb342f29570171febeb960f`

| Group | Listeners per phase | Operation | AB: A | AB: B | Delta | BA: A | BA: B | Delta |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| aa | 4000 | register | 0.890 | 0.997 | +12.02% | 1.359 | 1.255 | -7.65% |
| aa | 4000 | release | 0.661 | 0.796 | +20.42% | 1.005 | 0.979 | -2.59% |
| aa | 4000 | summed phases | 1.579 | 1.793 | +13.55% | 2.349 | 2.185 | -6.98% |
| signal | 4000 | register | 1.104 | 2.790 | +152.72% | 0.878 | 2.781 | +216.74% |
| signal | 4000 | release | 0.986 | 0.894 | -9.33% | 0.888 | 0.822 | -7.43% |
| signal | 4000 | summed phases | 2.090 | 3.737 | +78.80% | 1.721 | 3.673 | +113.42% |

## Native behavior and retained-reference observations

Both behavior runs validate individual removal, sibling listeners, callback
receiver and unrelated listeners. Aborting bypasses an overridden
removeEventListener method: the manual path observes one overridden call,
the signal path observes zero. A production integration could not silently
drop the existing cleanup/error-observation contract; it would need a guard
and fallback. Registering against an already-aborted signal adds no active
listener in this test, so refill would need a fresh channel.

Separate WeakRef probes retain each controller while removing a listener
individually. They either keep its node alive or drop the node too. Six
CDP garbage collections with separate task boundaries precede inspection,
then controllers abort and collection/inspection repeats. These are
specific Edge/V8 observations, not a portable GC or general heap guarantee.

| Cohort | Phase | Mode | Node deliberately held | Node retained | Handler retained | Payload retained |
|---|---|---|---|---|---|---|
| 1 | retentionBeforeAbort | manual | False | False | False | False |
| 1 | retentionBeforeAbort | manual | True | True | False | False |
| 1 | retentionBeforeAbort | signal | False | False | False | False |
| 1 | retentionBeforeAbort | signal | True | True | False | False |
| 1 | retentionAfterAbort | manual | False | False | False | False |
| 1 | retentionAfterAbort | manual | True | True | False | False |
| 1 | retentionAfterAbort | signal | False | False | False | False |
| 1 | retentionAfterAbort | signal | True | True | False | False |
| 2 | retentionBeforeAbort | manual | False | False | False | False |
| 2 | retentionBeforeAbort | manual | True | True | False | False |
| 2 | retentionBeforeAbort | signal | False | False | False | False |
| 2 | retentionBeforeAbort | signal | True | True | False | False |
| 2 | retentionAfterAbort | manual | False | False | False | False |
| 2 | retentionAfterAbort | manual | True | True | False | False |
| 2 | retentionAfterAbort | signal | False | False | False | False |
| 2 | retentionAfterAbort | signal | True | True | False | False |

## Decision and verification

Across the four 4000-listener signal comparisons, registration uses
2.53–3.22 times the manual CPU median.
The summed-phase medians use 1.79–2.13 times the manual CPU.
Release improves in both confirmation orders but changes direction in
the initial cohort. The small release differences do not repay the extra
registration cost in these paired native observations. No application-wide
slowdown multiplier is inferred.

Both probe runs observe collected handlers/payloads after individual removal, even while controllers remain alive.
Retention is not the reason for rejection here; there is no demonstrated
net native-cost benefit to justify a guarded runtime integration.

The primitive must pay for its extra registration and compatibility costs
with a repeatable benefit before runtime integration. Fewer explicit JS
calls alone are not evidence that total native work is cheaper. These
measurements do not establish an application speedup or product parity.

Both complete cohorts contain 14 passing browser cases: two behavior
cases and twelve timing cases, **336 measured phase windows**.
The producer validates every frozen source hash, active runtime/compiler
identity, sample count, round/action/order/mode, raw median and supervisor
record. Browser cases remain sandboxed headless Edge, GPU disabled, CPU
10%, 768 MiB job commit, 24 processes, 45-second wall/12-second progress
deadlines, 4 GiB minimum host free memory and kill-on-owner-close. Every
case reports zero remaining owned processes. No failed case is omitted.

No production source/test implementation changes. The existing 550-test
[functional closure](CORE-READINESS.md) remains historical implementation
evidence, not a fresh full-suite run. The
[current framework comparison](CURRENT-CORE-COMPARISON.md) still identifies
the active core. There are no fresh React/Svelte or full-application timing
comparisons in this native experiment.

## Reproduction

From the workspace root using the existing Python environment:

```powershell
python elnor/.elnor/mvp/framework-comparison/reports/listener-abort/run.py
python elnor/.elnor/mvp/framework-comparison/reports/listener-abort/run.py --confirm
python elnor/.elnor/mvp/framework-comparison/reports/listener-abort/producer.py
```

Fresh runners create unique directories; the retained report producer
reads the two fixed cohort IDs above. Its verification metadata preserves
the document digest and refuses replacement with different results.
