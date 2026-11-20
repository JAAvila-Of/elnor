# Closed primitive captions: compiler coverage study

**Private candidate, not integrated. No CPU gain or framework comparison claimed.**

The candidate extends the existing primitive-caption classification to closed
expressions made from primitive literals and selected arithmetic, comparison,
bitwise, logical, conditional, template, typeof and void operations. It emits the
existing literalText/literalButton helpers. JavaScript still evaluates the
original expression at mount; the compiler does not execute or fold it.

Identifiers, property reads, calls, objects, arrays, BigInt, regular expressions,
assignments and unsupported syntax retain the dynamic path. Every operand and
conditional branch must qualify, including unreachable ones. Traversal has a
conservative depth bound. Runtime code, Surface syntax and component interfaces
are unchanged. Existing static helpers retain their owner-registration and native
listener behavior; eliminating an effect does not eliminate all lifetime work.

Both variants pass 25 new directed controls and 99 existing controls for captions,
owner behavior, initialization, name hygiene and regions. One existing codegen
assertion is intentionally updated only in the candidate copy: a closed string
concatenation now uses the static helper. Directed controls cover native values,
live getters/called readers, state writes versus readonly props, button text
identity, listener release and rollback preserving pre-existing DOM. A test-only
Set-constructor observer records two effect dependency-Set constructions in the
baseline and zero in the candidate for two eligible captions. This is not an
engine allocation-byte measurement or CPU timing.

The corrected suite fails against the baseline when it requires the new static
classification, then passes baseline behavior mode and candidate mode. An earlier
harness failure attempted to assign to a readonly prop inside a fallback test.
The corrected suite checks both permitted state assignments and rejected readonly
assignments. The failed execution is retained. The first runs did not freeze the
test producer; the final authoritative run freezes it and the compiler/runtime
snapshots. The audit does not claim identical producer provenance for old runs.

## Coverage determines priority

| Corpus | Surface files | Changed generated modules | Removed dynamic caption calls |
|---|---:|---:|---:|
| Public examples | 4 | 0 | 0 |
| Frozen list fixtures | 2 | 0 | 0 |
| Frozen application matrix | 12 | 0 | 0 |

All 18 generated modules are byte-identical between variants with the same input
paths. The standalone candidate therefore has no demonstrated reach into the
current parity workloads. It is not expanded to browser CPU studies or integrated
as a purported solution to their performance gap. No release gate is rerun.

A separate source census identifies literal props consumed as direct caption
identifiers: three sites in examples and 25 in the application matrix (24 localized
panel labels and one composition title), with none in lists. These are source
opportunities, not execution counts, safe-specialization proofs or measured gains.
The local classifier cannot exploit them because the child's prop read remains
unknown when compiling that child in isolation.

The next investigation needs call-site knowledge while retaining dynamic public
mounts and mixed static/dynamic uses of one child. It must preserve live props,
lexical context, ownership, error timing and fallback behavior. No implementation
or benefit of that specialization is claimed here.

The read-only Svelte contrast is commit
`0156c5fe38b53b72675e2a7f04535de015fdeed1`,
`compiler/phases/3-transform/client/visitors/shared/utils.js`. Its text-expression
builder uses known-expression evaluation and reactive-state metadata. Elnor's
private candidate instead uses a syntactic primitive whitelist and native runtime
evaluation; no Svelte implementation was copied or executed.

Across all retained attempts, 12 serial Windows Jobs comprise eight passes, three
expected red-before executions and the one corrected harness failure. All enforce
CPU10%, commit768MiB, 24 processes, host-free4GiB, kill-on-owner-close and offline
wall/idle60/60 seconds. Every cleanup leaves zero owned processes. No browser
benchmark runs in this study. Public compiler/runtime remain 70abd192/ae44708c.

Authoritative private evidence:
`closed-caption-study/controls-eca38bd0f1d64c5cb7c96d6b68f9589d/review`.
The audit verifies all job outcomes, source identities and 71 sealed evidence
files. Candidate compiler identity:
`ba63caf02cb7c67ca28f19ed7c6c1c3e869e7593b71190e4327b7951d39fe08d`.
