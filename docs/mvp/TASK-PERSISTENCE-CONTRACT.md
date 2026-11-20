# First Task desk persistence contract

Status: bounded contract study with an executable internal SQLite model. The
public Task desk still uses in-memory data and resets to preview props on reload.
This study does not connect the application to a backend or add a stable API.

The subsequent [local editing variant](PERSISTENT-TASK-DESK.md) implements this
contract with a task journal, HTTP/SQLite and a separate Surface view. The
original Task desk remains the in-memory reference. The model evidence below
remains historical and is separate from that variant's integration gates.

The later [CRUD increment](TASK-CRUD.md) implements create/delete commands,
definitive client-generated IDs, tombstones and migration while retaining these
replace-command semantics. The first-slice limits below are historical.

## First vertical slice

Edit one existing task, including its title, assignee, description, priority and
status, under an expected revision. Preserve its existing `TASK-n` ID. Creation,
ID allocation, deletion, routing and a full CRUD migration remain separate work.
The [async policy guide](ASYNC-POLICY.md) supplies the invocation/lifetime rules;
the [recovery fixture](RECOVERY-JOURNAL.md) supplies prior journal experience.

The current `TaskDetails.save()` closes editing before emitting `saved`, and
`App.save()` replaces the matching item locally. A persistent variant must keep
the draft open until confirmation, show pending/error/recovery state and separate
the attempted snapshot from later typing. Reusing the event name without changing
that ownership would report success before the provider has confirmed anything.

## Ownership and identity

| Owner | Responsibility |
|---|---|
| Provider ledger | Confirmed tasks and per-task revisions, ledger epoch, retained terminal command results and atomic mutation/result commit |
| Application host | Fixed provider ID/scope/epoch, bootstrap snapshot, journal slot and one writer for that slot; retire an old owner before switching identity |
| Journal/client | Immutable command key/payload and result correlation through unknown outcomes; explicit status/retry/ack flow |
| View | Editable draft, validation, pending/error and selection; never infer remote rollback from disposal |

The first executable model is local and has no authentication or HTTP endpoint.
Scope is a namespace, not a security principal. An authenticated adapter must
derive/authorize scope from its session, rather than trusting the request string.
Do not describe this study as a multiuser backend. Provider transaction tests with
competing callers do not establish browser journal coordination between tabs.

The model creates a random epoch once per database and retains all command
results for that history. Replacing the database changes the epoch; restoring
older history or removing results needs an explicit epoch/retention operation
before an absence response is trusted. No such operation or garbage collection
is implemented here. Startup/read failure must never silently load preview data
and overwrite an unknown existing workspace. Fixture seeding is explicit,
transactional and refuses a workspace that already contains tasks.

## Proposed command and result shapes

An application-owned journal would persist schema version, provider ID, scope,
epoch, key and the exact command before transport. This is a new task command;
the existing text-only recovery client cannot accept it unchanged.

```json
{
  "kind": "replace",
  "taskId": "TASK-1",
  "expectedRevision": 1,
  "task": {
    "id": "TASK-1",
    "title": "Review persistence contract",
    "assignee": "Ada",
    "description": "Keep the draft until confirmation.",
    "priority": "normal",
    "status": "open"
  }
}
```

The model starts seeded tasks at revision 1. A successful command increments
exactly that task's revision once. Revisions are positive JS safe integers;
commands at the maximum safe revision are refused instead of overflowing.
Exact task/command fields are required, IDs must match and enum values follow
the current [Task types](../../examples/task-desk/types.ts). Proposed upper bounds
are 200 title, 120 assignee and 10000 description UTF-16 code units. These bounds
are not yet implemented in the public form. Title validation follows JS
`trim().length >= 3`, including surrogate pairs and BOM/whitespace behavior.
The client must validate and freeze the payload it actually submits; the model
does not silently trim or rewrite it. Python and JS text rules must agree.

Each result includes scope, epoch and key. Terminal results also echo the exact
command; applied results include the resulting revision. JSON member order does
not change command identity in the model's canonical comparison.

| Result | Interpretation and required UI behavior |
|---|---|
| `applied` | Original command committed; reconcile the confirmed task without overwriting later draft edits |
| `rejected` | Retained business rejection, such as a short title; preserve draft for correction after acknowledgement |
| `conflict` | Retained expected-revision conflict with the revision observed then; preserve draft and fetch the current snapshot before a new, explicitly reviewed command |
| `missing` | Retained result for an absent task; do not implicitly recreate it |
| `key-conflict` | Same key with different command; block and preserve the original journal/result, rather than acknowledge it as this command's success |
| `absent` | Status lookup found no retained result in the matching history; explicit retry must reuse the exact saved key/command |
| Unknown locally | Network/unavailable/malformed response; keep the journal and do not infer `absent` |

Malformed commands and mismatched epochs are refused without a task mutation or
new terminal record. A transport adapter must distinguish such refusals from
authoritative absence. No HTTP routes/status codes are established by this model.
No automatic retry, merge, force-save or abandon-unknown action is supplied.

## Transaction and replay order

The SQLite model acquires a write transaction, then looks up scope/key **before**
checking the current task revision. If that key already holds the same command,
it returns the original terminal result. Different data produces `key-conflict`
without replacing the stored result. Otherwise it validates the business rule,
checks task existence/revision, and records the terminal outcome. Applied task
data/revision and command result commit in the same transaction.

This ordering matters after a lost reply: revision 1 may have committed as 2 and
a later command may already have produced revision 3. Replaying the first key
must return its original revision-2 result without restoring revision-2 data.
The old receipt is historical confirmation, not a fresh workspace snapshot.
The client must refresh confirmed state separately and avoid regressing a newer
known revision. Likewise, a retained conflict's `currentRevision` is historical.

Two different commands based on one revision have one winner and one conflict.
Conflict resolution must preserve the losing draft, fetch current data and ask
for an explicit new save with a new key/revision. Retrying the old key continues
to return its old conflict. Title rejection, missing task and conflict change no
task revision. Injected failure between task update and result insertion rolls
back both; this tests transaction behavior, not power-loss durability.

## Acceptance for the application integration

Keep the current in-memory example as a reference. A persistent variant must
bootstrap from an authoritative snapshot, hold a fixed identity and restore any
journal before admitting another command. No unresolved command may be replaced
by a fresh key. The application host owns recovery across view retirement.

Test editing with a lost acknowledgement, explicit status check and same-key
retry; rejection, conflict, missing task and service outage; reload, retirement,
later typing and an identity/epoch change. Only matching terminal results may be
acknowledged. On conflict, keep the draft open and make reconciliation explicit.
Create/delete/status shortcuts must not remain deceptively local in the same
persistent collection: disable unsupported mutations or route them through their
own defined contracts. End-to-end browser and Surface/editor evidence is required
before claiming the application is persistent. Human DX acceptance stays separate.

## Retained model evidence

`elnor/.elnor/mvp/task-persistence-contract/run-9b7dc0bcbaf64dbab16a9564ec9c29ef`
retains the producer, exact model/test sources, bounded-job telemetry and a passing
16-test Python unittest run. Coverage includes revision advancement, reopened
database recovery, replay after a later edit, key conflict, retained stale-write
conflict, business rejection, missing task, malformed input, epoch/scope isolation,
injected rollback, eight duplicate callers, two competing edits, copied outputs,
atomic explicit seeding and JS-compatible Unicode title validation.

An initial red run verified the missing model. A later Unicode test exposed
Python code-point/strip behavior diverging from JS UTF-16/trim; the model was
corrected and the full 16 cases passed. These are internal semantic tests, not
new public Node tests, HTTP/browser evidence or an application integration.
The test uses synthetic records in temporary databases and removes them after
closing connections; retained evidence contains sources/logs rather than a user
database. No package installation, runtime/compiler/editor change, CPU comparison
or production-readiness claim is introduced.
