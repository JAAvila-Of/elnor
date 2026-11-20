# Literal caption specialization

Reviewed 2026-11-12. **Rejected candidate; the active core is unchanged.**
This experiment evaluates compiler-proven primitive text and button captions
across the expanded matrix and both existing keyed-list sizes. It does not
change Surface syntax or establish a new performance result against React or
Svelte.

## Candidate and compatibility

The compiler used the TypeScript AST to recognize strings, numbers, booleans,
null and templates without substitutions, including parentheses. Expressions,
identifiers and property reads retained the reactive path. The runtime skipped
effects for these literals in native scopes, checked whether the scope was
disposed, and used the ordinary effect path for foreign owners.

The first candidate passed the existing text conversion/write tests and the
four native matrix preflights. An overridden native `own` method exposed an
immediate-disposal regression; a revised candidate corrected that case and
passed **559 Node tests, check and build**. That gate was insufficient:
the subsequent generated-component probe reproduced another regression.

A foreign owner can expose only `own`, including through a Proxy that refuses
other properties. The baseline renders its literal captions and cleans up its
listeners. The candidate reads `Symbol(scopeDisposed)` before registering its
effect and throws. This is an observable change in the ownership protocol.
The candidate is therefore excluded, regardless of its resource savings.

The active compiler and runtime were restored byte for byte from the validated
baseline. Five regression tests in `tests/caption-owners.test.mjs` cover
immediate registration cleanup, exact registration errors before evaluation,
and a generated component rendered with an owner exposing only `own`.
The restored version passes **555 Node tests, check and build**, in 49 serial
contained phases (`test-runs/run-55f9d5c372c343a58f7151568bf31b2b`).

## Deterministic work and delivery

Diagnostic constructor counts use copied compiled graphs and an instrumented
runtime with a fake DOM. They verify equal visible initial output and empty
roots after disposal. They are not allocated bytes or timing measurements.
The revised candidate yields:

| Workload | Effects per mount, baseline → candidate | Effect dependency Sets, baseline → candidate | Entry gzip bytes, baseline → candidate |
|---|---:|---:|---:|
| Counter | 3 → 1 | 3 → 1 | 1441 → 1529 |
| Form | 12 → 11 | 12 → 11 | 2042 → 2128 |
| Composition | 12 → 3 | 12 → 3 | 1794 → 1877 |
| Localized | 73 → 48 | 73 → 48 | 1652 → 1736 |

Each removed effect had zero initial dependencies. Other zero-dependency effects,
including property-based captions, remain. The added scope check affects every
scope, including components without literal captions. Delivery grows by 83–88
bytes gzip in these four applications; the benefit is not free.

## Paired browser results

The new `benchmarks/matrix/compare-core-windows.py` collector compares two
immutable Elnor fixtures. Four workloads × A/A and candidate × AB/BA give
**16 browser cases and 840 measured action windows**, with two warmup rounds
and seven measured rounds per action/label. Pages alternate while visible;
the driver verifies values, identities and equal DOM schemas. CPU uses CDP
renderer thread time. Startup is excluded. A/A uses the baseline on both pages.

All 16 cases pass. Mount medians are descriptive and mixed:

| Workload | AB baseline → candidate thread ms | BA baseline → candidate thread ms | A/A mount difference, AB / BA |
|---|---:|---:|---:|
| Counter | 1.017 → 0.952 | 1.039 → 0.979 | +7.4% / +7.9% |
| Form | 2.260 → 2.174 | 1.926 → 1.546 | +28.5% / −11.9% |
| Composition | 1.278 → 1.437 | 1.194 → 1.121 | −0.7% / +3.8% |
| Localized | 1.989 → 2.135 | 2.221 → 2.291 | +12.6% / −6.3% |

The complete per-action CPU rows are retained, including mixed updates and
unmounts. No aggregate speedup or accepted margin follows from these samples.
The controls are not subtracted from the candidate timings.

After timing, the AB candidate cases collect GC heap and DOM counters in eight
interacted mount/unmount cycles per label: **64 cycles** in total. Mounted heap
above the loaded, unmounted baseline is lower in all four comparisons:

| Workload | Baseline bytes | Candidate bytes |
|---|---:|---:|
| Counter | 2120 | 1724 |
| Form | 7772 | 7632 |
| Composition | 6732 | 4372 |
| Localized | 41248 | 35740 |

DOM nodes and listeners return to each page's baseline after every cycle.
Heap includes driver/browser behavior and some post-cycle growth; this is
neither allocated-byte accounting nor proof of no leak.

The existing list collector also completes **eight action-interleaved browser
cases and 784 measured windows**, with candidate A/A controls and both orders
at 100 and 1000 rows. It exercises create, update, select, append, swap, remove
and clear, retaining keyed identity and separate post-timing AX observations.
For example, 1000-row create TaskDuration medians are 109.101 → 117.156 ms
in AB and 108.955 → 109.337 ms in BA; these do not support a global improvement.
The complete cohort remains evidence for a rejected candidate.

All expensive commands ran serially under the existing Windows Job limits:
CPU 10%, commit 768 MiB, 24 processes, at least 4 GiB host free memory,
browser wall 45 s / idle 12 s, and owned process cleanup. Limits were unchanged.

## Retained evidence

Paths below are workspace-relative and internal; they are not public downloads.

- Baseline: `elnor/.elnor/mvp/framework-comparison/matrix-vWhA85` and `run-RuBGXZ`.
- First candidate: `matrix-cAPNmj`; final rejected candidate: `matrix-AwFeHl` and `run-IyzIV2` under the same internal comparison directory.
- Candidate gate: `test-runs/run-55a4d79cbf194edd8e103620b7ee8e2d`.
- Expanded pairs: `core-studies/run-4eec01c7190a4a039f0e41bd13ccd761`.
- List pairs: `interleaved-studies/run-fa601152c5a64db7a61bf8bb931362ee`.
- Final counts, ownership regression and review: `literal-caption-final-study/`.

The old runtime-only list summary correctly refuses different compiler hashes.
It remains unchanged. This compiler/runtime experiment uses a separate frozen
reader that explicitly checks the declared baseline/candidate identities and
their compiler/runtime source hashes while retaining the original raw-data,
asset, order, timing, schema and supervisor checks.

The next hypothesis should avoid probing foreign owners and avoid adding work
to scopes without literal captions. It must retain disposed-owner behavior,
cleanup order and error identity, and be evaluated across the same global
coverage. No faster code is integrated by this study.
