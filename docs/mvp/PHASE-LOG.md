# Phase log

This log keeps the progress notes that `GOALS.md` collected under "Next phase"
before 2026-11-25, unchanged, with their links. The current plan is
[the roadmap](../ROADMAP.md).

Performance work now uses an [expanded synthetic matrix](EXPANDED-PERFORMANCE-MATRIX.md)
alongside keyed lists: small components, forms, composition/slots and localized
state, with runtime, lifecycle/memory, delivery and tooling kept separate.
Future changes must be evaluated for broader impact rather than a single list
size. Representative-app acceptance and repeatable startup wall comparisons
remain open; broader fixture coverage does not by itself close them.
The [visibility-controlled startup follow-up](CONTROLLED-STARTUP.md)
now supplies explicit visibility histories and balanced controls for all four
families. Remaining same-code wall variation still prevents startup wall ranking;
representative application and human DX acceptance remain open.
Separate [startup phase diagnostics](STARTUP-PHASE-DIAGNOSTICS.md) now
localize several navigation/browser/frame delay classes across the matrix.
Their instrumented observations do not identify one universal trigger, replace
normal comparisons or establish a framework speedup.

The [functional core closure](CORE-READINESS.md) records the current
550-test gate, native DOM checks and resolved scheduler/lifetime blockers.
It supports continued work on the documented MVP subset; competitive performance
and independent human DX acceptance remain open.
The subsequent [current-core comparison](CURRENT-CORE-COMPARISON.md)
retains both framework controls and A/A for that exact implementation. It narrows
the diagnostic priorities without establishing product parity or an overall CPU
speedup from the recent correctness fixes.

The [MVP readiness review](MVP-READINESS.md) separates the demonstrated
technical loop from pending human feedback and representative latency evidence.
The MVP remains open. The next technical step is to characterize that loop and
propose evidence-based budgets; this adds no Rust or full-v0.3 requirement.
The [first measured baseline](DEVELOPMENT-MEASUREMENTS.md) now records
that loop on two small synthetic fixtures. A representative workload and accepted
budgets still need confirmation; these measurements do not close human DX.

Follow the ordered [MVP scope](../../tasks/005-mvp.md): define the supported subset and
contracts, evaluate real developer workflows and formatting, then make the
project/dependency lifecycle predictable. Keep the destination specification
separate from current support claims. Retain reproducible regression evidence.
The [subset baseline](../surface/MVP-SUBSET.md) and
[operational contracts](../surface/MVP-CONTRACTS.md) complete the definition
step. The [authoring exercise](AUTHORING-WALKTHROUGH.md) now collects
assisted human feedback; its [preview notice](PREVIEW-BUILD-STATUS.md)
explains pending saved changes on reload. The [formatter](FORMATTER.md) now implements
conservative indentation through a pure API/read-only CLI, under its
[contract](FORMATTER-CONTRACT.md). This is not completed human DX
validation or automatic file writes. The [versioned adapter](VERSIONED-FORMATTING.md)
is implemented and tested through a real worker/API double. The
[fifteen-task native suite](NATIVE-VALIDATION.md) passed on 2026-11-11,
including formatting and saved-dependency watcher behavior.
[Saved TypeScript dependency invalidation](DISK-INVALIDATION.md)
now handles never-opened local dependencies without adopting disk text as buffers;
the initial [TypeScript configuration contract](TYPESCRIPT-CONFIGURATION.md)
now fixes one shared checker/editor profile, inspectable with `npm run config`.
Loading user tsconfig options and complete project freshness remain deferred.
The [saved-entry project check](PROJECT-CHECK.md) now supports a local
Surface import graph outside the examples. The separate
[project builder](PROJECT-BUILD.md) now emits checked entries into owned
generations with an entry manifest. The [local project preview](PROJECT-PREVIEW.md)
now consumes that manifest with explicit JSON props/CSS and verified generation
snapshots. The [development command](PROJECT-DEVELOPMENT.md) now combines
build/preview and rebuilds saved sources in an explicit watch scope, retaining
the last valid build after errors. [Observed local dependencies](OBSERVED-DEPENDENCIES.md)
now extend polling to concrete source, declaration and lookup paths outside the
initial folder. [Versioned preview inputs](PREVIEW-INPUTS.md) now let the
development command adopt saved props/CSS on navigation without restarting,
retaining the last valid pair on input errors. [Typed preview props](TYPED-PREVIEW-PROPS.md)
now validate against captured TypeScript inputs from the published build and
recheck fallback compatibility when that contract changes. Browser refresh remains manual. Complete dependency discovery,
arbitrary assets and configured-project support
remain outside those contracts.
The [technical verification command](VERIFICATION.md) combines the check,
Node and native suites with retained evidence; it does not replace human DX
evaluation or expand those contracts.
The [Linux Docker/Xvfb gate](HEADLESS-VERIFICATION.md) now exercises the
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

The [caption initialization follow-up](CAPTION-INITIALIZATION-STUDY.md)
records the latest supported-MVP resource/compiler step, 570 Node tests and
native global/list validation. Its allocation and heap gains, delivery cost and
mixed CPU are separate evidence; the competitive performance requirement stays
open.

The later [split caption helpers](SPLIT-CAPTION-HELPERS.md) retain that
resource optimization through separate literal entrypoints and restore the
original dynamic helpers. Its 572-test gate and broad native verification pass;
delivery and mixed CPU remain separate evidence, with competitive parity open.
