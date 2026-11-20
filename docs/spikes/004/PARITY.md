# Shared Surface contract validation

This records the graph-validation increment. The later
[acceptance follow-up](ACCEPTANCE.md) addresses optional contracts, early shadowing
diagnostics and the default-prop execution boundary.

## Question and result

Can CLI and original-source tooling reuse Surface contract rules without a
grammar change or replacing their TypeScript projections?

Yes, for the bounded graph-validation corpus below. Before integration, nine
cases produced Surface contract errors in the CLI and no corresponding Surface
errors in the editor. Both now use `src/semantic-validation.mjs`, report the same
codes and messages, and preserve exact original UTF-16 ranges in the editor.
This establishes shared contract validation, not complete semantic parity.

## Architecture

The pure `validateGraph` function accepts parsed components and returns errors.
It does not read files, generate code or execute user code. `typecheckGraph`
calls it before its existing CLI TypeScript check. The language service calls
it over its in-memory component graph before collecting mapped TS diagnostics.
The asynchronous worker uses that service without a protocol change.

An imported file with an unreadable contract is distinguished from an absent
file. Surface checks requiring that contract are deferred until it parses again.
The dependency retains its parser errors; TypeScript may still report import
errors in consumers. No obsolete contract is retained. Windows path lookup is
case insensitive.

## Acceptance evidence

`tests/semantic-parity.test.mjs` adds twelve tests:

| Cases | Evidence |
| --- | --- |
| Event outside a custom component | `ELN-EVENT-CONTEXT` |
| Fill outside a custom component | `ELN-SLOT-CONTEXT` |
| Unimported component | `ELN-COMPONENT-IMPORT` |
| Default content without a default slot | `ELN-SLOT-MISSING` |
| Unknown named slot | `ELN-SLOT-UNKNOWN` |
| Duplicate fills | `ELN-SLOT-DUP` |
| Duplicate handlers | `ELN-EVENT-DUP` |
| Missing and unexpected handler arguments | Two `ELN-EVENT-ARITY` cases |
| Unsaved dependency edits and unreadable contracts | Updated consumer diagnostics |
| Missing dependency followed by opening it | Original import-path range and error removal |
| Actual asynchronous worker query | Exact range, snapshot invalidation and updated contract |

The first nine compare CLI/editor codes and messages, verify exact source tokens
with Unicode and CRLF preceding them, and repair the consumer in memory.
They failed before integration and passed afterward.

Validation on Windows:

- `npm run check`: four components pass.
- `npm test`: pretest build succeeds; **71/71 Node tests pass**.
- The native VS Code host was not rerun for this increment. The six tasks in
  [ASYNC.md](ASYNC.md) remain evidence from that earlier revision.

## Limits and next uncertainty

The parser, compiler grammar, code generation and runtime are unchanged. The
shared validator preserves the existing graph rules and traversal model; this
corpus is not an independent proof that every rule is complete.

CLI and editor still use separate TypeScript projection generators. CLI contract
generation does not preserve the editor's optional/readonly prop contract, and
code generation separately rejects some action shadowing. Default-prop runtime
behavior needs acceptance evidence before any claim of supported defaults.
Full TypeScript diagnostic parity is not established by this Surface comparison.

Each editor diagnostic request currently validates the loaded graph afresh.
There is no incremental graph index or large-workspace performance evidence.
The next useful corpus should compare accepted programs and errors across both
TS projections and the runtime, especially optional props and action shadowing.
