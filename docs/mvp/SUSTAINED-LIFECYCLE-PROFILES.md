# Sustained lifecycle profiles and native input contract

**Diagnostic only. No production compiler/runtime change, CPU speedup or new
React/Svelte ranking.** The investigation improves source attribution before
choosing another optimization and rejects one behavior-breaking shortcut.

## Protocols kept separate

Both protocols use current production minified bundles with external esbuild
source maps. Maps are retained offline, not served or included in delivery sizes.
Display uses declared child events; editable uses independent draft state and an
ordinary callback prop. Both use the same existing runtime and compiler, not
either rejected component-argument candidate.

Each protocol has eight cases: two shapes, 16/128 children per parent, and two
passes with reversed case order. Several parents keep the active child total at
512. Preflight/postflight checks cover row output, events, independent input
state, native listener release and no resurrection after disposal. Fresh isolated
sandboxed headless Edge instances retain GPU-disabled flags and accessibility.

V1 requests four Profiler windows for each mount/unmount action: 64 profiles.
Most mount samples are (program), without an attributable JS stack. A separate
V2 requests four windows per case with eight synchronous lifecycle cycles each:
32 profiles and 4,096 child constructions per window, maximum 512 active at once.
V2 increases mapped samples; it is not pooled with V1. Natural GC can occur inside
profiles. Explicit GC, oracle checks and frame waits are outside requested work;
incidental browser activity can still run between CDP messages. These windows
omit normal per-cycle frame waits and cannot replace application latency tests.

The requested sampling interval is 100 microseconds, not an assertion of achieved
resolution. Sample counts and wall-clock timeDeltas are not converted to CPU time.
Self leaf frames remain separate from nearest mapped callers and inclusive
frames. Inclusive counts overlap along a stack and must not be summed. Source
positions refer to generated JS or exact runtime sources embedded in source maps,
not original Surface positions. Four mapping controls pass in each analyzer.

## V2 source observations

The input value comparison/assignment callback is repeatedly among the editable
runtime leaf frames with the most samples. Its line includes both a native getter
and setter; this does not identify which operation costs more. Native calls and
engine work may be charged to a JS call site. Props adaptation, scopes, binding
construction, disposal and DOM calls also appear. The diagnostic does not justify
another scheduler representation change or a language rewrite. Synchronous
construction intentionally bypasses normal scheduled updates, so absence of queue
drain samples is not evidence about its production cost.

| Shape | Children/parent | Pass | All samples | Runtime leaf samples | Input value-line samples | (program) samples | GC samples |
|---|---:|---:|---:|---:|---:|---:|---:|
| display | 16 | 0 | 269 | 115 | 0 | 12 | 40 |
| display | 128 | 0 | 269 | 116 | 0 | 11 | 41 |
| editable | 16 | 0 | 563 | 237 | 39 | 50 | 60 |
| editable | 128 | 0 | 642 | 283 | 50 | 54 | 72 |
| editable | 128 | 1 | 666 | 281 | 64 | 51 | 78 |
| editable | 16 | 1 | 556 | 226 | 48 | 47 | 51 |
| display | 128 | 1 | 228 | 101 | 0 | 11 | 37 |
| display | 16 | 1 | 286 | 125 | 0 | 12 | 45 |

## Native counterexample

One separate browser control compares the public runtime with a countermodel that
only removes `if(node.value!==v)` from input's binding callback. This is not a
performance candidate and receives no timing comparison. It passes when it
detects the expected behavioral difference.

With an initially empty value, the public helper leaves the fresh native input
untouched. Subsequently setting its value attribute changes the visible value to
"attribute default". The unconditional-write countermodel leaves the visible value
empty after the same attribute operation. Equal-looking initial values therefore
do not justify skipping the comparison. Both variants also check a nonempty
initial value, external-edit repair, disposal, immediate registration cancellation
and string conversion that mutates the input. The counterexample is retained in
its own source snapshot, never written into production.

The read-only Svelte reference is commit
0156c5fe38b53b72675e2a7f04535de015fdeed1, internal/client/dom/elements/bindings/input.js.
Its bind_value path also compares against the current input value before writing,
with additional contracts that Elnor does not claim to implement. The local source
is retained by hash as contrast, not imported or copied into Elnor.

## Outcome and verification

Preserve the native value comparison. Investigate binding construction with its
native semantics intact before proposing another candidate; do not infer a gain
from removing a read, allocation or callback. The target of global parity remains
open. No full production gate is rerun because production is byte-identical to
the source with the historical 610-test/check/build gate; that historical gate is
not validation of a new candidate or this diagnostic harness.

All 18 expensive Jobs pass serially: one checked fixture build, eight V1 cases,
eight V2 cases and one native counterexample control. CPU 10%, commit 768 MiB,
24 processes, host-free minimum 4 GiB and kill-on-owner-close are unchanged.
Browser wall/idle limits remain 45/12 seconds, build 60/60. Every Job has zero owned
processes after cleanup. All profile, map, bundle and source identities are
validated; raw profiles, both analyses and exact producers remain retained.

Production identities:

```json
{
  "compiler": "70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95",
  "runtime": "ae44708c9ab1b30e1818011e102f5f0a138220f161fe0a5fab232614c9a91b01"
}
```

Private evidence: `sustained-lifecycle-profile-study`, V1 `run-dd8b8741ffb94b2d9b5e064353b46297`, V2 `v2-10def73e1fde4844980cadb802c161a6`, native contract `input-contract-621be94ebae547979a9d28fa42f1e4cb`. These identifiers locate retained internal evidence, not public artifact links.
