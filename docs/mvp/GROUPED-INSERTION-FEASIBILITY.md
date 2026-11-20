# Grouped insertion feasibility

**Verdict: do not change the core based on this experiment.** Grouping new roots
showed an early positive signal in an isolated DOM operation, but the result did
not remain consistent across repetitions and observer controls. Runtime and
compiler are unchanged from `matrix-fFpgAM`. The existing 579-test/check/build gate
(`run-66aef17d832d4bf4a97c51c274d8e3c8`) remains the last complete core gate;
it was not rerun for this study because production source did not change.

## Scope and limits

The probe creates 100 or 1,000 detached li roots, each containing a button and
span, before timing. It measures either reverse individual insertBefore calls
or forward appends to a fresh fragment followed by one insertBefore. Fragment
creation and filling are included; root construction, key lookup, effects,
reconciliation and teardown are excluded. Siblings and the same end marker stay
in place; final identity/order and listeners are checked after every operation.
This is a feasibility probe, not an Elnor application or React/Svelte comparison.
It cannot establish a whole-application speedup or a safe compiler eligibility
proof. Layout is not explicitly flushed or measured separately, and GC/rendering
can occur in the metric window. No outliers were removed.

Edge 157.0.4341.42 ran headless and sandboxed. CDP Performance metrics used
threadTicks; tables show median TaskDuration in milliseconds over seven samples,
after two warmup rounds. AB/BA initial order reverses on alternate rounds.
A/A uses individual insertion for both pages. Each case has fresh pages/browser;
different rows/cases cannot be combined into a universal latency estimate.
All 14 expensive phases were serially contained: CPU10%, commit768MiB,
24 processes, host-free >=4GiB, wall45s/idle12s, kill-on-owner-close.
These caps and short diagnostic cohorts limit precision.

## Complete medians

Positive changes mean page B was slower. Candidate B groups roots; A/A B does not.
The first two cohorts used an observer in all timed cases. The final cohort also
includes unobserved A/A and candidate controls. Cohort 1 accidentally discarded
observer records before verification; its CPU samples are retained but its empty
record arrays are not evidence of no mutations. Cohorts 2 and 3 accumulate callback
records and explicitly verify their counts. Observer work is included in the
observed metric windows, which can influence the apparent benefit of batching.

| Cohort | Case | Roots | A ms | B ms | Change |
|---|---|---:|---:|---:|---:|
| 1 | AB | 100 | 0.384 | 0.391 | +1.8% |
| 1 | AB | 1000 | 1.607 | 1.229 | -23.5% |
| 1 | BA | 100 | 0.449 | 0.441 | -1.8% |
| 1 | BA | 1000 | 1.604 | 1.146 | -28.6% |
| 2 | aa-AB | 100 | 0.350 | 0.374 | +6.9% |
| 2 | aa-AB | 1000 | 0.967 | 1.177 | +21.7% |
| 2 | aa-BA | 100 | 0.431 | 0.416 | -3.5% |
| 2 | aa-BA | 1000 | 1.163 | 1.381 | +18.7% |
| 2 | candidate-AB | 100 | 0.426 | 0.352 | -17.4% |
| 2 | candidate-AB | 1000 | 1.810 | 1.444 | -20.2% |
| 2 | candidate-BA | 100 | 0.529 | 0.486 | -8.1% |
| 2 | candidate-BA | 1000 | 1.022 | 0.963 | -5.8% |
| 3 | aa-AB | 100 | 0.555 | 0.468 | -15.7% |
| 3 | aa-AB | 1000 | 1.719 | 33.138 | +1827.7% |
| 3 | aa-BA | 100 | 0.524 | 0.574 | +9.5% |
| 3 | aa-BA | 1000 | 1.586 | 1.412 | -11.0% |
| 3 | candidate-AB | 100 | 0.575 | 0.571 | -0.7% |
| 3 | candidate-AB | 1000 | 8.481 | 37.717 | +344.7% |
| 3 | candidate-BA | 100 | 0.584 | 0.571 | -2.2% |
| 3 | candidate-BA | 1000 | 1.497 | 1.336 | -10.8% |
| 3 | aa-unobserved-AB | 100 | 0.246 | 0.261 | +6.1% |
| 3 | aa-unobserved-AB | 1000 | 0.691 | 0.643 | -6.9% |
| 3 | aa-unobserved-BA | 100 | 0.247 | 0.293 | +18.6% |
| 3 | aa-unobserved-BA | 1000 | 0.540 | 0.621 | +15.0% |
| 3 | candidate-unobserved-AB | 100 | 0.409 | 0.434 | +6.1% |
| 3 | candidate-unobserved-AB | 1000 | 0.896 | 1.340 | +49.6% |
| 3 | candidate-unobserved-BA | 100 | 0.346 | 0.299 | -13.6% |
| 3 | candidate-unobserved-BA | 1000 | 0.812 | 0.810 | -0.2% |

The initial 1,000-root signal was about -24%/-29%. In the final unobserved
candidate comparison, the same size was +49.6%/-0.2%; 100 roots were +6.1%/-13.6%.
A/A variation is material, including extreme values in observed cases. These
results do not justify adding a compiler flag, subtree scan or reconciliation
branch. They do not prove that fragments are universally slower, either.

## Observable behavior

With an observer enabled, individual insertion produces N child-list records,
each adding one node; grouping produces one record adding N nodes. Final DOM and
event-handler identity pass in both variants. Record grouping is an intentional
semantic difference in this hypothetical optimization and must not be described
as identical mutation behavior.

A native custom-element negative control inside each root records connection
order [2,1,0] for individual insertion and [0,1,2] for grouping. Therefore final
DOM equality is insufficient to authorize batching arbitrary runtime builders.
The existing detached-root compiler check is not repurposed as permission here.
No eligibility flag or new restriction on supported Surface expressions shipped.
An implementation would require a separate conservative proof and complete
failure/lifetime/memory/global CPU checks; this probe supplies none of those.

## Retained evidence

All cohorts, worker revisions, limits, raw per-round samples and results are
retained under `grouped-insertion-study`:

1. `primitive-0b39b00100304c0ba6e89de4d36c30cf`
2. `primitive-affcb55db30a4c29ad2fc02054cb8f33`
3. `primitive-c5a27adfdb6742f98b5954e6dda236f8`

No whole-core improvement, framework ranking, exact allocated-byte reduction or
production-readiness claim follows from these measurements. Future optimization
work should start from a fresh measured cost rather than this first positive
primitive result.
