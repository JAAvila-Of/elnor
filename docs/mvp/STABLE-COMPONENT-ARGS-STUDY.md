# Stable component arguments: compiler-only experiment

**Not adopted.** Fewer source constructions did not establish a consistent broad
CPU improvement. The production compiler/runtime and Surface syntax are unchanged.
This experiment supplies no new parity claim against Svelte or React.

The private compiler uses imported-child facts to share invariant handler and
empty-slot arguments within one parent mount. Sharing is skipped for handlers
depending on loop locals, slots/content, omitted declared events, escaped source,
or child render-context observations. Standalone generation without graph facts
keeps the original output. Live prop readers, native listeners, state, ownership,
rollback and cleanup retain their existing paths. No user annotation is required.

Each variant passes 17 new and 168 existing controls (185). A separate generated
code counter covers display/editable children at 0, 1, 8, 64, 256 and 1,000 instances.
At 1,000, handler/slots objects plus parent handler functions decrease from 3,000
source constructions to 3. At zero, they increase from 0 to 3. These counts are
neither engine allocation bytes nor CPU measurements. Four existing application
graphs compile byte-identically between variants when given identical input paths.

The widened scale cohort completes 48 browser cases, crossing both shapes and all
six sizes with A/A controls and AB/BA candidate orders. Explicit GC runs after
reference release and verification, outside CPU windows. These isolated lifetimes
must remain separate from ordinary-GC measurements. At 1,000 display children,
mount CPU changes by +11.9%/-7.9% in the two orders; editable mount changes by
+0.2%/-2.9%. A/A variation is substantial. The separate ordinary-GC list cohort
covers seven actions at 100/1,000; creation at 1,000 changes by -15.6%/+3.0%.
Descriptive medians do not demonstrate a reliable broad gain or statistical parity.

The ordinary-GC application matrix also completes all 16 cases across counter,
form, composition and localized updates, including A/A and reversed candidate
orders. All 64 lifecycle cycles restore native node/listener counters to baseline.
That supplies behavior and lifecycle evidence, not a consistent CPU gain. The
audit covers 160 serial bounded Jobs: 158 pass, the two failures described below
remain retained, and every Job has zero owned processes after cleanup.

The first scale fixture build failed on a runtime-path error. The corrected V1
completed 44 cases before a baseline A/A editable-1,000 case hit its progress
timeout near the Job commit ceiling; three cases remained unexecuted. Exact
allocation failure was not established. V2 releases validation references and
collects garbage outside timing, using the same frozen bundles and limits. V1 and
V2 remain separate; failed runs are retained. Resource limits were not expanded.

The read-only Svelte reference is commit
0156c5fe38b53b72675e2a7f04535de015fdeed1 (5.57.3), compiler
`phases/3-transform/client/visitors/shared/events.js`. Its use of binding and
expression facts to choose direct handlers, memoization or wrappers informs the
principle, while Elnor's argument contract is a separate design.

The useful next hypothesis is to eliminate provably unused component work, with
profiles and behavior proofs, rather than treat a lower object count as a speedup.
Any such hypothesis requires a separate candidate and broad validation before
integration. No Rust migration or architecture replacement follows from this result.

Private evidence lives in `stable-component-args-study`: final controls
`controls-175654640f894e1caf57aa720a613f63`, existing controls
`existing-89143c62864243f89e70588c44492e1b`, counts
`counts-a171aeca8e854fc595ff93f728609c59`, scale V2
`scale-v2-45eb351aa82543239c39f122dd3705d1`, and ordinary-GC trial
`trial-1993bab21b9e409c932770632647f8e3`. These identifiers locate retained internal
evidence; they are not public artifact links. This directed candidate validation
does not replace the full production release gate.

The sealed internal report is
`review-2714db1d9d7e4858b7592e92fa2030fc/report.md`, with separate CPU tables,
source/producer hashes, resource-limit checks and retained failure provenance.
