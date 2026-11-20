# Local persistent Task desk CRUD

The local persistent variant now creates, reads, edits and logically deletes
tasks through the same journal/HTTP/SQLite contract. The in-memory example
remains a separate reference. There is no new Surface syntax, framework runtime
API or production backend. The stable CLI origin and ownership rules remain.

## Commands and identity

| Kind | Frozen command | Applied result |
|---|---|---|
| create | `{kind:"create", task}`; client-generated definitive ID, status open | Revision 1 |
| replace | `{kind:"replace", taskId, expectedRevision, task}` | Expected revision + 1 |
| delete | `{kind:"delete", taskId, expectedRevision}` | Expected revision + 1 and deleted:true |

Creation generates the task ID once and stores it with the command before PUT.
The transport key is separate. Retry uses both original identities and exact
payload, including after lost acknowledgement, reload or provider restart.
Different commands cannot claim the same live or deleted task ID. The example
uses TASK- plus the host's UUID generator; IDs are longer than the in-memory
example's sequential numbers. A friendly display-number scheme remains separate
from the durable identity contract.

The provider looks up the retained key/command result before checking current
task state. Replaying an old create after a later delete returns its historical
revision-1 confirmation without recreating the task. Delete replay similarly
returns the original deletion result without advancing another revision.
Same key/different command remains blocked. Missing task and revision conflict
are retained terminal outcomes and require acknowledgement before a new command.

Create starts open and uses the existing title/assignee/description/priority
bounds. Its status select is disabled until creation confirms. A short title is
a retained business rejection at the provider; malformed command structure is
refused without recording a terminal result. The HTTP routes and status codes
remain those of the [editing transport](PERSISTENT-TASK-DESK.md).

## Logical deletion and snapshots

Delete requires the selected revision. A stale delete conflicts instead of
removing newer edits. A stale replace against a tombstone returns missing and
cannot resurrect it. There is no automatic merge, force-delete or reuse of a
deleted identity within the ledger history.

Deletion sets a retained deleted flag and increments revision in the same
transaction as its command result. Rollback between mutation and result storage
leaves neither partial effect nor terminal receipt. Task rows and command
results remain retained; this is logical deletion, not physical data erasure.

Snapshots contain live tasks plus `tombstones: [{id,revision}]`. Both sets are
read in one SQLite read transaction. The client permits a known task to disappear
only with a strictly newer tombstone, rejects overlapping/duplicate IDs, and
does not accept disappearance or regression of known tombstones. An older
snapshot cannot bring a deleted task back. A verified applied-delete result
also supplies a monotonic tombstone immediately, so acknowledgement does not
temporarily expose a stale editable row. Create/replace receipts remain
historical confirmation; refresh selects current confirmed task data.

## Migration and recovery

Startup adds the deleted column transactionally to the earlier edit-only task
table when absent. Existing live rows default to not deleted; their revisions,
payloads, command results and ledger epoch remain. Tests open an actual old
schema, replay an existing receipt, and then delete through the new provider.
Do not use an older provider binary to write a ledger after this migration.

The journal keeps schema 1 with a discriminated command kind. Existing replace
entries remain understood. Older clients cannot operate on the new create/delete
commands; preserve/refuse unsupported journals rather than deleting them.
The client recognizes a correlated `GET` or `PUT` result with HTTP 410 and
`status: "receipt-unavailable"`. Scope, epoch, and command key must match.
The result blocks retry and acknowledgement and preserves the local attempt.
An authoritative `absent` result still requires HTTP 200. A provider that
forgets receipts needs a durable distinction between forgotten and never
submitted keys. A forgotten key cannot authorize replay.

The SQLite fixture can explicitly retire a receipt in one update. It replaces
the stored result with a marker and clears the stored command intent. The
marker survives provider restart and reserves the key against both the original
command and a different command with that key. A never-submitted key stays
absent. The fault header can also simulate a 410 without changing SQLite.
Marker reclamation, physical purge, backup restore and power-loss behavior
remain outside this fixture.

### Receipt retention in the fixture

Keep full receipts for at least 30 days after the provider stores a terminal
result. This is a starting window for the local pilot so someone who returns
to the desk after several weeks can still check a saved attempt. The original
result timestamp alone sets the deadline. After the window, the provider may
replace the receipt with a marker. Keep that marker for the lifetime of the
ledger epoch. Removing it within the epoch would let the provider report a
previously submitted key as absent and could admit another write. Routine
retirement keeps the epoch and current task data intact.

The ledger records provider UTC time in the same transaction as each terminal
result, with nanosecond resolution in storage. Migration gives existing full
receipts with unknown age a full window starting at migration time. Legacy
markers remain reserved and have no age entry. Reads and replays leave the
stored receipt date intact.

The fixture's `Ledger.retire_expired_receipts(scope, epoch)` operation is an
explicit maintenance pass. It retires up to 100 eligible receipts per
transaction, oldest first, and includes receipts exactly 30 days old. A failed
pass rolls back its entire batch; a later invocation picks up remaining
eligible receipts. The local host runs a schedule only when an interval is
explicitly supplied. A production schedule still needs operational monitoring
and a trusted clock policy across provider restarts. A restored
backup must preserve the active epoch's receipt and marker guarantees or use a
new epoch that refuses attempts from the old history.

The [maintenance command](../../examples/persistent-task-desk/README.md#maintain-receipts)
previews an existing, migrated ledger in read-only mode. Apply requires the
scope and preview's epoch, then reports eligible, retired and remaining counts
from a fresh transaction. The epoch check occurs before any receipt is changed.

The local schedule runs one batch at a time. On each process start, it waits
for an operator to supply a UTC sample checked against an independent source
through `receipt-clock` on standard input. Its cutoff uses the earlier of
current provider UTC and the supplied UTC plus elapsed monotonic time.
This prevents a forward clock jump during the process from accelerating
retirement; a backward jump can delay it. JSON batch reports go to
stderr, including errors from rolled-back attempts. The next scheduled pass
can retry, and shutdown joins any active batch.

The schedule reads up to 101 keys in age order through the receipt-age index
and retires up to 100 in the same transaction. An extra eligible key sets
`hasMoreEligible` in the batch report. The manual command supplies exact counts
for operators.

The earlier system-clock-only startup probe retired a fresh receipt after
a restart with UTC advanced by 30 days. With the startup gate, the controlled
probe keeps that receipt while the sample is missing and when the supplied
UTC confirms its actual age. It retires at the verified 30-day cutoff.
The fixture parses and uses the supplied time. Its accuracy is the
operator's responsibility, and existing receipt dates still depend on the
provider clock at the time of each write. Production startup needs a reliable
time source and an operational policy for those stored dates.

Controlled-clock tests cover the instant before expiry, the exact cutoff,
legacy migration, a failed batch and competing maintenance invocations.
The browser exercises a retired receipt after provider restart and confirms
that the next deliberate submit uses a new key.

The desk offers explicit recovery for a correlated unavailable receipt.
Refresh tasks loads the current target, its deletion revision, or its absence
in the same provider history. This is current data and the original outcome
stays unknown. Discard saved attempt asks for confirmation. Keeping the attempt
preserves its bytes; confirming clears the reviewed local journal and closes
its associated draft in that tab. A later write requires a separate submit
with a new key. An unsuccessful refresh, a changed history or a replaced
journal requires a new valid review before discarding an attempt.

## View behavior and visible DX

Refresh tasks loads confirmed data. New task opens a draft; Create task writes
the immutable intent before network work. Pending or unknown commands block
another create/edit/delete. A later edit typed while creation is in flight stays
local. After the create is acknowledged, those later fields become an edit of
the confirmed created ID, preventing accidental creation of a second task.

Delete task opens a confirmation for the selected ID/revision. Keep task sends
no command. Confirm deletion uses the same pending/error/status/retry path as
creation and editing. The draft stays available after confirmed deletion, with
save disabled. Copy draft to new task explicitly starts a new identity; it is
not resurrection. Discard remains explicit. Reload of a delete intent shows
recovery without inventing an editable task; unsaved draft text is not durable.

Check result precedes explicit retry after matching authoritative absence.
Finish attempt removes only the exact correlated terminal journal. Disposal
requests abort and suppresses late UI publication without rollback or journal
deletion. Fields, conflicts, validation and selection remain application policy.

DX costs remain visible: explicit Refresh/Check/Finish/revision review, confirmation,
long UUID identities and host/client wiring. No independent human acceptance or
stable SDK promotion is inferred. The view/client bundle now includes the added
CRUD behavior; comparing its bytes with the earlier editing-only view is not an
equivalent-workload runtime benchmark.

The later [Surface authoring exercise](TASK-DX-EXERCISE.md) uses an isolated copy
of this pilot to evaluate behavior changes and type-error recovery. Preparation
fixes [checker action-line mapping](CHECKER-ACTION-LINES.md), while the CRUD
implementation and the historical browser evidence below remain unchanged.

## Evidence

The latest receipt-retention gate ran 75 focused tests across the host,
provider, client and compiled Surface views. The two-tab recovery probe
exercises a retired receipt after provider restart. A separate loopback
load probe with 500,000 eligible receipts completed 6,624 HTTP operations
and retired 300 receipts per run while comparing exact and bounded
scheduled work. These results cover the local fixture and temporary
databases.

| Gate | Result | Internal evidence |
|---|---|---|
| Complete candidate | Check/build; 1016/1016 tests in 82 files, no skips/cancellations | full-62b913d858d648dab462072c1958b1fe |
| Added coverage | 6 client, 8 HTTP/SQLite (including old-schema migration), 6 compiled Surface cases | full-62b913d858d648dab462072c1958b1fe |
| CRUD browser | Six phases, lost replies, provider restarts, conflict, outage, rollback and copied draft | crud-browser-565f6630357041d08ec24df89129010f |
| Editing browser regression | Six prior phases, including foreign-history blocking | edit-browser-6d4db317c6db495a8fa4c63ef2b3bddc |
| Delivery | View plus client: 28457 JS bytes/8604 gzip-9; Node/Python host excluded | cost-58c2885c32c04cf688937220fdb940a8 |
| Public transfer | Check/build; 222/222 selected regressions and exact source hashes | promotion-5ac9d92f8fc64d35934f7c36cf2dab10 |

CRUD database SHA256: `ba7908805cb46172b2031bc339dc0ddb0a968cc1ad04ee0a4530d82109febefd`.
Editing-regression database SHA256: `cde6b5431851c64e4c9bacc4542de5fa4866e8d4fd8c91862e407bbda7d8b0fc`.

The CRUD browser sequence covers lost create/delete acknowledgements with reload
and provider restart, cancelled deletion, before-commit loss, outage preserving
the original command, same-ID retry, later-draft editing of the created task,
external revision conflict, injected delete rollback and explicit copying of a
deleted draft into a new identity. It ends with three live tasks and two
tombstones; the journal is empty only after explicit acknowledgements.

The separate editing regression repeats its six earlier phases, including
changed-history blocking. Both runs retain no unhandled/window errors or CSP
violations. Databases contain synthetic tasks only. Exact producers, source
hashes, before/candidate/documentation archives, logs and SQLite evidence live
under `elnor/.elnor/mvp/task-crud/`.

The complete and selected public gates are distinct. Native editor evidence
remains historical because compiler/runtime/editor sources are unchanged. The
current host remains loopback-only with same-origin fixture CSP, no authentication
and one journal writer. Multiple tabs/accounts, production authorization,
browser storage eviction, independent human DX and broader release readiness
remain outside this local CRUD increment. Stage 5 still needs its human workflow
acceptance criterion. See the [example](../../examples/persistent-task-desk/README.md).

The later [draft authoring refactor](DRAFT-DX.md) shares local field preparation
and one new-task default while preserving this protocol. Its separate 123-case
public gate and twelve repeated browser phases pass; the complete gate above
remains historical evidence.
