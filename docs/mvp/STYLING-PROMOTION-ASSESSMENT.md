# Styling candidate: promotion assessment

Historical snapshot: 2026-11-16. The later
[integration report](TYPED-DOM-CLASSES.md) records the completed native gate,
current 650-test public suite and experimental promotion. Native failures and
the older source/timing evidence below remain historical records.

Snapshot: 2026-11-16. This evaluates the second
[typed-class prototype](STYLING-ELEMENT-PROTOTYPE.md) plus conditional class
capability emission. The public source remains unchanged. Full Node correctness,
bundle comparison and a new class-specific CPU screen have completed; native
editor completion is still a promotion gate.

## Complete Node coverage

`full-913bd21cead24d849dacff7cade40d9b` under
`elnor/.elnor/mvp/style-classes/` passes check, build and all 57 test files:
**649 passed, zero failed, cancelled or skipped**. This covers all 55 current
public test files and the two prototype files. Files run serially, each in its
own bounded Windows Job. Input hashes and the public source baseline are
verified after the gate. The 21 feature cases are included, not added again.

## Delivery and unused-feature cost

An initial screen found 0–100 added gzip bytes in applications without the new
class syntax. The candidate now selects additional class handling only for
plans that require dynamic classes or styled sequential inputs. It also avoids
adding class-helper imports to components without class expressions. This uses
the existing capability-pruning architecture; it does not create another style
engine or scheduler.

The same nine original workload source graphs are built with the public baseline
and candidate in the same comparison workspace, with identical production
esbuild options. Final result: `cost-3d53c260f55f49faa890ced726e9d21a`.

| Workload | Baseline gzip bytes | Candidate gzip bytes | Delta |
| --- | ---: | ---: | ---: |
| Counter | 3025 | 3023 | -2 |
| Form | 6534 | 6533 | -1 |
| Composition | 2272 | 2273 | +1 |
| Localized | 5041 | 5041 | 0 |
| Keyed | 10910 | 10909 | -1 |
| Wide form | 15921 | 15922 | +1 |
| Deep composition | 2468 | 2468 | 0 |
| Wide localized | 19761 | 19761 | 0 |
| Lifecycle | 7097 | 7098 | +1 |

The byte differences are not a speed improvement. A bound-identifier structural
comparison passes for all nine bundles in
`proof-1f08fc26c5624fb08975b8800c2072bb`. It preserves AST structure, global
identifiers, property/export names and literal values, normalizing local bound
names. The normalized programs are never executed. This explains the tiny
minifier/compression differences; it does not provide new numerical CPU results
for the historical matrix. Unbundled preview modules still contain exports and
capability code; the table describes bundled production output only.

## New class-workload CPU screen

Four new common programs exercise one styled element, 96 styled fields,
32 styled child components and 1,000 styled keyed rows. Each has mount, change
and unmount operations. All four correctness preflights match DOM element
structure, class strings, input values and nonempty text against Svelte. Both
applications must fully unmount. Empty text anchors and comments are excluded;
the first failed preflight retained the raw schemas proving Svelte's extra
empty text anchor before that normalization was introduced.

Run: `timing-c54eaf8218694a8ba61adeb1c5ae8b6b`. Svelte 5.57.3, esbuild 0.28.2,
sandboxed headless Edge 157.0.4341.42. Each comparison uses two warmups and seven
retained samples per side, A/A controls and both AB/BA orders in fresh browser
jobs. CPU is renderer `TaskDuration` with `threadTicks` over the common
action/frame window; it is not wall latency, FPS or cold startup.

| Scenario | Action | AB Elnor/Svelte ms | AB ratio | BA Elnor/Svelte ms | BA ratio | AA ratio |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Single | Mount | 0.968/0.962 | 1.006 | 0.970/1.075 | 0.902 | 1.013 |
| Single | Change | 0.793/0.823 | 0.964 | 0.840/0.884 | 0.950 | 0.930 |
| Single | Unmount | 0.797/0.741 | 1.076 | 0.778/0.833 | 0.934 | 0.994 |
| Form 96 | Mount | 3.976/3.569 | 1.114 | 4.127/3.965 | 1.041 | 1.044 |
| Form 96 | Change | 2.059/1.979 | 1.040 | 1.963/2.071 | 0.948 | 0.995 |
| Form 96 | Unmount | 1.103/0.988 | 1.116 | 1.033/1.098 | 0.941 | 1.066 |
| Composition 32 | Mount | 1.426/1.406 | 1.014 | 1.383/1.476 | 0.937 | 1.084 |
| Composition 32 | Change | 1.168/1.032 | 1.132 | 1.035/1.043 | 0.992 | 1.041 |
| Composition 32 | Unmount | 0.864/0.806 | 1.072 | 0.815/0.827 | 0.985 | 0.986 |
| Rows 1000 | Mount | 20.592/20.593 | 1.000 | 19.375/20.768 | 0.933 | 1.170 |
| Rows 1000 | Change | 7.414/11.584 | 0.640 | 10.654/11.422 | 0.933 | 0.806 |
| Rows 1000 | Unmount | 3.226/2.691 | 1.199 | 3.117/2.916 | 1.069 | 1.164 |

Ratios below 1 favor Elnor. The screen is encouraging but order-sensitive:
8/12 AB phases and 12/12 BA phases are within a 10% Svelte margin. The rows A/A
ratios range from 0.806 to 1.170; do not subtract this noise, drop inconvenient
phases or infer a stable advantage from the largest speed ratio. This is one
descriptive class screen, not a replacement for the accepted broad matrix,
statistical equivalence or updated React evidence.

## Browser, security and remaining gate

`browser-3372f798f11f43d1bbbb13bfef21113f` rebuilds both project routes from
the capability-selected candidate and passes the targeted focus, draft, node
identity, class-write, child-event and external CSS checks. There are no observed
page errors or CSP violations, and markup-like class text is not interpreted
as HTML. This is bounded evidence, not a general security audit.

Windows jobs retain CPU 10%, aggregate commit 768 MiB, Node heap 192 MiB,
24 processes, 4 GiB host-free floor, offline 60/60s and browser 45/12s limits.
The native editor is attempted only in Xvfb inside the already installed Linux
image, with no installs, network or desktop windows. Its owned container also
has explicit memory/CPU/PID limits; the Linux PID ceiling includes threads and
is therefore stricter than a Windows process count. Workspace Trust is never
disabled or granted by the harness.

The native attempts did not complete within 60 seconds and supplied no passing
editor report. Their owned containers were removed. The diagnostic run
`native-a0405ebb784640f28d44b71b284f364e` showed only Xvfb and its launcher;
the adapter had omitted the original launcher's `--init`. Restoring it allowed
Node and VS Code to start in
`native-59a65d909e874ee0acd05c1ddea55976`. That run reached exactly 24 Linux
tasks across eight processes, with 75 MiB container memory and no OOM event,
before any native host report appeared. Thus the thread-inclusive PID ceiling
was saturated; this is not evidence of a compiler failure or completed editor
validation. The safe native isolation profile needs an equivalent process/thread
contract before this candidate can be promoted. No CPU/memory ceiling was raised.
The initial container-create attempt also rejected an overprecise CPU decimal;
the quota representation was corrected without increasing the percentage.

Human authoring acceptance, Tailwind extraction/build/watch, StyleX, npm package
resolution and production readiness remain outside this result. Keep the
candidate isolated until the remaining promotion evidence is complete.

Retained same-source review:
`review-93ea327c11ef4479a6accd9c0b2bc74f/audit.json`, under the same internal
directory. It verifies the complete Node gate, final delivery study, structural
proof, class CPU screen and browser gate against the archived candidate source.
The unsuccessful native attempts remain separate failures, not acceptance
evidence. No public promotion is recorded.
