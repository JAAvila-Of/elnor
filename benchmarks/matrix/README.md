# Expanded performance matrix

For paired changes to the compiler/runtime, use the independent collector:

```powershell
python elnor/benchmarks/matrix/compare-core-windows.py BASELINE_FIXTURE CANDIDATE_FIXTURE
python elnor/benchmarks/matrix/summarize-core.py STUDY_DIRECTORY
```

It verifies frozen assets before launching, alternates visible pages in A/A and
AB/BA comparisons across all four workloads, and collects separate post-timing
GC/DOM cycles. The reader rejects incomplete, inconsistent or altered evidence
and prints a summary without overwriting retained files. It supplies descriptive
renderer thread CPU, not startup rankings or a parity margin. Continue using the
existing list collector for 100/1000-row coverage.
The [literal caption study](../../docs/mvp/LITERAL-CAPTION-STUDY.md) records a
rejected candidate, including an ownership regression found after its Node gate.
The later [caption initialization study](../../docs/mvp/CAPTION-INITIALIZATION-STUDY.md)
retains a compatible variant for lower allocation/retained heap and fewer
compiler rewrite passes. CPU remains mixed; its complete global and list
cohorts, including the rejected default-parameter variant, are retained.
The [separate-helper follow-up](../../docs/mvp/SPLIT-CAPTION-HELPERS.md) restores
the original dynamic path, preserves those counts and measures entry/control
delivery changes. It includes a separate composition follow-up and work-count
probe; these do not supply a global CPU speedup.

This synthetic suite broadens the existing keyed-list comparison. It uses the
actual checked Surface compiler/runtime and equivalent React/Svelte apps. It
does not designate a representative product application or establish parity.

| Workload | Selected coverage |
|---|---|
| Counter | Small component, state update, mount and unmount |
| Form | Six string inputs, derived summary/validity, conditional validation error, one/all-field updates and recovery |
| Composition | Six prop/event relay layers, named/default slots, root and leaf updates |
| Localized | 24 independent child states, one middle child update, unchanged sibling values and node identities |

These complement the **existing** 100/1000-row keyed-list cases. They do not
replace them or supply coverage of network data, large apps, async workflows,
all Surface syntax, production devices or independent human DX.

## Serial Windows runs

From the workspace root, using the existing Python/pywin32 environment:

```powershell
python elnor/benchmarks/matrix/run-windows.py --preflight-only
python elnor/benchmarks/matrix/run-windows.py --fixture <frozen-fixture-directory>
```

Without `--fixture`, the runner builds a unique owned fixture. Builds run in a
separate Job with a 60-second deadline; browser cases each have 45-second wall
and 12-second progress deadlines. All phases preserve CPU 10%, 768 MiB job
commit, 24 processes, the 4 GiB minimum host-free-memory guard, sandboxed
headless Edge, GPU disabled and owned-tree cleanup. Never increase limits to
complete a case or terminate another project's processes.

A complete study has four preflights, 24 runtime pairs and twelve lifecycle
cases, all serial. It stops at a failed phase and preserves the failure.

## Distinct dimensions

- **Behavior first:** all three implementations pass action-state checks and
  matching normalized DOM/value schemas. Input `value` attribute serialization
  differs across controlled-input implementations; the schema compares the real
  input value and ignores only that reflected attribute. Framework marker
  comments/empty formatting text are not application structure.
- **Runtime:** one fresh owned browser per pair, isolated contexts, active-page
  action interleaving, two warmup and seven measured rounds, both initial
  orders. Each workload has identical-Elnor A/A and React/Svelte pairs. CPU uses
  renderer TaskDuration with `threadTicks`. Frame windows contain two animation
  frames and a geometry read, not input-to-pixel latency. Preparation, expected
  state checks and DOM identity validation are outside timed updates. Mount
  includes the shared readiness loop; unmount includes its empty-target check.
- **Accessibility observation:** a separate interaction trace after timing, in
  the same context, bounded to 8 MiB. Inclusive AX duration is not subtracted
  from total CPU and does not reconstruct every earlier action's conditions.
- **Startup:** three fresh-context navigations per workload/framework in an
  owned browser. Local HTTP/parse/evaluate/mount/readiness are included; module
  and OS caches are not claimed cold. This is separate from warm interactions.
  The initial collector activates the tab after startup timing and does not
  record visibility throughout navigation/readiness. Its wall observations are
  provisional; a foreground-controlled follow-up is required before considering
  comparison. Timed interactions do explicitly activate/check the page.
  The separate [foreground-ready-v2 follow-up](../../docs/mvp/CONTROLLED-STARTUP.md)
  now covers all four families with 24 pairs/336 startups, seven fresh contexts
  per label, alternating orders and A/A. It fixes the control/observation gap,
  but one identical-code pair still has large wall variation with visibility
  passing. No startup wall ranking is accepted; the old data remain retained.
- **Lifecycle/memory:** a separate context records post-GC loaded/unmounted,
  mounted and eight interacted mount/unmount cycles. Heap, DOM and listener
  counters are observations, not peak memory or general leak proof.
- **Delivery:** each production application entry records raw/gzip/Brotli bytes;
  shared driver/CSS are separate. These are not standalone runtime package sizes.
- **Tooling:** three checked project builds/publications per Surface workload
  in one sequential shared Node process. Wall and process CPU are retained;
  first-per-fixture is not cold CLI startup, and repeated builds are not HMR.
  No competitor tooling timing is equated with Elnor's checked publication.
  Editor latency and saved-error recovery retain their separate evidence.

No single aggregate score or numeric acceptance margin is introduced. For an
optimization, assess the whole relevant matrix, both framework controls, A/A,
delivery, lifecycle and DX/correctness before retaining a list-specific win.
Keep disagreements, regressions and unmeasured dimensions visible. The suite
itself changes no compiler/runtime behavior.

Validate a completed full study and create a one-time summary/report:

```powershell
python elnor/benchmarks/matrix/summarize.py <study-directory> --report elnor/docs/mvp/EXPANDED-PERFORMANCE-MATRIX.md
python elnor/benchmarks/matrix/summarize.py <study-directory> --stdout-only
python elnor/benchmarks/matrix/validate-windows.py <frozen-fixture-directory>
```

The reader refuses partial studies, source/asset/version mismatches, malformed
rounds/orders/clocks, missing traces or unsafe/uncleaned supervisor records.
`--stdout-only` revalidates without replacing retained results. The negative
validator checks corrupted assets and unknown workloads fail before browser
launch; its expected nonzero workers are separate from successful timing cases.

Controlled startup uses unchanged frozen app/driver assets and its own collector:

```powershell
python elnor/benchmarks/matrix/startup-windows.py <frozen-fixture-directory>
python elnor/benchmarks/matrix/startup-summarize.py <startup-study> --matrix-study <original-matrix-study> --report elnor/docs/mvp/CONTROLLED-STARTUP.md
python elnor/benchmarks/matrix/startup-validate.py <startup-study> --matrix-study <original-matrix-study>
```

The tab is activated before navigation; an init observer records visibility
through ready. The collector directly awaits the driver's ready promise after
module load, and stops host wall before retrieving post-ready CPU metrics.
These combined protocol changes cannot be attributed to visibility alone or
used as a framework speedup. Source and result snapshots, all first samples,
clock domains and the original cohort are preserved. No warmups are discarded.

## Separate startup phase diagnostics

The [phase investigation](../../docs/mvp/STARTUP-PHASE-DIAGNOSTICS.md) instruments
page/root/ready landmarks, Navigation/Resource Timing and animation frames,
with separate bounded traces. Its 24 cases/144 starts cover all families, A/A,
both framework controls and both orders. Wrappers/observers/stack capture and
tracing perturb execution: these samples must never be pooled with normal
startup or used as a speedup. App/driver/core bytes stay frozen.

```powershell
python elnor/benchmarks/matrix/startup-diagnostic-windows.py <frozen-fixture-directory>
python elnor/benchmarks/matrix/startup-diagnostic-summarize.py <diagnostic-study> --matrix-study <original-matrix-study> --report elnor/docs/mvp/STARTUP-PHASE-DIAGNOSTICS.md
python elnor/benchmarks/matrix/startup-diagnostic-validate.py <diagnostic-study> --normal-study <normal-startup-study> --matrix-study <original-matrix-study>
```

`--smoke` declares one counter A/A case before a full run; it is not a complete
matrix. Traces are streamed with an 8 MiB/sample cap. The reader recomputes phase
and trace evidence, verifies renderer/marks/checksums and unions overlapping
frame intervals. Nested trace durations are inclusive and must not be summed.
Current observations locate more than one delay class; they do not establish
the trigger of every long wall interval or explain old samples retrospectively.
