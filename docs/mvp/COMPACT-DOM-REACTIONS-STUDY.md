# Compact DOM reaction records: rejected private experiment

**Not integrated.** This candidate does not consistently reduce list creation or
clear CPU and has mixed effects elsewhere. Production remains the exact runtime
validated by the 610-test gate. The current comparative React/Svelte report
remains a separate frozen cohort; no cross-cohort speedup or parity is inferred.

## Mechanism and Svelte contrast

Svelte's local create_effect/destroy_effect implementation uses effect records
and explicit lifetime traversal. The reference checkout is commit
`0156c5fe38b53b72675e2a7f04535de015fdeed1` (5.57.3), inspected without changes or
Svelte builds. Its performance investigation guide was used to keep this to one
candidate and evaluate targeted comparisons before a full matrix.

Elnor's private candidate gives text, button and input reactions a shared run
function and a record in a native scope's existing cleanup array. It avoids the
per-reaction run/disposer functions for that internal path, but adds a WeakMap,
one registration object/function per scope, mixed cleanup dispatch and a separate
reaction shape. Public effect/computed behavior stays on the original path.
Foreign owners and overridden native own methods fall back to ordinary effects.
Callback entries remain callable; compact records stay private. Expressions
remain independent and listeners remain native. This differs from the previously
rejected shared-run-only experiment; it also removes DOM disposer functions.
Fewer function constructions do not establish fewer total allocated bytes or
lower CPU once the added registrations, lookups and dispatch are included.

## Directed verification

Baseline and candidate each pass 121 tests across thirteen existing test files
and five new controls. Coverage includes independent subscriptions, receivers,
foreign/immediate owners, mixed cleanup, reentrant cancellation, recovery,
keyed identity and cleanup/DOM failures. These are directed controls, not a
complete project gate for the candidate. The public 610-test gate was already
complete and its unchanged runtime/compiler identities were rechecked here.

Three earlier harness attempts are retained separately: a pre-created Job
directory prevented launch; copied tests then lacked TypeScript resolution;
a subsequent attempt used the wrong cwd for tests copying src/runtime.mjs.
The corrected run explicitly supplies the existing local TypeScript search path
and each private project's cwd. No failing tests were removed or weakened.

## List results: renderer main-thread CPU

Each cell is A → B milliseconds (relative change), explicitly **ThreadTime**.
The strict legacy summary also retains TaskDuration; those metrics are not
substituted for each other. A/A uses the candidate twice. Change compares the
current production baseline with the private candidate. Both AB/BA orders use
two warmups and seven measured rounds, alternating isolated active pages.
Accessibility remains enabled; post-timing traces are not subtracted.

| Rows | Action | A/A AB | A/A BA | Change AB | Change BA |
| --- | --- | --- | --- | --- | --- |
| 100 | create | 9.446 → 8.426 (-10.8%) | 8.651 → 9.529 (+10.1%) | 10.533 → 10.204 (-3.1%) | 9.192 → 9.591 (+4.3%) |
| 100 | update | 2.020 → 2.202 (+9.0%) | 1.908 → 1.809 (-5.2%) | 2.165 → 2.109 (-2.6%) | 2.025 → 2.201 (+8.7%) |
| 100 | select | 1.455 → 1.453 (-0.1%) | 1.345 → 1.454 (+8.1%) | 1.493 → 1.506 (+0.9%) | 1.398 → 1.423 (+1.8%) |
| 100 | append | 2.876 → 2.579 (-10.3%) | 2.336 → 2.438 (+4.4%) | 2.623 → 3.214 (+22.5%) | 2.895 → 2.967 (+2.5%) |
| 100 | swap | 1.947 → 1.896 (-2.6%) | 1.953 → 1.947 (-0.3%) | 2.173 → 2.272 (+4.6%) | 1.902 → 1.936 (+1.8%) |
| 100 | remove | 2.140 → 2.365 (+10.5%) | 2.139 → 2.175 (+1.7%) | 2.654 → 2.250 (-15.2%) | 2.321 → 2.238 (-3.6%) |
| 100 | clear | 2.396 → 2.209 (-7.8%) | 2.120 → 2.169 (+2.3%) | 2.322 → 2.454 (+5.7%) | 2.443 → 2.449 (+0.2%) |
| 1000 | create | 105.278 → 104.838 (-0.4%) | 103.837 → 105.721 (+1.8%) | 106.777 → 106.867 (+0.1%) | 106.066 → 106.216 (+0.1%) |
| 1000 | update | 8.628 → 8.911 (+3.3%) | 9.305 → 9.215 (-1.0%) | 9.740 → 10.243 (+5.2%) | 9.402 → 9.601 (+2.1%) |
| 1000 | select | 3.006 → 2.593 (-13.7%) | 2.920 → 3.037 (+4.0%) | 3.427 → 3.234 (-5.6%) | 3.348 → 3.340 (-0.2%) |
| 1000 | append | 11.898 → 11.343 (-4.7%) | 13.108 → 14.995 (+14.4%) | 14.359 → 13.088 (-8.9%) | 15.433 → 12.786 (-17.2%) |
| 1000 | swap | 4.117 → 4.089 (-0.7%) | 4.388 → 4.382 (-0.1%) | 4.653 → 4.910 (+5.5%) | 4.319 → 4.380 (+1.4%) |
| 1000 | remove | 7.155 → 7.592 (+6.1%) | 8.296 → 8.624 (+4.0%) | 9.508 → 7.299 (-23.2%) | 8.563 → 9.423 (+10.0%) |
| 1000 | clear | 13.093 → 12.901 (-1.5%) | 14.237 → 13.693 (-3.8%) | 12.603 → 13.731 (+9.0%) | 13.806 → 13.107 (-5.1%) |

At 1,000 rows, creation is +0.1% in both orders and clear is +9.0%/-5.1%.
Append is lower by 8.9%/17.2%, but update is higher by 5.2%/2.1%, swap by
5.5%/1.4%, and 100-row append by 22.5%/2.5%. Remove and other actions vary.
These are descriptive paired medians, not significance tests or wall latency.
The candidate does not justify adoption for the targeted creation/clear gaps.
The broader application matrix and full candidate gate were therefore not run;
no claim of global benefit, neutrality or production readiness is made.

## Provenance and controls

Successful evidence comprises 13 serial contained phases: two directed Node
gates, one fixture build, one browser preflight, eight browser pairs and one
strict summary phase. All verify the original limits: CPU 10%, commit 768 MiB,
24 processes, host free at least 4 GiB, kill-on-owner-close, browser 45/12 seconds
and Node 60/60 seconds, with zero remaining owned processes. Four earlier
failed Node phases remain outside that successful cohort; no resource limit
was relaxed and no unrelated process was terminated.

Baseline runtime: `ae44708c9ab1b30e1818011e102f5f0a138220f161fe0a5fab232614c9a91b01`

Candidate runtime: `ada2948829bdf569f9cf93b44af8498b75d6ccfdf69da5bd3125e0385e99a6b3`

Compiler: `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95`

Frozen baseline fixture: `run-hfalM3`; candidate fixture: `run-gFa4Vu`.

Internal evidence: `compact-reaction-study/list-trial-94dc59137020486abb765d68ef6512c6`,
`probe-f47a1a0ad22141eb9e4749109df68eec` and `run-62bfa12947d9457481a6e1aa8088f2ba`. Exact report revision, source/asset identities,
phase hashes and the failed attempts are retained in verification.json.
