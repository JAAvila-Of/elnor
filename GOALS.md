# Elnor goals and boundaries

## Purpose and priorities

Demonstrate that Surface, a human-oriented declarative UI language, can provide
an excellent developer experience through a maintainable, predictable
implementation. Syntax does not need to improve execution speed to justify its
existence. DX comes first, followed by security and performance; compiler and
runtime optimization are separate questions.

Elnor's [vision](docs/VISION.md) is to make asynchronous work declarative:
every operation has an owner, a policy, a lifecycle and a destination, and the
compiler checks the guarantees that follow from them.

The [capability backlog](docs/mvp/ECOSYSTEM-ROADMAP.md#owner-requested-capability-backlog-dx-throughout)
keeps future state, schema, development-tool and server capabilities mapped,
including Server Components and Server Actions. Exceptional DX is required
throughout their authoring, composition, diagnostics and recovery; implementation
and scheduling remain separate decisions.

**Required product target:** performance at least on par with Svelte and React,
with the ambition of materially outperforming them, while preserving Surface's
human-oriented syntax and DX. DX-first does not make performance optional.
The [competitive performance contract](docs/mvp/PERFORMANCE-TARGET.md) requires
equivalent workloads and explicit comparison boundaries. Parity/superiority
has not been demonstrated as a product-wide claim. On 2026-11-16 the owner
accepted a 10% CPU margin over Svelte for the fixed broad runtime matrix;
the [majority acceptance rule](docs/mvp/BROAD-PARITY-ACCEPTANCE.md) keeps that
bounded target and its exceptions separate from complete product parity.

That fixed Svelte runtime majority target now has two same-source cohorts and
a [validated public core integration](docs/mvp/CORE-REGION-INTEGRATION.md).
Persistent phase exceptions remain explicit; this does not close the broader
React, representative-app, startup, memory or production-readiness targets.

The current phase uses that core as a regression baseline and prioritizes
Surface and application DX. The [Task desk pilot](docs/mvp/TASK-DESK-PILOT.md)
now exercises a typed local application with verified browser flows. Human
authoring feedback remains open; intensive core optimization is closed for
this phase.

The product direction includes typed components, state, props, events, slots
and forms; original-source editor feedback; and independent component previews.
Security features must have explicit trust boundaries and evidence rather than
requiring repetitive syntax from application authors.

## Current viability outcome

The bounded technical investigation is closed with a GO for a small MVP. The
[closure report](docs/spikes/004/VIABILITY-CLOSURE.md) records 287 passing Node
tests, twelve native VS Code tasks and a real-browser UserEditor/CSP pilot.
Those observations establish a workable route for the tested composition and
tooling subset, not full Surface v0.3 or production readiness.

The original editor gates have bounded evidence: mapped TypeScript errors,
cross-component definitions, typed completion, applied Surface rename,
incremental invalidation and regressions for source positions and incomplete
editing. Live TypeScript buffers and alias ownership have additional native
coverage. General recovery and all symbol/workspace forms remain unproven.

Independent human DX and formatting preferences, complete project dependency/configuration
behavior and production performance still require work. Restrictive preview
CSP was exercised in one real browser; broad security, SSR, nonces and sealed
transport were not established.

## Next phase

Performance work now uses an [expanded synthetic matrix](docs/mvp/EXPANDED-PERFORMANCE-MATRIX.md)
alongside keyed lists: small components, forms, composition/slots and localized
state, with runtime, lifecycle/memory, delivery and tooling kept separate.
Future changes must be evaluated for broader impact rather than a single list
size. Representative-app acceptance and repeatable startup wall comparisons
remain open; broader fixture coverage does not by itself close them.
The [visibility-controlled startup follow-up](docs/mvp/CONTROLLED-STARTUP.md)
now supplies explicit visibility histories and balanced controls for all four
families. Remaining same-code wall variation still prevents startup wall ranking;
representative application and human DX acceptance remain open.
Separate [startup phase diagnostics](docs/mvp/STARTUP-PHASE-DIAGNOSTICS.md) now
localize several navigation/browser/frame delay classes across the matrix.
Their instrumented observations do not identify one universal trigger, replace
normal comparisons or establish a framework speedup.

The [functional core closure](docs/mvp/CORE-READINESS.md) records the current
550-test gate, native DOM checks and resolved scheduler/lifetime blockers.
It supports continued work on the documented MVP subset; competitive performance
and independent human DX acceptance remain open.
The subsequent [current-core comparison](docs/mvp/CURRENT-CORE-COMPARISON.md)
retains both framework controls and A/A for that exact implementation. It narrows
the diagnostic priorities without establishing product parity or an overall CPU
speedup from the recent correctness fixes.

The [MVP readiness review](docs/mvp/MVP-READINESS.md) separates the demonstrated
technical loop from pending human feedback and representative latency evidence.
The MVP remains open. The next technical step is to characterize that loop and
propose evidence-based budgets; this adds no Rust or full-v0.3 requirement.
The [first measured baseline](docs/mvp/DEVELOPMENT-MEASUREMENTS.md) now records
that loop on two small synthetic fixtures. A representative workload and accepted
budgets still need confirmation; these measurements do not close human DX.

Follow the ordered [MVP scope](tasks/005-mvp.md): define the supported subset and
contracts, evaluate real developer workflows and formatting, then make the
project/dependency lifecycle predictable. Keep the destination specification
separate from current support claims. Retain reproducible regression evidence.
The [subset baseline](docs/surface/MVP-SUBSET.md) and
[operational contracts](docs/surface/MVP-CONTRACTS.md) complete the definition
step. The [authoring exercise](docs/mvp/AUTHORING-WALKTHROUGH.md) now collects
assisted human feedback; its [preview notice](docs/mvp/PREVIEW-BUILD-STATUS.md)
explains pending saved changes on reload. The [formatter](docs/mvp/FORMATTER.md) now implements
conservative indentation through a pure API/read-only CLI, under its
[contract](docs/mvp/FORMATTER-CONTRACT.md). This is not completed human DX
validation or automatic file writes. The [versioned adapter](docs/mvp/VERSIONED-FORMATTING.md)
is implemented and tested through a real worker/API double. The
[fifteen-task native suite](docs/mvp/NATIVE-VALIDATION.md) passed on 2026-11-11,
including formatting and saved-dependency watcher behavior.
[Saved TypeScript dependency invalidation](docs/mvp/DISK-INVALIDATION.md)
now handles never-opened local dependencies without adopting disk text as buffers;
the initial [TypeScript configuration contract](docs/mvp/TYPESCRIPT-CONFIGURATION.md)
now fixes one shared checker/editor profile, inspectable with `npm run config`.
Loading user tsconfig options and complete project freshness remain deferred.
The [saved-entry project check](docs/mvp/PROJECT-CHECK.md) now supports a local
Surface import graph outside the examples. The separate
[project builder](docs/mvp/PROJECT-BUILD.md) now emits checked entries into owned
generations with an entry manifest. The [local project preview](docs/mvp/PROJECT-PREVIEW.md)
now consumes that manifest with explicit JSON props/CSS and verified generation
snapshots. The [development command](docs/mvp/PROJECT-DEVELOPMENT.md) now combines
build/preview and rebuilds saved sources in an explicit watch scope, retaining
the last valid build after errors. [Observed local dependencies](docs/mvp/OBSERVED-DEPENDENCIES.md)
now extend polling to concrete source, declaration and lookup paths outside the
initial folder. [Versioned preview inputs](docs/mvp/PREVIEW-INPUTS.md) now let the
development command adopt saved props/CSS on navigation without restarting,
retaining the last valid pair on input errors. [Typed preview props](docs/mvp/TYPED-PREVIEW-PROPS.md)
now validate against captured TypeScript inputs from the published build and
recheck fallback compatibility when that contract changes. Browser refresh remains manual. Complete dependency discovery,
arbitrary assets and configured-project support
remain outside those contracts.
The [technical verification command](docs/mvp/VERIFICATION.md) combines the check,
Node and native suites with retained evidence; it does not replace human DX
evaluation or expand those contracts.
The [Linux Docker/Xvfb gate](docs/mvp/HEADLESS-VERIFICATION.md) now exercises the
same native tasks without host-monitor windows; retain its platform provenance
alongside Windows results.

Use the current JS/TS implementation initially. A selective Rust port requires
a concrete need, measured benefit and behavior-preserving validation; replacing
the TypeScript semantic engine is not an established requirement.

Full v0.3, Rust migration, deep reactivity, SSR, HPKE, generalized production CSP,
publishing and comparative performance proof were not conditions for closing the
completed spikes. The owner's clarified competitive performance target is now
an explicit product requirement and pending evidence item for the MVP; it does
not change the historical viability result or imply that parity is already met.

The [caption initialization follow-up](docs/mvp/CAPTION-INITIALIZATION-STUDY.md)
records the latest supported-MVP resource/compiler step, 570 Node tests and
native global/list validation. Its allocation and heap gains, delivery cost and
mixed CPU are separate evidence; the competitive performance requirement stays
open.

The later [split caption helpers](docs/mvp/SPLIT-CAPTION-HELPERS.md) retain that
resource optimization through separate literal entrypoints and restore the
original dynamic helpers. Its 572-test gate and broad native verification pass;
delivery and mixed CPU remain separate evidence, with competitive parity open.
