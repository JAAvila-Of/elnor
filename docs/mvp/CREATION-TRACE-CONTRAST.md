# Retained creation traces: Elnor and Svelte

**Analyzed 2026-11-14 from captures recorded on 2026-11-13. No new browser run,
core modification or comparative timing ranking.** This analysis checks existing
post-timing creation traces from the core 610 comparison. It narrows the next
investigation; it does not establish parity, a speedup or exact optimization headroom.

## Sources and method

The retained cohort is `core-refresh-study/run-b8ef7e78b63f438f8b37461fe2410c90`,
list fixture `run-hfalM3`, sandboxed headless Edge 157.0.4341.42, GPU disabled,
accessibility enabled. All four Elnor/Svelte cases (100/1,000 rows, AB/BA) are
included, together with all eight contemporaneous A/A cases. The legacy change
group is explicitly a second A/A group: both labels use the same current fixture.
That is 24 retained traces: 20 Elnor and 4 Svelte, not 24 new timing samples.

Each trace observes one empty-to-full create after the normal seven-round timing
suite, with its own preceding clear. It is not the median of those seven rounds,
and its capture boundaries include driver/engine work. No trace of clear is
present in this subset; conclusions do not transfer to clear or unmount.

The exact historical interval reader is retained. One active renderer is selected
through framework FunctionCall URL and CrRendererMain metadata. Complete events
with CPU-thread tts/tdur clocks enter a union. Overlaps are partitioned once with
priority GC → accessibility → rendering → script-associated → other. Four existing
interval controls pass. An independent merged-interval implementation recomputes
every category on all 24 traces and agrees with the sweep partition. Nested
inclusive durations are never added as separate CPU time.

Script-associated means FunctionCall, v8.callFunction and microtask/checkpoint
coverage after higher-priority categories. It includes native DOM operations and
other callees inside those intervals; it is **not pure JavaScript self time**.
Unclocked complete events cannot independently supply CPU duration and remain
counted separately. Their parents may already cover their time. Captured union
is not a complete application CPU guarantee or user-perceived latency.

## Matched post-timing creation windows

All durations below are CPU-thread milliseconds for the captured union. One
observation per row; no cross-size or cross-framework pooling.

| Rows | Order | Framework | Captured union | GC | Accessibility | Rendering | Script-associated | Other | Unclocked events |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | AB | elnor | 11.624 | 0.000 | 4.827 | 4.695 | 1.214 | 0.888 | 45 |
| 100 | AB | svelte | 13.514 | 0.371 | 6.854 | 4.518 | 0.935 | 0.836 | 108 |
| 100 | BA | elnor | 9.332 | 0.000 | 4.934 | 2.482 | 1.104 | 0.812 | 147 |
| 100 | BA | svelte | 8.742 | 0.362 | 4.105 | 2.567 | 0.924 | 0.784 | 151 |
| 1000 | AB | elnor | 110.105 | 4.396 | 61.798 | 30.544 | 10.422 | 2.945 | 916 |
| 1000 | AB | svelte | 109.573 | 4.636 | 64.299 | 32.641 | 6.717 | 1.280 | 930 |
| 1000 | BA | elnor | 107.808 | 4.445 | 62.960 | 28.385 | 9.762 | 2.256 | 1117 |
| 1000 | BA | svelte | 106.419 | 4.869 | 64.748 | 27.783 | 6.285 | 2.734 | 1113 |

Differences below are Elnor minus Svelte within each retained pair; positive
means more covered CPU in that category, not an attributed source-code cause.

| Rows | Order | Union difference | GC difference | Accessibility difference | Rendering difference | Script-associated difference | Other difference |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | AB | -1.890 | -0.371 | -2.027 | 0.177 | 0.279 | 0.052 |
| 100 | BA | 0.590 | -0.362 | 0.829 | -0.085 | 0.180 | 0.028 |
| 1000 | AB | 0.532 | -0.240 | -2.501 | -2.097 | 3.705 | 1.665 |
| 1000 | BA | 1.389 | -0.424 | -1.788 | 0.602 | 3.477 | -0.478 |

At 1,000 rows, accessibility plus rendering covers 83.9–88.5%
of these captured unions. This is a distribution within instrumented windows,
not the share of normal benchmark CPU or a reason to disable accessibility.
Elnor's script-associated coverage is higher by 3.705/3.477 ms in AB/BA, while its
total union is only 0.532/1.389 ms higher because categories offset each other.
This is a useful repeated signal to investigate, not a scheduler self-time result.

## Contemporaneous A/A variation

Differences below are B minus A; both labels have identical Elnor sources.

| Control | Rows | Order | Captured-union difference | Script-associated difference |
| --- | --- | --- | --- | --- |
| aa | 100 | AB | -0.161 | 0.239 |
| aa | 100 | BA | 0.130 | 0.090 |
| aa | 1000 | AB | -19.247 | -0.952 |
| aa | 1000 | BA | 4.558 | -1.855 |
| change | 100 | AB | -0.438 | -0.022 |
| change | 100 | BA | -0.191 | 0.186 |
| change | 1000 | AB | 1.326 | -1.201 |
| change | 1000 | BA | 1.579 | 0.427 |

At 1,000 rows, the largest absolute A/A union difference is 19.247ms,
larger than the total differences in the Svelte pairs. A single diagnostic trace
cannot replace the normal paired distributions, establish a stable total ranking
or justify treating small category differences as exact available savings.

## Source inspection and next hypothesis

Retained Elnor FunctionCall G points to the minified queue-drain body: it consumes
pending effects and invokes r.run(). Its inclusive coverage is 10.115/9.477 ms in
the 1,000-row Svelte pairs. Svelte's corresponding recorded microtask callback
enters its batch drain, with framework-call unions 6.340/5.933 ms. Those unions
overlap other categories and must not be added to the table. These are inclusive
entry points into row construction, binding and native DOM work, not a measurement
of queue bookkeeping alone. Exact bundle hashes, raw positions and source excerpts
are retained in source-contexts.json; no source-map attribution is invented.

The current evidence does not support another pending-Set/array micro-optimization,
an inference that GC is the whole gap, or a Rust rewrite as a measured remedy.
Recent emitter/context reductions already showed that fewer expressions are not
enough to demonstrate global CPU improvement. Existing compiled-tree cloning and
direct-getter specialization were also reviewed; their rejected measurements are
not revived merely by this diagnostic signal.

A distinct, untested next hypothesis is the internal component prop adaptation:
createComponentRoot/renderComponent currently allocate a props object, enumerate
reader entries and install live getters before building each child. Unlike the
earlier direct-getter specialization, an internal reader-oriented calling path
could remove that adapter rather than recreate its descriptors. This requires a
separate proof and prototype, including ordinary public-entry fallback, live
reactivity, read order, cancellation, property descriptors where observable, and
the receiver of a function-valued prop invoked directly. The trace does not
attribute a cost to Object.defineProperty or prove this change will be faster.
No such optimization is implemented or adopted here.

## Verification and limits

This turn launches one bounded **offline Python analysis**, not a browser or
Rust build. Its limits remain CPU 10%, commit 768 MiB, 24 processes, host free >=4 GiB,
60 seconds wall/idle, kill-on-owner-close and zero owned descendants on completion.
The original twelve browser phase supervisors, all raw result hashes, recorded
source revisions, fixture files, dependency lock and matched DOM schemas were
checked. The historical full 610-test gate is not rerun; public sources are unchanged.

The core performance target remains open. The normal timing comparison and broad
application matrix remain in CURRENT-CORE-COMPARISON.md; this diagnostic neither
replaces them nor establishes parity beyond these synthetic cases.

Compiler: `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95`

Runtime: `ae44708c9ab1b30e1818011e102f5f0a138220f161fe0a5fab232614c9a91b01`

Evidence: `trace-contrast-study/run-b062fc5b14f14437ae903a7bb9a27f9e`. Exact report revision and audit
are retained with `verification.json`.
