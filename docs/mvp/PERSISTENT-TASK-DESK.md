# Local persistent Task desk editing pilot

This is the historical editing-only study. The subsequent
[persistent CRUD increment](TASK-CRUD.md) adds creation, versioned logical deletion,
tombstone snapshots and migration of the earlier ledger. Use its evidence and the
current example README for the present workflow; the editing evidence below is
retained with its original scope.

The separate [persistent variant](../../examples/persistent-task-desk/README.md)
edits existing tasks through a scoped journal, HTTP and a loopback SQLite
provider. The original Task desk remains the in-memory CRUD reference. No
compiler/runtime/editor implementation or stable persistence API changes.

## Workflow and ownership

Refresh tasks loads an authoritative snapshot. Selecting a task opens its full
editable draft with a captured revision. Save changes freezes the task, key and
expected revision in the journal before sending. Storage failure prevents the
write. The editor stays open while awaiting confirmation and later typing stays
separate from the sent command. New command admission remains single-flight and
blocked while a journal exists. Creation/deletion and local status shortcuts are
absent; status and priority changes belong to the versioned edit form.

The host owns one stable client outside the component. The client reads its
journal without starting network work. Reload restores an unresolved attempted
draft; unsaved later edits are not a durable draft store. Check result explicitly
queries the provider. A matching absence permits Retry saved edit with the exact
same key/command. A network error, unavailable service or missing endpoint never
authorizes replay. Disposal retires the view and requests abort without deleting
the journal or promising remote rollback.

Applied, rejected, conflict and missing outcomes require Finish attempt before
another command. It compares the stored bytes and only removes the correlated
terminal journal. A restored client must query again before acknowledging.
Key/payload/epoch mismatch blocks the attempt. The view closes the editor after
an applied acknowledgement only when the current fields still match the sent
payload; later edits and rejected/conflicting drafts remain open.

Refresh tasks updates confirmed list data while preserving editable fields.
On conflict, Finish attempt acknowledges that terminal result; refresh then
shows current data. Use current revision explicitly adopts that task revision
without overwriting the draft. The person reviews the fields before saving a
new command. It is not an automatic merge or force-save. Stale cached revisions
can produce another safe conflict and require another review.

## Provider and transport

The [versioned edit contract](TASK-PERSISTENCE-CONTRACT.md) is implemented by the
example's ledger and HTTP fixture. Replay lookup precedes revision checking.
An old confirmation is historical and never replaces current task data. Task
data/revision and terminal result commit in one transaction. Same-key different
data preserves the original result. Two different writes from the same revision
produce one applied result and one retained conflict.

| Request | Contract |
|---|---|
| GET `/scopes/{scope}/tasks` | Confirmed task snapshot, per-task revisions, scope and epoch |
| PUT `/scopes/{scope}/commands/{key}` | Full immutable replace command; applied 200, rejected 422, conflict/missing/key-conflict 409 |
| GET `/scopes/{scope}/commands/{key}` | Retained terminal result or authoritative absence, 200 |
| `X-Provider-Epoch` | Expected ledger history; mismatch 412, no mutation |

Malformed bodies are refused without creating a terminal record. A valid command
with a short title gets a retained business rejection. Both sides use UTF-16
length bounds and JS-compatible title trim rules. The client also verifies
result identity, echoed command, expected applied revision and response status.
Snapshot refresh preserves prior data on failure, duplicate IDs or a regressed
revision; published task arrays/objects are frozen.

The Node fixture host builds the view, serves external modules/CSS and proxies
its loopback API under `connect-src 'self'`. Its module map has no filesystem
fallback. This policy belongs only to this local fixture; the framework's general
preview CSP is unchanged. Python 3/stdlib SQLite are required, with
`ELNOR_TEST_PYTHON` selecting the interpreter. No package installation is added.

## Explicit limits and DX

One browser writer owns one journal slot. Scope is a namespace, not authentication.
The provider has no authorization, production deployment, result expiry/GC or
backup-history transition contract. Seed is explicit and refuses existing tasks;
startup errors do not repopulate the application from preview props. Keep the
ledger epoch stable only while its full outcome history is retained.

The journal belongs to a browser origin/profile. The later
[host-origin increment](TASK-HOST-ORIGIN.md) gives the CLI a stable default port
4337 and explicit --port selection, failing without fallback when occupied.
Programmatic hosts retain port 0 by default; --port 0 is an explicit ephemeral
CLI option. Recovery across host restarts needs the same origin/profile. Browser clearing/eviction, multiple tabs, account transitions and
durable unsaved drafts need additional application coordination. No encryption,
automatic retry or abandon-unknown control is supplied.

DX is deliberately explicit: Refresh, Check, Finish and revision review add steps;
the host/client wiring remains application code. This pilot demonstrates recovery
and conflict behavior, not independent human acceptance or a polished stable SDK.
The earlier optional operation helper is not required. Delivery measurements
include this view and client, exclude the Node/Python fixture host, and establish
no CPU/startup/GC ranking or equivalent-workload overhead.

## Evidence

| Gate | Result | Internal evidence |
|---|---|---|
| Complete candidate | Check/build; 990/990 tests in 78 files, no skips/cancellations | full-c34b39e51c204ea5953ae0047a8754cd |
| New coverage | 15 client, 9 HTTP/SQLite and 5 compiled Surface cases | full-c34b39e51c204ea5953ae0047a8754cd |
| Browser | Six phases; reload, lost acknowledgement, three starts of the original ledger, conflict, outage/retry and replacement-history block | browser-3e05ebc2be534a43afbd8df8921f6256 |
| Delivery | View plus client: 22990 JS bytes/7488 gzip-9; host/provider excluded | cost-535de8e6115e48719e408416cbaa795d |
| Public transfer | Check/build; 196/196 selected cases; exact source hashes | promotion-4e1552d909b840eb90780a752892495b |

Retained `ledger.sqlite` SHA256: `01da35856f5555508dcd94d715de844063a7d8df39befba769e4584f17ca6a43`.

The retained browser ledger ends with TASK-1 at revision 4 (`My conflict draft`)
and TASK-2 unchanged at revision 1. The final foreign-history probe intentionally
keeps its attempted edit blocked and byte-identical instead of discarding it.
No unhandled/window errors or CSP violations were recorded across the tested
reloads. The database contains synthetic fixture tasks only.

Evidence, exact source hashes, producers and before/candidate/documentation
archives are retained under `elnor/.elnor/mvp/persistent-task-desk/`.
The full candidate and public selected gates are separate runs. Native editor
evidence remains historical because compiler/runtime/editor sources are unchanged;
no new native run, production backend, full persistent CRUD or human DX acceptance
is claimed. Stage 5 of the broader roadmap remains open.
