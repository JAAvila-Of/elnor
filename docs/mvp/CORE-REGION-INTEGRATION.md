> **Superseded default.** The general renderer is now the default and the region
> backend is an opt-in experiment. See [General renderer as the default](GENERAL-RENDERER-DEFAULT.md).

# Public region core integration

The confirmed region backend is now integrated into `elnor/src`. The entire public source tree is byte-identical to the source revision in both fixed-matrix Svelte cohorts. Automatic proof-based selection keeps the existing Surface syntax; unsupported cases retain the general renderer. This is a local source integration, not a package publication.

The core includes compiled native construction for eligible owned views, unified tracking/scheduling records for sequential dynamic tasks, and an ordered subscriber index per source slot. The public CLI, TypeScript/editor, preview, module, runtime and lifetime suites remain operational.

## CPU result and its scope

The [fixed majority contract](BROAD-PARITY-ACCEPTANCE.md) passes in two independent same-source cohorts. All six family aggregates and all five complex scenario aggregates are within the selected 10% Svelte margin in each cohort. Every complex scenario has a majority of its phases within that margin. All 49 phases remain in the [complete report](BROAD-PARITY-MAJORITY.md); 43/49 phases pass the margin in the first cohort and 41/49 in the second.

| Family | Cohort 1 Elnor/Svelte CPU | Cohort 2 Elnor/Svelte CPU |
| --- | ---: | ---: |
| counter | 0.911 | 0.936 |
| forms | 0.995 | 1.018 |
| composition | 0.955 | 0.996 |
| local | 0.999 | 0.952 |
| lists | 1.040 | 1.042 |
| lifecycle | 1.009 | 1.061 |

Three phase exceptions persist in both cohorts: clearing 1,000 rows uses about 30% more CPU, recovering the 96-field form uses 12–22% more, and showing the 32 stateful components uses 14–19% more. This is majority parity, not parity in every operation or a uniform improvement over the previous backend. The source-index direct control also retains regressions in localized scatter updates and lifecycle toggles; see the [source-index report](REGION-BACKEND-SOURCE-INDEX.md).

The measured baseline is Svelte 5.57.3 in sandboxed Edge 157.0.4341.42. CPU is renderer thread time during the common action/frame window, not latency, FPS or cold startup. React on the expanded complex matrix, representative applications, comparative memory, delivery and development-speed parity remain outside this claim.

## Public validation

- `check` and `build` pass against the actual public tree.
- All 54 public test files execute: 626 passed, 0 failed and 0 skipped in the final coverage. This includes the original 52 files and two new regression suites.
- The confirmed source also retains 476 private backend tests, 71 compatibility tests, 112 native browser cycles and fake/real DOM collection controls. These counts overlap and must not be added as distinct tests.
- Nine workload graphs are rebuilt from the entire public source tree. Their raw programs match both measured revisions after local binding renaming and narrowly verified diagnostic-file relocation. Every relocated record must match the parsed Surface binding kind, name, start, length and identical fixture bytes. Other literals, keys, exports and operations remain. Normalized files are never executed.
- Ten public browser preflights execute the original built programs and match all 98 normalized DOM checks from the measured cohorts. This integration step collects no new timing samples.

## Retained failures and recovery

A transfer assertion initially failed because writing the fake-DOM helper normalized line endings. Recovery verified the complete backup and unchanged accepted core, then copied exact helper bytes.

One standalone-build assertion expected the old asset list. It now requires the additional regional runtime and also verifies its hash/capabilities and HTTP/CSP delivery; the file's 17 tests pass. The other 45 previously passed files were not repeated, and all remaining files completed. No runtime source was changed or test skipped to resolve that assertion.

The initial strict literal comparison correctly rejected absolute diagnostic paths from different build directories. Its failed output is retained. The final proof maps only compiler binding diagnostic file paths validated against immutable Surface source and exact source positions. It does not ignore arbitrary strings or runtime changes.

Public verification retains 84 successful bounded Jobs and two failed attempts (the old asset expectation and strict diagnostic-path comparison), plus the transfer assembly assertion. All retain CPU 10%, 768 MiB aggregate commit, Node 192 MiB, 24-process cap, 4 GiB host-free floor, original timeouts, CSP and browser sandbox. No failed attempt is reported as a pass. The same-source majority result is descriptive and does not establish statistical equivalence or complete product/production readiness.
