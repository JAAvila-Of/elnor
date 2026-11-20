# Constant-prop caption specialization

**Private candidate; not integrated. No broad CPU improvement or new React/Svelte ranking established.**

The compiler creates an internal renderer module per child and proven constant-prop-name set. Only primitive literal call-site values and direct caption identifiers qualify. Values are still read through the original generated prop getter; adapters, native listeners, scopes, state and scheduling are unchanged. The public child module and five-argument renderOwned entry remain dynamic. Internal variants export no mount. There are no runtime flags per binding or user annotations, and no transitive constant propagation.

Unknown props, calls, expressions, opaque child context (this/arguments/eval or escaped source) and shadowing retain the original path. Variants with the same child/name set are shared; different name sets are separate. These are conservative restrictions, not a claim of complete constant analysis.

## Work eliminated and validation

| Application | Baseline Set constructions | Candidate Set constructions |
|---|---:|---:|
| counter | 2 | 2 |
| form | 19 | 19 |
| composition | 4 | 3 |
| localized | 72 | 48 |

Counts use a separate test-only Set-constructor observer in fake DOM, covering cell subscriber and effect dependency Sets during mount. The 24/1 reductions correspond to eliminated initial caption effects. They do not measure engine allocation bytes or CPU. Runtime source is byte-identical. Each variant passes 16 directed tests; the candidate also passes 182 existing tests across ten files, with no existing assertion changed. Directed controls cover mixed static/dynamic use, live public mounts, distinct/shared constant-name sets, loop-variable shadowing, action reads, rollback, listener lifetime and one shared ordinary imported module instance.

## Separate CPU observations

ThreadTime changes are ratios of seven-sample medians; negative means lower candidate CPU. Each row retains AB/BA and two fresh-browser repetitions.

| Action | Repetition 1 AB / BA | Repetition 2 AB / BA |
|---|---:|---:|
| localized mount | -4.1% / -5.4% | -2.5% / -2.1% |
| localized local-update | +0.9% / +7.9% | -6.3% / +3.1% |
| localized unmount | +2.9% / +6.2% | +5.5% / +5.0% |
| composition mount | -0.4% / +3.7% | +3.9% / +7.8% |
| composition relay | -6.2% / -2.4% | -2.2% / +3.6% |
| composition unmount | +1.7% / +3.9% | -3.8% / +0.2% |

Localized mounting has lower medians in all four comparisons, but localized unmounting has higher medians in all four. Composition mounting is mixed, with three higher medians. Contemporary A/A controls vary substantially (localized mount reaches +17.4% in one order); repetition and directional agreement do not by themselves establish a code-caused effect. No significance, equivalence margin, noise subtraction or causal cleanup/GC explanation is asserted. Eliminating effects is proven; a broad CPU benefit is not.

The 32-case plan was shuffled with seed 20261115 and frozen before execution. Two warmups and seven samples per label, original normal scheduling/frame windows, sandboxed headless Edge with GPU disabled and accessibility behavior unchanged. All 1,680 timed windows pass original state/identity and equal-schema checks. 128 post-timing lifecycle cycles restore DOM/listener counts. Explicit GC is confined to those separate post-timing observations. No browser timing is run in parallel.

Fresh baseline/candidate bundles for counter and form are byte-identical, so their descriptive timing differences cannot be caused by different application bundle bytes. No list speedup is claimed or measured. This study does not replace the historical public 610-test/check/build gate or establish release readiness.

## Delivery cost

| Bundle | Raw bytes baseline / candidate | Gzip baseline / candidate | Brotli baseline / candidate |
|---|---:|---:|---:|
| composition | 4973 / 4969 | 1877 / 1875 | 1654 / 1651 |
| localized | 4547 / 4543 | 1727 / 1728 | 1500 / 1509 |

The compiler emits an additional internal module for each qualified child/name set. Public and specialized bodies can coexist; generated-module delivery, unbundled startup and compilation/DX cost have not been established as improved. These tradeoffs remain part of any future promotion decision.

## Outcome and provenance

Keep this version private. The work reduction and localized mount direction justify further mechanism investigation, but the lifecycle tradeoff and A/A variation do not justify integration or a claim of approaching global parity by this change. Do not infer that fewer Sets alone imply lower CPU.

One fixture-builder attempt failed because its observer treated manifest file records as strings. The failure and producer are retained; the corrected builder reads each record.file. Corrected directed suites fail as expected before the candidate and pass behavior/candidate modes. All raw supervisor verdicts remain unchanged.

Across retained attempts: 50 serial Windows Jobs, 47 passes, 2 expected red-before results and 1 corrected fixture-harness failure. Every Job enforces CPU10%, commit768MiB, 24 processes, host-free4GiB, kill-on-owner-close and wall/idle45/12 seconds for browsers or60/60 offline. All cleanups leave zero owned processes.

Read-only Svelte reference: commit 0156c5fe38b53b72675e2a7f04535de015fdeed1, compiler shared/utils.js and shared/component.js. Their known-expression/reactive metadata distinction informs the investigation. The private Elnor internal-module specialization is its own design; no Svelte implementation was copied, changed or executed.

Public compiler/runtime remain 70abd192/ae44708c. Candidate compiler: eb255d3b608d13272bd57b69574d1dfb4ba0e158f27dbf374b77a7c81ebbfafa. Surface and public src/tests/dist are unchanged.

Private evidence: `constant-prop-caption-study/screen-c213a4794b24491a81dd0deb6e04a633/review`, directed `tests-9ac0ff758bbe48d781c828f9728aa891`, existing `existing-3c3bd5a8353a4a65a179b97adbc58d78`, final `constant-prop-caption-study/review`. Full CPU cells, paired-round differences and descriptive leave-one-round-out ranges (not confidence intervals) are retained.
