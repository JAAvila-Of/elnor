# Unused component channels: directed compiler experiment

**Not adopted. The declared screening condition failed.** The private compiler
omits an empty handlers object only when a known child has no declared events,
and an empty slots object only when it has no slot reads. Supplied handlers and
content/fills retain their paths. Children that may observe this, arguments or
eval, or contain source escapes, conservatively keep the original channel objects.
The five-argument renderOwned ABI, runtime and Surface syntax remain unchanged.
No shared object or user annotation is introduced. This is independent of the
previous rejected stable-arguments experiment.

Both variants pass **16 new and 168 existing controls (184 each)**, including
context exposure, inherited event/slot getters, live props, independent state,
keyed identity, rollback and listener cleanup. Separate generated-code counters
cover display/editable shapes at 0/1/8/64/256/1000. For 1,000 children, the candidate
omits 1,000 slots objects in display and 2,000 empty channel objects in editable;
both variants construct zero of these objects at zero children. Minified bundle
AST checks confirm that these call argument objects disappear. These counts are
not engine allocation bytes or CPU measurements; prop readers, effects, state,
DOM and native listener work remain.

The predeclared CPU screen covers 16 browser cases: two shapes, 8/256 instances,
A/A controls, AB/BA orders, two warmups and seven samples per label. Explicit GC
runs after reference release/verification outside measured windows. These isolated
lifetimes are separate from ordinary-GC broad application measurements.

| Shape | Count | Mount CPU change AB / BA | A/A mount variation AB / BA |
|---|---:|---:|---:|
| Display | 8 | -1.6% / -5.3% | +4.4% / +7.5% |
| Display | 256 | -20.5% / -0.5% | -0.0% / +4.7% |
| Editable | 8 | +10.3% / +3.8% | +4.3% / +8.4% |
| Editable | 256 | -24.8% / -5.5% | -8.9% / +17.4% |

Negative means less renderer thread CPU. At 256 both shapes improve descriptively
in both orders, but the editable 8-instance case increases by 0.206/0.063 ms. That
fails the declared requirement of no same-direction regression in both small-case
orders. A/A variation prevents claiming causal improvements or regressions from
these medians. No confidence interval or statistical equivalence is asserted.
The candidate is not expanded to the ordinary-GC application matrix or full
release gate. This result supplies no new React/Svelte ranking or global parity.

Delivery also has a small cost: raw display bytes change 5,888 to 5,892, and
editable 6,855 to 6,863. Gzip changes 2,421 to 2,424 and 2,906 to 2,909. Retaining
positional arguments means void expressions occupy more bytes than empty literals.

The read-only Svelte contrast is commit
0156c5fe38b53b72675e2a7f04535de015fdeed1 (5.57.3), compiler
`phases/3-transform/client/visitors/shared/component.js`: it emits event/slot
collections only when nonempty. Elnor's graph contract and positional omission are
its own implementation. No Svelte files or dependencies were changed.

Audit: **48 serial Jobs, all passed**, CPU 10%, commit 768 MiB, 24 processes,
host free minimum 4 GiB, kill-on-owner-close, browser wall/idle 45/12 seconds and
offline Node 60/60 seconds. Every Job has zero owned processes after cleanup.
Production remains at compiler 70abd192 and runtime ae44708c; no core code changed.

Private evidence: `unused-component-channels-study`, controls
`controls-6633bdf807ca40c495738b0086c5391d`, existing checks
`existing-58f0dbe17b6f4149960948d3cb3e4dc6`, and directed cohort
`directed-f1f93138c54747c9a006dfdd21e36412/review/final-report.md`.
The report retains every CPU row, bundle/source identities, producer hashes and
limit/cleanup checks. These are internal evidence identifiers, not public links.
