# Current creation traces and whole-tree cloning feasibility

**No core change integrated.** Current-source traces still put most captured
1,000-row creation CPU in rendering stages. A separate native feasibility probe
finds a useful repeated-form signal, but no general row-creation improvement and
an uncached single-form cost. A callback control also shows why eagerly cloning
a whole tree cannot replace the current public construction path transparently.

## Current-source trace budget

The frozen normal fixture is run-MLugkN, using the retained runtime/compiler after
shared initialization guards. Four fresh owned browser cases cover 100/1000 rows
twice, reversing size order on the second repetition. The unchanged trace mode
warms twice, then captures create and clear once with threadTicks. Tracing remains
separate from normal timing and is not used to create a new framework ranking.

The existing interval analyzer checks four synthetic interval controls and assigns
each covered renderer CPU interval once. Priority is GC, accessibility, rendering,
script-associated and other. Nested/inclusive intervals are not summed as separate
work. Unclocked events remain counted but cannot independently supply CPU time.
Script-associated intervals include native DOM calls and driver/engine work;
they are not pure JavaScript or savings available from a language rewrite.

| Rows | Repetition | Action | GC ms | Accessibility ms | Rendering ms | Script-associated ms | Other ms | Captured union ms |
|---:|---:|---|---:|---:|---:|---:|---:|---:|
| 100 | 0 | create | 0.000 | 0.006 | 4.390 | 1.573 | 0.942 | 6.911 |
| 100 | 0 | clear | 0.000 | 0.003 | 0.331 | 0.690 | 0.747 | 1.771 |
| 1000 | 0 | create | 0.698 | 0.006 | 25.622 | 8.331 | 0.821 | 35.478 |
| 1000 | 0 | clear | 0.000 | 0.004 | 0.726 | 5.470 | 1.294 | 7.494 |
| 1000 | 1 | create | 0.735 | 0.002 | 20.237 | 6.999 | 0.763 | 28.736 |
| 1000 | 1 | clear | 0.561 | 0.005 | 0.489 | 3.874 | 0.879 | 5.808 |
| 100 | 1 | create | 0.535 | 0.004 | 4.405 | 1.789 | 1.080 | 7.813 |
| 100 | 1 | clear | 0.000 | 0.003 | 0.467 | 0.649 | 0.736 | 1.855 |

At 1,000 rows, rendering is about 70–72% of the captured union and script-associated
work about 23–24%. This supports examining DOM construction alongside rendering,
but identifies no single helper as the cause. Trace boundaries and instrumentation
mean these totals must not be pooled with normal benchmark medians or treated as
the whole application's precise cost distribution. The two 100-row captures are
shown separately; their distribution is not forced into the same percentages.

## Isolated native construction strategies

The probe compares two ways to construct a complete static skeleton:

- manual: createElement/createTextNode, static attributes and append operations;
- clone: lazily build the same skeleton programmatically, then cloneNode(true)
  and locate its dynamic node references.

It parses no HTML strings and changes no production CSP, compiler or runtime.
Unlike the earlier rejected per-node cloning trials, this clones one whole tree.
The row has a button and small caption; the form has six labeled text inputs and
two derived outputs. Forms intentionally omit the real benchmark's conditional
error branch. Counts are 100/1000 rows and 1/24 forms. Both strategies use the same
retained cells, effects, computed values and native listener binding code.

This is **not generated Elnor application code**. Both synthetic strategies build
the skeleton before binding, whereas public helpers normally interleave creation,
registration and reads. No repeat reconciliation or component-prop installation
is timed. A synthetic host and its layout differ from the real list application.
Consequently a probe result is not an Elnor, Svelte or React speedup claim.

Each case has two isolated pages and one sandboxed headless Edge 157.0.4341.42.
There are two warmup rounds and seven measured rounds per label, alternating page
order. A/A uses manual construction on both pages. The clone comparison uses
manual A and clone B. Metric capture includes construction, data/owner creation,
bindings, root placement, two animation frames and a height read. Oracles and
interaction checks run afterward. Values below are renderer ThreadTime medians.
No samples are removed, and A/A is descriptive rather than an acceptance margin.

Cached cases reuse the skeleton across mounts. Uncached cases drop it before
each run, so first prototype construction is included each time. These cases
still use warmed code and browser contexts: they are not OS/page/network startup.

## Corrected authoritative cohort

An exploratory 32-case cohort serialized a pristine-schema signature inside first
clone creation. That added diagnostic work to uncached clone intervals. All of
that output remains preserved, but those timings are not used for the decision.
The corrected 32-case cohort creates the independent pristine-schema oracle once,
outside all measurements, in both modes. It also checks live input values when
validating prototype integrity. The cohorts are not pooled or selectively mixed.

| Shape/count | Cache | A/A AB | A/A BA | Clone AB | Clone BA |
|---|---|---:|---:|---:|---:|
| row/100 | cached | 3.587 → 3.885 (+8.3%) | 4.266 → 3.984 (-6.6%) | 3.691 → 3.622 (-1.9%) | 3.829 → 3.944 (+3.0%) |
| row/100 | uncached | 3.855 → 3.830 (-0.6%) | 4.064 → 4.485 (+10.4%) | 3.734 → 3.890 (+4.2%) | 3.963 → 4.174 (+5.3%) |
| row/1000 | cached | 27.650 → 27.996 (+1.3%) | 24.933 → 26.128 (+4.8%) | 25.911 → 24.794 (-4.3%) | 24.812 → 25.756 (+3.8%) |
| row/1000 | uncached | 25.887 → 23.819 (-8.0%) | 25.713 → 26.726 (+3.9%) | 27.576 → 24.376 (-11.6%) | 26.307 → 26.042 (-1.0%) |
| form/1 | cached | 1.404 → 1.348 (-4.0%) | 1.454 → 1.402 (-3.6%) | 1.305 → 1.287 (-1.4%) | 1.331 → 1.305 (-2.0%) |
| form/1 | uncached | 1.286 → 1.391 (+8.2%) | 1.354 → 1.340 (-1.0%) | 1.367 → 1.486 (+8.7%) | 1.390 → 1.518 (+9.2%) |
| form/24 | cached | 6.632 → 6.592 (-0.6%) | 6.200 → 6.240 (+0.6%) | 6.835 → 6.190 (-9.4%) | 6.833 → 6.113 (-10.5%) |
| form/24 | uncached | 6.675 → 6.161 (-7.7%) | 6.878 → 6.596 (-4.1%) | 7.292 → 5.871 (-19.5%) | 6.011 → 6.547 (+8.9%) |

Cached 24-form creation is lower by about 9–10% in both orders, with A/A near zero
in those pairs. Cached row cases change sign; the 1000-row uncached observation
also varies in magnitude across orders. A single uncached form is higher by about
9% in both orders. These are descriptive paired medians, without significance
or a general decision threshold. The repeated-form signal warrants an eligibility
study, not automatic adoption or a universal average across unlike workloads.

Every measured run checks equal light-DOM schemas, distinct node identities,
initial data/input values, reactive clicks or input/derived updates, disposal of
retained listeners and an unchanged prototype. The prototype has no bound effects
or listeners. No exact heap saving or absence-of-leaks claim is made: cached trees
also retain DOM until their cache is released. Cross-document behavior, namespace
handling, hydration, arbitrary custom elements and full compiler compatibility
were not established by this probe.

## Observable construction order

A separate control uses the unmodified public text/effect runtime and a foreign
owner. The owner inspects how many children exist at registration and immediately
cancels when it sees more than one. The staged path sees child counts [1,2], reads
only A and displays A. An eagerly cloned two-span tree sees [2,2], cancels both
reads and displays nothing. The expected result is **inequivalence**, not a passing
replacement test. This control deliberately demonstrates an API boundary.

An optimization would need an explicit proof that its internal entry cannot
observe this difference, or preserve staged behavior. Potential internal detached
roots with native ownership require a separate design; this report does not prove
that all such entries are safe. The existing mount/renderOwned/text/button paths
remain unchanged, and no new public flag or grammar is introduced.

## Svelte contrast

Read-only reference: Svelte 5.57.3 at clean commit
0156c5fe38b53b72675e2a7f04535de015fdeed1. Its from_html factory lazily prepares a
tree and clones it, with importNode, namespaces, hydration and effect-node lifetime
handling for its own model. Elnor's probe borrows only the question of reusing an
entire static structure. It constructs that structure through ordinary DOM APIs,
keeps independent Elnor effects/native listeners and imports no Svelte code.
Svelte's ownership/hydration contracts are not assumed to match Elnor's public
foreign-owner behavior. The reference checkout and installed dependencies remain
unchanged; no Svelte benchmarks or branch-switching commands were run.

## Evidence and retained state

Internal root: elnor/.elnor/mvp/framework-comparison/tree-clone-study.
profile.py preserves four current-source trace cases; analyze-profiles.py uses the
retained disjoint-interval analyzer. run.py and run-v2.py preserve independent
32-case exploratory/corrected cohorts. observability.mjs records the incompatibility
control. summarize.py verifies all normal observations, and review.py recomputes
summaries, trace classification, source identities and supervisor limits.

All 69 supervised phases passed their stated controls and ran serially: four trace
cases, 64 feasibility cases and one observability control. This does not convert
the exploratory timing issue or expected incompatibility into equivalence. CPU 10%,
commit 768MiB, 24 processes, host-free minimum 4GiB and kill-on-owner-close remain
enforced. Browser limits 45s/12s idle; the Node control uses 60s/60s. Traces are capped
at 8MiB per action; GPU stays disabled and accessibility stays enabled.

Production runtime/compiler and public tests are unchanged. The prior complete
588-test plus check/build gate still applies to these exact sources and was not
rerun for this isolated study. No new cross-framework ranking, core speedup,
production-readiness result or release is established. Pending work is to prove
eligibility for any internal static-tree path before evaluating a real compiler
change across first mount, repeated mount and the full application matrix.

Runtime: `cf122b7f0c52d66aa360b981229f74af36f40740339c4399d5d7a959442821ab`

Compiler: `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95`
