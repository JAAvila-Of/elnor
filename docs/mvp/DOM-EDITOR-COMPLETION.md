# DOM property completion and bounded editor recovery

Integrated locally: 2026-11-17. The language service and local VS Code adapter
now offer host-specific property names and snippets. No DOM property or strict
compiler syntax is added by this increment.

## Authoring behavior

Invoke completion after a supported DOM tag or a property prefix such as
`button di`. Choosing disabled supplies `disabled=()` with the cursor inside
the value. The snippet has an empty placeholder; it does not guess false,
an expression, a state binding or a style value. Fill the expression normally.
When editing a name before an existing equals, completion replaces only the
whole name, preserving the expression and following caption/action.

| Host | Offered names |
| --- | --- |
| Existing containers and text tags | class |
| input and textarea | class, disabled, error, on-input |
| checkbox (later integration) | class, disabled |
| select (later integration) | class, disabled, error |
| form (later integration) | class, focus-invalid |
| submit (later integration) | class, disabled |
| reset (later integration) | class, disabled |
| button | class, disabled, aria-pressed, aria-current |

Complete properties on either side are excluded from suggestions. Dash
prefixes are supported. Ranges replace the entire name, including characters
after the caret, in UTF-16 coordinates. Captions, ordinary TypeScript,
comments and template text are protected from DOM snippet suggestions.
Component props continue to use the existing TypeScript-backed completion.

Only implemented properties are suggested; this does not establish Tailwind
utility completion, generic ARIA/data, roles, readOnly or other HTML attributes.
Prefix matching is bounded, not a general fuzzy repair system. Valid caption
expressions keep their existing TypeScript interpretation.

## Recovery without accepting invalid source

A single unfinished outer property parenthesis at the end of a real UI line,
for example `textarea disabled=(flags.`, can retain TypeScript member help.
Both an unfinished value and a balanced empty value such as `disabled=()`
can offer in-scope TypeScript names. Empty DOM expression spans retain an
editor-only position anchor; the compiler still rejects an empty value. This applies to the
supported host/property pairs; it does not invent an input state binding.
For `error=(...)`, recovery keeps the string context exposed by the
[field error contract](../surface/MVP-SUBSET.md#experimental-field-errors).
On a text control, recovery can keep both a field's error expression and the
callback type for [`on-input`](../surface/MVP-SUBSET.md#experimental-text-input-callbacks).
Unclosed quotes/comments, nested unclosed structures or multiple incomplete
property lines are outside the recovery envelope.

Recovery is an editor-only virtual view. The source buffer remains unchanged,
its original parse diagnostic remains visible, and invented tags/payloads have
no original-source mapping. Actual spans before and after the virtual insertion
are remapped; CRLF, surrogate pairs and later definitions are exercised.
The strict parser, formatter refusal and project build behavior remain intact.
A malformed project cannot replace its valid build manifest. Rename still
refuses an incomplete/invalid workspace; after completion, normal rename and
formatting resume.

The local Svelte parser reference exposes a separate loose parsing mode in
`packages/svelte/src/compiler/phases/1-parse/index.js`, file SHA256
`f672b3ad2eb112325c3c21780923adf94039e022d48a1014a019474efdebef7e`.
Elnor keeps its existing strict parser and extends its editor projection
instead. No Svelte implementation is copied or general loose grammar promised.

The later [checkbox integration](CHECKBOX-BINDING.md) verifies the additional
host in a new native editor revision. Evidence below belongs to the original
property-authoring increment.

## Validation and provenance

Current evidence lives under `elnor/.elnor/mvp/dom-editor-empty/`.
The first integration and earlier heap failure remain under
`elnor/.elnor/mvp/dom-editor/`.

| Gate | Result | Evidence |
| --- | --- | --- |
| Full isolated candidate check/build | 700 passed, 62 files; zero failures, cancellations or skips | `full-95532845806747d48e5aaef96813c00d` |
| Actual public transfer | Exact source/adapter copy, check/build and 23 editor/worker cases | `promotion-3db8c3952e1b4e83b5586a9445b3bbb4` |
| Native VS Code | 15 original checks plus 5 property-authoring checks | `native-complete-7b1c503696344711a59eefd26e3a3ddf` |
| Nine existing production graphs | Every bundle byte-identical, plus structural proof | `cost-c319d445fa33417284f198add61d0915`, `proof-dd95b54527034c0c9adbbcb6d7cf6423` |

The full suite ran on the exact isolated candidate; it was not repeated from
the public path. The 23 public cases are 14 new editor regressions and nine
existing async-worker cases, run serially after transfer. The native gate copies
and hashes the modified adapter as well as source, rather than relying on an
older adapter embedded in the image.

The five new native checks verify a real CompletionItem/SnippetString and
replacement range; insertion through TextEditor with its cursor in the value
and TypeScript names available before filling that empty snippet;
name replacement before an existing equals; host restrictions and textarea
recovery without source writes; and rename/format after repairing the document.
The test invokes the provider and inserts its returned snippet through the
native editor API. Completion popup/keybinding behavior and independent human
authoring preference are not established by that API-driven task.

Across the complete increment, only the language service, projection, new
editor helper and adapter change. The empty-value follow-up changes only the
projection and its existing regression tests.
All other prior source files, including parser, runtime and compiler sources,
retain their baseline hashes. No application source or CSS changes. Earlier
browser/ARIA evidence retains its own revision; no new browser runtime or CPU
campaign is claimed for this tooling increment.

Windows jobs retain CPU 10%, aggregate commit 768 MiB, Node heap 192 MiB,
24 processes and existing time/host-free limits. One retained pre-final test
held eight independent TypeScript services until test teardown and exhausted
its 192 MiB heap. The contained process tree was cleaned; the test now reuses
one service for successive edits without dropping host scenarios or raising
limits. The final targeted and complete suites pass within the same budget.

Only the dedicated native editor uses the approved 1 GiB ceiling, CPU 10%,
no swap/network and its reviewed sandbox/disposable profile. Workspace Trust
remains enabled and trusted, and owned containers are removed. Each native phase now uses a fresh anonymous
fixture volume at the existing trusted path, removed with its container. A
retained failed run exposed an incomplete pilot left in the older shared
fixture directory; rename correctly refused that invalid workspace. Two
volume-ownership setup failures are also retained. No fixture error is ignored
and no rename guard is relaxed. Linux has a hard
256-task ceiling including threads and a separately sampled 24-process policy
every 25ms; sampling is not a kernel process quota or a normal-editor memory
budget. No global extension was installed or personal setting changed. An
existing development extension host must reload to load its updated source.

## Unchanged generated browser programs

| Workload | Baseline gzip bytes | Candidate gzip bytes | Delta |
| --- | ---: | ---: | ---: |
| counter | 3030 | 3030 | 0 |
| form | 6535 | 6535 | 0 |
| composition | 2278 | 2278 | 0 |
| localized | 5046 | 5046 | 0 |
| keyed | 10917 | 10917 | 0 |
| form-wide | 15932 | 15932 | 0 |
| composition-deep | 2477 | 2477 | 0 |
| localized-wide | 19766 | 19766 | 0 |
| lifecycle | 7105 | 7105 | 0 |

Every raw production bundle has the same SHA256 on both sides. This is stronger
than structural equivalence for those nine graphs, and does not measure editor
latency, compiler startup or new framework CPU performance.

Broad syntax recovery, optional-value ergonomics, destination-spec ordering,
human DX and assistive-technology acceptance remain open. The DOM/form roadmap,
Tailwind pipeline and StyleX retain their separate scopes.

The later [native select integration](SELECT-BINDING.md) uses literal string options
and typed union writes. Task desk saves or cancels its existing priority draft
through this native control. Nested and controlled bindings remain unsupported.

The later [native form integration](FORM-SUBMISSION.md) gives the new-task composer
a single submit action. Enter in single-line fields creates a task; textarea
Enter remains multiline. Reusable submit-only components and reset remain outside
this first form contract.

The newer [submit composition increment](SUBMIT-COMPOSITION.md) removes the earlier
same-component restriction and verifies typed props, original definitions and
cross-component rename. TaskComposer now imports SubmitButton. Reset remains
separate work.

The later [managed reset increment](FORM-RESET.md) adds a typed `on reset()`
action and native reset buttons, including reusable components and slots. It
passes 45 native editor checks. The form cancels native defaults and runs the
explicit state action; automatic native-default restoration remains outside scope.

The later [component disposal increment](COMPONENT-DISPOSAL.md) maps cleanup
expressions through TypeScript, including void-result diagnostics, definitions,
rename and expression completion. The 50-check native revision verifies these
paths, duplicate/payload rejection, repair and formatting. No lifecycle keyword
snippet or general syntax-recovery expansion is implied.
