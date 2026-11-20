# Repeatability and accessibility investigation

An unchanged Elnor fixture produces double-digit apparent differences under the existing process-separated protocol. Separate calibration shows that empty frame windows and protocol-command accounting are small compared with creation. Expanded browser traces identify accessibility lifecycle work as a large part of the slow renderer work in all three frameworks. This identifies an important confounder; it does not establish the trigger or explain every A/A difference.

The runtime and compiler remain unchanged. No accessibility feature, DOM semantics, security setting or resource limit was disabled to obtain these results. No new runtime speedup or framework-parity claim is accepted.

## A/A control

Both Elnor labels use the exact same immutable `run-OLDLti` fixture, manifest, runtime and site files. Study `studies/run-53c1f413770943bb84f4444e070d417d` has 36 passing cases: four mutation cases plus four fresh browser processes per label/framework and size, two warmups and seven samples per action. Order rotates across four positions, reversed for the other size. Tables show pooled renderer TaskDuration medians in ms with threadTicks. The A/B label difference below is measurement variation, not a code improvement.

| Rows | Action | Elnor label A | Elnor label B | React | Svelte |
|---|---|---:|---:|---:|---:|
| 100 | create | 7.637 | 8.697 | 7.697 | 7.685 |
| 100 | update | 1.713 | 1.859 | 2.004 | 1.770 |
| 100 | select | 1.247 | 1.392 | 1.465 | 1.277 |
| 100 | append | 2.269 | 2.435 | 2.548 | 2.312 |
| 100 | swap | 1.687 | 1.741 | 8.202 | 1.749 |
| 100 | remove | 2.004 | 2.106 | 2.278 | 2.029 |
| 100 | clear | 2.038 | 2.202 | 2.151 | 1.949 |
| 1000 | create | 94.523 | 82.690 | 86.347 | 79.061 |
| 1000 | update | 8.715 | 8.472 | 9.726 | 8.421 |
| 1000 | select | 3.109 | 2.739 | 3.858 | 2.704 |
| 1000 | append | 12.242 | 11.231 | 12.459 | 10.463 |
| 1000 | swap | 4.186 | 3.659 | 77.936 | 3.728 |
| 1000 | remove | 7.954 | 7.603 | 9.164 | 7.248 |
| 1000 | clear | 11.820 | 11.193 | 11.057 | 8.575 |

For 1000-row creation, 94.523 versus 82.690 ms is an apparent 12.5% reduction without changing code. For 100-row creation the sign reverses: 7.637 versus 8.697 ms. The retained summary includes ranges and every process median; neither pooled value establishes a reliable optimization margin.

## Empty-window calibration

Capture `calibrations/run-ee6a729e6ffc4a3a904113ac8d0c0d4d` runs fresh Elnor, React, Svelte and Elnor processes in that order, at 1000 rows. Every action has two warmups and seven samples. A verified control window waits two animation frames and reads the same root geometry before the action, without clicking a control or changing model state. Its source differs from the normal timing protocol and is diagnostic only. The control is not subtracted from application timings.

The calibration additionally captures DevToolsCommandDuration, V8CompileDuration and TaskOtherDuration. TaskOtherDuration is Chromium's residual task accounting, not a named cause; its deltas are preserved without clamping. Individual metric medians need not sum to the TaskDuration median.

| Process | Action | Task CPU | Empty-window CPU | Script | Layout | Style | DevTools | Other |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1: elnor | create | 72.158 | 0.586 | 10.163 | 8.365 | 4.513 | 0.218 | 52.332 |
| 1: elnor | clear | 10.093 | 0.524 | 7.314 | 0.069 | 0.000 | 0.272 | 2.229 |
| 2: react | create | 72.150 | 0.581 | 8.238 | 8.057 | 5.377 | 0.250 | 49.764 |
| 2: react | clear | 11.501 | 0.545 | 8.333 | 0.061 | 0.014 | 0.261 | 2.392 |
| 3: svelte | create | 71.954 | 0.570 | 4.637 | 8.898 | 4.812 | 0.263 | 55.214 |
| 3: svelte | clear | 9.112 | 0.564 | 6.336 | 0.072 | 0.018 | 0.256 | 2.350 |
| 4: elnor | create | 76.537 | 0.572 | 8.674 | 7.416 | 4.656 | 0.225 | 53.336 |
| 4: elnor | clear | 10.381 | 0.545 | 7.911 | 0.065 | 0.000 | 0.257 | 2.276 |

## Accessibility traces

Each expanded trace captures creation and clear once after two create/clear warmup cycles. Categories are toplevel, accessibility, blink, devtools.timeline and v8. Trace streams are capped at 8 MiB per action; capture rejects data loss. The page renderer is selected by its FunctionCall event URL pointing to the local framework bundle and CrRendererMain metadata; the unused empty-page renderer is excluded. Thread durations (tdur) are reported in milliseconds. Durations below are inclusive: nested accessibility/serialization events must not be added together. Instrumented traces are not interchangeable with normal benchmark samples.

| Framework | Action | Task CPU | Accessibility lifecycle CPU | Trace bytes |
|---|---|---:|---:|---:|
| elnor | create | 70.614 | 41.428 | 476539 |
| elnor | clear | 10.233 | 1.173 | 3295790 |
| react | create | 66.698 | 39.974 | 462182 |
| react | clear | 11.000 | 1.294 | 3322212 |
| svelte | create | 66.924 | 41.568 | 476780 |
| svelte | clear | 8.643 | 1.370 | 3327323 |

Trace identifiers: `diagnostics/run-977f3ae05a43409cb0da4d87900e60db`, `diagnostics/run-9cd6357bf2fe4b919e9f0237bd33e6f2`, `diagnostics/run-e484b32c7094431e9b1f741b35daab59`.

In the Elnor creation trace, RunAccessibilitySteps consumes 41.428 ms of thread duration while TaskDuration is 70.614 ms; nested SerializeLifecycleStage accounts for 35.207 ms and is not an additional cost. React and Svelte show similar accessibility work. This explains much of the unclassified creation cost in these captures. It does not prove why accessibility work or A/A labels vary, who requested accessibility, or that earlier untraced cohorts used the same accessibility conditions.

Initial narrow traces, retained in `diagnostics/run-374e5304edfb4b318a826602cbe03eb6` and `diagnostics/run-93f1cc0de6a94f139f12117cba159022`, did not include accessibility/toplevel categories and could not account for the large residual. The expanded captures above add observation, rather than selecting the fastest trace.

## Validation and next measurement

All study/calibration/trace cases pass state and keyed-identity checks. A normal 49-sample runtime case `diagnostics/run-df98c28dc91c4aa28d6ddcd3692a753a` verifies that calibration controls/extra metrics are absent in normal mode. Preflight `diagnostics/run-078b00ed8e2e464f942bc42bac22700e` passes 42 checks. Deliberate invalid `trace --rounds 7` configuration `diagnostics/run-213745c20cbf41f1866c6e3c3e95ac4e` is rejected before browser launch with exit 1 and no remaining owned processes; trace mode captures only create/clear once and requires rounds 1.

Every heavy command remains in the existing Windows Job envelope: 10% aggregate CPU, 768 MiB commit, at most 24 processes, 45-second wall/12-second progress deadlines, sandboxed headless Edge and GPU disabled. Frozen collector copies/hashes, limits and zero remaining owned processes are checked by this producer. No new Rust work or full application-test rerun is needed for these benchmark-only changes; the prior 510-test verification remains historical evidence rather than a new claim.

Before accepting another small optimization, use paired measurements with a contemporaneous A/A control and record matching accessibility observations. Keep total renderer cost visible alongside component timings. A trace explains the captured work but is not proof of an uninstrumented speedup or a reason to disable accessibility. No acceptance threshold is introduced here.

Primary API references: [CDP Performance schema](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/browser_protocol.json), [Chromium performance accounting](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/inspector/inspector_performance_agent.cc), and [CDP Tracing](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/). The source shows that threadTicks selects thread time and that Other is residual accounting; the stream API provides data-loss reporting. The measured attribution above comes from retained local traces, not from these API documents.

Reproducer: `elnor/.elnor/mvp/framework-comparison/reports/repeatability/producer.py`; calibration runner: `calibrate.py` in the same directory. Earlier investigation: [Native clear](NATIVE-CLEAR-STUDY.md).
