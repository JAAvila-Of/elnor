# Single-flight async save

`OwnedSave.eln` uses ordinary async actions and `on dispose()` to demonstrate
one write request at a time. It snapshots and freezes the attempted text/key,
preserves edits made while saving, and requires explicit retry of an unconfirmed
intent. A matching receipt releases that intent; a later save receives a new key.

Inject `persist(intent, signal) => Promise<SaveReceipt>` and `createKey() => string`.
Keys must be unique within the provider scope. The provider must replay the same
key/data without applying a second mutation and reject conflicting reuse. Elnor
does not implement a backend or that replay guarantee.

```sh
npm run build:project -- examples/async-save/OwnedSave.eln --out .elnor/owned-save
```

An imperative host imports `mount` from the generated entry module, passes the
two function props and may register a `saved` handler. Ordinary `stop()` owns
local abort; no host lifetime signal is needed. Function props cannot be supplied
through JSON preview props. The controlled browser fixture lives in the internal
study; it is not a real HTTP/storage integration.

While saving, repeated submissions are ignored. An uncertain intent blocks
Clear draft, including programmatic form.reset(), until confirmed. The draft
remains editable and is preserved if it differs from the captured raw input.
There is no live Cancel command for an unknown write. Disposal does not roll
back a server mutation, and local attempts do not survive remount/reload.

See [policy, provider contract, evidence and limits](../../docs/mvp/ASYNC-WRITES.md).
