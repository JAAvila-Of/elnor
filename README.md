# Elnor — Surface feasibility experiments

[CI status](https://github.com/JAAvila-Of/elnor/actions/workflows/ci.yml) ·
[Releases](https://github.com/JAAvila-Of/elnor/releases) ·
[Contributing](CONTRIBUTING.md)

Elnor is an experimental frontend framework with a language called Surface.
Its provisional name definition is **Expressive Language for Native, Optimized
Rendering**. Here, native refers to the browser DOM. This meaning was adopted
during development; it is not a historical etymology or a performance guarantee.

Each spike reduces technical uncertainty about the intended design. Developer
experience comes first, followed by security and performance. This is not a
production framework.

**Performance requirement:** at least on par with Svelte and React, aiming to
outperform them while preserving Surface syntax and DX. This
[competitive target](docs/mvp/PERFORMANCE-TARGET.md) is required product behavior,
not a result already demonstrated by the current tests or development timings.

**Viability status:** bounded technical GO for a small MVP. See the
[closure report](docs/spikes/004/VIABILITY-CLOSURE.md) for evidence, limits and
the [ordered MVP scope](tasks/005-mvp.md). The last complete isolated candidate gate passed
1024 Node tests in 83 files. The exact public transfer of
[persistent Task desk CRUD](docs/mvp/TASK-CRUD.md) passes check/build and 222
selected application/async/lifecycle regressions. Six CRUD browser phases verify
creation/deletion, lost acknowledgements, provider restart, conflicts, outage,
rollback and retained drafts. Six separate editing regression phases preserve
changed-history blocking. The variant creates, reads, edits and logically deletes
tasks; the original Task desk remains in memory. Emitter, runtime and native editor implementation sources are unchanged from the
[local helper revision](docs/mvp/OPERATION-HELPER.md), whose separate native suite
passed 55 checks. That helper remains an optional prototype. Earlier
[component disposal](docs/mvp/COMPONENT-DISPOSAL.md) and
[managed reset](docs/mvp/FORM-RESET.md) retain their earlier regression evidence.
[ARIA states](docs/mvp/DOM-ARIA-STATES.md) retain their earlier
three-route browser/accessibility-tree evidence. [Typed DOM classes](docs/mvp/TYPED-DOM-CLASSES.md)
retain their separate earlier native/browser evidence. UserEditor and headless project-preview pilots retain their
separate bounded evidence.
The [host-origin follow-up](docs/mvp/TASK-HOST-ORIGIN.md) adds a stable CLI
port, validation before startup and no-fallback port admission. Its separate
92-case public gate and real complete-host browser restart preserve the pending
journal and confirm it without a second write. The earlier 990-case complete gate
remains historical; this host-only increment did not rerun that entire suite.

The [checker action-line correction](docs/mvp/CHECKER-ACTION-LINES.md) now maps
CLI errors inside multiline actions to the original parameter/body line, with
165 selected public regressions and unchanged generated-program evidence. The
[Surface authoring exercise](docs/mvp/TASK-DX-EXERCISE.md) is technically prepared;
independent human observations remain pending.

The [draft authoring follow-up](docs/mvp/DRAFT-DX.md) centralizes the new-task
default and shares local field preparation without changing recovery policy or
Surface. Check/build, 123 selected public regressions and twelve repeated browser
phases pass. This application-only change does not rerun the complete suite.


The [MVP readiness review](docs/mvp/MVP-READINESS.md) keeps the MVP open for
independent human workflow feedback and representative latency characterization.
An [initial timing baseline](docs/mvp/DEVELOPMENT-MEASUREMENTS.md) is now available
through `npm run measure:dev`; it uses owned synthetic fixtures and has no latency
pass/fail budget or browser-paint claim.
The [implemented subset](docs/surface/MVP-SUBSET.md) and
[operational contracts](docs/surface/MVP-CONTRACTS.md) separate current behavior
from the destination design; formatting integration and human DX evaluation remain open.

The [authoring walkthrough](docs/mvp/AUTHORING-WALKTHROUGH.md) provides an isolated
Counter/App exercise with setup/check/build/preview/status commands. It opens no
apps automatically and preserves existing source edits. An assisted counter-edit
task succeeded; broader evaluation remains open. A
page-level [build-status notice](docs/mvp/PREVIEW-BUILD-STATUS.md) now identifies
saved Surface/CSS edits missing from the preview when reloading. Its
[terminal diagnostics](docs/mvp/AUTHORING-ERROR-RECOVERY.md) now show checked
source lines and distinguish failed checks, retained previews and first-build
failures. A
[conservative indentation formatter](docs/mvp/FORMATTER.md) now offers a pure API
and read-only `npm run format -- ...`. Its
[versioned adapter integration](docs/mvp/VERSIONED-FORMATTING.md) is implemented
with Node/API-double evidence and a native formatting pass; automatic writes
remain outside the formatter CLI contract. The
[fifteen-task native suite](docs/mvp/NATIVE-VALIDATION.md) passed on 2026-11-11,
including formatting and the two saved-dependency watcher tasks.
The persistent launcher also passed two consecutive scripted runs with
Workspace Trust enabled; repeated test-mode trust prompts are no longer part of
the normal launch path for the current isolated profile.

[Saved TypeScript invalidation](docs/mvp/DISK-INVALIDATION.md) now refreshes
analysis for never-opened local dependencies while preserving unsaved buffers.
It has Node/API-double coverage and bounded native watcher evidence.
The [TypeScript configuration contract](docs/mvp/TYPESCRIPT-CONFIGURATION.md)
uses one fixed checker/editor profile and explicitly ignores `tsconfig.json`.
Inspect it with `npm run config`; configurable project support remains deferred.

The [async policy guide](docs/mvp/ASYNC-POLICY.md) consolidates the completed
initial technical evaluation, operation choices and the acceptance criteria for
a persistent application pilot. The operation helper remains optional.

## Run locally

The persistent-recovery provider tests additionally require Python 3 with its
standard-library SQLite module. Set `ELNOR_TEST_PYTHON` to select an interpreter;
otherwise the tests use `python` on Windows or `python3` elsewhere. This fixture
adds no framework runtime dependency or package installation.

`npm run verify:mvp` defaults to the complete
[Docker/Xvfb headless gate](docs/mvp/HEADLESS-VERIFICATION.md), without windows on
the host monitor. `npm run verify:headless` is an alias for the same launcher.
It retains a [combined verification report](docs/mvp/VERIFICATION.md) and fails
if Docker is unavailable; it never falls back to a desktop editor.
`npm run verify:windows` is a separate, explicit desktop run and opens VS Code.
Linux and Windows evidence are retained separately.

To check a local entry outside the examples, use
`npm run check:project -- <path/to/App.eln>`. This
[saved-source project check](docs/mvp/PROJECT-CHECK.md) follows Surface imports
without modifying the project or generating a preview; it keeps the fixed TS profile.
`npm run build:project -- <entry.eln> --out <directory>` now
[builds a local entry](docs/mvp/PROJECT-BUILD.md) into owned generations and
publishes an entry manifest. It does not start a server or create preview fixtures.
`npm run preview:project -- <build-directory> [--props <object.json>] [--css <file.css>]`
serves that [local build](docs/mvp/PROJECT-PREVIEW.md) on loopback with explicit
inputs and verified generation snapshots. Rebuild, then reload to adopt a new
generation; restart to change props/CSS. It opens no apps automatically.
`npm run dev:project -- <entry.eln> --out <directory>` combines build/preview and
[rebuilds watched saved sources](docs/mvp/PROJECT-DEVELOPMENT.md). Save, wait for
the build result, then reload; failures preserve the last verified preview and
show a notice. Select a broader source scope with `--watch-dir <directory>`.
The checker also [observes concrete local dependency paths](docs/mvp/OBSERVED-DEPENDENCIES.md),
so imported sources outside that scope can rebuild without a broader directory scan.
In `dev:project`, selected [props/CSS inputs](docs/mvp/PREVIEW-INPUTS.md) now
update on navigation: save and reload without restarting. Invalid input pairs
retain the last valid pair with a notice; open pages retain their earlier URLs.
Development props now [reuse the published entry's TS contract](docs/mvp/TYPED-PREVIEW-PROPS.md),
including imported types. Typed field errors retain a compatible earlier pair;
after a contract change, incompatible fallback props require correction.

```sh
npm ci
npm run check
npm test
npm run build
npm run preview -- UserList
npm run probe:language
```

Use Node.js 24 to match CI on Linux, Windows, and macOS. See
[Surface examples](docs/surface/EXAMPLES.md) for patterns you can try in a
preview and [the contribution guide](CONTRIBUTING.md) to run focused checks.

## Current experiments

See the [Surface syntax examples](docs/surface/EXAMPLES.md) for runnable
component patterns, forms, and the current experiment boundaries.

- [Spike 003](docs/spikes/003/RESULTS.md): composition, typed props/events/slots
  and standalone previews.
- [Spike 004](docs/spikes/004/RESULTS.md): mapped diagnostics, navigation,
  completion and applied rename on original `.eln` documents through an
  shared service and a minimal native VS Code development adapter. Twelve
  editor tasks pass; exceptional human DX and general recovery remain unproven.
- [Surface v0.3](docs/surface/SPECIFICATION.md): target design, not implemented
  feature documentation.
- [Incomplete editing and responsiveness](docs/spikes/004/RECOVERY.md): bounded
  recovery and the initial worker-boundary proof.
- [Asynchronous editor service](docs/spikes/004/ASYNC.md): a persistent worker,
  versioned responses, logical cancellation and unsaved-source replay on restart.
- [Shared contract validation](docs/spikes/004/PARITY.md): CLI/editor parity for
  the tested Surface graph rules, including original-source ranges.
- [Acceptance parity](docs/spikes/004/ACCEPTANCE.md): optional props, shared
  generator boundaries and explicit diagnostics for unimplemented prop defaults.

`src/` contains the experimental compiler, runtime and language service.
`examples/` contains components and fixtures. `tests/` contains reproducible
evidence. `tasks/004-language-service.md` describes the tooling experiment.

See [Contributing](CONTRIBUTING.md) for project checks and commit conventions.
Elnor is dual-licensed under [MIT](LICENSE-MIT) or [Apache 2.0](LICENSE-APACHE).
See the [security policy](SECURITY.md), [trademark policy](TRADEMARKS.md),
and [release process](docs/RELEASING.md).

## Limits

The preview has no HMR. The service has bounded recovery and an experimental
VS Code client ([run the editor experiment](editors/vscode/README.md)).
Full Surface syntax, full formatting/editor integration, generalized security, SSR, nonces, HPKE and
production performance remain unproven. The bounded browser pilot exercised
restrictive preview CSP.
