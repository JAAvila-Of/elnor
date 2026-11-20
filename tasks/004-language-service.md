# Spike 004 — Surface Language Service

**Status:** closed with a bounded technical GO in the
[viability closure](../docs/spikes/004/VIABILITY-CLOSURE.md). Local recovery,
versioned asynchronous integration and twelve native tasks are exercised.
General recovery, scale, complete semantic parity and human DX remain MVP risks.

## Purpose

Reduce technical uncertainty about whether Elnor can deliver the intended DX by
reusing TypeScript tooling directly from original `.eln` documents. A spike
produces evidence and decisions, not a production feature checklist.

## Questions and evidence

| Question | Evidence | Result |
|---|---|---|
| Can TS errors point to exact Surface ranges? | Unknown prop in real `UserEditor.eln`; UTF-16 position tests | Yes for mapped spans; generated-only errors are marked approximate |
| Can navigation cross Surface files? | Component and prop definitions; equal names in different directories | Yes for the tested cases |
| Can completion work while typing? | Partial prop names, blank prop position, trailing TS member access | Yes with bounded recovery; arbitrary malformed files remain unresolved |
| Can rename update Surface consumers safely? | Applied edits across three files, shadowing, shorthand, collisions, stale versions | Yes for the tested symbols in the loaded workspace |
| Can the operations pass through a real editor? | Nine native VS Code tasks passed, including independent alias URI views | Yes for the tested version and fixtures; exceptional human DX is not demonstrated |
| Can editing invalidate asynchronous results? | Gated engine tests and native edit-during-analysis task | Yes for the tested races; cancellation is logical and does not preempt TS |

## Experiment boundaries

G0: Windows paths repaired; local TypeScript required; existing tests preserved.

G1: Exact parser spans and bidirectional mappings with unmapped scaffolding.

G2: Persistent in-memory service with unsaved document versions, diagnostics and
definition navigation. The service reads imported source without executing it.

G3: Completion and versioned rename plans, applied and rechecked in tests.
Rename is rejected for parse-incomplete workspaces, unmapped edits, collisions,
untracked TypeScript targets and stale plans.

G4: Minimal native VS Code adapter exercised in an actual Extension Development
Host. Nine tasks passed, including applied edits, initially closed consumers,
break/repair cycles, editing during worker analysis and physical alias views. No LSP, Rider,
production extension or human DX claim.

## Reproduce

```sh
npm ci
npm run check
npm test
npm run probe:language
npm run probe:recovery
# Requires local VS Code and explicit trust of the generated fixture workspace:
npm run test:editor
```

See [results and decisions](../docs/spikes/004/RESULTS.md) for architecture,
position conventions, known gaps and the next uncertainty to investigate.
The [recovery follow-up](../docs/spikes/004/RECOVERY.md) records an eleven-case
corpus, calling-thread observations and the test-only worker experiment. The
subsequent [asynchronous follow-up](../docs/spikes/004/ASYNC.md) integrates that
route. The [contract parity follow-up](../docs/spikes/004/PARITY.md) shares
Surface graph validation between CLI and editor. The current Node suite passes
287 tests after the [TypeScript buffer follow-up](../docs/spikes/004/TYPE-BUFFERS.md).
Open TS buffers now participate in versioned snapshots; the expanded twelve-task
native suite passes on VS Code 1.145.3 (`run-8qpKqr`). The preceding
[native alias follow-up](../docs/spikes/004/EDITOR-ALIASES.md)
adds conflict diagnostics, URI-expanded rename and tab-aware closure to
the adapter. Nine native tasks passed on VS Code 1.145.3. The preceding
[physical identity follow-up](../docs/spikes/004/PHYSICAL-IDENTITY.md)
verifies filesystem aliases and guarded buffer ownership in-process and in
the worker. The [Surface identity follow-up](../docs/spikes/004/SURFACE-IDENTITY.md)
links contracts, emitted components and preview by source file. The
[local ESM follow-up](../docs/spikes/004/LOCAL-ESM.md) emits bounded local
value-module graphs. The preceding
[import follow-up](../docs/spikes/004/IMPORTS.md) repairs source-context type
resolution and establishes import boundaries.
The [mount rollback follow-up](../docs/spikes/004/MOUNT-ROLLBACK.md)
verifies cleanup after synchronous mounting failures. The preceding
[runtime guard follow-up](../docs/spikes/004/INITIALIZATION-GUARDS.md)
adds precise runtime errors for indirect early accesses without static
CLI/editor diagnostics for those calls. This builds on
[initialization parity](../docs/spikes/004/INITIALIZATION.md) and
the [generated-name follow-up](../docs/spikes/004/HYGIENE.md),
which builds on [lexical bindings](../docs/spikes/004/SCOPES.md) and
[acceptance parity](../docs/spikes/004/ACCEPTANCE.md);
six native VS Code tasks originally passed at the asynchronous revision. Those
six tasks plus three alias tasks now pass on the current adapter. This rerun
does not exercise every compiler/runtime case from the intervening increments
through the native editor.

## Scope discipline

The accepted compiler grammar remains unchanged. Local ESM graph emission is
bounded as described above; general packaging is not established. The runtime includes
initialization guards and bounded synchronous mount rollback. Editor-only
recovery is not syntax support. Surface v0.3 remains a design draft. No SSR,
HPKE, nonce, formatter, production performance or browser CSP claims are made.
