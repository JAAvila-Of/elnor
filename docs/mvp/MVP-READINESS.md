# Bounded MVP readiness review

**Later functional core closure (2026-11-12):** see
[core readiness](CORE-READINESS.md) for the current 550-test gate and native DOM
checks. The review below preserves its original workflow evidence and date.

**Owner clarification after this review:** the
[performance target](PERFORMANCE-TARGET.md) now explicitly requires parity with
Svelte and React, aiming for material improvement without sacrificing Surface
syntax/DX. Comparative evidence is a pending product/MVP item, not merely an
optional extension. The historical review below does not waive that requirement
or demonstrate it; the completed viability spikes remain closed.

**Reviewed:** 2026-11-11. **Verdict:** the bounded technical workflow is
demonstrated; the first MVP remains open for human workflow evaluation and
performance characterization. The completed viability spikes remain closed.
This review derives from [task 005](../../tasks/005-mvp.md),
[goals](../../GOALS.md) and retained evidence. It adds no language support,
production certification or newly approved acceptance budget.

**Measurement follow-up:** the [initial current-loop harness/results](DEVELOPMENT-MEASUREMENTS.md)
now provide serial synthetic 2/8-component observations. Representative-workload
confirmation, accepted budgets and human workflow feedback remain open; the
initial review below describes the evidence at audit time.

## Original work versus evidence

| Original work / observable outcome | Current evidence | Status and limit |
|---|---|---|
| Define supported subset and operational contracts | [Subset](../surface/MVP-SUBSET.md), [contracts](../surface/MVP-CONTRACTS.md), existing parser/checker/runtime regressions | Completed as a bounded implementation inventory; destination v0.3 remains separate |
| Create and edit a small local app | Preserving [exercise setup](AUTHORING-WALKTHROUGH.md), saved-entry CLI tests with projects outside examples | Bounded technical evidence. General scaffolding is not supplied or newly required by this review |
| Check, build and preview saved sources | [Project check](PROJECT-CHECK.md), [owned generations](PROJECT-BUILD.md), [manifest preview](PROJECT-PREVIEW.md) | Demonstrated for documented local Surface/ESM subset, fixed TS profile and one output writer |
| Predictable save/error/recovery loop | [Dev command](PROJECT-DEVELOPMENT.md), observed dependencies, input revisions, [typed props](TYPED-PREVIEW-PROPS.md), real-browser pilots | Technically demonstrated. Manual page reload, session-local contracts and incomplete dependency freshness remain explicit |
| Original-source editor feedback and stale-result refusal | Fifteen native tasks; worker/alias/unsaved-TS regressions | Bounded native development-host evidence, not all syntax/workspace cases or normal-editor distribution |
| Formatting for chosen subset | 26 pure formatter cases, worker/provider coverage, native task 13 | Indentation/preservation and native unsaved-buffer application demonstrated. Human preferences, full layout and automatic writes/save policy remain separate |
| Repeatable editor/test setup | Isolated persistent host, enabled trust, correlated reports and headless gate | Scripted technical setup demonstrated. Adapter remains unpackaged; independent authoring setup in a normal editor has not been evaluated |
| A person authors/modifies and recovers independently | [Recorded feedback](AUTHORING-FEEDBACK.md): independent validation pending | Open. Independent error recovery, event-flow comprehension and formatting preferences have no confirming human evidence |
| Bound discovery, invalidation and TS configuration | Disk watchers, dirty-buffer preservation, explicit scope plus observed paths, fixed-profile inspection | Bounded requirement addressed. User tsconfig, package installs, complete freshness and multiple workspaces remain deferred |
| Define latency targets using a representative project | Per-task timings exist; no representative workload/measurement harness or accepted budgets established in the reviewed workflow | Open measurement/design work. Test durations are not product latency evidence or a Rust-port justification |

The original ordered work is therefore: subset definition complete; workflow
implementation advanced with human evaluation still open; bounded project-state
behavior demonstrated with its documented exclusions. There is no useful honest
percentage-to-completion without an agreed finite denominator. More regression
cases alone cannot settle the remaining human observations.

## Priority assessment

**DX first.** The recorded save/build confusion has concrete engineering
responses: one development command, automatic saved-source builds, visible
failure/retention state, reloadable input pairs and typed JSON field feedback.
Automation confirms those mechanisms, not that a person now discovers or
understands them unaided. The review also found stale formatter descriptions
claiming native formatting was unverified; those descriptions are reconciled
with the actual fifteen-task result. Historical evidence remains labeled.

**Security next.** Retained evidence supports loopback/Host/method boundaries,
module allowlists/checksums, output ownership/link refusals, escaped status text,
enabled editor trust, no server-side application execution and scoped browser
CSP probes. Local application code still executes in the browser. These are
bounded development boundaries, not an untrusted-code sandbox or broad audit.
HMR/connections, remote services, SSR, nonces, HPKE and production deployment are
not new closure requirements. Headless remains the default without desktop
fallback or trust bypass.

**Performance informed by DX.** Known mechanisms include a 500 ms source-poll
interval with two stable snapshots, synchronous build/uncached props checks and
retained generations/input bytes. Their costs need measurement; the interval is
configuration, not a measured end-to-end response time. A few native request
timings do not provide a representative distribution. The
[historical viability closure](../spikes/004/VIABILITY-CLOSURE.md) also retained
three tiny check/build samples and a browser workflow observation; worker/recovery
probes recorded caller-thread observations. Those precede the current development
and typed-props loop and establish no current end-to-end budget. Reuse their
measurement approach where useful, with owned current fixtures and clear timing
boundaries. Keep JS/TS and TypeScript
semantics; no measured need for a Rust port has emerged from this review.

The later [persistent Task desk authoring exercise](TASK-DX-EXERCISE.md) now
prepares a current behavior-change/error-recovery task and verifies the technical
setup. It also exposes and fixes [CLI action-body line mapping](CHECKER-ACTION-LINES.md).
No new participant results are inferred; the review below retains its historical
verification scope and the human acceptance work remains open.

## Finite next work

1. **Characterize the current loop automatically.** Use owned, reproducible local
   fixtures and record cold/warm check/build, saved-change-to-publication,
   uncached/cached typed-props navigation and recovery timings. Record project
   size, runtime/platform and sample counts; distinguish watcher delay from
   compiler/HTTP time. First publish descriptive results, then propose DX-driven
   latency budgets. This review does not invent pass/fail thresholds or compare
   compiler languages without evidence.
2. **Revisit the outstanding human tasks on the current flow.** Prepare an owned
   fixture using `dev:project`, not the older two-terminal manual-build helper.
   Evaluate an increment edit, a deliberate source/type error and recovery,
   child-to-parent event explanation, and explicit formatting with preservation.
   Include one invalid JSON prop so the last-valid-pair notice is understood.
   The facilitator prepares the setup and checks; participants supply
   their own observations. Do not ask them to run test suites, infer comprehension
   from automated clicks, measure chat delays or score their ability. No screen
   observation is required. No outcome is recorded until feedback arrives.
3. **Make the bounded product decision from that evidence.** Record observed
   friction and timing, fix demonstrated blockers and repeat affected checks.
   Decide whether the documented subset satisfies the intended early workflow.
   Keep packaging, general tsconfig, automatic page refresh and full grammar as
   separately prioritized extensions. The later owner clarification makes
   competitive comparison an explicit pending requirement; broad production
   certification remains outside this bounded review.

The human work can proceed alongside measurements when the person chooses to
participate. Its absence does not prevent the facilitator from completing the technical
measurement work. No feedback or approval is assumed from silence.

## Reviewed provenance and verification

The latest retained implementation gate is
`elnor/.elnor/headless/runs/run-Y7xECF`: check of four original components,
460/460 Node cases with zero skips, and all fifteen native tasks; Linux/Xvfb,
VS Code 1.145.3, Node v24.22.1, process exit 0. Native run UUID:
`033c610e-9e1f-4b09-bf1b-728733edd6b0`. Trust was enabled and fixture disk sources
were unchanged. This review validates those saved records; it does not claim a
fresh implementation run or convert their per-task timings into a benchmark.

Browser provenance is retained separately: the historical UserEditor/CSP pilot
and project preview/development/dependency/input/typed-props pilots under
`elnor/.elnor/mvp/*pilot/run-20261111a`. The typed-props pilot covers wrong-type
retention, correction, changed-contract refusal and recovery; its later guards
are covered by the final Node gate. The recent project pilots are headless browser
observations on owned fixtures, separate from the person's authoring feedback
and the historical pilot; they are not a browser matrix.

This increment changes documentation only. Validation reads the correlated gate,
native/host records and Node log, checks documentation links and reviews current
adapter/formatter contracts. No editor/browser/server was launched, no source or
test coverage was changed and no user workspace/server was controlled.
The audit validation command was executed from the workspace root:
`node elnor/.elnor/mvp/readiness-reviews/run-20261111a/verify.mjs`.
Its JSON records remain under that internal directory, including link counts and
the explicit distinction between reviewed evidence and newly executed tests.
