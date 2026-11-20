# Region optimization experiments

Elnor already emits direct DOM operations. The Svelte source study identifies
useful engineering techniques, rather than a runtime to port. Implementations
here are designed around Surface's existing ownership, rollback and native
event contracts. No Svelte runtime code is incorporated.

## Shared generated ownership

An external `mount` creates a rollback boundary and returns its disposer.
Generated composition uses a separate `renderOwned` entry point inside the
caller's existing region. This removes a redundant child scope, DOM snapshot
and mount disposer. Live readonly property descriptors remain unchanged.
Conditional branches and keyed rows still have their own independent lifetimes.
An exception propagates to the enclosing mount or region's existing rollback.
`renderOwned` is compiler plumbing, not a replacement public mounting API.

## Verified exclusive clearing

The compiler marks an each region exclusive only when it is the sole child of
a container created by that same render. The runtime additionally requires:

- Every recorded row root and the anchor still belong to that container.
- The container contains exactly those roots and the anchor.
- All recursive cleanup is runtime-owned effect/listener/region cleanup.
- No staged rows or enclosing collective removal are active.

Public `scope.own` callbacks disqualify a region. Nested conditional/list owners
are checked recursively. Foreign/custom owners also fail the capability check.
Eligible rows release their resources in the existing order, suppress individual
DOM removals, then replace the container's children with its existing anchor.
Other cases keep ordinary per-row cleanup. This capability is an optimization
guard, not a security boundary against code that mutates runtime internals.

## Persistent text bindings

The next candidate retains one Text node per text/button binding and writes its
`nodeValue`. Each expression still has its own effect, dependency set and read
order, including value coercion on every scheduled run. Empty values keep the
same Text node. Native click listeners and their removal remain unchanged.
There is no cached expression result or assumption that getters are pure.

## Remaining independent experiments

Text-node updates should retain separate expression evaluation and dependency
tracking. Combining arbitrary expression getters into one effect can add reads
and side effects; Surface does not enforce general purity. A future grouping
scheme must preserve those properties rather than merely produce fewer effects.

A native DOM blueprint could clone a static subtree without HTML parsing,
`innerHTML`, Trusted Types exemptions or Surface syntax changes. It also changes
which sibling nodes exist when an expression first runs. That observation and
cross-document instantiation need explicit tests before adopting the path.

Event delegation changes native bubbling, `currentTarget`, propagation and
listener interoperation. Retain native listeners until a separately tested
design establishes the supported behavior. Fewer listeners alone do not prove
better creation, disposal, memory use or interaction latency.

The first candidate combines shared generated ownership and verified clearing.
The second adds persistent text bindings and releases capability checks when an
owner is disposed, including registrations made after disposal.
Tests and controlled browser measurements decide its retention; the source
study does not establish a speedup, parity or product acceptance.

## Retained result

The combined candidate is retained after check/build, 480 Node tests across
36 files, the 42-case browser preflight, and the complete 36-case contained
comparison. Its renderer CPU medians improve update and clear in this list
scenario. Creation remains slower than both controls at 1000 rows, with large
baseline run-to-run variation. Native events and separate effects are retained;
static subtree cloning and event delegation are not implemented by this change.
The [runtime protocol](../../benchmarks/runtime/README.md#independent-region-and-text-experiments)
records every operation, the increased bundle size, memory observations and
the exact internal evidence identities. This does not establish general parity.

## Single-node blueprint experiment (rejected)

The rejected candidate cloned individual static node shapes instead of a complete
dynamic sibling subtree. Generated factories are shared by tag/class/text shape
within a module. Their lazy WeakMap caches are keyed by document. Prototypes are
built with native createElement/createTextNode calls, without HTML parsing.
Text and button shapes include their empty Text child; other element shapes are
shallow. Each instance appends its clone at exactly the original creation point,
then reads its expression, installs its independent effect and registers its
native listener in the original order. Input uses its existing direct path.

This deliberately retains staged sibling creation: an earlier expression does
not observe later siblings merely because a larger tree was cloned. Dynamic
values, effects and listeners never belong to a cached prototype. Public runtime
helpers retain direct creation when no compiler factory is supplied.

Tests cover instance isolation, static attribute restoration, document switching,
collection of an inactive document while a factory is retained, expression read
order, event disposal, rollback of actual cloned controls and generated names.
Active-document prototypes consume memory and factory lookups add work. Both
costs must be measured, including cold first-use behavior, before retention.

The experiment passed 487 tests and browser preflight, but its completed
four-process study increased 1000-row creation from 20.126 to 20.867 ms CPU and
append from 4.259 to 4.466 ms. A separate eight-process first-creation study
gave medians of 32.561 and 31.965 ms with overlapping ranges. The extra 202 gzip
bytes and cached prototype nodes did not buy the intended creation improvement.
Runtime/compiler were restored to the prior implementation. The complete trial
sources, manifests and test snapshots are retained as `run-B7bKcY`, with studies
and limitations recorded in the runtime protocol. This rejects this particular
granularity and implementation, not all possible static subtree strategies.

## Direct live-prop installation experiment (rejected)

The compiler knows each child's prop names. Instead of allocating a readers
object and enumerating it with Object.entries, the rejected candidate allocated the
props object directly and calls a runtime helper once per known prop. It then
calls the child's existing renderOwned entry point. The helper keeps the builtin
Object.defineProperty outside user import scope. Descriptors remain enumerable,
nonconfigurable getters without setters; the object remains extensible. Readers
are not evaluated during adaptation. Slot/event creation and rendering remain
in their existing order.

This differs from the earlier rejected getter-literal/Object.freeze trial.
Runtime helpers for generic/native composition remain available. Tests exercise
readonly descriptors, deferred reads, reactive updates, disposal, slots, events,
an Object import supplied by the user, and helper-name collisions. Performance
must be compared independently before adoption.

Its first four-process comparison improved the 1000-row creation median from
20.342 to 19.303 ms, but increased 100-row clear from 1.083 to 1.170 ms. A
second, reverse-order two-process comparison did not confirm the creation win
(20.165 to 20.778 ms) and repeated the small-list clear regression (1.104 to
1.188 ms). The 20 gzip byte saving did not establish an overall improvement.
This variant was also removed. Both complete matrices, candidate snapshots
(`run-097Krr`) and the confirmation study are retained in the runtime protocol.

At the end of that rejected experiment, runtime/compiler were byte-identical to `run-LXEwZO`. General
regressions retain prop descriptor/read/disposal checks, Object-import hygiene,
native-like fake-DOM cloning support and observation of actual mounted controls.
The clone-specific tests are archived with their rejected implementation.

Final restored-source verification: check/build and 487 tests across 37 files
passed in `test-runs/run-b71dfb4b4d8c41cea0dc150c2fc8c087`. Runtime and compiler
SHA-256 values were checked against `run-LXEwZO` after verification. The retained
new runtime regression file is `tests/prop-descriptors.test.mjs`; no factory or
direct-installation helper from either rejected trial remains in active source.

## Retained direct-root and teardown follow-up

The subsequent [complete profiling and direct-root study](DIRECT-ROOT-STUDY.md)
retains a different design. The graph compiler proves an each body has a single
plain container root (including eligible imported views). It builds that element
without a temporary fragment, append or childNodes snapshot. Slots, dynamic
blocks, nested components and multiple roots keep the general route. Root
construction and binding evaluation remain staged, and public mount still
preserves prior target children and returns a disposer.

Verified exclusive clear now iterates owners directly. It keeps every cleanup,
its order, error aggregation and the final collective DOM removal, while removing
wrappers for individual DOM removals that were already suppressed. Native
listeners, separate effects and the original dependency Set representation remain.

The direct-root study retained `run-OLDLti`. Four-process and confirmation studies both
improve warmed creation/clear against `run-LXEwZO`; first-use results remain
variable and do not establish a general cold win. Check/build, 508 Node tests
and the 42-case browser preflight pass. The full report includes every operation,
rejected reactive variants, both cold studies, bundle cost, memory observations,
source hashes and the exact evidence identities. Product parity remains open.
