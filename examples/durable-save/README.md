# Durable save example

`DurableSave.eln` is [RecoverableSave](../recoverable-save/RecoverableSave.eln)
written with a `durable` action group. The person sees the same thing: a
draft, a Save button, a status label and a review step when someone else
changed the note. `host.ts` creates the journal, the `notes.save` operation and
its HTTP transport for one account. `provider_fixture.py` is the loopback-only
SQLite reference provider for tests; it is not an authenticated server.

The design is in [durable intents](../../docs/mvp/DURABLE-INTENTS-DESIGN.md),
and the policy is described with the other groups in
[choosing an async policy](../../docs/mvp/ASYNC-POLICY.md#durable-intents).

## The view

```elnor
action group saving("note") durable "notes"

action async save(edit: Note) in saving {
  const outcome = await notes.save(edit);
  if (outcome.status === "applied") {
    revision = outcome.result.revision;
    message = "";
  } else if (outcome.status === "unavailable") {
    message = "The save was received, but its result is no longer available.";
  } else if (outcome.reason.kind === "conflict") {
    conflict = outcome.reason.current;
    draft = edit.text;
    message = "Someone else changed this note. Review it before saving again.";
  } else {
    message = outcome.reason.message;
  }
}
```

Calling `save` stores the intent in the journal before anything is sent. The
rest of the body runs when the provider decides the outcome, in this page or
in a later one after a reload. The label reads `save.status`. Save is disabled
while the intent is pending or blocked and during a review. On a conflict the
body keeps the person's text in the draft and shows the provider's current
text. "Keep my text" and "Use their text" take the current revision, and the
next Save is a new intent with a new key.

The owner is the string `"note"` because the provider keeps one note per
account. An application with several notes would use the note's id.

## The host

```ts
const {journal, notes} = createNotes({storage: localStorage, account, baseUrl});
mount(root, {notes});
```

`createNotes` starts the journal. Call `journal.stop()` before the session ends
or changes, and create another journal for the next account. The
`X-Fixture-Account` header stands in for the session in this fixture.
`journal.outcomes()` and `journal.blocked()` list what no view consumed or what
cannot be sent; the host decides what to show for them.

## Running it

```sh
npm run build:project -- examples/durable-save/DurableSave.eln --out .elnor/durable-save
python examples/durable-save/provider_fixture.py --db .elnor/durable-save/ledger.sqlite
```

The provider prints its port and epoch. Its stdin command `stop` shuts it down
and `retire` replaces every retained answer with a marker, which the journal
reports as `unavailable`. `--faults` enables the `X-Fixture-Fault` header
(`before`, `after`, `rollback`) for tests only. The tests use
`ELNOR_TEST_PYTHON` when it is set, otherwise `python` on Windows and `python3`
elsewhere.

## Tests

[durable-save-surface.test.mjs](../../tests/durable-save-surface.test.mjs)
compiles this example, mounts it on the fake DOM and runs it against the
provider:

- a reply lost after the commit, then an unmount and a new journal on the same
  storage: the new view shows `Saved` and the provider applied one effect;
- a blocked record in storage: the view shows `Blocked`, Save stays disabled
  and nothing is sent;
- a conflict with a write made through another key: the view shows the other
  text, and saving after "Keep my text" or "Use their text" applies with a new
  key;
- the view has no editor warnings or errors, and the view and the host stay
  within 98 nonblank lines;
- the limit of the type checks described below.

The journal, the transport and the runtime have their own tests:
[journal](../../tests/intents-journal.test.mjs),
[HTTP and provider](../../tests/intents-http.test.mjs),
[groups](../../tests/durable-groups.test.mjs),
[types](../../tests/durable-types.test.mjs) and
[provider](../../tests/durable-provider.test.mjs). They run in Node.js with a
lock manager passed by the test. Acceptance in a browser, including two tabs,
has not run yet.

## Comparison with the handwritten version

| | RecoverableSave | DurableSave |
| --- | --- | --- |
| Nonblank lines of view and client or host | 60 + 136 = 196 | 45 + 21 = 66 |
| JS bytes, gzip-9 (sum of files) | 15133, 3398 | 33563, 10357 |

The byte counts were measured on this branch with the same method for both:
the compiled view module and entry, plus the client or host transpiled by
TypeScript. DurableSave also counts `intents.mjs` (19923 bytes, 5955 gzip-9)
and `durable-runtime.mjs` (7394 bytes, 2608 gzip-9), which every durable
component of an application shares. `runtime.mjs` is left out of both. The
[recovery journal](../../docs/mvp/RECOVERY-JOURNAL.md) reported 11039 JS bytes
and 3815 gzip-9 for RecoverableSave with an earlier compiler. Neither number
is minified, and neither is a CPU measurement.

DurableSave does more than the handwritten version: it resumes the outcome
after a reload without a "Check result" button, reports outcomes and blocked
records to the host, takes a lock per record at admission and pauses when the
provider refuses the session's account.

## Limits

- The resume point of a member is its `await`. The editor does not mark it
  yet, and the language service has no hover or inlay hint for it.
- The journal stores inputs and parameters in plain text in origin storage,
  readable by any script of the origin. Do not pass secrets as durable inputs.
- The group's `pending` is false for a blocked intent, and a call is refused
  while the owner's intent is pending or blocked. This view therefore disables
  Save with `saving.pending || save.status === "blocked"`.
- `save.status` is `idle` while another member of the same group and owner has
  the pending or blocked intent, and calling `save` is refused. In a group
  with several members, check the other members' status too.
- The durable checks read declared types. `any` passes the owner and JSON
  checks and `{}` passes the JSON checks, so the compiler cannot check what
  those types hold.
- Two tabs running different releases: a tab whose journal does not know an
  operation or its new version blocks records that the newer tab admitted.
- Browser storage clearing, real authentication and production retention are
  outside this fixture.
