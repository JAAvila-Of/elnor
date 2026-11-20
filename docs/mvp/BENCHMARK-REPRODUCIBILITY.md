# Sensitivity and repetition of retained benchmark samples

Analysis date: 2026-11-14. No fresh browser benchmark or core change.

The frozen production comparison retains a directional creation/clear gap against Svelte at 1,000 rows. The private internal-reader candidate does not reproduce its initial creation improvement in both orders. This analysis supports retaining the current core; it establishes neither universal parity nor a practical equivalence threshold.

## Scope and method

The analysis checks 88 raw runtime cases: the core validated by 610 tests (list and expanded matrix), and the final internal-reader experiment with its confirmation on the exact same candidate fixtures. It contains 434 case/action contrasts, 3,038 round pairs and 6,076 action windows. Of these, 202 contrasts compare identical fixture/framework/source identities (A/A). The production list group named `change` is a second A/A cohort; experiment `change` and matrix `candidate` compare different compilers even though their runtime is identical.

All times below are renderer-thread **ThreadTimeMs**, including browser/native work in the measured window. They are neither elapsed user latency nor pure JavaScript time. Earlier list summaries also contain TaskDuration; that is a different metric. Each contrast has seven alternating, round-matched A/B observations. A is Elnor baseline; B is the named framework or private candidate. Negative `(median B / median A - 1) * 100` means B uses less thread CPU. AB/BA identifies the initial order; within each case the action/round schedule alternates it.

For each contrast, remove the same round from A and B and recompute both medians on six observations. The resulting seven percentages form the leave-one-round-out (LOO) range. A sensitive direction means at least one deletion changes the sign relative to the full sample, including a tie. The 1e-9 ms sign tolerance only suppresses floating-point representation noise; it is not a performance margin. Raw paired differences, lower/higher/tied counts, first-three/last-three medians and position groups are retained in JSON.

LOO ranges are **not confidence intervals**. Seven sequential observations can be dependent; alternating order does not remove all drift or carryover. There is no bootstrap, p-value, significance claim, equivalence test or pooled framework score. A/A extrema below describe only their own named captured cases; they are not a transferable noise floor or an acceptance threshold.

## Production versus Svelte: creation and clear

| Rows | Action | Order | Elnor ms | Svelte ms | B vs A % | LOO % range | B lower/higher rounds |
|---:|---|---|---:|---:|---:|---|---|
| 100 | create | AB | 8.581 | 8.469 | -1.31 | -4.58 to +1.21 | 6/1 |
| 100 | clear | AB | 2.262 | 2.184 | -3.45 | -5.99 to -0.11 | 5/2 |
| 100 | create | BA | 9.598 | 9.111 | -5.07 | -11.23 to +2.70 | 4/3 |
| 100 | clear | BA | 2.579 | 2.224 | -13.77 | -12.88 to -6.82 | 4/3 |
| 1000 | create | AB | 104.274 | 96.975 | -7.00 | -8.93 to -6.18 | 7/0 |
| 1000 | clear | AB | 12.681 | 11.079 | -12.63 | -18.05 to -11.19 | 7/0 |
| 1000 | create | BA | 101.772 | 93.543 | -8.09 | -10.06 to -7.77 | 7/0 |
| 1000 | clear | BA | 13.778 | 10.547 | -23.45 | -26.35 to -18.27 | 7/0 |

At 1,000 rows, Svelte uses less thread CPU in all seven matched rounds for each of these four contrasts, and every LOO result retains that direction. Creation at 100 rows crosses zero under LOO in both initial orders. This is a prioritization signal from the frozen capture, not a claim about all sizes or workloads.

## Candidate repetition across the broad matrix

Each cell is candidate versus baseline percent, followed by `*` if direction is LOO-sensitive. These are four distinct contrasts, not repeated independent replications or confidence bounds. No values are averaged across actions.

| Family | Workload | Action | Initial AB % | Initial BA % | Confirmation AB % | Confirmation BA % |
|---|---|---|---:|---:|---:|---:|
| list | 100 | create | -12.52 | +1.18* | +11.42 | -7.69 |
| list | 100 | update | +13.94 | -3.66 | -1.37* | +0.56* |
| list | 100 | select | +17.34 | -1.94* | -0.82* | -9.13* |
| list | 100 | append | +1.73* | +7.59 | +1.54* | +4.66* |
| list | 100 | swap | +0.51* | -1.15* | +1.96* | +31.98 |
| list | 100 | remove | +2.69 | -6.84 | -1.71* | -10.71 |
| list | 100 | clear | +0.31* | -1.60* | +5.24 | +10.18 |
| list | 1000 | create | -4.21 | -6.44 | +1.04* | -2.53 |
| list | 1000 | update | +0.75 | +0.04* | +3.98* | -2.51* |
| list | 1000 | select | -6.92 | +8.00* | +5.01* | -12.78 |
| list | 1000 | append | -5.52* | +17.50 | +11.75 | +6.15 |
| list | 1000 | swap | +13.74 | +6.16 | +2.20 | -9.60 |
| list | 1000 | remove | -4.44* | -15.33 | +8.23 | -0.74* |
| list | 1000 | clear | +6.90 | -3.02* | +8.77 | -13.41 |
| matrix | counter | mount | -4.15* | +2.49* | +19.79 | +12.80 |
| matrix | counter | increment | -9.64 | -4.47* | -4.75 | -1.04* |
| matrix | counter | unmount | -3.13* | +0.33* | -3.22* | +20.35 |
| matrix | form | mount | -6.38* | -15.66 | +14.80 | -14.55* |
| matrix | form | edit-one | -0.48* | -12.20 | -0.40* | +6.15 |
| matrix | form | edit-all | +0.66* | +3.77 | +1.67 | +4.47* |
| matrix | form | invalid | -7.99 | -2.06* | -0.94* | -6.84 |
| matrix | form | recover | -2.63 | -2.45* | +6.09 | +0.43* |
| matrix | form | unmount | +5.96 | +2.18 | -7.75 | -1.15* |
| matrix | composition | mount | +2.38 | -10.46* | -1.69* | +12.21* |
| matrix | composition | relay | -10.70 | +21.23 | -16.16 | +3.42 |
| matrix | composition | unmount | -0.82* | +0.63* | +0.22* | +6.74 |
| matrix | localized | mount | -6.47 | -7.22 | -11.42 | +4.35 |
| matrix | localized | local-update | -12.41 | +79.67* | -6.06* | +0.15* |
| matrix | localized | unmount | -9.15 | +10.79 | +6.50* | -21.30 |

Of the 29 named workload/action combinations, 2 have B lower in all four full-sample contrasts and 2 have B higher in all four. These descriptive counts are not an aggregate speed score. In particular, creation of 1,000 rows goes from -4.2%/-6.4% initially to +1.0%/-2.5% in confirmation. Lower operation counts alone did not establish a reproducible CPU improvement.

## Identical-source controls

Rows summarize the two initial orders and the actions within each named workload/group. Ranges mix distinct actions solely to expose observed control variation; use the CSV for individual action assessment. `Sensitive` counts contrasts whose LOO direction changes. Large percentages on short actions need their absolute ms and raw observations, available in the CSV/JSON.

| Cohort | Family | Workload | Group | Contrasts | Observed delta % min/max | Sensitive |
|---|---|---|---|---:|---|---:|
| core610 | list | 100 | aa | 14 | -6.14 to +13.84 | 4 |
| core610 | list | 100 | change | 14 | -14.60 to +18.32 | 6 |
| core610 | list | 1000 | aa | 14 | -14.35 to +7.66 | 4 |
| core610 | list | 1000 | change | 14 | -11.48 to +10.91 | 6 |
| core610 | matrix | composition | aa | 6 | -6.51 to +4.79 | 2 |
| core610 | matrix | counter | aa | 6 | -2.34 to +8.91 | 4 |
| core610 | matrix | form | aa | 12 | -13.71 to +13.24 | 4 |
| core610 | matrix | localized | aa | 6 | -5.63 to +8.22 | 2 |
| readers-confirmation | list | 100 | aa | 14 | -7.26 to +18.45 | 9 |
| readers-confirmation | list | 1000 | aa | 14 | -14.50 to +14.08 | 4 |
| readers-confirmation | matrix | composition | aa | 6 | -9.39 to +25.61 | 3 |
| readers-confirmation | matrix | counter | aa | 6 | -14.99 to +3.02 | 3 |
| readers-confirmation | matrix | form | aa | 12 | -21.85 to +5.50 | 6 |
| readers-confirmation | matrix | localized | aa | 6 | -9.50 to +18.54 | 5 |
| readers-initial | list | 100 | aa | 14 | -14.20 to +13.15 | 8 |
| readers-initial | list | 1000 | aa | 14 | -8.52 to +11.22 | 3 |
| readers-initial | matrix | composition | aa | 6 | -5.32 to +15.45 | 5 |
| readers-initial | matrix | counter | aa | 6 | -5.34 to +18.76 | 4 |
| readers-initial | matrix | form | aa | 12 | -9.53 to +5.54 | 8 |
| readers-initial | matrix | localized | aa | 6 | -7.00 to +109.96 | 4 |

The most extreme A/A percentage belongs to its specific capture and cannot justify subtracting a common percentage from framework or candidate differences. Position and early/late diagnostics are descriptive; they do not identify a cause for variation.

## Verification and retained evidence

Four synthetic controls cover equal series, a constant shift, an unstable median and label reversal. The first analysis failed because the unstable-median control incorrectly excluded the zero result after removing its central observation; that run is retained. The corrected control expects negative, zero and positive results. No benchmark samples were changed or dropped.

A separate review implementation re-extracts all A/B ThreadTime arrays from the 88 raw cases, independently recomputes all 434 medians and seven LOO results per contrast, checks CSV values, identities, raw/supervisor hashes, current source hashes and fixture manifest hashes. The analysis itself also checks original audit hashes, fixture file/source hashes, sample order, visibility and saved ThreadTime medians. Both analysis jobs use the Windows Job limits: CPU 10%, commit 768 MiB, 24 processes, host free >=4 GiB, kill-on-owner-close, 60 s wall/idle. Both finish with zero owned descendants. No new browser or 610-test gate was run because compiler/runtime were unchanged.

Private evidence under `elnor/.elnor/mvp/framework-comparison/reproducibility-study/`:

- Failed analysis: `run-46c94d26602a462b8e1d4cb2d913e4dc` (original producer, worker, log and supervisor).
- Successful analysis: `run-22ee8055dc644d83a2c3ed45fafc67cc` (`result.json`, `contrasts.csv`, producer/worker snapshots, log and supervisor).
- Independent recomputation and exact report revision: `review-13776c929a8b458b9c541e2afa586b1d` (`verification.json`, `review.py`, `report.md`, log and supervisor).

The public runtime/compiler remain byte-identical to [the frozen production comparison](CURRENT-CORE-COMPARISON.md). This report adds sensitivity evidence to [the rejected reader experiment](INTERNAL-PROP-READERS-STUDY.md). Further optimization should target a concrete lifecycle/construction mechanism and retain broad correctness and workload checks; another small isolated delta is insufficient evidence for integration.
