# Region event candidate: fresh React and Svelte comparison

The event candidate expands real region selection to the keyed list, but does
not establish a global speed improvement. Creating and clearing 1,000 rows are
materially slower than both counterparts in this cohort. The candidate remains
private; public core sources are unchanged.

The sealed study is `event-comparison/run-2587e09511ad41868058fdf1a86f602a`
under the internal framework-comparison directory. It uses the reviewed event
revision `review-component-events-79ef4591c62045aaac4a1849a99c37fa` and the
original application sources. React 19.3.1, Svelte 5.57.3, esbuild 0.28.2 and
Edge 157.0.4341.42 match the pinned tools recorded by the run.

Each cell is **Elnor / counterpart**, in renderer main-thread CPU milliseconds.
Seven samples per label and initial order are summarized separately, then the
two AB/BA medians are averaged. Independent React and Svelte pairs give Elnor
different values. These are descriptive measurements, not input latency or FPS.

| Workload | Action | Elnor / React | Elnor / Svelte |
| --- | --- | ---: | ---: |
| Counter | Increment | 0.881 / 1.058 | 0.889 / 0.953 |
| Form | Edit all | 1.229 / 1.375 | 1.224 / 1.256 |
| Composition | Relay | 0.896 / 1.104 | 0.922 / 0.990 |
| Localized panels | Local update | 1.022 / 1.179 | 1.074 / 1.108 |
| 100 rows | Create | 4.111 / 3.294 | 3.919 / 3.233 |
| 100 rows | Update | 1.389 / 1.602 | 1.388 / 1.454 |
| 100 rows | Clear | 1.560 / 1.420 | 1.559 / 1.293 |
| 1,000 rows | Create | 26.433 / 22.927 | 26.180 / 17.525 |
| 1,000 rows | Update | 3.823 / 4.051 | 3.956 / 3.414 |
| 1,000 rows | Select | 2.356 / 2.677 | 2.254 / 2.020 |
| 1,000 rows | Append | 5.133 / 4.654 | 5.506 / 4.246 |
| 1,000 rows | Swap | 2.858 / 19.251 | 2.900 / 2.494 |
| 1,000 rows | Remove | 3.513 / 4.147 | 3.603 / 3.229 |
| 1,000 rows | Clear | 5.792 / 3.866 | 5.374 / 2.880 |

The complete internal `COMPARISON.md` and `comparison.json` retain all 29 action
rows, per-order observations, AA controls and delivery values. Elnor uses regions
for counter, form, localized panels and both list sizes. Composition retains
the general renderer because its Card uses slots. Neither application code nor
Surface syntax was changed to force selection.

The keyed application entry is 9,312 bytes gzip-9, compared with 69,744 for React
and 19,647 for Svelte. This includes framework/application code and excludes the
shared driver and CSS. It is larger than Elnor's public general-renderer entry;
being smaller than competitors does not settle the private backend's delivery
cost or establish a startup improvement.

Validation passed five checked builds, six cross-framework preflights, 36 paired
browser cases and 87 correctness checks, with 2,436 measured samples. The 47
Windows Jobs ran serially with verified CPU 10%, aggregate commit 768 MiB,
24-process maximum, 4 GiB host-free floor and kill-on-owner-close. All finished
with zero remaining owned processes. Node heap 192 MiB, build wall/idle 60/60
seconds, browser 45/12 seconds, headless mode, sandbox and CSP remained intact.
The complete evidence seal covers 527 files.

There is no significance test or established parity margin. Small differences
must be read with the retained AA variation. Differences from the older v17
cohort cannot isolate a causal core improvement: this is a fresh cohort with a
different backend selection. The next investigation should compare creation and
cleanup costs in both Elnor renderers and the local Svelte implementation across
both list sizes, while retaining the wider matrix and Surface behavior.
