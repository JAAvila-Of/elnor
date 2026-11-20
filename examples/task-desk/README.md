# Task desk

A local Surface pilot for tasks and issues. It uses five Surface components,
typed TypeScript models, component events, keyed lists, local state, named slots
and the existing checked project preview. No runtime or language extension is
required by this example.

From the `elnor` directory, using the existing project dependencies:

```sh
npm run dev:project -- examples/task-desk/App.eln --out .elnor/mvp/task-desk-output --props examples/task-desk/preview-props.json --css examples/task-desk/style.css
```

Open the local URL printed by the command. Save source changes, wait for the
build result, then reload the browser. Stop the command to stop the server.
This command opens no editor or browser automatically.

Clear filters uses the experimental native `disabled` property when the
search is empty and all statuses are selected. Both forms use the shared
[task input schema](task-input-schema.ts) for validation and normalization.
The creation and editing forms use the [experimental schema binding](task-draft-form.ts)
and call `taskDraftForm.fieldErrors(showErrors ? draft : undefined)` to
derive one typed message object. A control reads its message with a property
such as `error=(errors.description)`. The editor completes the schema's
field names. Live validation and submit use the same function to read the
draft, and submit reads the current fields directly.
After an invalid submit, messages appear beside the relevant title, assignee,
description or priority control. Submitting moves focus to the first invalid
field. Correcting a field clears its own error and leaves focus in place.
The creation form's priority checkbox only produces valid choices. The draft
stays open until validation succeeds.

Open, In progress and Completed are toggle filters: activating the current
filter again returns to all tasks. All tasks remains a command. ARIA states
identify pressed filters and the current task, including protected drafts.

## Try the workflow

1. Search by title, ID, assignee or description and filter by status.
2. Select a task, edit its fields and priority, then save or cancel.
3. While editing, select another task. Keep the draft or explicitly discard it
   before switching. Titles need at least three trimmed characters.
4. Start, complete or reopen a task; the summary and filtered list update.
5. Create a task, then try both cancelling and confirming its deletion.

Data lives only in memory. Reloading restores `preview-props.json`; this is not
persistent storage, synchronization or a multiuser issue tracker. IDs increase
within one mounted session. Descriptions use native multiline textareas when creating and editing. Saved descriptions preserve visible line breaks.
The narrow mobile layout stacks the list before the details and composer.

`App.eln` owns the task collection and selection. `TaskDetails.eln` owns its
explicit edit draft; switching guards live in the parent. `TaskComposer.eln`
owns new-task fields. Its native High priority checkbox uses a local boolean
draft, preserves the choice on validation errors and resets after successful
creation. See [checkbox behavior and evidence](../../docs/mvp/CHECKBOX-BINDING.md). `TaskList.eln` emits selection, and `WorkPanel.eln`
demonstrates default and named slots. Filtering helpers live in `model.ts`;
the isolated example declares its own ESM package context.

See [pilot evidence and next steps](../../docs/mvp/TASK-DESK-PILOT.md).

The later [native select integration](../../docs/mvp/SELECT-BINDING.md) uses literal string options
and typed union writes. Task desk saves or cancels its existing priority draft
through this native control. Nested and controlled bindings remain unsupported.

The later [native form integration](../../docs/mvp/FORM-SUBMISSION.md) gives the new-task composer
a single submit action. Enter in single-line fields creates a task; textarea
Enter remains multiline. Reusable submit-only components and reset remain outside
this first form contract.

The newer [submit composition increment](../../docs/mvp/SUBMIT-COMPOSITION.md) removes the earlier
same-component restriction and verifies typed props, original definitions and
cross-component rename. TaskComposer now imports SubmitButton.

The [managed reset increment](../../docs/mvp/FORM-RESET.md) adds **Clear draft**.
It reuses the composer clear action after successful submission, empties fields
and validation errors, and unchecks High priority without changing stored tasks.
The form declares `on reset() => clear()` explicitly; native reset defaults are
cancelled, including for programmatic `form.reset()`.
