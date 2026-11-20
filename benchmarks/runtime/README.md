# Shared runtime comparison: initial protocol

This is an initial descriptive comparison for the
[performance requirement](../../docs/mvp/PERFORMANCE-TARGET.md). It does not
declare parity, superiority, acceptable UX or a representative production app.
No numeric acceptance margin has been agreed. The protocol below is selected
before collecting the comparison samples.

## Shared scenario and correctness

All three versions render identical element/attribute/non-whitespace-text trees:
a title, row count, selected ID, six operation buttons and a keyed list. Each
row is a child component with a label button and numeric ID. Clicking it reports
the selected ID to the parent. The common immutable reducer creates data,
updates every tenth label, appends 10%, swaps first/last, removes the middle row,
selects through the child event/callback, and clears. Sizes are 100 and 1,000.

Surface uses its ordinary compiler, `state`, keyed `each` and typed child events.
React uses a normal stateful component with keyed child components, without
StrictMode or memoization. Svelte 5 uses keyed child components and `$state.raw`
for the shared immutable replacement pattern. No framework version uses a
manually written DOM implementation or a specially patched runtime. These are
equivalent straightforward implementations, not proof of each framework's best
possible optimized variant. Their authoring quality remains a human question.

Preflight must pass before measurement: all seven actions, correct labels/order/
counts/selection, retained DOM node identity for surviving keys, equal DOM-schema
hashes across frameworks and empty target after disposal, at both sizes. The
initial Node fixture test exposed duplicate append IDs after a swap in the common
model; that model error was fixed before comparative measurements. No language or
runtime change was made to pass the fixture.

## Build and isolation

Pinned dependencies: React/ReactDOM 19.3.1, Svelte 5.57.3, esbuild 0.28.2.
The package/lock files live here, while installed dependencies live only under
`elnor/.elnor/mvp/framework-comparison/deps-v1`. Install there using copies of
these files and `npm ci --ignore-scripts --no-audit --no-fund`; no global package
or normal editor profile is changed. esbuild's platform binary is Go-based;
this work neither compiles Rust nor starts a Rust toolchain.

`npm run bench:runtime` builds normal Surface output and production React/Svelte
client code. The same esbuild options minify/bundle all three to ESM/ES2022,
without sourcemaps or HMR. Svelte compilation has `dev:false`; React uses
`NODE_ENV=production`. The shared measurement driver/model verification is a
separate identical asset. Identical external CSS is used. Elnor is still an
experimental compiler/runtime; minifying its normal output does not certify a
production optimization pipeline.

The owned output retains source snapshots/hashes, dependency lock identity,
versions, uncompressed/gzip-9/Brotli-11 byte counts and the collection protocol.
A numeric loopback Host/method/asset allowlist serves precompressed gzip to
supporting requests, with unchanged restrictive CSP and `no-store`. Raw sources
and manifests are not served. No public port, inline script/style, connection
permission or security exception is introduced. All artifacts remain internal.

## Browser protocol and metrics

The original shared CLI session stopped responding during Elnor/1,000 on
November 11, 2026, followed by host responsiveness problems and a user restart.
The root cause is unresolved. Retain `run-7jklhY` as incomplete; do not resume its
shared session or combine its observations with the diagnostics below. The old
generated CLI scripts describe the historical protocol, not the current runner.

Use `diagnose-windows.py` for serial **diagnostic-only** cases. It requires an
existing Python installation with pywin32, Node, Playwright and Edge; it does not
install anything. Example from this directory (use your existing Python path):

```powershell
python diagnose-windows.py --fixture H:/path/to/run-7jklhY --framework elnor --size 100
```

An exclusive session mutex refuses overlapping diagnostic invocations before
starting a child. Each invocation starts a fresh owned headless Edge through the existing
Playwright API, without a shared CLI daemon. The child starts suspended and is
assigned to a Windows Job Object before any worker instructions execute. Kernel
limits are read back before resuming: 10% CPU hard cap, 768 MiB aggregate committed
memory, 24 active processes, and kill-on-owner-close. The external supervisor
enforces a 45-second wall deadline, a 12-second progress deadline, and aborts if
host available physical memory falls below 4 GiB. Cleanup terminates only that
job and records the remaining process count. These controls contain user-mode
resource use; they cannot guarantee recovery from an OS or device-driver fault.
See Microsoft's [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects),
[CPU rate control](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_cpu_rate_control_information)
and [job memory limits](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_extended_limit_information).

The worker verifies all retained site assets against their original manifest
hashes, serves only those assets on numeric loopback with the existing CSP, and
preserves the browser sandbox. GPU use is disabled for fault isolation. Default
collection is one measured round without warmup; `--rounds 7` uses the original
two warmups and seven measured rounds. Each case records source snapshots/hashes,
browser/framework versions, operation checkpoints, 500 ms job CPU/process/peak
commit and host-memory observations, worker errors, and an external supervisor
verdict. Data goes into fresh internal `framework-comparison/diagnostics/run-*`
directories. A failed/timed-out case retains partial evidence and exits nonzero.

These runs are not performance acceptance evidence: CPU is capped, GPU use is
disabled, startup/process isolation differs and the host is not controlled idle.
Do not feed their JSON to the original comparison summarizer. Run one case at a
time without another test/build gate. No screenshot or desktop editor is opened.
Fault-injection tests (`python -m unittest -v test_windows_job.py`) verify memory
refusal, wall/progress timeouts, descendant cleanup, unrelated-process survival
and owner-death cleanup without starting a browser.

The original uncapped protocol below used a 1280x800 viewport with reduced motion
and made no CPU/network throttling or controlled OS-idle/cache claim.

Runtime: two warmup rounds, then seven measured rounds per operation. Every
operation has an untimed create/clear preparation; data/model expectation and
button selection happen before the metric window. Actions use actual DOM button
click dispatch and ordinary framework scheduling, **without `flushSync`**.
Two animation-frame callbacks and a layout read bound completion. Correctness
and keyed-identity verification occur after the metric window. These synthetic
clicks exclude human input, focus/scroll and real-device input delivery.

Report individual operations and retain min/median/max/raw samples for:

- CDP `ScriptDuration`, `LayoutDuration`, `RecalcStyleDuration`, `TaskDuration`
  deltas in milliseconds around each operation. These include shared driver/
  automation overhead in that window; TaskDuration is main-thread work, not GPU
  time. Deltas exclude the separate model expectation and DOM verification.
- Elapsed two-frame window through layout read. This includes frame scheduling
  and is **not** exact paint/presentation latency. Small updates may be dominated
  by frame cadence. Do not call the combined numbers a pure rendering benchmark.

The declared runtime block order is Elnor/React/Svelte for 100 rows and
Svelte/React/Elnor for 1,000. Startup uses five fresh browser contexts per version,
rotating version order each round. Browser/OS/code caches may remain warm; this
is not fresh-browser or cold-server startup. Ready time starts at navigation and
includes delivery/parse/evaluation, empty mount and shared frame settling, not
context creation. Resource timing distinguishes encoded and decoded body bytes.

Memory: a separate context per framework, forced GC at empty mount, 1,000 rows,
clear, unmount and after three mount/create/dispose cycles. Record target JS heap
and DOM counters. This is one observation per phase, includes shared harness
state and code, and is not total process/GPU memory, peak allocation or proof
of leak freedom. The driver releases its DOM references when disposing.

## Contained reconciliation study

The production runtime now preserves the increasing subsequence of existing
keyed rows and moves only new or displaced DOM groups. An already ordered list
does not construct the subsequence index. It still scans the current values and
re-evaluates keys; it does not assume arrays or row objects are immutable. The
Surface language, component/event API and DOM identity contract are unchanged.

`diagnose-windows.py --build --runtime-source <retained-runtime.mjs>` builds an
old-runtime control without changing project sources. `--build` builds the
current runtime. Both builds are contained and retain the runtime source/hash.
The build also emits `elnor-profile.mjs`, with an effect-run counter, for separate
mutation collection only. The normal timed bundle contains no effect counter.
`--mode mutations` uses MutationObserver records to count attached row moves,
child-list records and text records. Effect counts are available only for Elnor.
`--mode preflight` checks both sizes and all three frameworks as before.

`study-windows.py --baseline <fixture> --candidate <fixture>` runs serially:
four mutation cases at 1,000 rows, followed by two fresh-browser timing cases for
each variant at each size. Each timing case has two warmups and seven measured
rounds. The second pass reverses variant order. All cases share the 10% CPU,
768 MiB, GPU-disabled, sandboxed Edge policy. The summarizer validates all cases,
kernel limits, zero residual processes, same browser version, and byte-identical
React, Svelte, driver and CSS assets before writing a separate study summary.

Study `run-3680d1455fcf4908864c581befa12135` completed 20/20 cases. At 1,000 rows,
Elnor's attached row moves changed from 1,000 to zero for update/select/append,
1,000 to two for endpoint swap, and 999 to zero for removal. Effect runs did not
change: selection still runs three effects, including the list effect. This
experiment removes unnecessary DOM work rather than claiming O(1) selection.

TaskDuration medians below are milliseconds, pooling 14 samples per operation
from the two runs. They include instrumentation/automation overhead in the metric
window and are not visual response times. Mutation instrumentation was disabled
for timing. Raw ScriptDuration, layout, style, frame windows, min/max and per-run
medians remain in the internal study summary.

| 1,000 rows | Original Elnor | Optimized Elnor | React | Svelte |
|---|---:|---:|---:|---:|
| Create | 17.68 | 22.47 | 17.54 | 17.96 |
| Update labels | 23.91 | 4.28 | 3.87 | 3.27 |
| Select | 15.89 | 2.14 | 2.58 | 1.92 |
| Append 10% | 24.64 | 4.47 | 4.54 | 4.10 |
| Swap endpoints | 16.46 | 2.51 | 19.69 | 2.31 |
| Remove middle | 22.87 | 3.46 | 3.68 | 3.01 |
| Clear | 4.30 | 5.09 | 3.42 | 2.48 |

Material limits remain visible: optimized create/clear pooled medians are worse
in this study. Optimized create's per-run medians vary from 25.50 to 17.85 ms,
while the original varies from 17.38 to 17.85 ms. Two runs do not identify the
cause of that variation or establish an accepted regression budget. Update and
clear remain behind Svelte. The five non-create/non-clear operations improve
substantially against the retained Elnor baseline, supporting the DOM-work
hypothesis without proving every remaining cost or the earlier host freeze.
No Rust migration or product-level parity conclusion follows from this study.

`test-project-windows.py` runs the existing check, build and every Node test file
serially, preserving the project cwd, with a separate bounded job per phase/file.
It does not replace coverage with a smaller suite or start the desktop editor.
Verification `run-8c927a792159422f82dcde84b3d09e72` passed check, build and all
33 test files (469 Node tests), including five new reconciliation cases. They
cover stationary selection/label updates, two-move endpoint swaps, multi-node
groups, disposal, all 120 five-key permutations and in-place mixed array edits.
Both retained baseline and candidate passed the 42-action browser preflight;
the four Windows containment fault-injection tests also passed.

## Lifecycle and text follow-up

The runner also accepts `--mode profile` for separate CDP sampling profiles and
`--mode memory` for the existing GC/DOM-counter lifecycle observations. Profile
mode with `--rounds 7` now performs two warmup rounds and retains seven separate
profiles per action (49 total); the default retains one per action. Profiles
include frame waiting and only a short action window; their small sample counts
are diagnostic, not precise percentages of a bottleneck. Neither mode contributes
to runtime timing summaries. `study-windows.py --repeats 4` declares four fresh
browser runs per variant/size with balanced position rotation (reversed for the
other size), producing 28 measured samples per operation and retaining all runs.

The first follow-up trial combined grouped insertion, DOM-text equality checks
and cleanup allocation changes. Study `run-99ae5ff083594e4eb0894627b337a667`
completed 36/36 cases but worsened 1,000-row create from 22.40 to 26.27 ms and
clear from 4.69 to 5.06 ms, despite fewer child-list mutation records. It is not
the selected runtime. Exploratory ablation
`run-79c45281266e42038ea11006df08575b` separates text-only, cleanup-only and
combined-without-batching changes against the prior runtime and both controls.
All twelve cases and all builds are retained, including unfavorable results.
The grouped-insertion optimization was rejected; insertion keeps the established
keyed-group behavior. The experimental fake-DOM fragment change was also removed.

Intermediate variants cached rendered text and changed cleanup allocation/removal
paths. They were not retained after confirmation showed mixed latency results,
including regressions on smaller lists. The selected production change is narrow:
error-path closures live outside mountBoundary's successful call frame, so its
returned disposer no longer retains the original staging fragment. Empty staging
targets also avoid allocating and retaining an unnecessary prior-node Set. The
prior text, cleanup and component-prop adapter behavior remains in production.

Separate memory observations on the prior and an intermediate fixture, after GC with
1,000 Elnor rows, changed the target renderer's DOM-node counter from 6,036 to
5,036 and JS heap from 3,502,476 to 3,363,020 bytes. Both returned to 12 nodes
after unmount and after three mount/dispose cycles. These are single observations
per phase, not peak process memory or a general proof of leak freedom. The
removed retention existed while rows were mounted, rather than accumulating
after disposal.

The final selected fixture `run-yRQmok` records 3,337,440 JS heap bytes and 5,036
DOM nodes at 1,000 Elnor rows, versus 3,502,476 bytes and 6,036 nodes in the prior
fixture: approximately 4.7% less observed JS heap and 1,000 fewer retained nodes.
It also returns to 12 nodes after unmount and after three disposal cycles. A new
WeakRef/forced-GC regression fails against the retained prior runtime and passes
against the fix, while confirming that text updates and disposal still work
after the staging fragment has been collected.

### Discarded component-prop experiment

An additional compiler experiment emitted live getter literals for child props rather than
allocating reader objects and adapting each field through Object.entries and
Object.defineProperty at mount time. Its helper froze the prepared container
before mounting the child. Focused tests confirmed lazy/live/readonly props,
zero descriptor-adapter calls, disposal and generated-name hygiene. However,
CPU-clock study `run-c69dc29b7983479fa181c90693574462` still showed mixed results:
at 1,000 rows update improved from 4.179 to 3.604 ms, but creation increased from
19.622 to 20.193 ms, and several 100-row operations regressed. This variant and
its experimental cost tests are retained with their fixture/study evidence,
not in the active compiler/runtime. No global performance improvement is claimed.
New fixture builds retain compiler source and hash as well as runtime source.
A runtime override must match its compiler; historical comparisons use their
retained compiled site.

### Duration clock correction

The historical CDP duration tables used Performance.enable's default `timeTicks`
domain. Those are durations measured with monotonic elapsed time, not strict
CPU consumption. Scheduling pauses under the hard CPU cap and host contention
can influence them. They remain retained observations of those runs, but must
not be relabeled as pure CPU milliseconds. `--time-domain threadTicks` explicitly
selects the renderer thread's running-time clock for new CPU-duration studies.
The worker records the domain and the separate ThreadTime delta; the summarizer
rejects mixed clock domains or collection-source changes within one study.
The frame-window measurement always remains elapsed wall time, and is retained
separately. CPU-clock studies do not replace wall-time or user-latency evidence.
See the [official Performance protocol](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Performance.pdl)
and [Chromium's duration-clock implementation](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/inspector/inspector_performance_agent.cc).

### Retained fix confirmation

The active runtime is the prior keyed reconciler plus the staging-retention and
empty-prior-Set fix; the compiler-prop, text and disposal micro-optimizations are
not active. Final fixture `run-yRQmok` and CPU-clock study
`run-5a422694610845e29358aaa502f8e112` completed 36/36 cases. The following
renderer-thread TaskDuration medians use `threadTicks`, four independent
processes and seven measured rounds each (28 samples/operation). They include
renderer instrumentation overhead and are not elapsed user-interaction times.

| 1,000 rows, CPU ms | Prior Elnor | Retained fix | React | Svelte |
|---|---:|---:|---:|---:|
| Create | 19.32 | 21.87 | 19.59 | 17.73 |
| Update labels | 4.05 | 4.28 | 4.03 | 3.28 |
| Select | 2.05 | 2.13 | 2.67 | 1.93 |
| Append 10% | 4.37 | 4.28 | 4.83 | 4.20 |
| Swap endpoints | 2.49 | 2.53 | 22.14 | 2.51 |
| Remove middle | 3.32 | 3.27 | 4.05 | 3.11 |
| Clear | 4.63 | 4.48 | 3.71 | 2.50 |

This confirmation establishes no global speed improvement. Creation has a higher
observed median, updates do not improve and several small-list medians also
increase. The retained change is a resource-retention correction, not a speed or
product-parity acceptance. The observed 4.7% JS-heap reduction and removal of
1,000 retained staging nodes are reported separately from timing. All raw samples,
per-process medians, wall frame windows, failures and rejected variants remain
available internally; none are replaced by the final table.

The next structural hypothesis is disposal ownership: each list row and its child
component currently create separate scopes, and per-button listeners are also
disposed individually. Scope sharing or event delegation would require explicit
tests of callback order, rollback, slots, event semantics and held-node disposal;
their performance benefit is not established by this investigation.

Final verification `run-d4704654d1444a91a0b7ed2faec83928` passed check, build
and all 34 Node test files: 472 tests. All previously existing tests remain;
the final suite adds the behavioral staging-retention regression and two name
hygiene cases. Cost-budget tests for rejected experimental code are retained with
that trial's source, not asserted against code that was not adopted. The selected
fixture also passed all 42 browser preflight actions and the lifecycle memory
observations, with zero residual processes after each contained study case.

## Svelte source study

Source study `svelte-study-h9jsG4` uses the exact installed Svelte 5.57.3 benchmark
dependency. It retains source snapshots, compiled App/RowView output, producer and
SHA256 manifest. This is source/compilation evidence, not another timing result.

Elnor currently uses direct DOM construction and mutation through reactive cells,
effects and keyed node groups. Its keyed Map and increasing-subsequence index
are bookkeeping for real nodes, not a virtual DOM tree diff. Svelte also emits
code for direct DOM work and retains a runtime; removing a virtual DOM is not the
missing architectural step in Elnor.

| Mechanism | Installed Svelte output/runtime | Elnor before region experiments |
|---|---|---|
| Static row creation | Cached `from_html` factory clones the row subtree | Individual `createElement` and append calls |
| Text updates | Cached value check, then existing Text.nodeValue assignment | Element.textContent assignment on each text effect run |
| Row update effects | Our RowView compiles both label and ID into one template_effect | Button label and ID text have separate effects |
| Click handling | Our RowView emits delegated click handling | Native listener and disposer per button |
| Clearing a whole list | Controlled-each specialization can empty its sole-owned container, then destroy effects without per-row DOM removal | General row/component cleanup with individual removals |

The compiled App emits `each(ul, 21, ...)`; its flags include
`EACH_IS_CONTROLLED` (4). In each.js, the clear specialization additionally checks
transition/pending-batch conditions. This establishes an available code path for
the benchmark structure; it does not prove how much of the timing difference it
causes or replace tracing the branch in a measured run. Cleanup, reactive effects
and event semantics still require work after a container is emptied.

The next experiments should test controlled-list clearing, grouped effects with
in-place text updates, static subtree cloning and event delegation independently.
Each must preserve Elnor's CSP, prior-node ownership, cleanup/rollback order and
event behavior. This differs from the rejected grouped-new-row insertion trial.
No runtime or Surface behavior changes were made for this source study.

Sources: [templates](https://github.com/sveltejs/svelte/blob/main/packages/svelte/src/internal/client/dom/template.js),
[text](https://github.com/sveltejs/svelte/blob/main/packages/svelte/src/internal/client/render.js),
[controlled each](https://github.com/sveltejs/svelte/blob/main/packages/svelte/src/internal/client/dom/blocks/each.js),
[event delegation](https://svelte.dev/docs/svelte/basic-markup#Events-Event-delegation).
Linked main-branch sources are explanatory references; the installed-version
snapshots are the version-specific evidence.

## Independent region and text experiments

The source study informed a separate Elnor design; no Svelte runtime code was
incorporated. See [region optimization](../../docs/mvp/REGION-OPTIMIZATION.md).
The retained implementation shares the existing region owner with generated
children, verifies eligibility before collectively clearing an exclusive list,
and updates persistent Text nodes. Expressions keep separate effects and native
event listeners. Surface grammar, live readonly props and external mount remain.
Static subtree cloning, event delegation and grouped expression evaluation have
not been adopted. They require independent semantic and performance evidence.

Evidence under `elnor/.elnor/mvp/framework-comparison/`:

- Original baseline: `run-yRQmok`; ownership/clear candidate: `run-uo094R`;
  retained combined candidate: `run-LXEwZO`. Runtime and compiler SHA-256 values
  in that manifest matched the retained sources at that stage; the later
  direct-root follow-up below is now active.
- Ownership/clear study: `studies/run-db5b3ba67ba0431f98e7476831ae2091`.
  Clear at 1000 rows: 4.683 to 3.359 ms CPU. Its 477-test run is
  `test-runs/run-56be5d4af7384803a9ad6678b6f32f0c`.
- Final combined study: `studies/run-be38668f997e446a8f13423935c2d375`.
  All 36 cases passed: separate mutation counters plus four fresh processes
  per variant/size, each with two warmups and seven measured rounds. Balanced
  order, `threadTicks`, Edge 157.0.4341.42, GPU disabled and the existing Job
  limits. All shared/control assets and collector identities were checked.
- Final check/build and 480 tests across 36 files:
  `test-runs/run-83ccbb0f6ec4409caedac4e9c0c5b097`.
  Final 42-case preflight: `diagnostics/run-99194fb8352a4b5a9ae10d512cc1b0e2`.
- Forced-GC memory observation:
  `diagnostics/run-8be3934f91ba4ef0a804de7b5d4099c3`.

Final CPU TaskDuration medians in ms (28 samples per operation/variant):

| Rows | Operation | Baseline | Retained Elnor | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | Create | 3.481 | 3.286 | 3.160 | 3.219 |
| 100 | Update | 1.428 | 1.199 | 1.423 | 1.310 |
| 100 | Select | 1.142 | 1.057 | 1.236 | 1.097 |
| 100 | Append | 1.601 | 1.454 | 1.657 | 1.552 |
| 100 | Swap | 1.297 | 1.274 | 3.139 | 1.279 |
| 100 | Remove | 1.481 | 1.365 | 1.631 | 1.403 |
| 100 | Clear | 1.349 | 1.086 | 1.240 | 1.071 |
| 1000 | Create | 19.379 | 18.938 | 16.805 | 16.542 |
| 1000 | Update | 4.031 | 3.210 | 3.765 | 3.113 |
| 1000 | Select | 2.082 | 1.898 | 2.505 | 1.880 |
| 1000 | Append | 4.183 | 4.153 | 4.421 | 3.961 |
| 1000 | Swap | 2.510 | 2.408 | 18.605 | 2.360 |
| 1000 | Remove | 3.314 | 3.122 | 3.844 | 2.980 |
| 1000 | Clear | 4.684 | 3.075 | 3.719 | 2.431 |

The combined update median is 20% lower and clear 34% lower than baseline at
1000 rows. Creation is still about 14% slower than Svelte and has substantial
baseline variability: baseline process medians are 22.886/16.931/17.330/22.920 ms,
versus candidate 18.297/19.200/19.997/18.676 ms. Do not interpret small median
differences as established wins or these two studies as an isolated text ablation.
The candidate's update process medians are 3.361/3.139/3.173/3.190 ms; clear is
2.987/3.042/3.077/3.089 ms. Summary JSON retains the full ranges and run medians.

Mutation counters verify the intended work: clear changes from 1002 child-list
records to one (plus two character-data records); label updates use existing
Text nodes, and the endpoint swap still moves exactly two LI nodes. Effect run
counts are unchanged. These counters are separate from timed measurements.

The extra machinery costs bytes: the Elnor comparison bundle grows from 5533 to
6245 raw bytes, 2509 to 2788 gzip bytes, and 2244 to 2500 Brotli bytes. This is
the measured workload bundle, not a general package size claim.

One forced-GC observation gives Elnor 3,220,324 heap bytes and 5036 DOM nodes
with 1000 rows; after unmount and three further mount/dispose cycles it has
12 DOM nodes and 13 listeners (including page/instrumentation listeners).
This checks the sampled lifecycle; it is not peak memory, a repeated memory
comparison, or proof against all leaks. All diagnostic jobs reported zero owned
processes after cleanup. Product parity remains open.

## Single-node cloning follow-up (rejected)

To preserve staged sibling evaluation, an independent compiler/runtime trial
cached and cloned each standard element shape, including an empty Text child
for text/buttons. Prototypes were native DOM nodes keyed weakly by document;
there was no HTML parsing, changed expression grouping or event delegation.
Its correctness tests covered isolation, readonly effects/listeners, document
switching, inactive-document collection, sibling read order and cloned-control
rollback. Check/build, 487 tests across 37 files and browser preflight passed.

That correctness did not establish a speedup. The implementation was rejected
and runtime/compiler restored to `run-LXEwZO`. Trial sources/manifests remain
in `run-B7bKcY`; its test snapshots are in `run-B7bKcY/trial-tests`. Evidence:

- Full four-process study: `studies/run-545e200f500d4252a2b5d9924b45540a` (36/36).
- Check/build/tests: `test-runs/run-b2730d1706214049ad5cb48e09c57b43`.
- Preflight: `diagnostics/run-8990262e00ea4bc1ad54d3e9d8ee8956`.
- First row creation: `cold-studies/run-0bcc532b93394db4b9a35221cbf7bae0` (8/8).
- Forced-GC observation: `diagnostics/run-2d911748eef44f8bba636c0b8910173a`.

CPU medians in ms, under the same contained `threadTicks` protocol:

| Rows | Operation | Retained baseline | Cloning trial | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | Create | 3.345 | 3.406 | 3.174 | 3.246 |
| 100 | Update | 1.238 | 1.246 | 1.440 | 1.276 |
| 100 | Select | 1.071 | 1.080 | 1.260 | 1.129 |
| 100 | Append | 1.508 | 1.493 | 1.680 | 1.529 |
| 100 | Swap | 1.300 | 1.292 | 3.215 | 1.322 |
| 100 | Remove | 1.369 | 1.394 | 1.700 | 1.475 |
| 100 | Clear | 1.167 | 1.162 | 1.337 | 1.133 |
| 1000 | Create | 20.126 | 20.867 | 17.810 | 17.839 |
| 1000 | Update | 3.337 | 3.402 | 4.000 | 3.430 |
| 1000 | Select | 1.980 | 1.971 | 2.642 | 2.011 |
| 1000 | Append | 4.259 | 4.466 | 4.761 | 4.110 |
| 1000 | Swap | 2.423 | 2.487 | 21.705 | 2.411 |
| 1000 | Remove | 3.151 | 3.226 | 4.085 | 3.086 |
| 1000 | Clear | 3.158 | 3.179 | 3.640 | 2.645 |

The extra caching/cloning granularity did not reduce creation and append costs.
The trial bundle grew from 6245/2788/2500 raw/gzip/Brotli bytes to
6875/2990/2690 bytes. A single forced-GC observation retained 28 nodes after
unmount and after three further cycles, versus 12 in the preceding retained
implementation's observation. The extra cached prototypes were stable across
those cycles, but remained a cost while the document was active; this is not
a repeated memory comparison or a general leak result.

The new `cold-study-windows.py` isolates **first row creation after an empty
mount**, not network load, module evaluation or page startup. It uses four new
processes per Elnor variant, alternating order, zero warmups, one round and the
same kernel limits/CPU clock. It checks fixture hashes, control/shared assets,
collector identities, browser version, keyed identity and process cleanup, and
retains its exact producer. Baseline creation values were
32.571/32.551/36.860/25.938 ms, versus trial
32.511/37.991/28.229/31.419 ms. Medians of 32.561 and 31.965 ms have broadly
overlapping ranges and do not rescue the warmed-creation regression.

## Direct prop descriptor follow-up (rejected)

A second independent trial emitted known prop installations directly through a
runtime helper, avoiding a temporary readers object and Object.entries. It kept
the original enumerable/nonconfigurable getter descriptors and extensible props
object, without Object.freeze. The helper insulated Object.defineProperty from
user imports named Object. Targeted lazy-read/descriptor, slot, event, rollback
and ordinary compiled-fixture tests passed, followed by build and preflight.
Generic native runtime composition helpers were preserved.

The first study suggested a creation improvement, but also a small-list clear
regression. A second comparison was run specifically to investigate that concern.
It did not confirm the creation improvement and repeated the clear regression.
The candidate was therefore removed; the active runtime/compiler again match
`run-LXEwZO`. It is not a retained performance improvement.

Evidence under the same internal comparison root:

- Candidate sources/manifests and original test snapshots: `run-097Krr` and
  `run-097Krr/trial-tests`.
- Targeted tests: `test-runs/props-targeted-56eb83f0d1104d0daa22896015d4f3ee`.
- Preflight: `diagnostics/run-42d639b5866e404099f7c1a8a1fbfffa`.
- Four-process study: `studies/run-798a63d62d9d42dc87cc6d768f74261b` (36/36,
  balanced order, 28 samples per operation/variant).
- Confirmation: `studies/run-d33f6cea8a3b4195a1756ae1652787f5` (20/20,
  reverse order on the second process, 14 samples per operation/variant).

Both studies use the same contained `threadTicks` protocol and preserve complete
ranges, run medians, source identities, controls and raw observations. Do not
compare a control from one study to a candidate from another.

First study CPU medians in ms:

| Rows | Operation | Retained baseline | Prop trial | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | Create | 3.211 | 3.165 | 3.074 | 3.140 |
| 100 | Update | 1.208 | 1.205 | 1.405 | 1.268 |
| 100 | Select | 1.031 | 1.036 | 1.220 | 1.068 |
| 100 | Append | 1.473 | 1.488 | 1.630 | 1.494 |
| 100 | Swap | 1.248 | 1.278 | 3.133 | 1.272 |
| 100 | Remove | 1.378 | 1.363 | 1.604 | 1.415 |
| 100 | Clear | 1.083 | 1.170 | 1.210 | 1.063 |
| 1000 | Create | 20.342 | 19.303 | 17.531 | 17.778 |
| 1000 | Update | 3.380 | 3.268 | 3.921 | 3.298 |
| 1000 | Select | 1.954 | 2.033 | 2.653 | 1.953 |
| 1000 | Append | 4.366 | 4.190 | 4.555 | 4.246 |
| 1000 | Swap | 2.481 | 2.445 | 20.397 | 2.455 |
| 1000 | Remove | 3.167 | 3.178 | 4.003 | 3.128 |
| 1000 | Clear | 3.207 | 3.240 | 3.758 | 2.475 |

Confirmation CPU medians in ms:

| Rows | Operation | Retained baseline | Prop trial | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | Create | 3.309 | 3.164 | 3.109 | 3.143 |
| 100 | Update | 1.212 | 1.273 | 1.406 | 1.259 |
| 100 | Select | 1.049 | 1.116 | 1.250 | 1.080 |
| 100 | Append | 1.432 | 1.488 | 1.646 | 1.596 |
| 100 | Swap | 1.263 | 1.345 | 3.091 | 1.293 |
| 100 | Remove | 1.367 | 1.407 | 1.697 | 1.412 |
| 100 | Clear | 1.104 | 1.188 | 1.234 | 1.068 |
| 1000 | Create | 20.165 | 20.778 | 18.581 | 16.908 |
| 1000 | Update | 3.496 | 3.331 | 4.092 | 3.228 |
| 1000 | Select | 2.166 | 1.995 | 2.598 | 2.136 |
| 1000 | Append | 4.608 | 4.293 | 4.909 | 4.299 |
| 1000 | Swap | 2.504 | 2.445 | 25.603 | 2.454 |
| 1000 | Remove | 3.151 | 3.206 | 3.942 | 3.067 |
| 1000 | Clear | 3.231 | 3.365 | 3.776 | 2.376 |

The candidate bundle was slightly smaller (6198/2768/2485 raw/gzip/Brotli bytes,
versus baseline 6245/2788/2500). Its first study's baseline/candidate mutation
and effect counters were identical. Neither observation established a stable
creation benefit or cancelled the repeated small-list clear regression.
No numeric product acceptance margin is inferred from these experiments.

After restoration, check/build and **487 tests across 37 files** passed in
`test-runs/run-b71dfb4b4d8c41cea0dc150c2fc8c087`. At that stage runtime/compiler
SHA-256 values matched the retained `run-LXEwZO` manifest. General tests
now retain lazy/nonconfigurable/readonly descriptor checks, reactive child/slot
reads, Object-import and helper-name hygiene, event disposal and observation of
actual mounted controls rather than allocation prototypes. Clone-specific tests
remain archived with their trial. The fake DOM retains native-like cloning,
firstChild and ownerDocument support. No additional application-runtime speedup
is claimed for this investigation.

## Retained profiling and direct-root follow-up

The [complete profiling and direct-root report](../../docs/mvp/DIRECT-ROOT-STUDY.md)
contains all operation matrices, rejected reactive variants, instrumented
constructor counts, cold repetitions, memory observations and source hashes.
The direct-root study retained `run-OLDLti`, compared against `run-LXEwZO`.

The graph compiler proves eligibility for a plain single-root row, then avoids
its temporary DocumentFragment, append and childNodes snapshot. Slot/block/child
component/multi-root bodies keep their general behavior. Exclusive clearing
releases every owner directly instead of allocating wrappers for DOM removals
already suppressed by its existing ownership guards. TypeScript/Surface syntax,
native listeners, separate effects and public mount/disposal remain.

The complete four-process study `studies/run-fd9b786820c4433da868e648468b4a22`
reduces 1000-row creation from 19.769 to 18.882 ms CPU and clear from 3.329 to
3.032 ms. Confirmation `studies/run-e27e1dc4ea8940cdaf42c21446345359` also
improves both (19.420 to 16.939 and 2.951 to 2.820 ms). Both sizes and every
operation are published in the full report; small adverse differences and
remaining Svelte gaps are visible. These are descriptive gains, not accepted
product parity or an isolated per-subchange attribution.

Check/build and 508 Node tests across 39 files passed in
`test-runs/run-c37032df5014499aa8f9a06595c40d67`; preflight
`diagnostics/run-e7ac910bda2e457f9a68d2780afac439` passed 42 checks.
The candidate adds 126 gzip bytes to this workload bundle. Cold medians change
direction across two four-process-per-variant studies with broad overlap, so
no general first-use improvement is accepted. A forced-GC observation per
variant returns to 12 DOM nodes after unmount and three additional cycles;
it does not establish peak memory or exclude all leaks.

Diagnostic-only modes `allocations` and `domallocations` retain 4096-byte heap
samples and constructor/method call counts separately from timings. The worker
rejects allocation-instrumented runtime fixtures for other modes, with a retained
pre-launch fault-injection check. Constructor counts are not total allocated
bytes, and heap sampling is not CPU attribution. Normal timing fixtures contain
none of these runtime/page probes.

## Scope-disposal follow-up: rejected

The [scope-disposal report](../../docs/mvp/SCOPE-DISPOSAL-STUDY.md) records two
complete 36-case studies of reverse callback traversal without a copied array.
The inline candidate slightly improves 1000-row clear but regresses creation;
the shared helper improves creation but regresses clear, update and removal.
Both were rejected and the trial restored `run-OLDLti`.

Two new cleanup contract tests and a diagnostic-only cleanup-snapshot counter
remain. After restoration, check/build and 510 Node tests across 40 files passed
in `test-runs/run-446cd760ca7b43209d8b44065ce7ceb9` (42 steps). No additional
runtime speedup, cold-start gain or memory improvement is claimed.

## Native-clear investigation: not adopted

The [native-clear report](../../docs/mvp/NATIVE-CLEAR-STUDY.md) records a repeated
CPU profile and two complete studies (36 and 20 cases) of clearing text content
and reinserting the same anchor instead of `replaceChildren`. Pooled 1000-row
clear medians favor the candidate, but confirmation contains large variation in
the unchanged baseline and both controls; its first process pair does not
improve clear. The alternative was not adopted and the trial restored `run-OLDLti`.

The summary CLI now prints `taskRunMediansMs` beside each pooled median, and
`--stdout-only` revalidates/prints a retained study without replacing its summary.
No samples are removed and no acceptance threshold is introduced. Region tests
measure collective clearing independently of the primitive and check anchor
identity. Check/build and 510 Node tests passed across the 42 selected phases in
`test-runs/resumed-27d88891393b41fab152242ae185964e`. This includes the first 35
passing phases from `test-runs/run-cfcc49ae938240f490f723d84566bcd3` and the
affected/remaining files after rebuilding incomplete output. The original EPERM
cleanup failure and first retry's missing-module failure remain recorded; the
full report explains recovery without changing assertions or limits.

## Repeatability and accessibility calibration

The [repeatability report](../../docs/mvp/REPEATABILITY-STUDY.md) records a
36-case A/A study using `run-OLDLti` for both Elnor labels. Identical code gives
94.523 versus 82.690 ms pooled CPU for 1000-row creation. This is apparent
variation, not a code improvement; a small favorable difference cannot establish
an optimization by itself.

`diagnose-windows.py --mode calibration --rounds 7` adds a verified empty
two-frame/geometry window before each action and captures DevToolsCommandDuration,
V8CompileDuration and TaskOtherDuration. The empty control does not click or
change application state, and its cost is not subtracted. Four fresh processes
cover Elnor, React, Svelte and Elnor again. These diagnostic samples remain
separate from normal runtime summaries.

`--mode trace --rounds 1` captures creation and clear after two warmup cycles,
with toplevel/accessibility/blink/devtools.timeline/v8 categories. It rejects
known data loss and streams over 8 MiB per action. Local trace CPU attribution
finds approximately 40–42 ms of accessibility lifecycle work during creation in
all three frameworks. Nested events are inclusive and must not be summed;
traces perturb execution and do not establish the trigger for A/A variation.
Accessibility remains enabled and the DOM workload remains unchanged.

The report verifies 49 ordinary runtime samples, 42 preflight checks and expected
pre-launch rejection of unsupported trace round counts. Runtime/compiler source
hashes remain unchanged. Future comparisons need contemporaneous A/A controls
and matching accessibility observations; total renderer cost remains relevant.

## Retained core hardening: reactive scheduler

The [scheduler report](../../docs/mvp/REACTIVE-SCHEDULER.md) records a correctness
fix retained as `run-ukbjyh`: a failing queued reaction no longer discards other
live effects from its batch, and chained writes queue one follow-up microtask
instead of an extra empty flush. Errors remain observable and ordered;
disposal and later-write recovery are covered by six regression tests.

Three regressions fail before the change. Check/build and 516 tests across 41
files pass after it in `test-runs/run-6d23fc7fe007431399d6a4d317a4765e` (43
supervised phases), and browser preflight passes 42 checks in
`diagnostics/run-5b6d07397f3b4a5c9f2d0abf1fc41977`. The compiler is unchanged.
The bundle adds 26 gzip bytes. This is a correctness claim, not a measured CPU
speedup; `run-OLDLti` remains the historical direct-root performance baseline.
The subsequent paired performance investigation is documented below.

## Retained core hardening: structural recovery

The [structural recovery report](../../docs/mvp/STRUCTURAL-RECOVERY.md) records
the current correctness fixture `run-BknsXh`. Failed queued each/when updates
release their owned and staged resources, preserve the anchor for a later
dependency notification, and report the original error (plus cleanup errors).
The failed region becomes empty; previous UI and cell writes are not rolled
back. Exclusive clearing retains node references until DOM removal succeeds.
Writes without subscribers no longer queue empty work.

Check/build and 533 Node tests across 42 files pass in
`test-runs/run-a22f57e7264b4f4f88a6cf2520a52964` (44 supervised phases).
Preflight `diagnostics/run-07ea9a93145149308c16b89ca7c44ad8` passes 42 checks.
Actual DOM/microtask recovery, host error reports and inactive disposed resources
are verified for fragment/direct-root lists in
`test-runs/structural-browser-e1c03de02cdc41eeaa7020e02c77207a`.

Sixteen structural regressions and one additional scheduler regression are
retained. The compiler is unchanged; the bundle adds 15 gzip bytes versus the
scheduler correctness fixture. This is not a measured CPU gain. Historical
performance fixtures and tables remain separate from the active correctness
fixture, and performance acceptance remains pending.

## Paired measurement investigation

The [complete paired report](../../docs/mvp/PAIRED-MEASUREMENT.md) records
`paired-studies/run-5c3f6c5da3904914bff4d1a0e9727d8b`: 16 passing pairs,
32 isolated contexts and 1568 measured action samples. Each pair owns one browser,
uses consecutive variant blocks, and reverses AB/BA order in a second browser.
A/A compares the exact current fixture; further pairs compare the previous core,
React and Svelte. All operations, both sizes and both orders remain visible.

The new `paired-windows.py` runner uses the same Job limits and original fixture
bytes via separate loopback ports. `summarize-paired.mjs` validates assets,
collector hashes, samples, paired schemas and cleanup, and preserves per-pair
medians rather than merging different cohorts. `--stdout-only` revalidates a
retained study without overwriting its summary. With `--controls`, the runner
includes React and Svelte in addition to its default A/A/core-change pairs.

An optional collector hook records an accessibility trace after timing within
the same context. Ordinary collection has no hook or extra trace. Post-timing
AX does not prove constant conditions during all earlier samples and is never
subtracted from total CPU. Fault injection verifies pre-launch rejection of
instrumented fixtures and corrupted hashes. Normal collection still passes 49
samples and preflight passes 42 checks.

A/A still differs by -4.64%/-11.46% for 1000-row creation and
+19.32%/+8.35% for append. Sharing a browser does not by itself establish
repeatability for small changes. No new CPU gain, regression verdict or general
framework ranking is accepted here. Core/runtime source remains unchanged from
`run-BknsXh`; its 533-test correctness gate remains historical evidence.

## Retained text write guard and action interleaving

The [full text-write report](../../docs/mvp/TEXT-WRITE-GUARD.md) records an exact
Svelte 5.57.3 source review and an independently implemented Elnor guard. Elnor
uses its existing input-value comparison idea for actual Text.nodeValue; it does
not import Svelte caches, templates or event handling. Reads/conversion and
independent effects remain, and later reevaluation repairs external edits.

At 1000 rows, separate mutation observation changes update text records from
202 to 100 and swap from 2 to 0, with the same effect counts and keyed identity.
The active fixture is `run-9EYGTh`. Check/build and 539 tests across 43 files
pass in `test-runs/run-8c43bd8d53144874a2972c4da90d400a` (45 phases). Preflight
`diagnostics/run-fb1ef47da7654fde8dd95ebfcce0c914` passes 42 checks. Native DOM
repair/unchanged-write observation and recovery pass in
`test-runs/text-guard-browser-5f11672697fc467e91818cd170864609`. The compiler is
unchanged and the bundle adds 9 gzip bytes versus structural recovery.

`paired-windows.py --interleaved` keeps two isolated contexts live and alternates
the active page per action/round. It records visibility and timestamps; the
summary verifies the alternating order and nonoverlapping windows. The complete
16-pair cohort is `interleaved-studies/run-e7d6488446854574b1e9842ea1a75490`.
AB/BA now denotes an order seed, not consecutive context blocks. This protocol
is separate from earlier timing cohorts. Accessibility is still observed in a
post-timing trace, not inside every measured action.

Interleaving improves some observed A/A differences but leaves large ones in
other actions, including +24.98%/-6.21% for 1000-row swap. No general repeatability
or CPU gain is accepted. The retained improvement is fewer redundant DOM writes,
not a percentage speedup or a framework-parity claim. Shared pre-launch rejection
checks still pass for instrumented/corrupted fixtures.

## Retained direct subscriber notification

The [notification snapshot report](../../docs/mvp/NOTIFICATION-SNAPSHOTS.md)
records the current fixture `run-sPU8kb`. notify traverses its private subscriber
Set directly while only enqueueing effects; flush retains its batch snapshot
because it executes user callbacks. Four new regressions preserve asynchronous
notification, later subscriptions, dependency changes, disposal and reentry.

Separate instrumented sources count 101 versus zero subscriber snapshot
expressions for update1000, with 101 notifications and 203 enqueue attempts in
both variants. These are source-expression counts, not net allocated objects or
bytes. Instrumented fixtures are rejected for timing before browser launch.

A bounded bare-page experiment tests five notification scenarios, two warmups
and eight measured rounds, followed by A/A and one fresh A/B confirmation. The
two-subscriber burst CPU medians are 18.327/14.634 ms initially and
15.933/13.977 ms in confirmation; A/A is 15.415/14.774 ms. This is isolated
signal-write/coalesced-flush cost, not an application rendering gain.

All eight application pairs and both order seeds are retained, including higher
candidate update medians and substantial A/A variation. No general CPU speedup,
regression verdict or framework parity is accepted. The experiment compares
this core change; it does not repeat React/Svelte comparison cohorts.

Check/build and 543 tests across 44 files pass in
`test-runs/run-3a12a540818446ad9fd69c9bb3320c0c` (46 phases). Preflight passes
42 checks in `diagnostics/run-ab22db13dd054886b67863e6565beb4c`; native DOM,
listener and error recovery pass in
`test-runs/notify-browser-e9c3ea65f1294cb082c8efe6460ef90e`.
The compiler is unchanged; the bundle is 5 gzip bytes smaller than `run-9EYGTh`.

## Current functional core baseline

The [functional core closure](../../docs/mvp/CORE-READINESS.md) supersedes the
earlier retained fixture with `run-RuBGXZ`. Flush consumes invalidations already
covered by an upcoming effect execution, and public mount disposers release
ownership before cleanup. Disposed effects release their stored callback.
Seven new regressions fail five cases before the change and pass all seven
afterward. The complete gate passes 550 tests across 46 files plus check/build
(48 phases), in `test-runs/run-fd04fb3502964523940da779d83230ac`.

`diagnostics/core-closure-8517258fb59e4c7089ed7f4e4af82adf` retains 42 preflight
checks, native Edge scheduler/unmount and structural/text/listener checks, and
the controlled V8 retention observation, all passing with zero owned processes
remaining. Its producer is `reports/core-closure/producer.py`. The application
bundle is 7156 raw / 3003 gzip / 2708 Brotli bytes; the compiler is unchanged.
No timing cohort was repeated or new CPU/parity result accepted.

The subsequent [current-core comparative cohort](../../docs/mvp/CURRENT-CORE-COMPARISON.md)
now measures this exact fixture. Study
`interleaved-studies/run-50116057b6604073a0975c79fbafad0c` passes all 16 pairs,
32 isolated contexts and 1568 measured samples. It includes identical-current
A/A, cumulative changes from `run-9EYGTh`, React and Svelte, at both sizes and
both initial orders. Full CPU, frame-window and post-timing AX tables are
retained. The summary validates every frozen collector/asset, identity, schema,
clock domain, order/visibility and containment result; the report producer
independently matches raw medians and sample counts.

A/A differences span -6.92% to +6.02% here, without establishing general
repeatability or a new tolerance. The current core has lower 1000-row CPU than
React in six operations in both orders; creation costs more. Svelte retains
lower creation, append and clear CPU in both orders, while update/select/remove
change direction. Cumulative old/new-core differences do not establish an overall
speedup. Absolute improvements versus earlier cohorts also occur in framework
controls and must not be attributed to Elnor. No source optimization is added;
the 550-test functional closure remains the unchanged implementation evidence.

Producer: `reports/current-core-comparison/producer.py`; validation result:
`reports/current-core-comparison/verification.json`. Summary validation runs in
`test-runs/current-comparison-summary-ca6e6508743f49b991c03d92a17e8ec7`.
Every phase reports zero owned processes remaining.

## Rejected native Range clear

The [Range clear evaluation](../../docs/mvp/RANGE-CLEAR-STUDY.md) profiles the
current core before trying a new native deletion primitive in an isolated copy.
Seven clear profiles contain 72 self samples in replaceChildren and 21 in
removeEventListener, with many idle/program samples; this is not precise CPU
attribution. Candidate `run-0NMQxg` preserves the marker by deleting the preceding
Range, with the existing primitive as fallback for a relocated marker. Ten
native browser cases pass for baseline and candidate, as do 42 preflight checks.
The three-row normal case changes one collective mutation record to three
individual records, while avoiding marker removal/reinsertion.

First study `interleaved-studies/run-bb072136f27041f491915ebb68cda5e7` retains
six passing pairs and a 45-second timeout on the seventh, with no final timing
result for that pair. It is not a successful complete cohort. Exactly one
full retry with identical limits completes eight pairs/784 measured samples in
`interleaved-studies/run-4651765b32bb46a8a4b88e59eda55c89`.

Large-list clear changes 12.049 to 12.015 ms in AB and 12.052 to 12.225 ms in
BA; small-list clear uses more candidate CPU in both orders. A/A differences
span -13.17% to +15.62%. The candidate adds 58 gzip bytes and establishes no
repeatable benefit, so it is rejected. The active runtime/compiler remain
byte-identical to `run-RuBGXZ`; the current framework comparison and historical
550-test functional gate remain their corresponding evidence. No full suite or
fresh framework timing controls are claimed from this experiment.

Producer: `reports/range-clear/producer.py`; native fixtures, isolated source
and verification metadata remain in the same report directory. Summary
validation: `test-runs/range-clear-summary-8c3705d5bbab4d29a436edf4f6115921`.
The report preserves setup failures and the timed-out cohort. All completed
and terminated phases report zero owned processes remaining.

## Rejected shared native listener cancellation

The [native listener investigation](../../docs/mvp/NATIVE-LISTENER-STUDY.md)
tests the primitive before adding runtime ownership/channel machinery. Two
complete cohorts pass 14 browser cases and 336 measured CPU phase windows:
manual/manual A/A and manual/shared-signal, with both initial orders. The initial
cohort covers four groups of 100 and 1000 detached buttons; confirmation covers
four groups of 1000. Each phase therefore handles 400 or 4000 listeners. Node
creation, verification clicks and bounded GC remain outside CPU windows.

Across the four large signal comparisons, registration consumes 2.53–3.22 times
the manual CPU median; summed registration/release phases consume 1.79–2.13
times as much. Release changes direction initially and improves slightly in
confirmation. These are isolated native-operation costs, not application
rendering multipliers. A/A variation remains visible. Both behavior/GC probes
observe released handler/payload objects after individual removal, including
with controllers and nodes kept alive; this is not a general heap guarantee.

Abort also bypasses an overridden removeEventListener method, so any integration
would require compatibility guards/fallback and fresh channels after abort.
The primitive shows no net cost benefit to justify that machinery. Shared
cancellation is rejected for this optimization; the runtime/compiler stay
byte-identical to `run-RuBGXZ`. The 550-test functional gate is unchanged
historical evidence; no full suite or framework timings were rerun here.

Retained cohorts: `diagnostics/listener-abort-7f1c907df99649dcb0354fddab2bc4e3`
and `diagnostics/listener-abort-646b51a9efb342f29570171febeb960f`. Producer,
frozen browser sources, runner and verification metadata:
`reports/listener-abort/`. All heavy cases retain the existing limits and
report zero remaining owned processes.

## Product acceptance

The [expanded matrix](../../docs/mvp/EXPANDED-PERFORMANCE-MATRIX.md) now
complements these list studies with four other workload families. Its
[harness](../matrix/README.md) retains 40 passing browser phases, 45 preflight
checks, 1260 action samples, 36 startup samples and 96 memory cycles, plus twelve
checked Surface builds and per-entry delivery sizes. Initial startup wall
observations remain provisional because foreground visibility is not verified
throughout navigation/readiness; no startup ranking is accepted. The compiler
and runtime remain unchanged. Use cross-family evidence before retaining a
list-specific optimization, without hiding regressions behind an aggregate.

Publish all cases and both baselines. No aggregate score or tolerance is chosen
after seeing results. Material gaps must remain visible even if transfer size
or some operations favor Elnor. The work is separate from development-loop
typechecking/HMR timings and does not fulfill the complete performance pillar.
Further representative workloads, repeats, accepted margins and human DX
evaluation are required before a product-level acceptance decision.

API sources used to design the harness:
[React root](https://react.dev/reference/react-dom/client/createRoot),
[React flushSync caveats](https://react.dev/reference/react-dom/flushSync),
[Svelte compiler](https://svelte.dev/docs/svelte/svelte-compiler),
[Svelte raw state](https://svelte.dev/docs/svelte/$state#state.raw),
[Playwright CDP sessions](https://playwright.dev/docs/api/class-cdpsession),
[CDP Performance](https://chromedevtools.github.io/devtools-protocol/tot/Performance/),
[CDP HeapProfiler](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/).
