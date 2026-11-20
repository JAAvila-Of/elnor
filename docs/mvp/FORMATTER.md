# Conservative Surface formatter

**Status:** first implementation of the [formatter contract](FORMATTER-CONTRACT.md).
It formats indentation and compact action layout through a pure API and a read-only CLI. A
[versioned development-adapter integration](VERSIONED-FORMATTING.md) is now
implemented with API-double/real-worker coverage and a passed
[native unsaved-buffer formatting task](NATIVE-VALIDATION.md). The formatter
does not save files or implement full v0.3 layout.
The authoring preview server is unnecessary for this command and can be stopped.

## Use from the command directory

Run commands in `elnor`, the directory containing this package.json. On the
current exercise checkout:

```powershell
Set-Location '.'
npm run format -- --check examples/authoring/Counter.eln examples/authoring/App.eln
```

For the editable exercise copy, use its explicit path:

```powershell
npm run format -- --check .elnor/mvp/authoring-workspace/Counter.eln
```

Without `--check`, one file's formatted text is printed; the input is unchanged:

```powershell
npm run format -- .elnor/mvp/authoring-workspace/Counter.eln
```

For exact source-only stdout, call `node scripts/format-surface.mjs <file>`;
npm itself prints script headings. This version intentionally has no `--write`.
It reads the saved file, not an editor's dirty buffer. A formatted result is not
a typecheck result; use the ordinary check command separately.

| Exit code | Meaning |
|---|---|
| 0 | All checked files are formatted, or printing succeeded |
| 1 | At least one checked file needs formatting |
| 2 | Refused source, read failure or invalid usage; this takes precedence over 1 |

## API and scope

`formatSurface(source, {filename = "Component.eln", indentSize = 2})` in
`src/formatter.mjs` returns `{edits, diagnostics}`. Indent size may be 2 or 4.
Edits are sorted, non-overlapping, original UTF-16 ranges containing only whitespace
changes. `applyFormatEdits(source, edits)` validates their ranges
and applies them to that input snapshot. It cannot independently identify a
stale editor revision; the future caller must enforce that boundary.

The formatter normalizes Surface and action-body indentation. Inside an action,
it uses TypeScript syntax to put adjacent statements in the same block and
properties of a multi-property object on separate lines. A leading inline block
comment can move to its own line with its contents intact. TypeScript supplies
action indentation. Simple one-statement bodies can stay inline. The formatter
also indents multiline `state` and `calc` initializers written with an explicit
`= (` opener and `);` closer. A standalone, single-line declaration with
those parentheses wraps when it exceeds 100 columns after indentation.
For a top-level conditional it also puts `?` and `:` on separate lines
when those breaks can use whitespace around the tokens. The wrap preserves
author-supplied line breaks and comment placement. Declaration headers and UI
expressions retain their layout.

An action's single-line `if` or `guard` condition wraps when the text from the
keyword through the closing parenthesis exceeds 90 columns. In a top-level
`&&` or `||` chain, operators can start continuation lines. Parenthesized
groups keep their layout, as do gaps where a comment would have to move.
The closing parenthesis retains its existing spacing before `then` or the
following statement.

Use the multiline form for logic that is easier to scan across lines:

```surface
state count = 0;
calc label = (
  count === 0
    ? "No tasks"
    : "Tasks: " + count
);
```

The parentheses mark the expression boundary and make continuations visible.
Use them on compact expressions to let the formatter wrap long declarations.
The width is a trigger for this layout. Long individual expressions and
literals can still extend beyond it.

LF or CRLF, BOM, comments, strings, regular expressions and multiline literals
are preserved. Mixed line endings and lone-CR files are explicitly refused.
Template expressions are protected as a whole, including interpolation layout;
the formatter can leave their internal indentation unchanged. It does not
normalize quotes, sort imports, rename symbols, add semicolons, repair source or
load dependency files. The existing strict parser and its lexical limits remain
the accepted-input boundary; arbitrary TypeScript fragments are not newly
supported by formatting.

## Preservation and refusal

The implementation combines the parser's semantic spans with a source-based
view of braces outside protected TS fragments. TypeScript AST/token information
protects action literals and comments; a regex-only brace counter is not used
on arbitrary embedded code. The original source is never regenerated solely
from the IR, which does not contain all trivia.

Before exposing edits, the candidate is parsed again. Its semantic structure,
TS token signatures and action/header comment text must match, disregarding
positions and formatting-only fields. A second formatting plan must be empty.
Only whitespace edits outside protected contents are selected. These checks
and the regression corpus support the tested subset; they are not a formal
equivalence proof for all language programs.

| Diagnostic | Meaning |
|---|---|
| `ELN-FORMAT-OPTIONS` | Unsupported indentation option |
| `ELN-FORMAT-EOL` | Mixed line endings or lone CR |
| `ELN-FORMAT-PARSE` | The strict parser refuses the input; `causeCode` retains its diagnostic |
| `ELN-FORMAT-STRUCTURE` | A safe indentation structure cannot be identified |
| `ELN-FORMAT-EQUIVALENCE` | The candidate fails strict parsing or structure/token preservation |
| `ELN-FORMAT-UNSTABLE` | A second pass would still produce changes |

Every expected refusal returns no edits with a diagnostic, rather than an empty
successful result. Unexpected internal failures propagate through the API; the
CLI reports them as failures without modifying inputs. Type-invalid but
syntactically valid source is not a dependency-aware typechecking request.

## Evidence and next boundary

`tests/formatter.test.mjs` has 26 cases: six existing examples unchanged,
unindented Surface/actions, 2/4-space layouts, tabs/Unicode/BOM/CRLF, templates,
regexes, escaped continuations, comments, multiline headers, nested Surface and
TypeScript structures, explicit refusals, overlapping edit rejection, and CLI
exit/preservation behavior. Counter/App typecheck and execute equivalently
before/after formatting, including events and disposal, using the existing fake
DOM. The initial stub failed 13 of the original 21 cases before implementation.

The pure formatter increment passed 324 tests. The later adapter integration passed
**343/343 Node tests** at that point; `npm run check` still checks
four original components. CLI `--check` reports all six baseline examples clean.
The pure increment did not exercise native/browser integration. Subsequent
native task 13 verified formatting an unsaved buffer without saving; its evidence
is separate from the Node suite. The [readiness review](MVP-READINESS.md) links
its reviewed baseline and remaining human evaluation. The latest
[measurement increment](DEVELOPMENT-MEASUREMENTS.md) retains a 463-case/fifteen-task gate.

Versioned buffer handling is covered in the linked integration report. Automatic
save policy, filesystem writes and full layout remain separate. No server or screen
access is needed to exercise the pure API and read-only CLI.
