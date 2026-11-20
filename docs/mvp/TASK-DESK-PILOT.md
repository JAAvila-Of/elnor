# Task desk application pilot

The owner selected a task and issue manager as the first application pilot
after the [public core integration](CORE-REGION-INTEGRATION.md). Intensive core
optimization is closed for this phase. Work now tests Surface's authoring and
application workflow against concrete needs. The [example](../../examples/task-desk/README.md)
provides the existing development command and its in-memory scope.

## Verified behavior

On 2026-11-16 the actual example passed project check, project build and two
new application regression tests. An isolated copy builds and executes using
the public compiler/runtime. Tests exercise filtering, keyed lifetime, local
CRUD, edit drafts, validation, protected selection, status summaries, monotonic
IDs, immutable initial props, stale callbacks and idempotent disposal. A typed
invalid status produces TS2345 mapped to the original Surface file and leaves
the last valid build manifest unchanged.

A sandboxed headless Edge pilot passed search/filter, edit/discard/save,
validation, status, create/delete confirmation, reload reset and keyboard Tab
flows with no page errors. Desktop 1280x900 and mobile 390x844 screenshots were
inspected; the mobile page has no horizontal overflow. This is targeted browser
verification, not a full accessibility audit or independent human DX acceptance.
The preview retained its restrictive CSP. The temporary browser session and
server were closed.

The complete public `src` hash map remains identical to the integrated core.
The earlier 626-test core gate and these two new tests are separate evidence;
the full suite was not rerun for this application-only increment. No new runtime
timings were collected.

Internal retained evidence:

- `elnor/.elnor/mvp/task-desk/run-40a9f9114b7d4fb99250183de4b14abb/result.json`
- `elnor/.elnor/mvp/task-desk/browser-2b1d2329495a49d7912ae192581257e8/result.json`
- Reproducers: `run-checks.py`, `run-browser.py`, `browser-pilot.mjs` and the two
  browser flow files in `elnor/.elnor/mvp/task-desk/`.

All expensive steps ran serially in bounded Windows Jobs: CPU 10%, aggregate
commit 768 MiB, Node heap 192 MiB, 24 processes and 4 GiB host-free floor;
offline limits 60/60 seconds and browser limits 45/12 seconds.
Failures remain retained: an isolated copy first exposed its missing explicit
ESM context; a test incorrectly expected a removed row to keep DOM identity
after remount; the first browser launcher had an incorrect relative import.
Each was corrected before the final successful runs. No core behavior or
resource limit was changed to make them pass.

## Multiline follow-up

The [textarea increment](TEXTAREA-BINDING.md) now resolves the single-line
description workaround below, with updated application and browser evidence.
The earlier source hashes and test counts above remain historical.

## Observed friction and next scope

The pilot deliberately uses existing Surface constructs. Description editing
uses a single-line input; priority and status use explicit buttons. This makes
multiline form controls and their typed binding/keyboard behavior the next
candidate for a bounded language/tooling increment. Design that contract and
its diagnostics before promising new syntax. The current single-line workaround
is not evidence that textarea/select/native form submission are supported.

Parent/child events implement draft protection successfully, but their
readability and recovery still need human authoring feedback. Mobile details
appear below the task list; navigation with longer real lists needs evaluation.
Persistence, routing, backend access and authentication remain separate scope.

## Persistence contract follow-up

The [versioned edit contract](TASK-PERSISTENCE-CONTRACT.md) now defines the
first persistent slice and verifies revision conflicts, retained outcomes and
transactional replay with an internal SQLite model (16 tests). The public app
remains in memory. Its draft-close/event ownership must change before integrating
a provider; create/delete and other shortcuts need explicit persistent contracts.

## Separate persistent editing variant

The [local persistent variant](PERSISTENT-TASK-DESK.md) now implements the
versioned edit contract with a real journal/HTTP/SQLite flow. It keeps drafts
open until confirmation and verifies reload, provider restart, conflicts,
outage/retry and epoch mismatch in the browser. The original application remains
the in-memory CRUD reference; create/delete are absent in the persistent variant.

## Persistent CRUD follow-up

The [local persistent variant now supports CRUD](TASK-CRUD.md), with definitive
creation identities, revision-checked logical deletion, tombstone snapshots and
explicit recovery. It preserves drafts and migrates the earlier edit-only ledger.
The original in-memory example remains a separate reference. Human DX acceptance
and broader deployment/coordination contracts remain open.

## Performance guard

Keep the accepted fixed broad matrix and its 10% Svelte CPU margin as a
regression guard for compiler/runtime changes. Preserve all phases and family
weighting, correctness checks and retained exceptions; do not tune this small
app to replace that matrix. Application-only changes do not justify repeating
the full benchmark campaign. A core change requires the relevant correctness
gate and affected workload comparisons against the accepted source, broadening
when shared scheduling, tracking or lifetime behavior changes.

The two accepted Svelte cohorts establish bounded majority parity. Updated
React measurements on the expanded matrix, representative application timing,
startup, memory and delivery comparisons remain open and do not block this
Surface pilot. Existing historical React numbers must retain their source and
date distinction. Human DX acceptance and production readiness remain open.
