# Formatter contract for the MVP subset

**Status:** the [conservative formatter](FORMATTER.md) provides pure indentation
and action layout edits with a read-only CLI. The [versioned adapter](VERSIONED-FORMATTING.md)
is implemented with Node/API-double evidence and the passed
[native unsaved-buffer formatting task](NATIVE-VALIDATION.md). Write actions and
settings changes are absent. The [subset baseline](../surface/MVP-SUBSET.md)
remains the scope. This contract does not expand Surface grammar or promise
round-trip support for the complete v0.3 design.

## Purpose and first boundary

The [Task desk authoring feedback](TASK-DX-EXERCISE.md#participant-title-validation-edit-and-layout-friction)
now records a participant struggling with compact code during an actual edit.
The [action layout increment](FORMATTER.md) separates statements and object
properties while preserving tokens and comments. The same formatter indents
explicitly parenthesized multiline state and calc initializers. Human evaluation
of the resulting layout remains open.

Reduce manual layout work while preserving what a developer wrote. The first
implementation should conservatively format Surface structure and indentation,
without rewriting TypeScript expressions to fit parser limitations. Two-space
indentation matches the current starter/examples. Do not add syntax merely to
make printing easier.

The current IR retains original source and semantic spans, but skips comments
and does not model all delimiters/trivia as a lossless syntax tree. Reprinting
that IR alone would risk losing source. Build edits over original source with
protected literal/comment/TypeScript ranges. Reuse TypeScript tooling where it
can format a mapped fragment safely; do not invent a second TS parser or apply
edits that cross generated scaffolding. A formatter-specific token/trivia view
must preserve the existing strict grammar.

## Observable contract

Pure API shape for the supported indentation and action layout operations:

```typescript
formatSurface(source, options) -> {
  edits: Array<{start: number, length: number, newText: string}>,
  diagnostics: Array<FormatDiagnostic>
}
```

The API is callable as described in the implementation guide. Its responsibilities:

- Source is an input string. The formatter never reads dependencies, executes
  expressions, mutates an editor model or saves a file.
- Edits use original zero-based UTF-16 spans, are non-overlapping and contain no
  generated offsets. The caller applies them against the exact input revision.
- Already formatted source yields no edits. Reformatting the result yields no
  further edits: idempotence is mandatory.
- Preserve identifiers, token order, import/declaration order, literal values,
  comments and their order, and the distinction between explicit/implicit
  syntax. Do not sort imports, rename bindings, fix errors, insert defaults or
  transform action semantics.
- Preserve BOM and the existing LF or CRLF convention by default. Mixed line
  endings require an explicit policy rather than silent normalization. A final
  newline policy must be explicit and idempotent; literal contents retain their
  original bytes regardless of layout rules.
- Preserve line-comment boundaries, block-comment contents and multiline literal
  text, including template literals and escaped line continuations. Trimming
  every line or counting braces with regular expressions is insufficient.
- Keep Surface statement boundaries valid. Indent explicitly multiline state
  and calc initializers while keeping their author-supplied line breaks.
  Standalone single-line initializers with outer parentheses may gain line
  breaks through whitespace-only edits when they exceed 100 columns.
  Actions can wrap single-line `if` and `guard` conditions longer than 90
  columns from the keyword through the closing parenthesis. Top-level logical
  operators can break at whitespace gaps while nested groups retain their layout.
  Keep UI expression layout within the current grammar.
- For syntactically invalid, partial or structurally ambiguous source, return no edits with a
  useful refusal diagnostic. The first version need not repair incomplete
  programs; recovery for reading/completion does not authorize formatting them.

## Integration and failure behavior

An explicit formatting action should be first. Automatic formatting on save
should remain opt-in until the corpus and human workflow support it. Native
integration must check the document version after analysis and return edits to
the editor. It must not save or pre-mutate the language service; ordinary editor
change events invalidate old diagnostics/rename snapshots afterwards.

The current CLI supports read-only checks/printed results. Any future explicit
write action must verify the saved input/identity still
matches its analyzed snapshot. Existing dirty editor text cannot be silently
adopted from disk. No filesystem-transaction guarantee is implied.

If re-parsing or equivalence checks fail, expose no candidate edits. A refusal
must not become an empty successful result. Expected errors and optional
approximate ranges must be distinguishable from internal formatter failures.

## Required acceptance evidence

| Case | Required result |
|---|---|
| Counter and App from the authoring exercise | Stable canonical layout, strict parse and typecheck before/after, unchanged generated behavior and event payloads |
| Already formatted baseline examples | No further edits; comments/literals retained |
| Nested UI, props, slots, conditionals and keyed lists | Structure and expression boundaries preserved |
| Multiline actions with nested functions, comments and shadowing | Correct layout without changing tokens or binding behavior |
| Strings/templates containing braces, whitespace and line breaks | Exact literal contents and evaluated values preserved |
| CRLF, tabs, accents, astral characters and BOM | Correct UTF-16 edits and the declared line-ending policy |
| A partial prop, broken action, comment or delimiter | No edits with a clear refusal; source unchanged |
| An editor edit while formatting is pending | Stale formatting edits discarded |
| A second formatting pass | Empty edit set |

Compare semantic structures without source offsets, check non-whitespace tokens
and protected source text, and execute representative emitted components. No
single comparison alone proves all semantic preservation. Keep browser/native
claims separate from fake-DOM or in-process coverage.

The participant has not yet evaluated this formatting implementation. Initial layout
defaults are engineering choices matching examples, not user-validated language
preferences. Pure indentation and preservation are covered by 26 formatter
cases. Versioned worker/adapter tests now cover the pending-editor-edit row;
those results are distinct from the later passed native task. Human preferences
remain open in the [readiness review](MVP-READINESS.md). Continue against this contract without reopening
the completed viability spikes.
