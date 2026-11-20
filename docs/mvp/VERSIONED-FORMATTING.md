# Formatting versioned Surface buffers

**Follow-up:** the [fifteen-task native suite](NATIVE-VALIDATION.md) passed on
2026-11-11, including native formatting without saving. The initial integration
evidence below predates that run.

**Status:** implemented in the synchronous service, async worker/client and
development VS Code adapter. Verified with Node, real workers and a VS Code API
double, followed by the passed fifteen-task native suite linked above. Task 13
requested/applied formatting to an unsaved Surface buffer and verified unchanged
disk source. The earlier twelve-task result remains historical and does not
establish formatting; current native evidence comes from task 13 itself.

The [conservative formatter](FORMATTER.md) remains an indentation operation,
not full layout normalization. The preview server is unnecessary. The initial
Node/API-double increment launched no app and used no screen capture/control;
the subsequent native host evidence is recorded separately above.

## Request and ownership

`service.format(file, options)` uses the explicitly opened Surface document's
original source. It does not format the TS projection, recovered text or saved
disk contents in place of that buffer. The pure formatter returns original UTF-16
edits or refusal diagnostics; requesting a result does not change the service
revision, source, editor or disk.

`client.query('format', [file, {indentSize: 2}])` runs the same operation in the
worker and returns `{value, snapshot}` like the other language queries. The URI
must be explicitly registered and acknowledged by the client. A dependency
merely discovered by the worker, an unregistered physical alias or an ordinary
TypeScript file is insufficient authority for this request.

Workspace epoch/generation checks apply before dispatch and on responses.
Edits, close, cancellation, restart, worker loss and disposal discard the relevant
pending result. Restart/recovery replay current owned text, including unsaved
source. Cancellation does not preempt synchronous analysis already running in
the worker. A caller using a returned snapshot directly must still check it
before applying; the raw edit application helper has no editor revision model.

Known aliases must acknowledge the canonical text, and physical retargeting
invalidates a snapshot. These engine/client guards complement the adapter policy
below. Formatting refusals retain their diagnostics and original filename rather
than becoming empty successful edit sets.

## Development adapter

The adapter registers `registerDocumentFormattingEditProvider` for local Surface
documents in its first trusted workspace folder. It synchronizes the open
documents, captures the target version and exact source text, then requests
formatting through the worker. Before returning `TextEdit`s it checks:

- cancellation, closure and whether the document is still a supported view;
- unchanged target version and text;
- a current worker/workspace snapshot and absence of source conflicts;
- no other supported open URI view of the same physical origin.

The last condition is a conservative refusal: a document-formatting provider
returns edits for one document, not a workspace edit that coordinates multiple
URI documents. `ELN-FORMAT-ALIASES` asks the caller to close the other view first.
An alias opened while work is pending invalidates the result. Multiple tabs
sharing one URI/document are not treated as distinct URI views.

Editor options are respected within the selected subset: spaces with tab size 2
or 4 are supported; explicit tabs or unsupported sizes produce
`ELN-FORMAT-OPTIONS`. The provider reports formatter refusals as errors, while
stale/cancelled responses return no edits. Ordinary TypeScript documents remain
with their own provider.

The adapter returns edits only. It does not apply them, save a document or
pre-mutate the service. Actual editor change events update the service after the
editor applies them. It changes no formatting/save settings. An existing user
opt-in setting may cause VS Code to invoke a registered provider; this extension
does not enable such a setting. Checks before return are not an atomic guarantee
against changes after ownership passes back to the editor.

The extension is still an unpackaged development adapter. This implementation
does not install it globally or claim availability in a user's normal editor
session. Native task 13 subsequently exercised the actual formatting command and
document lifecycle; API-double results remain separate evidence.

## Evidence

The initial targeted tests failed because `service.format`, the worker query and
the provider were absent. After integration:

- `tests/versioned-formatting.test.mjs`: **11 cases** using the real service and
  real workers, with deterministic barriers for in-flight races. They check
  unsaved text, no mutation/revision change, refusal provenance, edits,
  cancellation, close, restart, loss, disposal, explicit ownership, alias
  acknowledgment and physical retargeting.
- `tests/editor-alias.test.mjs`: **21 cases total**, eight added for this provider.
  They check returned edit application via simulated editor events, untouched
  disk bytes, 2/4-space options, version-only invalidation, source edits, closure,
  cancellation, alias refusal/recovery, alias opening during dispatch, refusals
  and the TypeScript boundary. These use the real worker and an API double.
- The existing **26 pure formatter/CLI cases** remain part of the complete
  regression suite. Native/browser results from earlier revisions remain
  historical evidence for their stated tasks.

Reproduce without opening applications:

```powershell
node --test tests/versioned-formatting.test.mjs tests/editor-alias.test.mjs
npm run check
npm test
```

At the initial adapter increment, the complete suite passed **343/343 Node tests**,
and check covered four original components. The later native formatting result
is linked above; the [readiness review](MVP-READINESS.md) records the current
baseline. No real-browser formatting workflow or human preference is established.
Writing files, format-on-save policy changes, multi-URI coordinated formatting
and full layout normalization remain separate scope.
