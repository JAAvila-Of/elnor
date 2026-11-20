# Surface authoring exercise: Persistent Task Desk

Use a separate copy of the [Persistent Task Desk example](../../examples/persistent-task-desk/)
and its synthetic seed data. Follow the example's setup and build instructions
before changing the Surface entry. Keep the preview origin stable during an
exercise involving draft or journal recovery.

## Change the creation default

Find where a new task gets its initial priority. Change the default from
normal to high. Verify that existing tasks and restored attempted payloads
retain their own priority. Record where you expected to make the change and
where you found it.

## Diagnose a type error

Temporarily assign the unsupported value 'urgent' when preparing a new task.
Run the checker and use its original-source diagnostic to locate the assignment.
Replace the value with a supported priority and check again. Compare the saved
source and the served build before and after recovery.

## Trace a creation request

Trace how the input becomes a command and how the view learns its result.
Consider what should happen if the server commits and the acknowledgement is
lost. See the [async policy](ASYNC-POLICY.md) and [CRUD contract](TASK-CRUD.md)
for the replay and reconciliation rules.

Record which steps were understood independently, what required guidance, and
what would make authoring or recovery easier.
