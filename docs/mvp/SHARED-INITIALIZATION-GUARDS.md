# Shared initialization guards

**Retained as an allocation optimization. No general CPU speedup or neutrality is
established.** Generated modules now create one stateless initialization guard per
state/calc binding and reuse it when initializing each component instance. State
and computed cells, their context objects, effects and cleanup remain per instance.
The runtime, Surface syntax and initialization phases are unchanged.

A guard throws a fresh ReferenceError for each early read/write, with the original
binding/kind/file/span and ELN-INIT code. It never stores a component value. Each
instance still replaces its own context entry with a real cell in sequence.
Guards do not capture props, DOM, owner or component state. They now live for the
module lifetime and are created on import, even before an eventual first mount.
This trades bounded eager/static storage for less repeated construction.

## Work avoided and native allocation evidence

Private source counters on frozen checked graphs compare nine mounts per workload.
Counter/form/composition/localized/list guard calls per mount change from
**1/8/1/24/1 to zero**. Candidate import creates 1/8/1/1/1 guards respectively:
the 24 localized instances share the one guard belonging to the Leaf module.
DOM shape, values and empty unmounts match in both variants. These are source-call
counts, not exact engine allocations or time measurements.

An independent Edge 157.0.4341.42 probe serves the uninstrumented checked ESM graph,
warms three mounts, then samples 64 native mount/unmount cycles of 24 leaves. Sampling
starts after import and warmup, so it measures repeated mounting, not eager module
allocation. Minor/major-collected objects are included and GC runs before stopping.
A retained array allocation control is sampled in every round. Values below are
V8 sampled estimates, not exact allocated bytes or whole-application heap savings.

| Round | Variant | Bytes attributed through guard factory | Positive-control bytes | Total sampled bytes |
|---:|---|---:|---:|---:|
| 1 | baseline | 127660 | 100168 | 4056904 |
| 2 | candidate | 0 | 66728 | 3520356 |
| 3 | candidate | 0 | 60480 | 3433232 |
| 4 | baseline | 82372 | 66728 | 3918696 |
| 5 | baseline | 139992 | 75088 | 4004052 |
| 6 | candidate | 0 | 81304 | 3484256 |

Baseline guard-path estimates are 82,372–139,992 bytes; candidates are zero for that
path. Metadata constructed by a caller, DOM wrappers, effects and other engine
allocations may fall elsewhere in the profile. Total samples are not a controlled
exact savings estimate. GC heap measurements include the harness and are not used
to claim a universal retained-memory reduction. Module-level guards remain live.

## Correctness and delivery revisions

Four directed suites pass for both baseline and measured candidate: initialization,
source/name identity, semantic projection parity and literal captions. Additional
controls cover fresh errors across instances, early writes, failed-mount closures,
successful remounts and generated guard-name collisions. Two public regressions
protect those isolation and name-hygiene boundaries. The final retained compiler
passes **588 tests plus check/build in 52 serial phases**.

The first private candidate moved construction to module scope without a purity
annotation. A downstream JS consumer importing an unused generated component then
kept its guard route. The final revision marks only the stateless guard constructor
call as pure. The same control measures 1539 bytes at baseline, 1862 for the initial
candidate and 1539 for the final revision; unused metadata is absent again. This
is one delivery control, not a universal bundle-size saving. A Surface-only control
first failed to expose the issue because TypeScript had already removed its unused
import; that failed control is preserved and was replaced with an explicit JS
consumer whose import reaches the bundler.

Normal CPU/startup samples below use the initial candidate's frozen minified
bundles. A separate contained rebuild adds exactly the final purity annotation
to those sources and proves **all five used bundles byte-identical**. The final
compiler differs from the measured compiler only by that generated annotation.
The raw native allocation graph likewise changes only a nonexecuting comment for
this revision. Original fixtures, compiler snapshots and manifests are preserved;
they are not relabeled with the final compiler hash.

## Broad normal CPU measurements

The unchanged production collectors compare all four expanded workloads plus lists
at 100/1000 rows with A/A controls and AB/BA. Small-workload values are renderer
ThreadTime milliseconds; list values are TaskDuration milliseconds. Do not combine
these metrics or treat A/A as a statistical acceptance margin. Paired medians are
descriptive; no samples or actions are removed.

The list reader normally requires an identical compiler. This study deliberately
varies the compiler: its private reader instead pins both expected compiler hashes
by group/label and verifies compiler snapshots, while keeping the original fixture,
worker, bundle, sample, DOM/accessibility and resource checks. The original reader
is retained verbatim. The matrix reader is unchanged.

| Workload/action | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| counter/mount | 0.989 → 0.926 (-6.4%) | 1.017 → 0.967 (-4.9%) | 1.038 → 0.985 (-5.1%) | 1.065 → 1.122 (+5.4%) |
| counter/increment | 0.932 → 0.862 (-7.5%) | 0.980 → 0.894 (-8.8%) | 0.874 → 0.818 (-6.4%) | 0.918 → 0.917 (-0.1%) |
| counter/unmount | 0.827 → 0.798 (-3.5%) | 0.818 → 0.867 (+6.0%) | 0.863 → 0.783 (-9.3%) | 0.896 → 0.908 (+1.3%) |
| form/mount | 1.405 → 1.237 (-12.0%) | 1.366 → 1.352 (-1.0%) | 1.389 → 1.325 (-4.6%) | 1.427 → 1.421 (-0.4%) |
| form/edit-one | 1.105 → 1.231 (+11.4%) | 1.196 → 1.210 (+1.2%) | 1.183 → 1.160 (-1.9%) | 1.282 → 1.314 (+2.5%) |
| form/edit-all | 1.268 → 1.200 (-5.4%) | 1.175 → 1.160 (-1.3%) | 1.211 → 1.269 (+4.8%) | 1.336 → 1.355 (+1.4%) |
| form/invalid | 1.173 → 1.078 (-8.1%) | 1.118 → 1.173 (+4.9%) | 1.140 → 1.254 (+10.0%) | 1.142 → 1.305 (+14.3%) |
| form/recover | 1.061 → 1.176 (+10.8%) | 1.156 → 1.128 (-2.4%) | 1.203 → 1.314 (+9.2%) | 1.302 → 1.286 (-1.2%) |
| form/unmount | 0.941 → 0.867 (-7.9%) | 0.929 → 0.930 (+0.1%) | 0.986 → 0.928 (-5.9%) | 0.993 → 1.064 (+7.2%) |
| composition/mount | 1.179 → 1.180 (+0.1%) | 1.158 → 1.124 (-2.9%) | 1.215 → 1.159 (-4.6%) | 1.195 → 1.289 (+7.9%) |
| composition/relay | 1.038 → 0.906 (-12.7%) | 0.981 → 1.047 (+6.7%) | 1.014 → 0.954 (-5.9%) | 0.953 → 0.938 (-1.6%) |
| composition/unmount | 0.910 → 0.824 (-9.5%) | 0.874 → 0.894 (+2.3%) | 0.935 → 0.857 (-8.3%) | 0.831 → 0.862 (+3.7%) |
| localized/mount | 1.959 → 1.995 (+1.8%) | 1.893 → 1.928 (+1.8%) | 1.894 → 1.931 (+2.0%) | 1.875 → 1.989 (+6.1%) |
| localized/local-update | 1.090 → 1.150 (+5.5%) | 1.122 → 1.126 (+0.4%) | 1.084 → 1.011 (-6.7%) | 1.303 → 1.147 (-12.0%) |
| localized/unmount | 1.043 → 1.030 (-1.2%) | 0.972 → 0.977 (+0.5%) | 0.965 → 1.042 (+8.0%) | 0.951 → 1.013 (+6.5%) |

| List size/action | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| 100/create | 3.488 → 3.250 (-6.8%) | 3.815 → 3.524 (-7.6%) | 3.196 → 3.347 (+4.7%) | 3.159 → 4.606 (+45.8%) |
| 100/update | 1.352 → 1.544 (+14.2%) | 1.280 → 1.325 (+3.5%) | 1.257 → 1.238 (-1.5%) | 1.321 → 1.297 (-1.8%) |
| 100/select | 1.233 → 1.174 (-4.8%) | 1.049 → 1.113 (+6.1%) | 1.072 → 1.303 (+21.5%) | 1.159 → 1.301 (+12.3%) |
| 100/append | 1.647 → 1.654 (+0.4%) | 1.519 → 1.668 (+9.8%) | 1.511 → 1.480 (-2.1%) | 1.778 → 1.580 (-11.1%) |
| 100/swap | 1.365 → 1.410 (+3.3%) | 1.418 → 1.309 (-7.7%) | 1.327 → 1.358 (+2.3%) | 1.392 → 1.349 (-3.1%) |
| 100/remove | 1.800 → 1.542 (-14.3%) | 1.564 → 1.664 (+6.4%) | 1.379 → 1.499 (+8.7%) | 1.620 → 1.863 (+15.0%) |
| 100/clear | 1.277 → 1.294 (+1.3%) | 1.134 → 1.366 (+20.5%) | 1.137 → 1.062 (-6.6%) | 1.370 → 1.302 (-5.0%) |
| 1000/create | 29.813 → 25.951 (-13.0%) | 25.326 → 20.025 (-20.9%) | 22.240 → 22.227 (-0.1%) | 27.216 → 32.418 (+19.1%) |
| 1000/update | 4.248 → 4.338 (+2.1%) | 3.298 → 3.294 (-0.1%) | 3.778 → 3.331 (-11.8%) | 5.291 → 5.156 (-2.6%) |
| 1000/select | 2.271 → 2.418 (+6.5%) | 2.220 → 1.936 (-12.8%) | 1.994 → 2.084 (+4.5%) | 2.285 → 2.580 (+12.9%) |
| 1000/append | 5.472 → 5.050 (-7.7%) | 4.157 → 4.603 (+10.7%) | 4.633 → 4.148 (-10.5%) | 4.726 → 5.610 (+18.7%) |
| 1000/swap | 2.932 → 3.219 (+9.8%) | 2.412 → 2.459 (+1.9%) | 2.631 → 2.675 (+1.7%) | 2.588 → 3.515 (+35.8%) |
| 1000/remove | 3.361 → 3.554 (+5.7%) | 3.304 → 3.287 (-0.5%) | 3.567 → 3.269 (-8.4%) | 4.566 → 4.632 (+1.4%) |
| 1000/clear | 4.121 → 4.479 (+8.7%) | 3.318 → 3.422 (+3.1%) | 3.986 → 4.072 (+2.2%) | 4.036 → 4.374 (+8.4%) |

Warm CPU remains mixed, including higher medians in localized mount/unmount and
form invalidation in both orders. No cause is assigned to JIT/layout/GC without
evidence. The allocation benefit does not establish faster or CPU-neutral apps.
The branch is retained for the measured guard-construction reduction; these timing
tradeoffs remain relevant when evaluating real applications.

## First import and mount

An independent private adaptation of foreground-ready-v2 compares the two frozen
fixtures using fresh contexts: four workloads × A/A/candidate × AB/BA. Each case
has seven repetitions per label with the initial order reversed on alternate
repetitions. Visibility is checked before navigation, at document initialization,
through transitions and at ready. The window includes navigation, module work and
first mount/ready; it is not an OS-cold browser measurement. DOM schemas match and
each context is unmounted. All CPU and wall observations remain in the report.
Cells below show **thread CPU / wall milliseconds**, then CPU change.

| Workload | A/A AB | A/A BA | Candidate AB | Candidate BA |
|---|---:|---:|---:|---:|
| counter | 17.993/64.2 → 19.069/58.4 (+6.0%) | 18.057/60.4 → 20.969/63.1 (+16.1%) | 21.770/66.4 → 20.627/59.0 (-5.3%) | 20.965/66.7 → 19.531/189.9 (-6.8%) |
| form | 21.921/64.7 → 21.004/64.3 (-4.2%) | 24.482/68.5 → 23.764/65.9 (-2.9%) | 22.730/61.8 → 24.023/66.1 (+5.7%) | 27.075/68.5 → 27.252/77.4 (+0.7%) |
| composition | 22.325/64.0 → 20.993/60.2 (-6.0%) | 21.812/63.2 → 21.535/57.1 (-1.3%) | 21.336/63.8 → 21.617/218.8 (+1.3%) | 20.861/62.4 → 20.081/59.5 (-3.7%) |
| localized | 22.376/57.6 → 21.409/61.2 (-4.3%) | 20.995/62.9 → 22.666/59.1 (+8.0%) | 23.675/67.9 → 24.614/64.1 (+4.0%) | 23.733/62.1 → 20.305/63.5 (-14.4%) |

Startup is also mixed. Candidate counter BA and composition AB include much higher
wall medians despite lower/similar CPU; they are not removed or reclassified as
source-independent delays. The CPU cap and synthetic environment constrain
interpretation, so there is no startup-speed or universal wall-time claim.

## Svelte contrast and scope

Read-only Svelte reference: 5.57.3 at clean commit
0156c5fe38b53b72675e2a7f04535de015fdeed1. VariableDeclaration.js distinguishes
per-instance state creation from static work; for example it hoists static excluded
prop-name arrays while creating state sources from each declaration's initializer.
The useful principle is separating static data from instance state. Elnor's guards
and ELN-INIT diagnostics are its own design: cells remain per instance, and no
Svelte sentinel, AST visitor or runtime implementation is imported. The local
performance-investigation workflow informs directed tests and measurements; its
branch-switching comparison command is not run. Installed React/Svelte controls
and their versions are unchanged; no new cross-framework ranking is established.

## Evidence and limitations

Internal root: elnor/.elnor/mvp/framework-comparison/shared-guards-study.
Builders freeze the private measured compiler and unchanged runtime; raw checked
graphs and served bundles are verified. Allocation and counter diagnostics are
separate from normal CPU timing. Sources-v2 records both measured and final
compiler identities; delivery-proof.mjs checks byte identity and unused imports.
review.py recomputes strict summaries and profile attribution, verifies source
identities, the full gate and phase nonoverlap, and preserves report revisions.

There are 121 audited serial expensive phases: 119 passed and two earlier preparation
attempts failed. The first private baseline could not resolve TypeScript; private
junctions then reused the existing local installation, without installing packages,
and a fresh complete directed cohort passed. The other failure was the invalid
unused-import control described above. Neither failure is counted as a successful
gate or deleted. CPU 10%, commit 768MiB, 24 processes, host-free floor 4GiB and
kill-on-owner-close remain enforced. Browser limits 45s/12s idle; Node 60s/60s.
All owned process trees are empty after cleanup; no guard was relaxed.

The change reduces repeated initialization scaffolding. It does not remove real
cells/effects, change reactivity, solve all mount costs or establish production
readiness. Import-only modules retain bounded guard objects unless a bundler can
remove the unused definitions. Future application measurements must include both
startup and repeated mounting rather than selecting the favorable boundary.

Runtime: `cf122b7f0c52d66aa360b981229f74af36f40740339c4399d5d7a959442821ab`

Baseline compiler: `e9f610d9e18c325c1789246bdd8fddc9af6e9195d340c55a00537dc2d8859ab5`

Measured compiler: `0df904be25353e432607163f0254058e127412832ab68e15292306b40a1b24c2`

Retained compiler: `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95`
