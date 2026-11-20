# Spike 004 follow-up — Versioned asynchronous editor service

**Date:** 2026-11-10, Lima.
**Environment:** Windows; Node 24.21.0; TypeScript 5.9.3. Native tests:
VS Code 1.145.2 with extension-host Node 24.22.1.
**Result:** bounded GO. The native adapter now runs Surface/TypeScript analysis
in a persistent worker, rejects outdated results and reconstructs current
unsaved sources after a worker restart. This establishes a viable integration
route, not a production language server or exceptional human DX.

## Questions answered

| Question | Evidence |
|---|---|
| Can editor events run while the engine analyzes? | Node tests hold a real worker request in flight while a caller timer executes. The native Extension Development Host also services a timer before cold analysis completes. |
| Can an edit make pending results unusable? | Deterministically gated tests edit a document/dependency during diagnostics, completion, definition and rename. Old promises reject; new diagnostics select the current text. |
| Can the adapter avoid publishing stale diagnostics? | A native test edits during a real diagnostic batch, observes its rejection and verifies that no old revision is published after the edit. |
| Can a request be cancelled? | An AbortSignal rejects a running request, removes it from pending state and allows later requests to succeed. This is logical cancellation, not interruption of synchronous TS execution. |
| What happens if the worker exits or fails to load? | Pending work rejects. A subsequent request creates a fresh worker and replays the latest caller-owned sources. Both startup and in-flight failures are tested. |
| Does restart preserve unsaved changes? | The native test restarts after an unsaved three-file prop rename, then confirms that diagnostics use the renamed contract rather than the disk version. |
| Does shutdown release its state? | Pending requests reject, the owned worker terminates, source snapshots are cleared and new queries are refused. |

## Execution and version contract

```text
VS Code documents and events
        |
        v
async client: text store + workspace revision + worker generation
        | messages / promises
        v
one persistent worker: existing Surface/TypeScript service
        |
        v
response + captured revision/generation
        |
        v
current token? -> translate original ranges and publish/apply via VS Code
outdated/cancelled? -> discard
```

- `src/async-language-service.mjs` imports worker/path utilities, not the TS
  engine. Loading TS, parsing Surface and performing analysis happen in the
  worker. The compiler, runtime, strict grammar and existing direct service are
  unchanged.
- Every changed caller document or removal advances a workspace revision.
  Invalidation is intentionally global: changing a child invalidates a parent
  request even if the parent's text has not changed. This is conservative and
  can discard unrelated requests; selective dependency invalidation is unproven.
- Every worker instance has a new generation. Revision plus generation identify
  the response snapshot; an old token cannot become current after a restart.
- A query captures its token before waiting for startup. Edits during startup
  also invalidate it. Replay repeats if the caller's store changes during boot.
- Document updates and queries use the same ordered message channel. The worker
  checks tokens before executing queued jobs and gives queued edits/cancellation
  messages an opportunity to drop those jobs. The caller checks again on reply.
- Cancellation or a source change rejects the caller promise immediately. Late
  replies have no pending receiver and are ignored. A TS call already running
  may finish; the protocol does not claim to preempt it or guarantee bounded
  latency for a subsequent queued request.

The native adapter checks the token again before publishing diagnostics and
after asynchronously opening definition/rename targets. It forwards VS Code
cancellation to an AbortController. It does not mutate source before VS Code's
actual change events or save files automatically. Rename also refuses any edit
whose file is not owned by the caller's versioned document store, even if the
worker discovered that import on disk.

Diagnostics are cleared when their workspace changes or the worker fails and
are recomputed after the debounce. Empty markers while a refresh is pending are
not a completed validation result; a progress/status UX is not established.
Filesystem reads are checked against later reads and newly opened documents
before updating snapshots. A closed source missing from disk is removed rather
than retained as an old unsaved snapshot. Comprehensive watcher race behavior
is outside this experiment.

## Failure and replay policy

A dead worker is not restarted continuously in a background loop. A fresh
request or edit-triggered diagnostic request creates the replacement and replays
current texts. Old requests are rejected, never silently retried with offsets
captured from a previous version. Explicit restart rejects pending requests and
also invalidates old tokens.

Worker failures are reported through the adapter log. This is not a sandbox:
worker and caller retain normal process privileges. Only the four read/query
methods are accepted by the protocol; source mutations enter through document
updates. No project source or TS plugin is evaluated.

## Reproducible evidence

```sh
npm run check
npm test
# Existing local VS Code, with explicit trust of generated fixtures:
npm run test:editor
```

The Node suite passes **59/59 tests**, none skipped: the previous 50 plus nine
asynchronous service tests. The new tests use a separate gated worker entrypoint
to hold real engine calls in flight. They do not rely on artificial latency
thresholds to guess whether a race occurred. Production worker startup has no
test gate.

The added cases cover original-source results and caller responsiveness,
in-flight diagnostic invalidation, dependency invalidation of other operations,
logical cancellation, worker death, explicit restart/shutdown, edits during
startup, missing worker entrypoint, source removals and refusal of unversioned
rename targets. `check` and the test prebuild remain successful for the four
existing components.

Native run `run-YoFNWs` under the internal `spikes/004/editor-runs` directory
passed **6/6 tasks**, with exit code zero and `sourceFilesUnchanged: true`.
The original five provider tasks still pass. The sixth uses the adapter's real
diagnostic publication path, restarts its actual worker, observes request
dispatch, executes an extension-host timer, edits while the old batch is pending
and verifies the current error's range. It audits publication tokens against
the client state and confirms the unsaved renamed contract survived replay.
Observability is exported only in VS Code test mode; the test does not mock
`vscode` or replace the engine with a delayed fake.

Sample request times from this native run were 427 ms for the first timed
completion, 9 ms for repeating it, 18 ms for definition and 204 ms for rename.
Startup/queue costs can be included; these numbers are not comparable to the
earlier warmed samples and show no claimed speedup. The valuable observation
is that the calling host handled another event while analysis remained pending.
No p95, UI frame-rate, large-project memory or production throughput claim follows.

## Remaining uncertainty and GO / NO-GO

GO for the technical route: original-source tooling can use a shared TS-backed
engine through an asynchronous, versioned adapter. The main compiler and runtime
did not need replacement, and Surface syntax did not need to change for it.

Still unproven: hard preemption, bounded queues/backpressure, restart limits under
repeated failures, scalable indexing, live external `.ts` synchronization,
complete recovery, full compiler/editor semantic parity, multi-root/remote/LSP
integration, complete rename capture safety and human DX. The worker adds message
and source-copy costs which this small experiment does not characterize at scale.

These limits are a NO-GO for describing the prototype as a production editor
service. They do not negate the bounded feasibility evidence of Spike 004.
