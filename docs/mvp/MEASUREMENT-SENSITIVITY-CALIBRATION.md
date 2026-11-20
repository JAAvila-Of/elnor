# Measurement sensitivity calibration

**No runtime change or new framework ranking.** This experiment measures how the
browser comparison responds to identical code and synthetic added work. It does
not establish an accepted performance margin or rehabilitate earlier candidates.

Both labels execute the exact public compiler/runtime fixture bytes
(`70abd192` / `ae44708c`). A executes a zero-iteration control; B executes the
declared number of deterministic integer operations before the original app
action, inside the same CPU window. An observable checksum is validated outside
that window. Iteration counts do not imply a known CPU duration.

There are 36 independently launched browser cases: three actions, three doses,
two repetitions and both AB/BA orders. The complete plan was shuffled with seed
20261114 and retained before execution. Each case uses two contexts in one fresh
browser, two warmups and seven timed rounds per label; label order alternates
each round. AB/BA specifies opening and even-round order. Contexts are not claimed
to isolate every browser process or GC/JIT resource from one another.

The table gives the range across four separate cases per cell of changes in
renderer thread CPU medians, `(B / A - 1)`. These ranges are descriptive, not
confidence intervals, pooled estimates or latency measures.

| Action | Identical code, dose 0 | Dose 4,096 | Dose 65,536 |
|---|---:|---:|---:|
| Counter increment | -9.6% to -3.4% | -5.4% to +6.8% | +6.5% to +20.3% |
| Form edit all six fields | -11.3% to +9.7% | -3.2% to +7.3% | +5.5% to +22.1% |
| Create 1,000 rows from empty | +0.9% to +9.2% | -15.4% to +9.8% | -6.1% to +5.3% |

Identical-code list controls have higher B medians in both orders in both
repetitions; counter controls have lower B medians in all four cases. Repetition
and reversing order alone therefore do not establish that a source change caused
a small difference. This experiment does not identify the source of those
context differences or turn the observed ranges into a universal noise floor.

The larger dose has higher B medians in all eight counter/form cases. It remains
mixed for list creation, where three of four cases have higher B medians. The
smaller dose is mixed in each workload. These observations cannot quantify the
collector's statistical power, prove equivalence, or predict sensitivity to a
different runtime optimization. Absolute CPU values from other cohorts are not
compared or adjusted using these controls.

All 504 timed windows pass deterministic checksum, state/identity and equal DOM
schema checks. List preparation clears and verifies the empty list outside the
CPU window. Form/counter use the frozen driver's original preparation. Ordinary
scheduling, frame settlement, GC and accessibility behavior remain enabled. The
driver's returned frame-window duration excludes the added work and is not used
as total action latency. Raw TaskDuration and ScriptDuration remain separate from
the primary ThreadTime metric. The audit also retains matched-round changes,
direction counts, first/last-three medians and leave-one-round-out ranges.

All 36 serial Windows Jobs pass with CPU10%, commit768MiB, 24 processes,
host-free4GiB, kill-on-owner-close and browser wall/idle45/12 seconds. Every cleanup
leaves zero owned processes. The public runtime/compiler and Surface DX are
unchanged. The historical 610-test/check/build gate was not rerun or replaced.

As a methodological contrast, the local Svelte checkout at commit
`0156c5fe38b53b72675e2a7f04535de015fdeed1` runs each reactivity benchmark in a
separate child process (`benchmarking/compare/runner.js`, SHA256
`f0823d6842dc12fca70ce5900e46e5d3ec5579a68336cfe88908370dd00872f4`). Its stated
purpose is to avoid carrying heap/GC/JIT state between benchmarks. That source
was read only; its runner was not executed. It is not the browser protocol used
here and does not supply a framework result for this study.

Small candidate differences need corroboration beyond direction agreement in
AB/BA: retain concurrent identical-code controls and examine independent
repetitions, absolute changes and evidence that the proposed mechanism reduces
the intended work. No fixed percentage is accepted by this study, and previous
candidate decisions remain intact.

Private evidence:
`measurement-sensitivity-study/run-aaa2828b19964ad7836431416c925b09/review`.
The audit verifies all 36 configurations and 333 sealed evidence files.
