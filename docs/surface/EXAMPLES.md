# Elnor Surface Examples

Use this guide to look up syntax for a component, a form, or an application
workflow. Each code block preceded by a filename belongs to that file. Put
files from the same example in one directory. Blocks called excerpts show
part of an existing file, and the development commands run from `elnor`.

- [Components and local state](#components-and-local-state)
- [Composition, events and slots](#composition-events-and-slots)
- [DOM controls and styling](#dom-controls-and-styling)
- [Forms, validation and reset](#forms-validation-and-reset)
- [Guards and typed action bodies](#guards-and-typed-action-bodies)
- [Schema validation and transformed data](#schema-validation-and-transformed-data)
- [Async actions and disposal](#async-actions-and-disposal)
- [Shared and persistent application state](#shared-and-persistent-application-state)
- [Development, refresh and packaging](#development-refresh-and-packaging)
- [Server rendering and proposed syntax](#server-rendering-and-proposed-syntax)

## Components and local state

A component receives typed props and owns its `state` for the lifetime of
that instance. A `calc` derives a value from state or props. An `action`
contains ordinary TypeScript statements. Use a fallback expression for an
optional prop.

**`Counter.eln`**

```elnor
component Counter(label?: string) {
  state count = 0;
  calc caption = (
    `${label ?? "Counter"}: ${count}`
  );

  action increment() {
    count++;
  }

  ui {
    section .counter {
      h2 caption
      button "Increment" => increment()
    }
  }
}
```

Two instances start with separate counts. State and calc declarations use
semicolons. For a multiline initializer, start with `= (` and close with
`);`. UI statements are written one per line. [Declaration rules](MVP-SUBSET.md#component-and-declaration-baseline)

## Composition, events and slots

The parent supplies data and handles the child's typed events. A `slot`
receives default content. A named `slot actions` receives a matching
`fill actions` block. A keyed list identifies each rendered row by its
stable data ID.

**`task.ts`**

```ts
export type Task = {
  id: string;
  title: string;
};
```

**`Panel.eln`**

```elnor
component Panel(title: string) {
  ui {
    section .panel {
      header {
        h2 title
        slot actions
      }
      slot
    }
  }
}
```

**`TaskRows.eln`**

```elnor
import type { Task } from "./task.js";

component TaskRows(tasks: Task[], selectedId: string | null) {
  event selected(id: string)

  ui {
    if tasks.length === 0 {
      p "No tasks match"
    }
    ul {
      each task in tasks by task.id {
        li {
          button aria-current=(task.id === selectedId) task.title => emit.selected(task.id)
        }
      }
    }
  }
}
```

**`TaskPanel.eln`**

```elnor
import type { Task } from "./task.js";
import Panel from "./Panel.eln";
import TaskRows from "./TaskRows.eln";

component TaskPanel(tasks: Task[]) {
  state selectedId: string | null = null;

  action select(id: string) {
    selectedId = id;
  }

  action clear() {
    selectedId = null;
  }

  ui {
    Panel title="Tasks" {
      fill actions {
        button disabled=(selectedId === null) "Clear selection" => clear()
      }
      TaskRows tasks=tasks selectedId=selectedId {
        on selected(id) => select(id)
      }
      p (selectedId === null ? "Choose a task" : `Selected ${selectedId}`)
    }
  }
}
```

For zero-payload events, declare `event closed()` and use
`emit.closed()` in the child. A parent listens with
`on closed() => close()` inside the child tag. [Dialog example](../../examples/components/ConfirmDialog.eln)

## DOM controls and styling

Two-way bindings target a direct mutable state name. Text inputs and
textareas use strings, checkboxes use booleans, and selects write one of
their declared string values. The option label is what the user sees and
the value is what the binding receives.

**`Preferences.eln`**

```elnor
component Preferences() {
  state name = "";
  state notes = "";
  state completed = false;
  state priority: "normal" | "high" = "normal";
  state locked = false;
  calc className = locked ? "preferences locked" : "preferences";

  action toggleLock() {
    locked = !locked;
  }

  ui {
    section class=(className) {
      h2 "Preferences"
      input class=("name") disabled=(locked) "Name" <-> name
      textarea disabled=(locked) "Notes" <-> notes
      checkbox disabled=(locked) "Completed" <-> completed
      select disabled=(locked) "Priority" <-> priority {
        option "Normal" => "normal"
        option "High" => "high"
      }
      button aria-pressed=(locked) "Lock editing" => toggleLock()
    }
  }
}
```

Use `.class-name` for a literal container class or `class=(...)` for
a string expression. Supply styles through the preview stylesheet. The
supported prefix set depends on the host element, and the editor suggests
the available names. [DOM prefix guide](../mvp/DOM-EDITOR-COMPLETION.md)

## Forms, validation and reset

`form => save()` handles the form submit event. An action validates the
current draft and publishes errors or a successful result. The optional
`focus-invalid=(true)` moves focus to the first focusable invalid control
after the submit updates render. Editing a field updates its message while
focus stays in place.

**`TitleForm.eln`**

```elnor
component TitleForm() {
  event saved(title: string)
  state title = "";
  state showErrors = false;
  calc titleError = showErrors && title.trim().length < 3 ? "Use at least 3 characters." : "";

  action submitTitle() {
    const value = title.trim();
    showErrors = value.length < 3;
    if (showErrors) return;
    emit.saved(value);
    clear();
  }

  action clear() {
    title = "";
    showErrors = false;
  }

  ui {
    form focus-invalid=(true) => submitTitle() {
      on reset() => clear()
      input error=(titleError) "Title" <-> title
      submit "Save"
      reset "Clear draft"
    }
  }
}
```

`error=(...)` takes a string on `input`, `textarea` and `select`.
An empty string clears the error. A message marks the field invalid and
associates the message with the control. `on reset()` updates the form's
Surface state. [Field errors and focus](MVP-SUBSET.md#experimental-field-errors) · [Reset contract](../mvp/FORM-RESET.md)

### Publish edits from a child field

Bind the local draft with `<->` and pass a typed callback with `on-input`.
The parent can handle `changed` to update its own form state on every edit.

```elnor
component ContactEmail(initial: string, error: string) {
  event changed(value: string)
  state email = initial;

  ui {
    input error=(error) on-input=(emit.changed) "Email" <-> email
  }
}
```

The callback runs synchronously after the binding receives the new text.
This works on `input` and `textarea`. [Text input callback contract](MVP-SUBSET.md#experimental-text-input-callbacks)

## Guards and typed action bodies

The implemented experimental `guard` exits the action when its condition
is true. A `then` block runs immediately before that exit. The shorter form
can omit the semicolon. Use braces with `then`.

**`GuardedDraft.eln`**

```elnor
component GuardedDraft() {
  event saved(value: string)
  state title = "";
  state pending = false;
  state error = "";

  action save() {
    guard (pending)
    const value = title.trim();
    guard (value.length < 3) then {
      error = "Use at least 3 characters.";
    }
    error = "";
    emit.saved(value);
  }

  ui {
    section {
      input "Title" <-> title
      button "Save" => save()
      p error
    }
  }
}
```

A guard such as `guard (task === null)` lets TypeScript narrow the type
of `task` in the following statements. A standalone call to a TypeScript
function named `guard` can be ambiguous inside an action. The checker
reports the ambiguity. A qualified call such as `policy.guard(value)`
retains the ordinary TypeScript meaning. [Guard tests](../../tests/action-guards.test.mjs)

## Schema validation and transformed data

The experimental Standard Schema helper uses an ordinary TypeScript schema.
`bindFormSchema` binds flat field names. The form declares when to show
messages and reads the current draft again on submit. The action receives
the validated output.

For this example, put both files in `elnor/examples/syntax-guide/` so the
relative import can reach the experimental helper.

**`note-schema.ts`**

```ts
import { bindFormSchema } from "../../src/form-schema.js";

function validate(input: unknown) {
  if (input === null || typeof input !== "object" ||
      !("title" in input) || typeof input.title !== "string") {
    return {issues: [{path: ["title"], message: "Enter a text title."}]};
  }
  const title = input.title.trim();
  if (title.length < 3) {
    return {issues: [{path: ["title"], message: "Use at least 3 characters."}]};
  }
  return {value: {title}};
}

const schema = {
  "~standard": {version: 1 as const, vendor: "note-example", validate}
};

export const noteForm = bindFormSchema(schema, ["title"]);
export type Note = NonNullable<ReturnType<typeof validate>["value"]>;
```

**`NoteForm.eln`**

```elnor
import { noteForm } from "./note-schema.js";
import type { Note } from "./note-schema.js";

component NoteForm() {
  event saved(note: Note)
  state title = "";
  state showErrors = false;
  calc draft = noteForm.validate({title});
  calc errors = noteForm.fieldErrors(showErrors ? draft : undefined);

  action save() {
    const result = noteForm.validate({title});
    showErrors = !!result.issues;
    if (result.issues) return;
    emit.saved(result.value);
  }

  ui {
    form focus-invalid=(true) => save() {
      input error=(errors.title) "Note title" <-> title
      submit "Save note"
    }
  }
}
```

Excerpt from the Task desk [schema binding](../../examples/task-desk/task-draft-form.ts).

```ts
export const taskDraftForm = bindFormSchema(taskInputSchema, [
  'title',
  'assignee',
  'description',
  'priority'
]);
```

Excerpt from [TaskComposer.eln](../../examples/task-desk/TaskComposer.eln).

```elnor
calc draft = taskDraftForm.validate(readDraft());
calc errors = taskDraftForm.fieldErrors(showErrors ? draft : undefined);
```

```elnor
textarea error=(errors.description) "New task description" <-> description
```

For a transform, bind the paths of the input separately from the output.
This excerpt pairs controls with two distinct input paths that share the
same leaf name. The string keys on the left name the resulting messages.

```ts
const form = bindFormPaths(requestSchema, {
  requester: ['requester', 'name'],
  reviewer: ['reviewer', 'name']
});
```

The verified transform maps the cleaned input to a result such as
`{ requestedBy: "Ada", reviewedBy: "Linus", requesterLength: 3 }`.
The helper handles synchronous validation. The path variant requires input
type metadata and accepts up to four segments with object keys or numeric
array indices. Root issues and
issues without a bound field are available on the result. [Schema helper contract](MVP-SUBSET.md#experimental-form-schema-helper)

Use `unboundIssues` to show form or group feedback separately from
messages attached to fields. Keep the `output` mounted so later messages
update its native status region. [Form and group feedback](MVP-SUBSET.md#experimental-form-and-group-feedback)

```elnor
calc summary = form.unboundIssues(showErrors ? draft : undefined).map(issue => issue.message).join(" ");
```

```elnor
output class=("form-feedback") summary
```

### Check a validated draft over HTTP

Capture the current draft when submitting. Put local validation inside
`work` so a duplicate submission leaves form state alone. Pass the
validated value to the HTTP provider, then apply the reply from a synchronous
`success` callback while the submitted draft is current.

```elnor
action async validate(submitted: ContactDraft, signal: AbortSignal) {
  remote = null;
  const result = form.validate(submitted);
  showErrors = !!result.issues;
  if (result.issues) return;
  return requestFeedback(result.value, signal);
}

action accept(message: string | undefined, submitted: ContactDraft) {
  if (message !== undefined && isCurrent(submitted)) remote = {
    message,
    submitted
  };
}
```

Configure `work: validate`, `publish: report` and `success: accept` in
`createOperation`. Use `policy: "single-flight", cancellable: true` to keep
one active check and let Reset cancel it. Put pending and retry messages in
the status output. Let `focus-invalid=(true)` handle field errors from
the submit action. [Operation options and callback contract](../mvp/OPERATION-HELPER.md#explicit-api-and-ownership)

The editor checks schema paths and operation types. A path such as
`["contact", "mobile"]` needs a matching property in the input schema.
`run` expects the draft object when `work` accepts that object. The
`success` callback must accept the resolved type of `work`, including
`undefined` when local validation exits early. TypeScript highlights
`success` when its signature is incompatible and shows the types from
`work` in the error details.

## Async actions and disposal

`action async` can await a host-supplied operation. The component chooses
when to accept a response and what to do on cancellation. In this search,
the latest controller owns the visible result and pending flag. Empty
queries cancel active work. Removing the component runs its synchronous
`on dispose()` handler.

**`Search.eln`**

```elnor
component Search(request: (query: string, signal: AbortSignal) => Promise<string>) {
  state query = "";
  state result = "";
  state error = "";
  state active: AbortController | null = null;

  on dispose() => cancel()

  action cancel() {
    const previous = active;
    active = null;
    previous?.abort();
  }

  action async search() {
    cancel();
    error = "";
    const text = query.trim();
    guard (!text)
    const controller = new AbortController();
    active = controller;
    try {
      const value = await request(text, controller.signal);
      if (active === controller) result = value;
    } catch {
      if (active === controller) error = "Search failed";
    } finally {
      if (active === controller) active = null;
    }
  }

  ui {
    section {
      form => search() {
        input "Query" <-> query
        submit "Search"
        button disabled=(active === null) "Cancel" => cancel()
      }
      small (active === null ? "Idle" : "Loading")
      p result
      p error
    }
  }
}
```

A write has a different policy. The managed save example uses
`createOperation({policy: "single-flight", ...})` to keep one write in
flight, records the submitted input and request key, and retries the same
intent if confirmation is lost. The operation helper and receipt checks
live in TypeScript and Surface application code. [Managed search](../../examples/operations/ManagedSearch.eln) · [Managed save](../../examples/operations/ManagedSave.eln)

## Shared and persistent application state

Use a parent instance as the owner when siblings need the same value.
Task desk keeps task selection in the parent, passes typed props to
children and handles their events. For instance-scoped logic, mount the
same component twice with different props or host clients.

Persistent Task desk passes a typed client into its root and separates the
editable draft from confirmed records. This excerpt shows how the root
reads and observes the client and retires its work when removed.

```elnor
state status: DeskState = client.read();
state unwatch = client.observe?.(syncJournal);
on dispose() => retire()
```

| Scenario | Pattern in the pilot |
| --- | --- |
| Refresh | The client reads a confirmed snapshot. The open draft stays editable. |
| Save or create | The client saves the intent and key in the local journal before the HTTP write. |
| Unknown result | **Check result** reads the receipt. Authoritative absence permits retry with the saved key. |
| Revision conflict | The user can keep the draft and explicitly review the newer revision. |
| Rejected field | The message is tied to the saved attempt and the matching field value. Correcting that value clears the field message while the receipt remains available. |

This is an application pattern using browser storage, HTTP and SQLite.
Documented pilots also explore request-owned state and isolation between
browser tabs. A general store or context API remains on the roadmap.
[Persistent example](../../examples/persistent-task-desk/README.md) · [Shared state roadmap](../mvp/ECOSYSTEM-ROADMAP.md#owner-requested-capability-backlog-dx-throughout)

## Development, refresh and packaging

The project CLI checks an entry and its imported graph. The development
server builds saved changes and reloads when a verified build is ready.
If a change fails to build, the preview keeps the last valid version and
shows a diagnostic.

```powershell
npm run check:project -- examples/task-desk/App.eln
npm run dev:project -- examples/task-desk/App.eln --out .elnor/mvp/task-desk-output --props examples/task-desk/preview-props.json --css examples/task-desk/style.css
```

Use the read-only formatter to check a saved file or print its formatted
source. The VS Code development extension also maps diagnostics and
completion to the original Surface code. [Formatter](../mvp/FORMATTER.md) · [Editor authoring](../mvp/DOM-EDITOR-COMPLETION.md)

```powershell
npm run format -- --check examples/task-desk/TaskComposer.eln
npm run format -- examples/task-desk/TaskComposer.eln
```

From `elnor`, open a VS Code development window to try the extension on
these examples. Press `Ctrl+Shift+M` to see the Problems panel.

```powershell
code --new-window --extensionDevelopmentPath="$PWD\editors\vscode" .
```

`--experimental-hot` opts into compatible Surface replacement. A
presentation edit in an eligible component can preserve root state and
state owned by stable list keys. Incompatible changes use a full reload.
The supported text controls preserve focus and selection when the replacement
can identify the same field, and replacement can wait for IME composition.
Use the eligible fixtures in the development guide for a state-preserving
example. [Development and HMR](../mvp/PROJECT-DEVELOPMENT.md#experimental-surface-replacement)

Executable helpers use relative local ESM paths, such as
`import { normalize } from "./normalize.js";`. The reference build emits
local ESM. Valibot was tested through a local ESM entry in the schema
experiment. Direct executable npm imports currently receive
`ELN-MODULE-PATH`. Vite integration and a second bundler adapter remain
roadmap work. [Local ESM contract](../spikes/004/LOCAL-ESM.md) · [Bundler roadmap](../mvp/ECOSYSTEM-ROADMAP.md#owner-requested-capability-backlog-dx-throughout)

## Server rendering and proposed syntax

The feasibility work includes a bounded Task desk SSR and hydration pilot
with a host adapter. It checks initial HTML against the generated plan and
preserves the draft in the tested attachment path. The roadmap tracks
general SSR and hydration across arbitrary component trees.

Server Components and Server Actions are separate proposals. The current
`action async` runs where the component is mounted and can call a typed
host client. Server-only imports, authorization, serialization, transport
and mutation recovery need their own server integration contract.

For future syntax such as routing, `query`, `command`, effects and context,
read the design examples in the Surface specification. Those examples are
proposals. [Surface v0.3 designs](SPECIFICATION.md#3-veinte-situaciones-reales) · [Server capability roadmap](../mvp/ECOSYSTEM-ROADMAP.md#owner-requested-capability-backlog-dx-throughout)
