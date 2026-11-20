# Spike 004 follow-up — Incomplete editing and thread responsiveness

**Date:** 2026-11-10, Lima.
**Environment:** Windows; Node 24.21.0; TypeScript 5.9.3. Editor regression:
VS Code 1.145.2 with extension-host Node 24.22.1.
**Result:** GO for bounded editor recovery and for a subsequent asynchronous
editor-service experiment. Full recovery and a nonblocking VS Code adapter are
not established by this iteration.

**Later evidence:** the [asynchronous follow-up](ASYNC.md) now integrates a
versioned worker adapter. Thread and test counts below describe this earlier
recovery iteration.

## Questions

1. Can a local incomplete statement preserve useful component contracts and
   intact source references without accepting new compiler syntax?
2. Does the synchronous analysis route occupy its calling thread long enough
   to warrant evaluating a separate thread?
3. Can the same service cross that thread boundary without changing original
   positions, completion entries, rename edits or version checks?

## Recovery corpus

The initial ten-case probe preserved contracts and prop completion for three
partial states: partial prop name, missing final brace and trailing member
access. It lost the whole component projection for four local errors. Three
structurally uncertain cases were expected to remain unrecovered.

The final corpus adds an unterminated prop string, yielding eleven cases:

| Incomplete edit | Final contract/navigation and prop completion |
|---|---|
| Partial prop name | Preserved |
| Missing final component brace | Preserved through EOF recovery |
| Trailing member access | Preserved |
| Unclosed single-line UI string | Preserved, including intact sibling references |
| Unclosed quoted prop value before another component use | Preserved outside the damaged value |
| Unfinished non-structural UI statement | Preserved outside the skipped line |
| Unfinished `state` declaration | Preserved outside the skipped declaration |
| Incomplete expression in a TS action | Preserved using TS syntax recovery |
| Incomplete component parameter type | Refused; no fabricated contract |
| Unclosed block comment | Refused; no fabricated contract |
| Unclosed parenthesized prop expression | Refused; no fabricated contract |

Eight cases retain useful operations; three deliberately refuse recovery. Each
case must still produce diagnostics, reject rename while incomplete and return
to a clean state after repair. This small corpus is not a recovery percentage
for the language as a whole.

Additional tests cover multiple broken lines with exact intact source positions,
Unicode, tabs and CRLF. Valid backslash-continued strings (including CRLF) and
multiline TS templates survive beside a broken UI line. The earlier test for
discarding an unrecoverable file now uses an unclosed block comment because the
single-line string case has stronger, dedicated recovery assertions.

## Implementation and DX decision

The strict compiler path is unchanged. It still rejects every incomplete case
in the corpus. The editor tries that path first and keeps its diagnostics.
Only the editor fallback:

- Ends a broken single/double-quoted string at an unescaped line boundary.
  It preserves backtick multiline behavior and escaped line continuations.
- Skips unsupported UI lines that contain no structural braces and records
  their original diagnostic positions.
- Skips an unfinished non-structural `state`/`calc` line with a diagnostic.
- Leaves malformed action expressions for TypeScript's parser to diagnose.
- Projects a broken quoted attribute as an **unmapped** placeholder so that its
  quote cannot consume generated call syntax and disable a later intact use.

Source text is not rewritten, offsets are not shifted and no valid old snapshot
is substituted for the current incomplete document. Skipped statements are not
treated as valid declarations: references to a skipped binding may produce
additional unresolved-name errors. Cascading/duplicate diagnostics still need
UX work. Rename stays disabled whenever a loaded Surface file has parse errors.
Semantic binding validation remains strict, so skipping a declaration can still
make another construct invalidate the projection; this is not whole-file recovery
for every use of `state`.

These choices preserve useful operations while typing without asking authors
to change syntax for the parser. They do not settle ambiguous scopes, arbitrary
lexical errors, malformed imports, all multiline UI cases or complete recovery.

## Calling-thread observation

`npm run probe:recovery` runs in a fresh Node process. It separately records
module import, service construction, initial analysis and a queued timer. The
timer cannot run while the synchronous service occupies that same thread.

| Observation | Initial probe | Final probe |
|---|---:|---:|
| Load service module and TS | 164 ms | 144 ms |
| Construct service | 1 ms | 1 ms |
| Open healthy sources and obtain first diagnostics | 387 ms | 350 ms |
| Timer queued before that analysis can execute | 387 ms | 350 ms |

The difference between runs is not evidence of an optimization. These are
single observations on a tiny fixture, not a distribution or benchmark. They
show that the synchronous call blocks its caller. They do not measure the VS
Code renderer, UI frame rate, user keystroke latency or every initialization
path. Increasing debounce changes when analysis starts, not its ability to
service other events during that call.

## Worker-boundary proof

The worker experiment lives only in `tests/fixtures/service-worker.mjs` and
`worker-client.mjs`. One persistent worker owns the existing service and accepts
a whitelist of method calls through message passing. It neither evaluates
source components nor creates a worker per request. The VS Code adapter still
uses its original in-process service.

In the final probe, worker startup took 181 ms while a timer in its caller ran
after 4 ms, before readiness. Initial worker analysis took 324 ms while another
caller timer ran after 1 ms, before the response. The useful evidence is this
ordering and separation, not a claim that 324 ms is faster than 350 ms.

The worker test compares original-source diagnostics, definitions, completion
entries and the complete rename plan against a direct service. It then modifies
a document, verifies that the transferred plan is stale and checks rejection
of its application. Unsupported method calls are rejected.

This is a feasibility test of moving the same work, not a production transport.
There is no editor integration, queue policy, cancellation/preemption,
restart/replay recovery, backpressure or resource-bound guarantee. An additional
isolate has costs not characterized here. A worker is also **not a trust
boundary or filesystem sandbox**; it retains normal process privileges.
See the [Node worker-thread documentation](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html).

## Verification

```sh
npm run check
npm test
npm run probe:recovery
# Local VS Code; explicit trust of generated fixtures remains required:
npm run test:editor
```

- `check` and the test prebuild pass for the four existing components.
- **50/50 Node tests pass**, none skipped: 17 runtime/compiler tests, 19 original
  language-service tests, 13 recovery assertions and one worker-boundary test.
- **5/5 native editor tasks pass** in `run-R04IMV`, under the local internal
  `spikes/004/editor-runs` directory. The updated break/repair task verifies that
  an unclosed UI string preserves both the component definition and an intact
  sibling reference. Its report confirms unchanged fixture files on disk.
- Raw before/after probe observations are stored internally as
  `elnor/.elnor/spikes/004/recovery-before.json` and `recovery-after.json`.
  These are local evidence paths, not artifact custody revision identities.

## Next uncertainty

The thread-boundary result supports trying an asynchronous editor adapter with
versioned responses. The critical experiment is to edit again while an old
request is running and verify that stale diagnostics/edits never reach the
editor, while its extension-host event loop remains available. Cancellation,
shutdown and worker failure/restart need explicit evidence. Do that before
claiming the current VS Code integration no longer blocks or expanding Surface.
