# Runtime initialization guards

The subsequent [mount rollback follow-up](MOUNT-ROLLBACK.md) verifies and repairs
cleanup after synchronous initialization/rendering failures.

## Question and result

Can the spike identify an actual indirect early access without rejecting deferred
closures, safe branches or shadowed local variables?

Yes for the tested executions. Generated components now install sentinel cells
for every state and calc before running any initializer. Reading or writing a
sentinel throws a `ReferenceError` with `code: "ELN-INIT"` and metadata identifying
the binding's original declaration. Initialization replaces each sentinel with
its real cell in the existing state-then-calc phases.

The three generic runtime failures recorded in [INITIALIZATION.md](INITIALIZATION.md)
now produce explicit errors. Before this change, all three strengthened tests
requiring `ELN-INIT` failed; after the change they pass. This improves runtime
diagnostics. **CLI and editor still accept those indirect accesses without a
static diagnostic.** There is no interprocedural static safety claim.

## Error contract

The new internal runtime helper `uninitializedBinding` receives declaration
metadata emitted by the compiler. A failed access throws an error containing:

| Field | Meaning |
| --- | --- |
| `code` | `ELN-INIT` |
| `binding` | Original state or calc name |
| `kind` | `state` or `calc` |
| `file` | Original component filename |
| `start`, `length` | Declaration identifier range in UTF-16 code units |

The message names the uninitialized binding and file. The range identifies the
declaration, not the indirect access site; stack frames still refer to generated
code. No IDE presentation or exception source-map integration is implemented.

Both storage objects exist before initialization begins, so an action called by
a state initializer can identify an unavailable calc instead of exposing a
generated-storage temporal-dead-zone error. The runtime helper lives in its own
module and its generated import alias uses the existing fresh-name allocator.
Object-literal sentinel keys are computed string keys, preserving their identity
as data properties. Once initialized, ordinary cells, computed effects and
tracking behavior are unchanged; an initialized `undefined` value is valid.

An async action follows ordinary JavaScript behavior: a read before its first
`await` rejects its promise with the same error metadata, while a read after
resuming may succeed if initialization has completed. A guard does not convert
an asynchronous rejection into a synchronous mount error.

## Why execution guards

The original checker gap involved an action reading a binding whose initialization
had not completed. Source text alone cannot establish whether such a function
will run immediately: a caller may store it, invoke it through an alias, pass it
to a callback or take a different branch.

The chosen guard checks the executed access. It preserves valid closures and
branches without inventing a second JavaScript control-flow analyzer. Rejected
alternatives were retaining generic storage errors, rejecting actions mentioned
by initializers, and attempting general interprocedural static analysis in this
bounded increment. The parser and TypeScript projections are unchanged. Runtime
and generated modules must come from compatible revisions; the existing build
copies the current runtime alongside the modules.

## Evidence

`tests/initialization-parity.test.mjs` now contains 31 cases. Its original
initialization coverage remains, and the strengthened/new cases verify:

- Exact error type, code, binding, kind and declaration range for the three
  original indirect state/calc accesses, including Unicode/CRLF positions.
- Action call chains, local function aliases and an early state write.
- A dynamic branch with both safe and failing mounts of the same module.
- A synchronously invoked higher-order callback versus a stored callback.
- A closure returned by an action, including reactive UI updates after mounting.
- A shadowed local that must remain independent of the component binding.
- Async reads before and after resumption, including handled promise rejection.

Two additional cases in `tests/name-hygiene.test.mjs` check collisions with the
new runtime helper and its generated alias. On Windows, `npm run check` checks
four components; `npm test` builds and passes 171/171 Node tests. This includes
explicit assertions of the guarded errors, not successful execution of invalid
initialization programs. Execution uses the existing fake DOM. The native VS Code
host was not rerun.

## Limits and next uncertainty

The guard detects access to a state/calc cell before its initializer completes.
It does not statically diagnose the access, establish calc purity, prove general
cycle safety, or guard the event emitter and every other possible JavaScript
temporal-dead-zone error. No browser or large-workspace performance claim follows.

Initialization exceptions can occur after earlier effects have been created.
This increment did not implement rollback or prove resource cleanup when mounting
throws before returning a disposer. The subsequent [cleanup corpus](MOUNT-ROLLBACK.md)
addresses synchronous failures. Value/type import execution remains independently open.
