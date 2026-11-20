# Spike 004 — Surface Language Service evidence

**Date:** 2026-11-09, Lima.
**Environment:** Windows; Node.js 24.21.0; npm 11.19.0; TypeScript 5.9.3.
**Editor follow-up:** 2026-11-10, Lima; VS Code 1.145.2; extension-host Node 24.22.1.
**Latest follow-up:** [acceptance parity](ACCEPTANCE.md) aligns optional prop
contracts and early generator-boundary diagnostics, with 84 passing Node tests.
The preceding [graph validation](PARITY.md) shares Surface contract rules. The
[asynchronous service](ASYNC.md) previously passed six native editor tasks;
the native host was not rerun for either parity increment. The earlier
[recovery experiment](RECOVERY.md) records the corpus and original thread probe.
**Conclusion:** bounded GO for mapped TypeScript tooling on Surface. This reduces
uncertainty about the implementation route, not about production readiness or
the complete Surface v0.3 design.

## What was uncertain

Spike 003 queried TypeScript on generated `.eln.mts` files. It did not prove that
positions, edits and incomplete authoring states could be translated back to
original Surface. Counting rename locations was insufficient: the edits had to
be applied to real `.eln` text and checked afterward.

## Observations

| Question | Evidence obtained | Remaining uncertainty |
|---|---|---|
| Can TypeScript provide precise Surface diagnostics? | Unknown `missing` prop selects exactly seven original characters; CRLF, tabs, accents and emoji tests | Errors spanning scaffolding may only have an explicitly approximate component anchor |
| Can definitions cross source boundaries? | Component/prop use resolves to another `.eln`; `User` resolves to ordinary `types.ts` | Full workspace/package resolution and malformed import recovery |
| Can completion work on incomplete text? | `Badge la`, `Badge ` and `user.` return contextual TS suggestions; a Surface replacement span is tested | General recovery, completion details, auto-imports and client UX |
| Can rename preserve text and semantics? | Declaration, local uses and two consumers change together; shadowed locals, aliases and TS shorthand are preserved | Unloaded consumers, cross-language edits and all symbol categories |
| Can the service handle unsaved changes? | Prop type changes invalidate consumer diagnostics; restoration clears them; stale plans are rejected before editing | Filesystem watchers, large graphs, cancellation and latency |
| Can these operations run through a real editor? | Five automated tasks passed in a native VS Code Extension Development Host | Human DX, cold-start responsiveness, general recovery and other editors remain unproven |

The real-source probe navigates from `UserEditor.eln` to `UserList.eln`, reports
`missing=visible` at line 81 / column 16, suggests `users` from `UserList us`, and
renames `users` to `rows` in the child and consumer. It applies edits in memory
and asserts that source files on disk are unchanged.

## Architecture exercised

```text
versioned .eln document
        |
        v
existing parser + exact spans
        |
        v
editor TS projection + copied-segment source map
        |
        v
persistent TypeScript Language Service
        |
        v
original diagnostics / definitions / completions / rename plans
```

- `src/parser.mjs` retains source ranges alongside its existing representation.
  The compiler still uses strict parsing; no language syntax was added.
- `src/language-projection.mjs` copies source segments verbatim and records each
  generated/original interval. Wrappers and generated suffixes have no origin.
  One declaration can appear in both a local TS binding and an exported contract;
  those mirrors connect the otherwise separate TypeScript symbols.
- `src/language-service.mjs` owns versioned documents and one persistent TS
  service. `open` updates unsaved text. Imports can be read without execution.
  Virtual module paths derive from source paths, so equal component names in
  different directories do not collide.
- Rename follows TS symbol references and mirrored declarations, deduplicates
  original edits and retains TS shorthand prefix/suffix text. A candidate
  workspace is checked before returning edits. Applying the plan checks document
  versions and workspace revision first. Source files are not written.
- `src/editor.mjs` remains the historical virtual-only probe. The CLI checker
  still uses its old projection; convergence with the editor projection is
  future work, not a proven single compilation pipeline.

## Position and recovery decisions

API `start` and `length` values are zero-based UTF-16 code-unit offsets.
Diagnostic `line` and `column` are one-based; a tab counts as one code unit, not
visual indentation. Newlines are preserved; CRLF is not normalized.

The v0.3 draft mentions UTF-8 offsets. This spike uses the native coordinate
system of JS and TS. A byte-oriented consumer needs an explicit UTF-8 conversion;
that conversion is not implemented or claimed. This is an editor API decision,
not a grammar change or an assertion of RFC conformance.

Strict parsing is attempted first. On failure, the editor may append closing
delimiters at EOF and accept a final partial prop name or incomplete TS UI
expression. Original errors remain visible. Appended text receives no source
range. Rename is disabled while any loaded Surface file has a parse error.
Unclosed block comments, malformed headers and other structurally ambiguous
input can prevent projection of the whole file. Single-line string and local
statement recovery was extended in the [later follow-up](RECOVERY.md). A failed
projection replaces the old one rather than retaining
stale exports. TS may navigate to a local import when an export is unavailable;
it must not return an obsolete component declaration.

## Reproduction and checks

```sh
npm ci
npm run check
npm test
npm run probe:language
```

The lockfile records TypeScript 5.9.3. Initially `check` and the pretest build
failed on Windows: missing local TS fell through to `which`, and `URL.pathname`
produced a doubled drive path. Root paths now use `fileURLToPath`; missing local
TS produces an installation instruction.

The suite retains the original 17 tests and adds language-service tests for
exact ranges, original definitions, partial completion with replacement spans,
applied multi-file rename, versions, Unicode/CRLF/tabs, shadowing, multiline TS
actions, generated-only ranges, unchanged strict grammar, separate directories,
aliases, shorthand and unrecoverable input.

Verified on the environment above:

| Command | Observed result |
|---|---|
| `npm run check` | Four components parsed and typechecked |
| `npm test` | Pretest build passed; **36/36 tests passed**, zero skipped |
| `npm run probe:language` | All assertions passed; original source locations and applied in-memory edits printed |

The 36 tests comprise 17 retained Spike 003 tests and 19 new language-service
tests. The HTTP/CSP test remains header/output evidence, not browser enforcement.

## Boundaries and costs

- The shared engine now has a versioned asynchronous VS Code development adapter.
  Six real provider/lifecycle tasks pass in the latest follow-up; no LSP, Rider, remote workspace or
  distributable extension support is claimed.
- The document store defines the workspace. Opening a child alone does not
  discover all reverse consumers. A caller must load relevant project files
  before requesting a project-wide rename.
- Rename rejects incomplete Surface files, unmapped references, unversioned
  targets and edits into `.ts`. Default import aliases retain TS local alias
  semantics; this is not a file rename or a global rename of every import spelling.
- Candidate validation compares diagnostic codes and messages, allowing the old
  symbol spelling to change. It is a bounded safeguard, not semantic equivalence
  proof or complete detection of every possible capture.
- Symbol coverage is not universal. Slot contracts contain generated-only names;
  slot rename is not established. An editor needs explicit unsupported-operation
  behavior.
- Recovery does not establish multiline UI syntax, all TS lexical cases, a
  formatter, Surface v0.3 support or full incremental parsing.
- The editor projection lacks some CLI-only semantic checks, including slot/event
  context restrictions and code-generation shadowing rules. Projecting a contract
  does not establish readonly/default prop runtime semantics. Compiler/tooling
  semantic parity remains work to prove.
- Changes reparse and regenerate their document. TS service state is reused, but
  there is no proven incremental Surface parser. Rename creates a temporary
  service to check its candidate. No production latency or memory conclusion
  follows from passing this small suite.
- Components, fixtures, project plugins and generated code are not evaluated.
  No filesystem sandbox or untrusted-project containment is claimed. Browser
  CSP evidence remains unchanged from Spike 003.

## Recommendation

Continue with mapped TypeScript tooling. Do not replace its type system or
change Surface syntax to simplify tooling. Strict compilation and bounded
editor recovery remain distinct entry points.

The minimal adapter now establishes that the mapped results can pass through an
actual editor. The next uncertainty is whether useful results survive a wider
set of incomplete edits without blocking the extension host. General recovery,
startup cost and shared compiler/editor semantics remain more important than
adding language constructs. Human editing tasks are still needed to assess DX.

## Editor follow-up: real provider evidence

`editors/vscode/extension.cjs` registers native VS Code providers instead of
adding an LSP transport in the same experiment. The development adapter indexes
the first workspace folder's `.eln` files, including consumers not initially
open, synchronizes unsaved text and publishes debounced diagnostics. It rejects
restricted workspaces, and keeps source files unsaved. A rename plan is checked
again after asynchronously opening its targets to detect intervening edits.

`npm run test:editor` launches the installed editor with separate profile and
extension directories. It creates only disposable synthetic source files under
`elnor/.elnor/spikes/004/editor-workspace`, never editing project examples or
installing an extension globally. The test host can keep Workspace Trust in
temporary storage: explicit approval in that instance is required. No trust
settings are disabled or seeded by the launcher. Interrupted or timed-out trust
attempts are failed runs, not proof of editor support.

The five tasks passed in `run-IHagsg`, `run-Y7AY5i` and the final measured
`run-FpBwkb`. These are local run-directory references under
`elnor/.elnor/spikes/004/editor-runs`, not public artifact revision identities.
The final run's `result.json` has `passed: true`, `trusted: true` and
`sourceFilesUnchanged: true`; the process exited with code zero.

| Task | Final observed wall time | Assertion |
|---|---:|---|
| Type/complete a component prop | 62 ms | Elnor suggestion replaces exactly `la`; the editor applies its range |
| Fix a type error without saving | 264 ms | `missing` is underlined exactly despite CRLF, tabs and emoji; error clears |
| Navigate to a component | 5 ms | Definition target is the component identifier in original `Badge.eln` |
| Rename a prop | 206 ms | Native WorkspaceEdit changes declaration, local use and two consumers |
| Break/repair a declaration | 501 ms | Missing-brace recovery preserves navigation; repairs clear errors without restart |

Separate command-response observations in that same run:

| Request | Observed time |
|---|---:|
| First timed completion after activation | 40 ms |
| Repeat of the same completion | 3 ms |
| Definition | 5 ms |
| Rename preparation | 200 ms |

These observations exclude activation, trust approval and editor launch. The
first timed request is **not a proven cold TypeScript request**: activation may
already have published diagnostics and initialized TS state. Earlier runs took
1,253 ms and 2,192 ms for the whole first completion task. Those values include
edits and diagnostic handling and cannot be compared directly to the individual
requests. No p95, scale, startup-cost or production performance conclusion is
supported by this sample.

The test uses real `vscode.executeCompletionItemProvider`, definition and rename
commands, not mocked `vscode` objects. It checks the `Elnor Surface` completion
marker to exclude generic word suggestions. All three fixture files are verified
unchanged on disk at the end of the final run. The original `npm run check` and
pretest build still pass, and the Node suite passes **36/36**, separately from
these five editor tasks.

At the time of this first editor follow-up, an unterminated string prevented
useful whole-file recovery; the [later recovery experiment](RECOVERY.md) supersedes
that boundary for the tested single-line cases. Analysis was still synchronous
in the extension host at this stage; the [asynchronous follow-up](ASYNC.md) moves
it into a persistent worker. The adapter's `.eln` index does not establish scalable
workspace discovery, live `.ts` synchronization, reliable asynchronous
cancellation or multi-root behavior. Functional automation is evidence of the
integration route, not a study showing that humans experience exceptional DX.

Implementation references: [VS Code language feature APIs](https://code.visualstudio.com/api/language-extensions/programmatic-language-features)
and [Extension Development Host testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension).
