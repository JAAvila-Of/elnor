# Persistent Task desk local CRUD pilot

This variant creates, reads, edits and logically deletes tasks through a scoped
journal, HTTP and SQLite. The original ../task-desk remains the in-memory reference.

From the repository root, with the existing Node/TypeScript dependencies and
Python 3 with stdlib SQLite:

```sh
node examples/persistent-task-desk/serve.mjs --db task-desk.sqlite --seed
```

Seed is explicit and refuses a workspace containing tasks. On later starts omit
--seed; do not replace the database to clear an unknown command. Startup migrates
an earlier edit-only task table while retaining its epoch, tasks and receipts.
Do not write the migrated database using an older provider binary. Set
ELNOR_TEST_PYTHON to select Python. No package install is added.

The CLI defaults to http://127.0.0.1:4337. Keep the database, port and browser
profile stable for journal recovery. --port chooses another fixed port; an
occupied port fails before building/seeding and never silently falls back.
--port 0 opts into an ephemeral origin; --help prints supported options.
Send `stop` followed by a newline to close the owned host/provider and temporary
build. Stdin EOF also closes them; the database remains.

The host waits for the provider's JSON readiness line. A startup failure
reports the provider's recent stderr and closes the spawned process. The local
test harness uses the same protocol and allows up to 30 seconds for the CLI
to compile the preview and start its provider.

## Use the pilot

The delete and discard actions use early-exit `guard` conditions. For a
compact condition, Format Document adds the outer line breaks and separates
the top-level `&&`. The short form ends on the closing parenthesis.

```elnor
guard (
  kind === "delete"
  && (!selected || !deleting || creating || deleted || status.phase !== "empty")
)
```

Keep a compact inner group to scan when the action applies and why it exits
in four lines. Expand the group by hand when you want one reason per line.
The formatter preserves those explicit breaks.

```elnor
guard (
  kind === "delete"
  && (
    !selected
    || !deleting
    || creating
    || deleted
    || status.phase !== "empty"
  )
)
```

If you add `then`, give it a block on the closing-parenthesis line. A missing
block highlights `then` and formatting refuses the incomplete source. An
invalid phase such as `"blocked-phase"` highlights the comparison. The
headless authoring test exercises both errors over the editor worker, verifies
that failed builds keep the last published output, and runs the repaired
deletion flow. [Task desk authoring test](../../tests/task-crud-surface.test.mjs)

The [task draft schema](../task-desk/task-input-schema.ts) supplies the
`TaskInput` type and trims the draft before submission. Titles need 3 to 200
characters, assignees up to 120 and descriptions up to 10,000. Priority is
`normal` or `high`. Invalid drafts stay local. After a failed submit, messages
appear beside the relevant title, assignee, description or priority control.
Submitting moves focus to the first invalid field. Correcting a field clears
its own error and leaves focus in place.
One calc uses the [shared form binding](../task-desk/task-draft-form.ts) to
project visible local issues and applicable receipt issues. Each control
reads its message by name, for example `error=(draftErrors.description)`.
The submit action validates the current fields directly, including an input
updated in the same turn as submission.

Field messages from a rejected receipt appear on the draft for that saved
attempt. Each message stays visible while the current field has the same
trimmed value as the submitted field. Editing another field leaves it visible.
Changing the rejected value clears the field message and leaves the receipt
available under Check result and Finish attempt. Recovering a receipt updates
the messages without moving keyboard focus.

The local HTTP host uses the same emitted schema module to add field paths to
malformed command responses (`400`, for example `['task', 'priority']`). Its
wire validation measures the original values in UTF-16 code units. A
well-formed command with a short title reaches the SQLite transaction, which
records the rejection and returns its existing `422` receipt. The provider
also checks command identity, workspace scope and revision in its existing
protocol. Raw command bytes reach the provider before any field diagnostics are
added to the response, keeping the receipt and replay contract intact.

1. Refresh tasks to load confirmed data. New task opens the creation form. Tasks
   start open; the provider assigns revision 1 to the client's journaled ID.
2. Select a task to edit its fields/status/priority. Save changes submits the
   captured expected revision; the draft stays open during the request.
3. Delete task opens a confirmation. Keep task sends nothing; Confirm deletion
   requires the selected revision and leaves a versioned tombstone.
4. For an unknown result, Check result first. Only matching authoritative absence
   permits Retry saved edit, which reuses the original command and identities.
   A provider outage never authorizes a fresh command.
5. Refresh updates confirmed data without overwriting draft fields. Finish attempt
   acknowledges only a correlated terminal outcome. On conflict, finish that
   result and refresh to review current data. Use current revision becomes
   available when the refreshed list contains a newer revision. It keeps the
   draft fields and does not submit them.

Later typing during creation becomes editing of the confirmed created ID after
acknowledgement; it does not silently create a second task. A deleted task's
draft remains available with Save disabled. Copy draft to new task explicitly
uses a new identity, while Discard removes the local draft. Reload restores the
attempted create/edit payload or deletion target; other unsaved edits are not
durable. A deletion removes a row from the live collection but retains ledger
data/outcomes; it is not physical erasure.

## Maintain receipts

From the repository root, preview one workspace in an existing database.

```sh
python -B examples/persistent-task-desk/maintain_receipts.py --db task-desk.sqlite --scope alice
```

The command opens the database read-only and prints JSON with the ledger
`epoch`, total `eligible` receipts and `batchLimit`. Use that epoch when
applying a batch.

```sh
python -B examples/persistent-task-desk/maintain_receipts.py --db task-desk.sqlite --scope alice --epoch EPOCH_FROM_PREVIEW --limit 10 --apply
```

Apply reports `retired` and `remainingEligible` from the same transaction.
It recalculates eligibility at execution time and processes one batch, up to
100 receipts by default. Repeat the operation to process another batch. For a
ledger without receipt dates, start the current provider first to migrate it.

The loopback host can also run one maintenance batch per interval for its
`alice` workspace. Pass the interval in seconds to opt in.

```sh
node examples/persistent-task-desk/serve.mjs --db task-desk.sqlite --receipt-maintenance-seconds 3600
```

At each startup, the scheduler reports `waiting-for-clock` on stderr. Check
UTC against an independent source, then enter `receipt-clock` followed by
the verified UTC timestamp in `YYYY-MM-DDTHH:MM:SSZ` format on the host's
standard input. The host accepts one valid sample per process. The next
scheduled tick can retire receipts. CRUD remains available while it waits
for the sample.

Each pass reports JSON on stderr with `retired` and `hasMoreEligible`, or
an error when the transaction fails. `hasMoreEligible` says whether another
batch is needed at that pass's cutoff. The next pass waits for the full
interval again. Stopping the host interrupts the wait and lets any active
batch finish. The one-off
command remains available for previews and explicit runs.

## Boundaries

The browser client also checks draft rules when admitting a new command. Its
journal retains the exact command for recovery. The provider validates its own
requests independently.
Rejected write receipts keep their reason and can include field issues. The
client exposes those issues only for a correlated, confirmed rejection.
Reason-only receipts remain readable, and recovery returns the stored result.

If the provider history changes, the journal stays blocked and keeps the
original attempt. A page that already has the draft open keeps its edits.
A page opened with a different provider, workspace, or epoch keeps the
stored attempt hidden. Reopen the original provider and reload to check
that attempt. Refreshing the task list preserves the journal's explanation.

If the provider reports that the receipt is unavailable, the journal keeps
the attempt and explains that the result cannot be confirmed. Use Refresh
tasks to review the current target. Then choose Discard saved attempt and
Confirm discard to clear the attempt and close its associated draft in this
tab. Keep saved attempt leaves the journal intact. Discard is local and
leaves provider tasks untouched.

The SQLite fixture records receipt dates and supports an explicit maintenance
pass that replaces eligible receipts at least 30 days old with durable markers.
The markers keep the keys reserved after restart. The fault header can also
simulate this result without changing the ledger. Scheduling is opt-in.

The host fixes provider ID/scope/epoch and injects a stable client outside the
view. A custom ESM host may still call startPilot({database,port}); its default
port is 0 for fixtures. Function-valued clients cannot be supplied through the
general framework JSON preview. This host's same-origin CSP does not change the
framework preview policy. Fault injection is opt-in through the test host API.

The fixture is loopback-only, unauthenticated and assumes one browser writer per
journal slot. There is no multi-tab lock, account lifecycle, production scheduling,
physical purge, encrypted outbox, automatic retry or production deployment
contract. A stable port does not preserve cleared/evicted browser storage.
Explicit Check/Refresh/Finish/revision review and long UUID task IDs remain DX
costs under evaluation. Independent human acceptance is still open.

See [CRUD contract and evidence](../../docs/mvp/TASK-CRUD.md), the
[historical editing study](../../docs/mvp/PERSISTENT-TASK-DESK.md) and the
[complete host-restart evidence](../../docs/mvp/TASK-HOST-ORIGIN.md).

For source authoring, use the [owned Surface exercise](../../docs/mvp/TASK-DX-EXERCISE.md).

The [draft authoring follow-up](../../docs/mvp/DRAFT-DX.md) shares field loading
and normalization through local actions. Change `initialPriority` in
`beginCreate()` to choose the new-task default; restored attempts keep their
original captured priority.
