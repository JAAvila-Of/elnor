# Recoverable save fixture

`RecoverableSave.eln` receives a stable RecoveryClient. `client.ts` implements
the example's single-writer journal/status protocol; `provider_fixture.py` is an
unauthenticated, loopback-only SQLite/HTTP test provider. Neither is a stable
Elnor persistence API or production backend.

Save writes a schema/owner/scope/epoch/key/text record before PUT. A fresh client
restores it as unknown without sending. Check result queries the provider;
only authoritative absence enables Retry saved attempt. Applied or rejected
results enable Finish attempt, which explicitly removes the checked record.
An unknown result cannot be abandoned through Clear draft or disposal.

```sh
npm run build:project -- examples/recoverable-save/RecoverableSave.eln --out .elnor/recoverable-save
python examples/recoverable-save/provider_fixture.py --db .elnor/recovery-demo/ledger.sqlite
```

The fixture prints its port and persistent epoch. Its stdin command `stop`
shuts it down. `--faults` is only for deterministic tests and enables explicit
before/after-commit reply loss or rollback injection. The tests use
`ELNOR_TEST_PYTHON` when provided, otherwise python on Windows/python3 elsewhere.
No Python package installation is required.

An imperative host imports mount from the generated entry, creates the client
with storage/slot, provider identity, baseUrl, fetch and createKey, and passes it
as the client prop. Scope/key/identity tokens are bounded ASCII identifiers.
The client must use one dedicated slot per provider/account scope and one writer.
Capture the expected ledger epoch; a changed history must block old records,
not silently reinterpret them as absent. Function/object props are not JSON preview
inputs. The general Elnor preview keeps its existing network policy; the internal
browser harness uses a separate same-origin loopback API proxy.

The raw intent survives view disposal and page reload in the retained origin.
Unsaved draft edits are not a durable outbox. Browser clearing/eviction, multiple
tabs, account transitions, real authentication and production retention operations
require an application contract beyond this fixture.

See [protocol, verified recovery scenarios, retained database and limits](../../docs/mvp/RECOVERY-JOURNAL.md).
