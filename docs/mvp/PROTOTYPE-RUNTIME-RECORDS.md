# Prototype runtime records

Creating 1,000 keyed rows was the only phase still above the 10% Svelte margin
in both cohorts after the [general renderer became the default](GENERAL-RENDERER-DEFAULT.md),
at 1.137 and 1.141. This change removes most of the per-row allocation behind
it, without changing behavior.

## Cause

Allocation sampling of keyed1000 create, run on unminified bundles in the same
headless Edge and Windows Job limits as the matrix, found 2.6 MB allocated per
create for Elnor and 1.56 MB for Svelte. Most of the difference was functions
created once per instance:

- each `cell` created its own getter and setter;
- each `scope` created its own methods and getters;
- each `effect` created its own `run` method;
- each keyed row record defined three closures through `Object.defineProperty`;
- child props were built through `Object.entries` with a new descriptor per prop.

A first profile, built with esbuild's `keepNames`, attributed 63% of create to
garbage collection. That option adds its own wrappers. Without it, collection
costs about 1 ms per create in both frameworks.

## Change

- `Cell`, `Scope` and `Reaction` are classes with their methods on the
  prototype. Private fields keep the state that the closures encapsulated.
- An effect callback is still called without a receiver. The existing test for
  unbound receivers caught the first version, which passed the reaction as
  `this`.
- Keyed rows use a `ListRow` class whose `nodes` and `moving` accessors read
  through the row's part, which may still replace `nodes` with a range getter.
- Props are still defined as enumerable, non-configurable getters without a
  setter. One shared descriptor is reused, because `Object.defineProperty`
  copies it.

Sampled allocation per create dropped to 1.52 MB.

## Measurements

The paired list study compares the previous runtime and this one at 100 and
1,000 rows. All 14 phases are faster. The largest change is create at 1,000
rows:

| Phase | Before ms | After ms | Change | Svelte ms |
| --- | ---: | ---: | ---: | ---: |
| 1,000 create | 19.322 | 16.197 | −16.2% | 16.942 |
| 1,000 append | 4.106 | 3.790 | −7.7% | 3.846 |
| 1,000 swap | 2.429 | 2.209 | −9.1% | 2.250 |
| 1,000 remove | 3.050 | 2.840 | −6.9% | 2.918 |
| 1,000 clear | 2.926 | 2.762 | −5.6% | 2.356 |
| 100 create | 3.273 | 2.939 | −10.2% | 3.033 |

Two paired core studies of the counter, form, composition and localized
workloads show changes within their A/A controls. The form recover phase rose
in all four of their orders, by 6% to 16%. A follow-up alternated the same two
fixtures in one browser for 84 samples per variant and found −0.3% for recover,
−0.8% for edit-all and −0.2% for invalid. The core studies take each median from
seven rounds, and their A/A controls moved by up to 13%.

Two new cohorts of the [fixed matrix](BROAD-PARITY-ACCEPTANCE.md) pass the
majority rule. Keyed1000 is at 1.017 and 1.012 against 1.046 and 1.098 before,
and create is within the margin. 48 and 47 of 49 phases are within the margin,
against 46 in both earlier cohorts.

| Phase outside the margin | Cohort 1 ratio | Cohort 2 ratio |
| --- | ---: | ---: |
| keyed1000 / clear | 1.233 | 1.289 |
| form-wide / recover | within | 1.332 |

Clearing 1,000 rows remains the persistent exception. It is faster than before
in the paired study, but Svelte ran faster in these cohorts than in the earlier
ones, so its ratio rose. Clearing is the next list phase to examine.
