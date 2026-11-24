# General renderer as the default

The build now compiles every component with the general renderer. The region
backend remains available as an experiment through the `regionBackend: true`
option of `buildSurfaceProject` and `emitGraph`, and no new features are added
to it. The [vision](../VISION.md) explains why: rendering speed is not Elnor's
differentiator. Paired measurements also found no CPU advantage for regions
over the general renderer in any measured workload, and their runtime is 2.5 to
3 times larger.

## Parity check before the switch

The 10% Svelte margin of the [fixed majority contract](BROAD-PARITY-ACCEPTANCE.md)
was first demonstrated with regions selected. Before changing the default, the
same fixed matrix was run again in two cohorts. Both used the current public
source with `regionBackend: false`, and each build verified that no output
contained region construction or the region runtime. The scenario sources,
plan, worker, containment limits and analysis are unchanged.

The working majority criteria pass in both cohorts.

| Family | Cohort 1 ratio | Cohort 2 ratio |
| --- | ---: | ---: |
| counter | 0.910 | 0.951 |
| forms | 0.989 | 0.978 |
| composition | 0.957 | 0.960 |
| local | 1.001 | 0.992 |
| lists | 1.008 | 1.048 |
| lifecycle | 0.991 | 1.031 |

| Complex scenario | Cohort 1 ratio / phases within margin | Cohort 2 ratio / phases within margin |
| --- | ---: | ---: |
| keyed1000 | 1.046 / 5/7 | 1.098 / 4/7 |
| form-wide | 0.998 / 6/6 | 0.975 / 6/6 |
| composition-deep | 0.951 / 3/3 | 0.991 / 3/3 |
| localized-wide | 0.970 / 5/5 | 0.983 / 5/5 |
| lifecycle | 0.991 / 6/6 | 1.031 / 6/6 |

In each cohort, 46 of the 49 phases are within the margin. The region cohorts
in the [majority report](BROAD-PARITY-MAJORITY.md) had 43 and 41.

| Phase outside the margin | Cohort 1 Elnor / Svelte ms | Ratio | Cohort 2 Elnor / Svelte ms | Ratio |
| --- | ---: | ---: | ---: | ---: |
| keyed1000 / create | 21.900 / 19.263 | 1.137 | 20.642 / 18.100 | 1.141 |
| keyed1000 / clear | 3.496 / 3.164 | 1.105 | 3.307 / 2.936 | 1.126 |
| keyed1000 / select | within | | 2.339 / 2.068 | 1.131 |
| localized / mount | 2.096 / 1.805 | 1.161 | within | |

Keyed1000 create and clear are outside the margin in both cohorts. With regions,
clear was about 30% above Svelte; with the general renderer it is 11% to 13%.
The region exceptions for form-wide recover and lifecycle show are within the
margin here.

## Limits

- The region cohorts were measured in an earlier session with an earlier frozen
  source, so the comparison between backends is descriptive, not paired.
- Keyed1000 in cohort 2 is at 1.098, close to the margin. List creation is the
  first candidate for optimizing the general renderer.
- This matrix does not cover React, delivery size, startup or memory. The
  [competitive performance contract](PERFORMANCE-TARGET.md) still applies.

## Build changes

- Builds no longer emit `region-runtime.mjs`.
- The experimental hot update still uses the region analysis as its proof of a
  static shape. It computes that analysis even when regions do not emit code,
  so focus markers and state transfer keep working in hot builds.
- Region tests request `regionBackend: true` explicitly and keep comparing
  region behavior with the general renderer.
