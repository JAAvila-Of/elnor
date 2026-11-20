# Experimental boolean ARIA states

Integrated locally: 2026-11-17. Buttons accept `aria-pressed=(boolean)` and
`aria-current=(boolean)` before their caption. Optional class, disabled and
these ARIA prefixes can appear in any order. Unknown names, duplicate prefixes
and unsupported hosts are rejected. No arbitrary ARIA/data/role API is added.

```eln
component Choice() {
  state active = false;
  action toggle() { active = !active; }
  ui {
    section {
      button aria-pressed=(active) "Toggle choice" => toggle()
    }
  }
}
```

## Pilot semantics

Task desk exposes Open, In progress and Completed as toggle filters. Repeating
an active filter returns to all tasks. All tasks remains a command and marks
the general mode with aria-current. Each task-row button indicates whether
it is the actual current task. A pending switch during editing does not mark
the pending target as current. Native button labels and keyboard behavior are
preserved. CSS styles the same ARIA state rather than a separate visual flag.

[WAI-ARIA pressed semantics](https://www.w3.org/TR/wai-aria-1.2/#aria-pressed)
distinguish toggle state from ordinary command buttons.
[Current semantics](https://www.w3.org/TR/wai-aria-1.2/#aria-current) distinguish
the current item in a related set from widget selection. The pilot keeps at
most one visible current task; it does not introduce listbox/tab/radio roles.

## Typed execution contract

This is a boolean subset. Both true and false serialize as ARIA string tokens;
false is retained as `"false"`. The runtime checks the two fixed names and the
boolean type, including values hidden behind TypeScript `any`. Equality avoids
redundant attribute writes. Literal booleans become construction metadata;
dynamic state uses existing effects/tasks and ownership. Removal cancels queued
writes and callbacks. Native owned children accept the new binding kind.

The regional capability selector now prunes unused ARIA code/imports as its
seventh feature. Production programs without these states retain the existing
workload structure. Unbundled runtime source includes the added support; this
does not promise zero cost for every import mode or establish new CPU numbers.

Svelte reference: local checkout `0156c5fe38b53b72675e2a7f04535de015fdeed1`,
`packages/svelte/src/internal/client/dom/elements/attributes.js`, SHA256
`5a20e747d9090d2e4de20a562131e2d63b928e33fa45497b3a86bfa3d3f0c4ca`.
Its attribute path distinguishes removal from serialized boolean values.
Elnor extends its own guarded setters and owned tasks with two fixed names;
generic setter caches, hydration and custom-element behavior remain separate.

## DX boundaries

Completion, rename and exact-range diagnostics are mapped inside expressions;
the engine also covers a partial `flags.` member expression. Native formatting
preserves the prefixes. The later [editor follow-up](DOM-EDITOR-COMPLETION.md)
adds host-filtered property names and bounded outer-expression recovery. Other
incomplete-prefix cases and destination-spec ordering remain open. Optional booleans need an
explicit fallback such as `active ?? false`. Values such as pressed `mixed`
and current's other tokens are not accepted by this initial subset; full ARIA
support and human authoring acceptance are not established.

## Validation and provenance

Retained runs live under `elnor/.elnor/mvp/dom-aria/`.

| Gate | Result | Evidence |
| --- | --- | --- |
| Final candidate check/build and full suite | 686 passed, 61 files; zero failed, cancelled or skipped | `full-932e7c4c43a641c1a9467eda60f0a2a1` |
| Actual public transfer | Byte-identical source/tests, check/build and 16 feature/app checks | `promotion-741b0e06b74347e89033a1c91f349d57` |
| Native VS Code | 15 original tasks plus 4 ARIA tasks, serial sessions | `native-complete-b96eed91f8c544caaea8318f75319afa` |
| Real browser | General, blueprint, sequential; keyboard, false tokens, identity, focus, no unrelated writes and native pressed AX state | `browser-fdfdf6480ad544afa3246bfea381a1ef` |
| Task desk browser | Toggle filters, actual/pending current task, plus multiline/create/save/discard/keyboard/mobile checks | `app-browser-638b44bdaf3b4078a2fad8dba30f770b` |
| Existing workload delivery | Nine production bundles and structural comparisons passed | `cost-ed0bf3f6c5d442bfbc2f45c459baac86`, `proof-e9e943f11b3e464ab2a7d764658d7355` |

The complete 686-case gate ran on the identical isolated candidate; it was
not rerun in the public path. Public CLI and 16 feature/application cases ran
after exact transfer with source/test hashes verified. Fourteen new cases cover
syntax/ranges, type guards, partial member completion, rename/format, three
construction routes, native owned children, no-op writes and branch cleanup.
The fake DOM now models attribute storage/cloning. Native interaction and
accessibility-tree evidence come from the real browser.

The browser checks pressed state through Chromium's native
`Accessibility.getFullAXTree`, along with keyboard activation. Current-task
checks assert DOM ARIA state and actual application selection. This does not
establish how every screen reader exposes current state or certify WCAG
compliance. Actual assistive-technology, human DX and broader browser testing
remain open. The four new native editor cases use aria-pressed for completion,
state rename, mapped TS2345 and formatting; engine tests cover both names.
Workspace Trust stays enabled and trusted, and owned containers
are removed.

Windows jobs retain CPU 10%, aggregate commit 768 MiB, Node heap 192 MiB,
24 processes and existing host-free/time limits. Only the dedicated editor
container uses the approved 1 GiB, CPU 10%, no swap/network, reviewed sandbox
and disposable profile. It has a hard 256-task Linux ceiling plus a separately
sampled 24-process policy every 25ms; sampling is not a kernel process quota.
This isolated gate does not define a normal-editor memory budget.

The earlier full suite before refining the application's toggle semantics
is retained separately, not used as final application-source evidence.

## Unused-feature delivery guard

| Workload | Baseline gzip bytes | Candidate gzip bytes | Delta |
| --- | ---: | ---: | ---: |
| counter | 3025 | 3024 | -1 |
| form | 6524 | 6528 | 4 |
| composition | 2272 | 2270 | -2 |
| localized | 5040 | 5040 | 0 |
| keyed | 10907 | 10910 | 3 |
| form-wide | 15915 | 15915 | 0 |
| composition-deep | 2469 | 2469 | 0 |
| localized-wide | 19761 | 19762 | 1 |
| lifecycle | 7094 | 7098 | 4 |

Bound-identifier structural comparisons preserve AST structure, global names,
properties, exports and literals; normalized programs are never executed.
Compression/name changes can alter bytes. These are unused-feature checks,
not updated runtime rankings against Svelte or React.

Generic ARIA/data, roles, URL/style/events, readOnly, select/checkbox and
form submission/reset remain separate contracts. Tailwind and StyleX still
need their own build integration. Roadmap stage 1 remains incomplete.
