Measured source: the frozen region backend. The [public core integration](CORE-REGION-INTEGRATION.md) promotes the identical source tree and validates generated programs and browser behavior separately.

# Same-source broad CPU majority assessment

Working majority criteria satisfied: **True**. This assessment reconstructs both complete cohorts from raw data and verifies identical frozen inputs, source review, versions and normalized DOM schemas. It does not pool timings, claim statistical equivalence, or establish complete product parity. Source adoption and public integration are separate decisions.

| Family | Cohort 1 ratio | Cohort 2 ratio |
| --- | ---: | ---: |
| counter | 0.911 | 0.936 |
| forms | 0.995 | 1.018 |
| composition | 0.955 | 0.996 |
| local | 0.999 | 0.952 |
| lists | 1.040 | 1.042 |
| lifecycle | 1.009 | 1.061 |

| Complex scenario | Cohort 1 ratio / phases within margin | Cohort 2 ratio / phases within margin |
| --- | ---: | ---: |
| keyed1000 | 1.046 / 6/7 | 1.067 / 5/7 |
| form-wide | 1.029 / 4/6 | 1.025 / 4/6 |
| composition-deep | 0.960 / 3/3 | 1.011 / 3/3 |
| localized-wide | 1.061 / 3/5 | 0.950 / 4/5 |
| lifecycle | 1.009 / 5/6 | 1.061 / 5/6 |

## Phase exceptions

Every phase remains reported below. A majority result does not mean every action is within 10%. Persistent exceptions above 10% in both cohorts: keyed1000/clear, form-wide/recover, lifecycle/show.

| Scenario / phase | Cohort 1 Elnor ms | Svelte ms | Ratio | Cohort 2 Elnor ms | Svelte ms | Ratio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| counter / mount | 1.081 | 1.154 | 0.936 | 1.038 | 1.091 | 0.952 |
| counter / increment | 0.934 | 1.043 | 0.896 | 0.926 | 1.015 | 0.912 |
| counter / unmount | 0.891 | 0.988 | 0.902 | 0.921 | 0.975 | 0.945 |
| form / mount | 1.429 | 1.475 | 0.969 | 1.430 | 1.493 | 0.958 |
| form / edit-one | 1.260 | 1.173 | 1.074 | 1.409 | 1.280 | 1.101 |
| form / edit-all | 1.285 | 1.379 | 0.932 | 1.414 | 1.412 | 1.001 |
| form / invalid | 1.175 | 1.246 | 0.943 | 1.285 | 1.296 | 0.991 |
| form / recover | 1.183 | 1.382 | 0.856 | 1.331 | 1.408 | 0.946 |
| form / unmount | 0.949 | 0.936 | 1.014 | 1.022 | 0.952 | 1.074 |
| composition / mount | 1.237 | 1.320 | 0.937 | 1.428 | 1.472 | 0.969 |
| composition / relay | 1.017 | 1.078 | 0.943 | 1.161 | 1.175 | 0.989 |
| composition / unmount | 0.909 | 0.934 | 0.973 | 0.998 | 1.013 | 0.985 |
| localized / mount | 2.106 | 2.242 | 0.939 | 2.043 | 2.181 | 0.937 |
| localized / local-update | 1.181 | 1.219 | 0.968 | 1.196 | 1.256 | 0.952 |
| localized / unmount | 1.006 | 1.103 | 0.913 | 0.966 | 0.990 | 0.976 |
| keyed100 / create | 4.428 | 4.190 | 1.057 | 4.227 | 3.545 | 1.192 |
| keyed100 / update | 1.686 | 1.558 | 1.082 | 1.576 | 1.491 | 1.056 |
| keyed100 / select | 1.417 | 1.496 | 0.947 | 1.296 | 1.335 | 0.971 |
| keyed100 / append | 2.021 | 1.906 | 1.060 | 1.777 | 1.806 | 0.984 |
| keyed100 / swap | 1.639 | 1.584 | 1.035 | 1.573 | 1.645 | 0.957 |
| keyed100 / remove | 1.884 | 1.777 | 1.061 | 1.797 | 1.930 | 0.931 |
| keyed100 / clear | 1.592 | 1.595 | 0.998 | 1.567 | 1.481 | 1.058 |
| keyed1000 / create | 27.870 | 25.861 | 1.078 | 28.713 | 23.496 | 1.222 |
| keyed1000 / update | 4.771 | 4.616 | 1.033 | 4.297 | 4.471 | 0.961 |
| keyed1000 / select | 2.533 | 2.770 | 0.915 | 2.363 | 2.543 | 0.929 |
| keyed1000 / append | 5.894 | 5.708 | 1.033 | 5.160 | 4.932 | 1.046 |
| keyed1000 / swap | 3.517 | 3.304 | 1.064 | 3.161 | 2.906 | 1.088 |
| keyed1000 / remove | 4.480 | 4.837 | 0.926 | 3.775 | 3.864 | 0.977 |
| keyed1000 / clear | 5.108 | 3.865 | 1.322 | 4.977 | 3.841 | 1.296 |
| form-wide / mount | 4.468 | 4.328 | 1.032 | 4.161 | 4.373 | 0.952 |
| form-wide / edit-one | 2.217 | 2.617 | 0.847 | 2.341 | 2.541 | 0.921 |
| form-wide / edit-all | 4.964 | 5.036 | 0.986 | 5.026 | 4.438 | 1.132 |
| form-wide / invalid | 1.971 | 1.993 | 0.989 | 1.800 | 1.846 | 0.975 |
| form-wide / recover | 2.561 | 2.102 | 1.218 | 2.644 | 2.359 | 1.121 |
| form-wide / unmount | 1.334 | 1.164 | 1.146 | 1.233 | 1.154 | 1.069 |
| composition-deep / mount | 1.879 | 2.032 | 0.925 | 1.553 | 1.512 | 1.027 |
| composition-deep / relay | 1.356 | 1.302 | 1.041 | 1.073 | 1.076 | 0.997 |
| composition-deep / unmount | 1.117 | 1.216 | 0.919 | 0.925 | 0.916 | 1.010 |
| localized-wide / mount | 11.646 | 11.005 | 1.058 | 9.479 | 9.986 | 0.949 |
| localized-wide / local-update | 3.300 | 2.946 | 1.120 | 2.657 | 2.882 | 0.922 |
| localized-wide / scatter-update | 3.264 | 3.478 | 0.938 | 3.213 | 2.908 | 1.105 |
| localized-wide / all-update | 7.827 | 7.647 | 1.023 | 6.151 | 7.649 | 0.804 |
| localized-wide / unmount | 1.911 | 1.619 | 1.181 | 1.646 | 1.655 | 0.995 |
| lifecycle / mount | 3.190 | 3.259 | 0.979 | 3.339 | 3.176 | 1.051 |
| lifecycle / edit-and-emit | 1.775 | 1.927 | 0.921 | 1.906 | 1.766 | 1.080 |
| lifecycle / hide | 1.337 | 1.403 | 0.953 | 1.273 | 1.352 | 0.942 |
| lifecycle / show | 4.357 | 3.839 | 1.135 | 3.712 | 3.118 | 1.190 |
| lifecycle / toggle-cycle | 4.822 | 4.782 | 1.008 | 5.016 | 4.847 | 1.035 |
| lifecycle / unmount | 1.314 | 1.224 | 1.074 | 1.252 | 1.156 | 1.083 |

The original strict analyses remain unchanged. CPU is renderer thread time across the common action/frame window; these are not latency, cold-start or FPS measurements. React, representative apps and other product dimensions remain outside this two-cohort claim. The working rule was recorded before confirmation; no scenario, tolerance, correctness check or resource limit was removed.
