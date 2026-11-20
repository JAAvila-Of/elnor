# Static input pieces: private compiler/runtime experiment

**Directed screen failed; no integration on current evidence.**

Renderer thread CPU medians, milliseconds. Negative B/A change means less CPU. AB/BA and A/A remain separate. Explicit GC after reference release is outside measured windows. This is an isolated-lifetime screen, not global parity, ordinary-GC application ranking or full startup measurement.

| Shape | Count | Group | Action | AB A/B ms (change) | BA A/B ms (change) |
|---|---:|---|---|---:|---:|
| display | 8 | aa | mount | 1.360/1.205 (-11.4%) | 1.281/1.520 (+18.7%) |
| display | 8 | aa | unmount | 0.932/0.949 (+1.8%) | 0.963/1.029 (+6.9%) |
| display | 8 | change | mount | 1.500/1.422 (-5.2%) | 1.394/1.590 (+14.1%) |
| display | 8 | change | unmount | 1.083/0.915 (-15.5%) | 1.149/1.167 (+1.6%) |
| display | 128 | aa | mount | 7.219/6.080 (-15.8%) | 6.186/6.376 (+3.1%) |
| display | 128 | aa | unmount | 1.936/2.046 (+5.7%) | 1.889/2.180 (+15.4%) |
| display | 128 | change | mount | 6.644/5.978 (-10.0%) | 4.213/4.716 (+11.9%) |
| display | 128 | change | unmount | 2.174/1.964 (-9.7%) | 1.419/1.364 (-3.9%) |
| editable | 8 | aa | mount | 1.693/1.775 (+4.8%) | 1.664/1.718 (+3.2%) |
| editable | 8 | aa | unmount | 1.005/1.076 (+7.1%) | 1.001/0.986 (-1.5%) |
| editable | 8 | change | mount | 1.686/1.757 (+4.2%) | 1.687/1.669 (-1.1%) |
| editable | 8 | change | unmount | 0.967/0.975 (+0.8%) | 0.934/1.006 (+7.7%) |
| editable | 128 | aa | mount | 10.364/10.341 (-0.2%) | 10.399/10.780 (+3.7%) |
| editable | 128 | aa | unmount | 2.067/2.133 (+3.2%) | 2.061/2.216 (+7.5%) |
| editable | 128 | change | mount | 11.301/11.770 (+4.2%) | 10.637/12.838 (+20.7%) |
| editable | 128 | change | unmount | 2.189/2.200 (+0.5%) | 2.139/2.230 (+4.3%) |

## First mount after import (single observations, not distributions)

| Shape | Count | Order | A mount ms | B mount ms |
|---|---:|---|---:|---:|
| display | 8 | AB | 8.581 | 10.240 |
| display | 8 | BA | 9.504 | 9.067 |
| display | 128 | AB | 14.499 | 17.062 |
| display | 128 | BA | 9.504 | 10.361 |
| editable | 8 | AB | 11.227 | 10.188 |
| editable | 8 | BA | 11.121 | 11.451 |
| editable | 128 | AB | 30.194 | 20.536 |
| editable | 128 | BA | 22.131 | 33.582 |

## Mechanism and compatibility

**Not integrated.** This independent candidate starts from the unchanged public
core. Each compiled input site declares a module-local factory. A lazy WeakMap
stores a pristine span containing its closed string label and a pristine text
input per document. Each instance first inserts its empty label wrapper, then
clones the two pieces and appends them together, preserving the observed mutation
record order. Values, state, native listener callbacks and effect/cleanup records
remain per instance. No HTML parser, whole-form clone, user annotation, generated
props specialization or shared handler object is introduced.

The original public input implementation is preserved after newline normalization.
Only generated Surface inputs call the new factory. The native value comparison
is retained verbatim; the prior unconditional-write counterexample remains
rejected. Template label text is static, and live field values or callbacks are
never stored in the cached pieces. Lazy lookup avoids constructing template DOM
until the binding executes, while module-level factory closures remain an import
cost not included in first-mount windows.

The read-only Svelte contrast is commit
0156c5fe38b53b72675e2a7f04535de015fdeed1, internal/client/dom/template.js from_html:
it caches parsed structure in a factory and clones/imports it on use. This Elnor
experiment uses two detached native-created pieces and a per-document weak cache;
no Svelte code is imported and its hydration/ownership/platform behavior is not
claimed. Prior whole-tree cloning results are not revived or pooled with this.

## Correctness and retained memory

Each variant passes 16 new and 168 existing controls (184). New checks cover lazy
module import, construction counts at eight instances, label escaping, distinct
values/listeners, template contamination, separate documents, ownership access
order, immediate registration cancellation, foreign proxy owners, exact thrown
values, coercion, external edits, generated keyed state, rollback and hygiene.
These are directed candidate checks; no full release gate was run.

Native browser checks compare baseline and candidate after first and repeated use:
empty/nonempty initial values, later value-attribute updates, external repair,
disposal, registration cancellation, coercion with DOM mutation, MutationObserver
records, instance/template isolation and form.reset. The observations match.

A separate GC control tests five static bindings. The baseline has 6 DOM nodes
before and after, while the candidate rises from 6 to 21 and retains those 21
through six additional verified cycles. Listener counts stay at 13 in both
variants. The 15 additional nodes correspond to the five cached span/text/input
sets. This is a measured cache tradeoff, not fewer DOM nodes per live instance or
proof of no leak for arbitrary programs/documents. The weak-key document strategy
does not receive a separate native document-collection proof here.

## Timing and decision

The declared screen requires editable mount medians lower in both orders at 128,
without higher medians in both orders at 8. It fails: at 128 mount is +4.2%/+20.7%;
at 8 it is +4.2%/-1.1%. These descriptive observations and A/A controls do not
establish statistical significance or causal regression. They do not justify
integration, independent confirmation, a wider ordinary-GC comparison or a full
candidate gate. Unmount, control shape and first-mount observations remain in
their own rows; no favorable cell is selected as the verdict.

One first mount after import is captured per label before two warmup rounds and
seven normal samples. It includes cache preparation but excludes import execution,
network delivery and most startup. It is a single observation, not a distribution
or full cold-start measurement. Explicit GC and validation remain outside CPU
windows. First-mount DOM counters are retained in raw output, not interpreted as
application-only allocations. The screen uses actual uninstrumented/minified
runtime code; fake-DOM construction counts are not CPU or engine allocation data.

Delivery for display changes gzip 2,421 to 2,420 bytes (no generated inputs).
Editable grows from 6,839 to 6,984 raw bytes, 2,897 to 2,989 gzip and 2,612 to 2,699
Brotli. Public generated modules also have a new factory closure per input site;
minified fixture size is not the entire unbundled preview delivery cost.

## Failed preparation and cohort provenance

The first preparation script wrote the private runtime and then stopped at a
compiler-patch assertion due to a missing backtick in its search string. No tests
or runtime candidate executed before the compiler-only recovery prepared the
intended emitter. Both exact producers remain retained.

The first timing producer completed four display-8 cases, then rejected 128 in
its inherited size validator before launching a browser (0.281 seconds, no
samples). The validator accepted an older size set and omitted the declared new
size. V2 changes only validation to accept exactly 8/128, reuses the same frozen
bundles and repeats all 16 cases. The four partial cases are retained separately;
the failed case is not counted as a candidate regression or erased.

Audit covers 52 serial bounded Jobs: 51 pass and the validation failure remains
failed. Every Job has zero owned processes after cleanup. CPU 10%, commit 768 MiB,
24 processes, host-free minimum 4 GiB, kill-on-owner-close, browser wall/idle
45/12 seconds and offline Node 60/60 are unchanged. The audit checks source/fixture
identities, snapshots, all raw result hashes and nonoverlapping Job intervals.
The public core remains compiler 70abd192/runtime ae44708c, the exact source of
the historical 610-test/check/build gate. That gate is not candidate validation.
No new React/Svelte ranking, global parity or speedup is established.

Private evidence: `input-parts-study`, cohort `timing-v2-06493f3044ce4ae1b03755aea34fa989/review`. These are retained internal evidence identifiers, not public artifact links.
