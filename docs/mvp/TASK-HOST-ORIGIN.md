# Persistent pilot host origin

The local Task desk CLI now defaults to `http://127.0.0.1:4337`, accepts
`--port <0..65535>` and rejects an occupied requested port without fallback.
This removes the need for a custom host merely to keep the journal's browser
origin stable. The programmatic startPilot API retains default port 0, and
`--port 0` explicitly selects an ephemeral CLI origin. Keep the database, port
and browser profile stable when reconciling a saved edit after restart.

## Startup and shutdown

Arguments are parsed before starting work. Unknown/repeated options, missing
values and invalid ports are refused. `--help` prints usage without a provider.
The host reserves its loopback port before building or explicit database seeding,
so a port collision cannot initialize a fresh database or silently move the UI.
The database is never deleted or reseeded as an error-recovery action.

`stop` is read as a line, including fragmented stdin chunks. Stop or stdin EOF
closes the owned HTTP host/provider and temporary build output; the SQLite file
remains. This is graceful shutdown evidence, not crash or power-loss recovery.
No framework preview CSP, task protocol, component, client, ledger or editor API
changes. The fixture's same-origin CSP and explicit seed/epoch checks remain.

## Evidence

| Gate | Result | Internal evidence |
|---|---|---|
| Initial red | New test refused because parsePilotArgs did not exist | run-c94ea6ca924249f583d1169c3b736041 |
| Focused candidate | 35/35 cases: 6 host-origin plus 29 task persistence; no skips/cancellations | run-852f5014abee47bca17b3d05439ca229 |
| Browser | Two complete CLI starts, same origin/database/epoch, restored exact journal, status-first acknowledgement, exactly one PUT | browser-ba1c9922b7674cefa162ac6ac3c0c826 |
| Public transfer | Check/build; 92/92 host/persistence/recovery/async/application regressions | promotion-ff2065cd74bc4497934b26c28beb83dc |

The browser saved an edit without acknowledging it, gracefully stopped the Node
host and Python provider, then restarted both through the actual CLI on the same
port without seeding. Reload restored the attempt as unknown; Finish was disabled
until GET confirmed the result. Refresh showed revision 2, then explicit Finish
cleared the journal. Task 2 remained at revision 1. No extra PUT, unhandled/window
error or CSP violation was recorded. The isolated port was selected for the test
and explicitly passed to the CLI, rather than assuming the default port was free.

Retained synthetic `ledger.sqlite` SHA256: `69ce5167e66901780349dd9f32014627d7dd76bc3b817a195840ba04d2cb8448`.
Tests also verify default-port parsing, malformed options, a real occupied port
leaving no database, invalid programmatic ports, and stop input split across pipe
chunks. Heavy runs use existing Windows Jobs with unchanged CPU/memory/process/
wall/free-memory guards; browser is headless and sandboxed.

Evidence, exact producers and before/candidate/documentation archives live in
`elnor/.elnor/mvp/task-host-origin/`. The earlier
[990-test complete gate and six-phase browser pilot](PERSISTENT-TASK-DESK.md)
remain separate evidence. This host-only increment uses focused regressions and
does not claim a new full-suite, native editor or delivery/CPU measurement.
The view/client graph is unchanged from the earlier 7488-byte gzip measurement.

## Remaining scope

A stable port is an origin convenience, not authentication or a browser storage
durability guarantee. Clearing storage, changing profile/origin, concurrent tabs
and a replaced ledger history still require their existing application policies.
The editing pilot remains one browser writer with explicit Check/Refresh/Finish
and conflict review; persistent creation/deletion and independent human DX
acceptance remain outside this increment. See the
[example instructions](../../examples/persistent-task-desk/README.md).
