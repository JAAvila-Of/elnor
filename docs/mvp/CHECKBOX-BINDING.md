# Experimental checkbox boolean binding

Integrated locally: 2026-11-17. Checkbox is now available in the public local
implementation and Task desk uses it for the new-task High priority draft.
It remains experimental; this is not general HTML input-type support.

```eln
component Checklist() {
  state completed = false;
  state locked = false;
  ui {
    section {
      checkbox class=("task-toggle") disabled=(locked) "Completed" <-> completed
    }
  }
}
```

## Authoring and DX limits

Use a double-quoted literal label and a direct mutable boolean state identifier.
Class and disabled prefixes are optional and may appear in either order. The
actual checkbox receives those properties. A native label wraps input then span,
in that order on general, blueprint and sequential renderers. No generated ID,
handler or explicit label association is required from the author.

Both reads and arbitrary boolean writes are checked. Strings, numbers,
boolean-or-undefined and narrowed literal state fail at the binding reference.
An any escape is rejected by a runtime boolean guard rather than silently
coerced. An optional boolean therefore needs an explicit state design; this
increment does not introduce implicit fallback behavior.

The direct-state restriction is a real DX cost for task.completed and reusable
controlled fields. Those forms, object mutation and binding through component
props remain unsupported. The first integration deliberately follows the
existing input/textarea binding shape. Task desk's highPriority is a local draft,
not duplicated state for each row. Human authoring acceptance remains open.

Editor assistance includes class/disabled names, value snippets, TS suggestions
inside empty snippets, mapped binding errors, definitions, rename and formatting.
One unfinished outer property expression can retain member help. The source
buffer and strict compile diagnostics remain intact; invalid-workspace rename
is still refused. This is bounded recovery, not a general loose parser.

## Native execution and pilot

The control is input[type=checkbox]. Its checked property uses a boolean and its
change event writes that boolean. Text input continues to use value/input.
Programmatic state updates preserve the node and avoid unchanged property writes.
Native label activation, Space, tab navigation and disabled behavior are used;
Elnor does not simulate them. Programmatic events are not an authorization boundary.

Removal cancels queued work, removes change listeners and prevents captured
retired callbacks from writing. Labels remain text, including HTML-looking text.
General rendering uses an owned constructor; both regional variants use checked
bindings and change events with an eighth prunable capability. Existing text-input
construction metadata and its fast path are retained.

In Task desk, selecting High priority creates a high-priority task. Failed title
validation preserves the checkbox draft; successful creation resets it to false
without replacing the control. The next unchecked creation uses normal priority.
The external stylesheet keeps the native control compact and its caption beside
it; no styling framework or inline style capability is introduced.

## Validation and provenance

Retained evidence is under `elnor/.elnor/mvp/checkbox-integration/`.

| Gate | Result | Evidence |
| --- | --- | --- |
| Complete isolated candidate check/build | 725 passed, 63 files; no failures, cancellations or skips | `full-a6a7c2bd06b340debb2e110c08f3eb7d` |
| Native VS Code | 15 original + 5 existing DOM editor + 5 new checkbox tasks | `native-complete-c3c97b25b2084568ae6f52fcd7ca9b50` |
| Native checkbox browser interaction | Three forced renderers, including exact control/caption order | `browser-76f259a5c44749d689f8814bbb607ebf` |
| Task desk browser workflow | Checkbox keyboard interaction, draft preservation/reset, priority, existing CRUD/ARIA flows, mobile overflow | `app-browser-e4bf879325ce48d6937d20c7dafc47b8` |
| Existing nine graphs | Delivery comparison and bound-identifier-normalized AST equality | `cost-84b246c945ca44c6aea95e1259399373`, `proof-c935d20de7bd4406bc466b99bdbd980b` |
| Exact local public transfer | Check/build and 50 tests: 25 checkbox + 2 Task desk + 9 async worker + 14 DOM editor | `promotion-946d2f06af2543d8b8a9c55ae691af33` |

The 725-case suite ran on the exact isolated candidate, not again from the public
path. Transfer archives and hashes verify that code identity; the 50 public-path
checks run after copying. Documentation is updated separately. Earlier study
evidence and its failed byte-equality expectation remain historical records.

Native VS Code runs headlessly in the existing offline non-root Docker image,
with Workspace Trust enabled. Only this gate uses the approved 1 GiB ceiling,
no swap/network, CPU 10%, hard 256 Linux tasks including threads, and a 24-process
policy sampled every 25 ms. Sampling is not a kernel process quota. Disposable
fixture volumes and owned containers are removed. One retained run completed
four new tasks then correctly refused rename because the prior suite left an
incomplete pilot on disk. The wrapper now removes its own nonce-named pilot
between suites; no rename guard or Trust setting was weakened.

Other heavy jobs run serially under the existing Windows containment: CPU 10%,
768 MiB aggregate commit, 192 MiB Node heap, 24 processes and host-free floor.
Browser jobs use 45-second wall and 12-second idle limits. Edge is isolated,
headless and sandboxed; restrictive preview CSP is retained. No page errors or
observed CSP violations occurred. These automated tasks do not establish a full
screen-reader audit, human completion-popup preference or broad browser matrix.
No install, desktop editor launch, publication or global settings change occurred.

## Delivery cost

| Existing graph | Baseline gzip bytes | Candidate gzip bytes | Delta |
| --- | ---: | ---: | ---: |
| counter | 3031 | 3030 | -1 |
| form | 6536 | 6535 | -1 |
| composition | 2278 | 2277 | -1 |
| localized | 5045 | 5045 | 0 |
| keyed | 10918 | 10918 | 0 |
| form-wide | 15933 | 15936 | 3 |
| composition-deep | 2476 | 2476 | 0 |
| localized-wide | 19765 | 19765 | 0 |
| lifecycle | 7105 | 7105 | 0 |

These are structural comparisons, not a byte-equality or new CPU result. The
normalizer preserves external/property names, strings and syntax while comparing
bound local identifiers. All nine programs match under that comparison. The
accepted earlier Svelte/React results retain their own revision and scope.

The application delivery measurement (`app-cost-3cfd78102245453792899104d690f3bd`) compares the previous Task
desk with this additional feature, so its workloads are not behavior-equivalent:

| Delivery | Previous Task desk | With high-priority checkbox | Delta |
| --- | ---: | ---: | ---: |
| JS bytes | 20260 | 22213 | 1953 |
| JS gzip bytes | 6423 | 6644 | 221 |
| CSS bytes | 2975 | 3130 | 155 |
| CSS gzip bytes | 1119 | 1161 | 42 |

These gzip values are level 9. They describe minified browser JS and external
CSS separately, without HTTP/header costs. The unbundled runtime source grows
by 729 bytes; this is not a universal zero-cost feature claim. No new
latency, memory, startup or CPU campaign is asserted for checkbox.

## Svelte contrast and remaining scope

The inspected local Svelte bind_checked implementation in
`packages/svelte/src/internal/client/dom/elements/bindings/input.js`, SHA256
`25d8263cd3721080913590cc8b74f8e3485d112412edce11e69ab0ec96a01212`,
also separates checked/change from value/input and includes reset/hydration
handling. Its read coercion differs from Elnor's strict boolean contract.
Elnor uses its own existing ownership and region architecture; no implementation
is copied. The [initial study](CHECKBOX-CONTRACT.md) is retained as history.

Nested/controlled bindings, form reset/submission, defaultChecked, indeterminate,
radio groups, array selection, SSR/hydration and broader accessible-kit contracts
remain separate. The DOM/forms roadmap stays open.
