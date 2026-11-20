# Checkbox boolean binding contract study

Historical isolated prototype, 2026-11-17. This report describes the earlier
private study. It is superseded by the [integrated checkbox report](CHECKBOX-BINDING.md),
which records the normalized DOM order, native editor and public transfer.
The limitations and not-integrated status below refer to that earlier revision.

## Proposed authoring contract

```eln
component Checklist() {
  state completed = false;
  state locked = false;
  ui {
    section {
      checkbox disabled=(locked) "Completed" <-> completed
    }
  }
}
```

`checkbox` denotes a native input with type checkbox, a literal wrapping label,
and a two-way boolean state binding. It uses checked/change, independently of
the string value/input contract of the existing text input. Class and disabled
prefixes follow their current typed contracts. ARIA prefixes remain button-only.

Read and write directions must both accept boolean. String, numeric, optional
and narrowed-literal state are rejected at the original binding span. An any
escape is guarded at runtime rather than coerced through Boolean. Programmatic
state changes preserve node identity and unchanged values avoid property writes.
Removal disposes the listener and cancels queued work; captured retired callbacks
cannot write state. Labels remain text, including HTML-looking text.

## Architecture and Svelte contrast

The general renderer has an owned checkbox constructor. Both regional variants
have an explicit checked binding and change event, plus a separately prunable
eighth capability. They do not send checked values through string conversion or
force the entire component into the general renderer. Public architecture and
existing benchmark claims remain unchanged until promotion.

The local Svelte reference is
`packages/svelte/src/internal/client/dom/elements/bindings/input.js`, SHA256
`25d8263cd3721080913590cc8b74f8e3485d112412edce11e69ab0ec96a01212`.
Its bind_checked distinguishes checked/change from value/input, integrates reset
and hydration, and coerces the read through Boolean. Elnor independently tests a
strict boolean boundary through its existing owner and regional task system.
No implementation is copied and no reset/hydration support follows from this
comparison.

## Evidence and limits

Evidence is retained under `elnor/.elnor/mvp/checkbox-contract/`.

| Gate | Result | Evidence |
| --- | --- | --- |
| Candidate check/build and complete regressions | 723 passed, 63 files, no failures/skips/cancellations | `full-09a8970a7698406881b01f599db9d444` |
| New checkbox regressions | 23, including general/blueprint/sequential execution | `run-89eb437c4f944a259bbe4e2e96f9d2c3` |
| Real browser | Three forced backends: label click, Space, tab order, disabled, identity, literal label and removal | `browser-4d3d2555fcfb435698728f394cc0d910` |
| Existing nine production graphs | Bound-identifier-normalized AST equivalence | `proof-8e9fe8680e2244349e863074065119ac` |
| Retained source/provenance review | Exact candidate hashes and public source/test baseline retained | `review-641866a08a994d65bc82d36402c72141` |

Browser tests ran in isolated sandboxed headless Edge through the installed
Playwright CLI, with restrictive preview CSP, no page errors or observed CSP
violations. These are automated behavior checks, not a screen-reader audit or
human authoring acceptance. No native VS Code task ran for this new keyword.
Earlier native editor results belong to their earlier source revision.

| Workload | Public baseline gzip bytes | Prototype gzip bytes | Delta |
| --- | ---: | ---: | ---: |
| counter | 3027 | 3027 | 0 |
| form | 6532 | 6531 | -1 |
| composition | 2275 | 2276 | 1 |
| localized | 5044 | 5044 | 0 |
| keyed | 10914 | 10913 | -1 |
| form-wide | 15931 | 15933 | 2 |
| composition-deep | 2475 | 2474 | -1 |
| localized-wide | 19766 | 19766 | 0 |
| lifecycle | 7102 | 7102 | 0 |

These bundles are **not byte-identical**. The binding-aware structural comparison
normalizes local symbol names while preserving external/property names, literals
and syntax; all nine match under that comparison. The original aggregate gate
`acceptance-b4f00172ef4b4e169c70b229f594c485` retained a failed byte-equality
assertion. The separate review records structural equivalence and descriptive
delivery deltas, rather than rewriting that failure or claiming byte equality.
No CPU, memory, startup or new Svelte/React performance result is established.

All heavy Windows jobs ran serially under the existing containment: CPU 10%,
768 MiB aggregate commit, 192 MiB Node heap, 24 processes, host-free floor and
existing timeouts. Browser phase uses 45-second wall and 12-second idle limits.
There were no installs, Rust builds, desktop editor launches or global changes.

## Required before integration

The binding currently requires a direct mutable state identifier. Expressions
such as task.completed and controlled component-prop bindings are unsupported.
That is meaningful DX friction for task rows, not a completed form-binding API.

The prototype general constructor places the input before its caption while the
regional plans place the caption first. Native label/keyboard behavior passes,
but DOM order and styling must be normalized and asserted across renderers before
promotion. This study does not endorse those differing shapes.

Next acceptance work is that normalization, native editor completion/diagnostics/
rename/formatting for the new host, an explicit decision on the initial binding
scope, and a representative pilot before an exact public transfer. Form reset,
submission, defaultChecked, indeterminate, radio groups, arrays of selected values,
SSR/hydration and complete accessible component-library support remain separate.
