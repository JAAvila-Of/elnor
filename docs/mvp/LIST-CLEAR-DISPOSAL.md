# Allocation-free disposal

After the [prototype runtime records](PROTOTYPE-RUNTIME-RECORDS.md), clearing
1,000 keyed rows was the only phase outside the 10% Svelte margin in both
cohorts. This change removes the garbage that disposal created, without
changing which cleanups run or in what order.

## Cause

A CPU profile of keyed1000 clear, in the same headless Edge and Windows Job
limits as the matrix, found that removing the DOM nodes costs the same in both
frameworks: about 1.5 ms for Elnor's `replaceChildren` and for Svelte's
`clear_text_content`. The difference, about 0.65 ms of JavaScript, was in
disposing each row. Allocation sampling found 293 KB per clear for Elnor and
196 KB for Svelte, from:

- `cleanAll` creating an error array on every call, even with no failure;
- `for...of` loops over sets and maps creating an iterator result per step;
- `Set.prototype.clear`, which allocates a new table in V8, once per stopped
  reaction.

## Change

- `cleanAll` creates its error array only when a callback fails. It still
  calls each callback without a receiver; the existing receiver test caught a
  first version that called them through the array.
- A stopped reaction removes itself from each subscriber set through
  `Set.prototype.forEach` with one shared callback. It then points at one
  shared empty set instead of clearing its own. A stopped reaction never runs
  again and cells skip disposed readers, so nothing is ever added to that set.
- A reaction skips removing itself from the pending set when that set is
  empty, which is the usual case while a list clears.
- Clear eligibility and bulk disposal iterate rows with `Map.prototype.forEach`.

Reactions still unsubscribe from every cell, because a row may read parent
state. Sampled allocation per clear dropped to 72 KB.

## Measurements

The paired list study compares this runtime with the previous one:

| Phase | Before ms | After ms | Change | Svelte ms |
| --- | ---: | ---: | ---: | ---: |
| 1,000 clear | 3.557 | 2.769 | −22.2% | 2.684 |
| 1,000 remove | 3.904 | 2.913 | −25.4% | 3.460 |
| 1,000 swap | 2.976 | 2.319 | −22.1% | 2.677 |
| 1,000 select | 2.136 | 1.825 | −14.6% | 2.052 |
| 100 update | 1.233 | 1.288 | +4.5% | 1.336 |
| 100 select | 1.071 | 1.113 | +3.9% | 1.180 |

Baseline run medians varied more in this session, for example 19.8 and 22.2 ms
for creating 1,000 rows. The two small rises at 100 rows are within that
variation; the same phases at 1,000 rows are faster. A paired core study of the
four small workloads shows changes within its A/A controls.

Of two new cohorts of the [fixed matrix](BROAD-PARITY-ACCEPTANCE.md), the first
passes the majority rule with 48 of 49 phases within the margin and keyed1000
clear at 1.095. The second does not: localized-wide has 2 of 5 phases within
the margin, with mount at 1.156. Neither phase runs code this change touches. A
follow-up alternated the localized-wide fixtures of the previous and current
cohorts in one browser for 84 samples per variant and found −0.9% for mount,
−1.4% for local-update and −3.2% for scatter-update. Two further cohorts of the
committed source are needed before claiming parity for it.
