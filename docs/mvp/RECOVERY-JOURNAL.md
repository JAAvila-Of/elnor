# Persistent write-recovery fixture

This bounded application example separates a saved client intent from the
provider's authoritative outcome. It adds an ordinary TypeScript journal/HTTP
client, a Surface view, and a loopback-only Python/SQLite test provider. No
compiler/runtime/editor code or stable Elnor persistence API is introduced.

## Protocol and identity

A record contains schema version, provider ID, scope, epoch and immutable key/text
intent. The client stores it before any PUT. If storage fails, no request is sent.
A fresh client reads the record as unknown and starts no network work. It does not
infer that a rejected fetch or missing HTTP endpoint means the write was absent.

| Operation | Meaning |
|---|---|
| PUT scopes/scope/intents/key | Apply the same key/data or return its retained terminal result |
| GET scopes/scope/intents/key | Return applied, definitively rejected, or authoritative absence |
| X-Provider-Epoch | Require the expected ledger history before reads or writes |
| Finish attempt | Explicitly acknowledge a correlated terminal result and remove the exact local record |

Only a valid GET absent response with matching scope/key/epoch enables explicit
retry. The retry uses the saved key/data. HTTP404, server/network failure and
malformed results do not authorize replay. Conflicting data or identity blocks the
record. A valid rejection is terminal and can be acknowledged before a new intent.
Applied receipts must match the saved payload and contain a positive receipt ID.

The fixture retains terminal results indefinitely within its database epoch.
Replacing the database creates a fresh epoch. A provider that truncates or restores
incomplete history must change that epoch; otherwise absence is not authoritative.
The provider ID and scope are caller configuration/namespaces, not authentication.

## Journal ownership

One writer owns one storage slot for a provider/account scope. The journal stores
the attempted payload, not every unsaved draft edit. Browser fixtures use
localStorage under one retained origin/profile. Quota/access errors, corrupt JSON
and foreign identity never silently delete the attempt or start a new write.
Finishing compares the current serialized record before removal, preventing a
stale confirmation from deleting a different entry.

The record remains until explicit acknowledgement, including after an applied
response. A new client or page reload checks it again. A retained client may keep
its already verified terminal knowledge across ordinary view remount. Disposal
aborts the UI request but leaves the journal intact; a later view can reconcile.
There is no automatic replay, abandon-unknown action or browser-wide writer lock.
Multiple tabs/writers, account login/logout and secure storage need separate
application coordination. This is not an encrypted or authenticated outbox.

## SQLite provider fixture

The provider uses a primary key on scope/key and BEGIN IMMEDIATE. The effect and
its applied result are inserted in the same transaction. A rejection records a
terminal reason without inserting an effect. Same-key/same-data replay returns
the original receipt; different data conflicts. Statements bind parameters.
The connection verifies rollback-journal mode and synchronous FULL.

[SQLite atomic commit](https://www.sqlite.org/atomiccommit.html) and
[synchronous settings](https://www.sqlite.org/pragma.html#pragma_synchronous)
describe the storage guarantees and their environmental assumptions. This study
tests graceful process restart and an injected transaction rollback; it does not
simulate power loss, filesystem failure, backup rollback or every SQLite deployment.

The server binds only 127.0.0.1. Its optional faults mode drops a reply before or
after commit or raises inside a transaction for deterministic tests. It is a test
fixture with no authentication, production authorization, expiry/GC policy or
deployment contract. There is no real external service or user data involved.

## Surface view and security boundary

RecoverableSave receives one stable RecoveryClient. It reads local state during
initialization and exposes Save, Check result, Retry saved attempt and Finish
attempt. New Save/reset remain disabled while an intent exists, and the client
guards the same rules independently. Later draft text is preserved when finishing
a different confirmed payload. Rejected text remains available for correction.

`on dispose()` only retires the view's controller. Recovery ownership stays in the
client/journal, outside the component. The example does not depend on the optional
operation-helper prototype. Pending/error flags remain explicit.

The browser harness serves its API proxy from the same loopback origin and uses
connect-src self. This applies only to the fixture. Elnor's general preview CSP,
including its existing network policy, is unchanged. No external connection or
desktop editor is opened. A scope string is not an account security boundary.

## Evidence and limits

| Gate | Result | Internal evidence |
|---|---|---|
| Complete candidate | Check/build; 961/961 tests in 75 files, no skips/cancellations | full-d58ebab36bdb40c3a4a5665692d8f052 |
| Focused coverage | 16 journal/client, 12 HTTP/SQLite, 6 compiled Surface cases | full-d58ebab36bdb40c3a4a5665692d8f052 |
| Browser recovery | Four phases, three provider process starts, same-origin reloads, lost replies, outage, status/replay/ack | browser-27ef09bad7b44137ba6c80b08a81f84b |
| Retained database | 3 effects/4 terminal results; SQLite 3.45.3; SHA256 below | browser-27ef09bad7b44137ba6c80b08a81f84b |
| Delivery | New view plus client: 11039 JS bytes/3815 gzip-9; excludes Python provider | cost-afbf99afac1b4fbd962a3e7186d74297 |
| Public transfer | Check/build; 167/167 tests with exact source hashes | promotion-280ac0493ee4473881a14a503ff7a0bc |

The final closed database is retained as `ledger.sqlite` in the browser evidence.
SHA256: `3618bd04a4b451cdd856b236f3ec2807a9fd8c70ef6ab4d52f02dfa59d2da3dc`. The four terminal results include one
definitive rejection; exactly three effects were applied. The client journal was
empty only after explicit terminal acknowledgements. Browser instrumentation
retained no unhandled errors or CSP violations across the tested reloads.

Evidence, producers and before/candidate/documentation archives are retained
under `elnor/.elnor/mvp/recovery-journal/`. Delivery includes the client
factory as well as the view; it is not an equivalent-workload overhead comparison
or CPU benchmark. The database contains only synthetic fixture records.

Python 3 with its standard-library SQLite module is required for the provider
tests; ELNOR_TEST_PYTHON selects the interpreter. No package installation is added.
The evidence covers one client writer and controlled fixture traffic, not
exactly-once effects in arbitrary services, multiuser conflicts, durable browser
storage under every failure mode, general backend support, or human acceptance.
Earlier native editor evidence remains separate because implementation sources
are unchanged. Persistent Task desk integration is not claimed.
