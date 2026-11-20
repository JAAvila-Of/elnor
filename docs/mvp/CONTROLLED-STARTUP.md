# Controlled startup across the expanded matrix

**Separate phase investigation:** [startup diagnostics](STARTUP-PHASE-DIAGNOSTICS.md)
now retain 144 instrumented navigations across the same four families. They
locate pre-request, accessibility-lifecycle and frame-wait delays without
identifying one universal cause. Their timings are not pooled with this normal
cohort, and the startup wall-ranking restriction remains.

**Measured (UTC): 2026-11-12.** Protocol `foreground-ready-v2`
uses the exact application/driver bundles from the
[expanded matrix](EXPANDED-PERFORMANCE-MATRIX.md). The compiler/runtime
remain unchanged. Earlier startup observations are preserved as
provisional; they are not pooled with this cohort or rewritten.

Study `run-1769a8d8dd2f42408937fc296bb668bc` under `startup-studies/`; frozen fixture
`matrix-vWhA85` under `elnor/.elnor/mvp/framework-comparison/`.
Controls: React 19.3.1, Svelte 5.57.3,
headless Edge 157.0.4341.42.

## Protocol and boundaries

Four workloads (counter, six-field form, six-layer props/events/slots,
24 independent child states), three pair groups (Elnor A/A, React,
Svelte), and two initial orders produce **24 fresh browser cases**.
Every label performs seven fresh-context navigations; initial label
order alternates per repetition. All **336 startups** are retained,
including each first navigation. No warmup sample is discarded.

Before each navigation, the tab is activated inside the headless
browser and its visibility is checked. An initialization observer
records the new document's initial visibility and visibility changes.
Initial, intermediate and ready states must remain visible. A hidden
observation fails the case rather than being filtered from its samples.
This is browser active-page control, not an OS foreground/display test.

After module load, the collector directly awaits the frozen driver's
ready promise, without the earlier additional rAF polling gate. Host
wall ends when that result arrives, before reading post-ready CPU
metrics. Renderer CPU uses a separate Performance metrics bracket
with threadTicks and includes its protocol-boundary work. The ready
promise waits for the application root and two animation frames; this
is not first contentful paint, input-to-pixel or presented-pixel latency.

Visibility observation, readiness waiting and the wall stop boundary
all change from the provisional collector. A difference between the
two cohorts cannot be attributed solely to visibility or to faster
framework code. The application bytes did not change.

Requests use the same local loopback server, CSP and raw production
assets with no-store headers. Driver/CSS are shared. Fresh contexts are
not cold OS/filesystem/browser caches; later contexts may benefit from
process-level caches. Both orders and A/A remain visible. Successful
initial DOM/value schema and unmount cleanup are checked outside timing.

## Paired startup observations

Seven-sample medians in ms. A is Elnor, B is the named framework (also
Elnor for A/A). Positive delta means B uses more time. Compare within
each pair; control groups use different browser processes. Total CPU
includes browser work and no accessibility cost is subtracted.

### aa

| Family | Metric | AB: A | AB: B | Delta | BA: A | BA: B | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| counter | wall | 51.241 | 51.102 | -0.27% | 58.522 | 56.145 | -4.06% |
| counter | renderer CPU | 19.647 | 18.102 | -7.86% | 18.639 | 18.968 | +1.77% |
| form | wall | 55.939 | 60.840 | +8.76% | 51.810 | 54.858 | +5.88% |
| form | renderer CPU | 22.290 | 24.130 | +8.25% | 22.582 | 20.762 | -8.06% |
| composition | wall | 58.515 | 53.907 | -7.88% | 60.861 | 58.404 | -4.04% |
| composition | renderer CPU | 23.295 | 23.792 | +2.13% | 23.956 | 24.019 | +0.26% |
| localized | wall | 52.988 | 51.884 | -2.08% | 60.880 | 215.226 | +253.52% |
| localized | renderer CPU | 24.650 | 23.381 | -5.15% | 27.062 | 28.041 | +3.62% |

### react

| Family | Metric | AB: A | AB: B | Delta | BA: A | BA: B | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| counter | wall | 49.796 | 96.799 | +94.39% | 49.737 | 95.489 | +91.99% |
| counter | renderer CPU | 18.355 | 40.322 | +119.68% | 18.392 | 39.209 | +113.19% |
| form | wall | 48.450 | 95.719 | +97.56% | 53.854 | 91.506 | +69.91% |
| form | renderer CPU | 20.657 | 41.216 | +99.53% | 20.603 | 41.714 | +102.47% |
| composition | wall | 58.856 | 121.727 | +106.82% | 54.384 | 92.526 | +70.14% |
| composition | renderer CPU | 24.527 | 54.569 | +122.49% | 20.549 | 41.407 | +101.50% |
| localized | wall | 79.514 | 196.645 | +147.31% | 52.663 | 100.102 | +90.08% |
| localized | renderer CPU | 29.437 | 61.398 | +108.57% | 23.300 | 45.924 | +97.10% |

### svelte

| Family | Metric | AB: A | AB: B | Delta | BA: A | BA: B | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| counter | wall | 55.623 | 52.676 | -5.30% | 51.322 | 56.485 | +10.06% |
| counter | renderer CPU | 19.438 | 21.372 | +9.95% | 20.550 | 22.603 | +9.99% |
| form | wall | 83.214 | 59.751 | -28.20% | 56.483 | 59.990 | +6.21% |
| form | renderer CPU | 21.647 | 27.560 | +27.32% | 24.073 | 26.942 | +11.92% |
| composition | wall | 52.708 | 49.971 | -5.19% | 50.265 | 58.698 | +16.78% |
| composition | renderer CPU | 20.656 | 23.443 | +13.49% | 20.290 | 23.658 | +16.60% |
| localized | wall | 54.586 | 57.060 | +4.53% | 50.684 | 52.257 | +3.10% |
| localized | renderer CPU | 24.094 | 27.152 | +12.69% | 23.000 | 24.936 | +8.42% |

## Interpretation and limits

Identical-code A/A differences span -7.88% to +253.52%
in wall medians and -8.06% to +8.25%
in CPU medians. These are observed variations, not acceptance bands,
significance tests or proof that every larger gap is causal. No global
framework score or product-parity verdict is supplied. Keep per-family
differences, conflicting orders, sample ranges and first samples visible.

The localized A/A BA pair is a material counterexample to a wall-time ranking:
the same code has 60.880 and 215.226 ms wall medians while CPU is 27.062 and
28.041 ms. All visibility checks pass. Its page-local ready-clock readings also
vary; the records do not identify the cause of the waits. Controlling visibility
and removing the extra ready poll therefore does not establish wall-time
repeatability. **No startup wall-time ranking is accepted from this cohort.**

Renderer CPU medians are lower for Elnor than React and Svelte in both orders
of all four workload pairs here. The Svelte gaps are smaller, some close to the
observed A/A variation. This is descriptive evidence for these frozen synthetic
apps under the declared protocol, not a general multiplier, parity verdict or
claim that the core became faster. All contradictory wall observations remain.

This fixes a documented observation/control gap in the startup collector.
It is not a framework speedup. Host load, capped CPU and GPU-disabled
headless operation still constrain conclusions; no old delay is assigned
a cause. Real applications, devices, browser versions, production network
delivery and independent human DX need their separate evidence.

## Verification and reproduction

The reader checks all 24 declared cases, hashes of every served asset
and frozen collector, the original matrix schema, versions, sample
order/count, visibility histories, clock fields, timestamps and cleanup.
All heavy cases preserve CPU 10%, 768 MiB job commit, 24 processes,
45-second wall/12-second progress deadlines, 4 GiB minimum free host
memory, sandboxed headless Edge and owned-tree cleanup. Every case
reports zero remaining owned processes.

From the workspace root using the existing Python environment:

```powershell
python elnor/benchmarks/matrix/startup-windows.py elnor/.elnor/mvp/framework-comparison/matrix-vWhA85
python elnor/benchmarks/matrix/startup-summarize.py elnor/.elnor/mvp/framework-comparison/startup-studies/run-1769a8d8dd2f42408937fc296bb668bc --matrix-study elnor/.elnor/mvp/framework-comparison/matrix-studies/run-72d12d53290b404a846f0827492f29ac --report elnor/docs/mvp/CONTROLLED-STARTUP.md
```

The runner creates new study directories; the displayed IDs retain this
cohort. Summary creation refuses overwrite; `--stdout-only` revalidates
without writing. The old expanded matrix and 550-test functional core
gate remain separate evidence; no full application suite is rerun for
this collector-only change.

Negative validation:
`startup-validation/run-afb2f71e29c04661b3e2a2c4ef99949a` under the comparison
evidence root rejects nine altered records (hidden before/initial/during/ready,
wrong clock, missing sample, wrong order, negative wall and wrong schema).
It first accepts the unmodified real record. Two separate workers reject a
corrupted asset and an unknown workload before browser launch, with expected
exit 1 and zero owned processes remaining. These are validation outcomes, not
additional successful startup samples. Command:

```powershell
python elnor/benchmarks/matrix/startup-validate.py elnor/.elnor/mvp/framework-comparison/startup-studies/run-1769a8d8dd2f42408937fc296bb668bc --matrix-study elnor/.elnor/mvp/framework-comparison/matrix-studies/run-72d12d53290b404a846f0827492f29ac
```
