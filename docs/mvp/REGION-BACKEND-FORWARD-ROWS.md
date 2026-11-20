# Lightweight contexts for forwarding rows

The private compiler/runtime candidate replaces a complete iteration frame with
a lightweight context when a row only forwards its item to one component. The
child component keeps its full owned frame. This is an experimental candidate;
mixed CPU results and a selection regression prevent global promotion.

The compiler marks only a sequential row group with exactly one item slot, one
root component operation, and no tasks, native nodes or events of its own. Other
rows keep the existing path. The reduced context retains indexed ownership,
dynamic subscribers, general-effect bridges, live props, event forwarding and
disposal guards. It does not snapshot the item or remove the child's state,
effects or lifecycle. Surface syntax and public core sources remain unchanged.

The local Svelte `create_item` implementation was inspected as a contrast for
per-item data and branch ownership. Elnor retains its own collector, generated
readers, event contract and teardown order. The change removes unused machinery
from a proven forwarding context rather than copying Svelte's implementation.

Validation passed 449 backend tests and 71 unchanged public compatibility tests.
The initial run exposed a missing detached-root geometry check. The candidate
now rejects a prematurely attached child root with the original ELN-RUNTIME-003
error. That red run is retained; no assertion or resource limit was relaxed.
Other controls cover injected fragment siblings, initialization failure,
disposal during construction, keyed identity, edited inputs, queued observation
rounds, live item replacement and retired callbacks.

Four typechecked Edge fixtures compare both renderers across 64 lifecycle
cycles under CSP and sandbox. Two focused retention fixtures keep parent trees,
callbacks and disposers alive: all seven weakly observed removed nodes collect,
while live controls remain reachable. These are scoped node-retention controls,
not a measurement of total heap reduction.

The primary candidate/control comparison runs all six original workloads and
29 actions, with two warmups, seven measured rounds, both initial orders and AA
controls. The real keyed build asserts that the forwarding marker is present,
preventing an unnoticed fallback. A separate confirmation reuses exactly the
same frozen bundles for both list sizes and orders.

Each cell is **candidate / preceding frame-task candidate**, in renderer CPU
milliseconds balanced over AB/BA medians. The cohorts remain separate.

| Operation | Primary | Confirmation |
| --- | ---: | ---: |
| Create 100 | 5.447 / 5.326 | 5.381 / 6.113 |
| Clear 100 | 1.841 / 1.857 | 1.958 / 2.110 |
| Create 1,000 | 34.456 / 31.180 | 30.510 / 31.301 |
| Update 1,000 | 5.440 / 5.413 | 5.274 / 5.509 |
| Select 1,000 | 3.316 / 3.043 | 3.273 / 2.917 |
| Append 1,000 | 7.064 / 7.810 | 6.391 / 6.877 |
| Swap 1,000 | 3.783 / 3.515 | 3.732 / 3.929 |
| Remove 1,000 | 4.921 / 5.095 | 5.023 / 5.332 |
| Clear 1,000 | 7.633 / 8.197 | 7.182 / 8.020 |

Append and clear consume respectively 9.6%/7.1% and 6.9%/10.5% less CPU in
the two cohorts. Selection consumes 8.9%/12.2% more. Creation and swap change
direction between cohorts, so neither establishes a repeatable improvement.
There is substantial AA variation and no significance test or parity margin.
No universal speedup or new comparison with React/Svelte follows.

Counter, form, composition and localized candidate/control bundles are byte
identical in this study; observed CPU differences in those pairs cannot be
causally attributed to this source change. The keyed gzip-9 entry grows from
9,344 to 9,901 bytes (+557). Shared driver/CSS are excluded. There is no startup
claim based on entry size or frame count.

All 51 Windows Jobs ran serially with verified CPU 10%, aggregate commit
768 MiB, 24-process maximum, 4 GiB host-free floor, Node heap 192 MiB and zero
remaining owned processes. Offline wall/idle limits remain 60/60 seconds and
browser limits 45/12 seconds. Headless Edge, sandbox, CSP and GPU-disabled
isolation remain enabled. The evidence includes one retained failing Job,
1,624 primary samples and 392 confirmation samples.

Internal evidence:

- Primary: `forward-row-study/run-5269432f5df34877801f7a92eb081d66`.
- Confirmation: `region-backend/forward-row-confirm-afc0bb36bf67425bac22964c61149f43`.
- Retention: `region-backend/component-root-retention-3281c23c2b704bc89b3ad74159196212`.
- Native: `region-backend/component-event-native-783c4d2f0e6c48978afd2a5cc419369d`.

The next investigation must isolate the selection/update cost of the reduced
context, including tracking and owner representation, without assuming a JIT
cause from these observations alone. Slots still keep the composition entry on
the general renderer. This candidate remains private until the wider tradeoffs
are resolved.
