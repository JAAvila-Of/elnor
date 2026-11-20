# Effect record release: reachability benefit with unresolved CPU cost

**Not integrated.** The private candidate releases completed effect records and
their empty dependency Sets in controlled probes. It passes the full isolated
gate and broad behavior/lifecycle checks, but comparative CPU observations do not
establish neutrality. The public runtime remains ae44708c; the compiler and
Surface are unchanged. No new React/Svelte ranking or parity follows.

## Mechanism

The baseline's owned disposer keeps a constant reference to its effect record
after successful inert execution or explicit disposal, even though its reader
callback has already been released. The candidate changes that reference to a
nullable slot: successful dependency-free execution clears it, and disposal uses
a temporary record reference, performs the original cleanup, then clears the
slot. Cleanup remains callable/idempotent. The initial run checks the slot after
owner registration, preserving immediate registration-time cancellation.

Failures retain the record unless normal disposal completes. A queued callback
that throws before reading dependencies remains a positive retained control,
matching the prior successful-only reader release policy. The Set representation,
cell getter, subscriber insertion/deletion order, pending Set, microtasks and
everything outside effect() are unchanged. None of the rejected dependency-array,
cursor, size-delta or input-cloning candidates is included.

## Reachability and correctness evidence

Four new regression tests use native WeakRefs and controlled GC in child Node
processes. A temporary Set-constructor subclass records a WeakRef to the single
dependency Set constructed during effect registration; it is restored before
collection and retains no strong reference to the Set. Owners and returned
cleanup callbacks deliberately remain alive. The existing baseline passes 53
previous controls, then fails exactly three of these four new tests as expected.
The candidate passes all 53 previous controls and all four new tests. The expected
red baseline phase remains failed in its supervisor; it is not reported as green.

An independent sandboxed headless Edge probe serves unmodified runtime bytes and
uses the same constructor-observation strategy. Twelve CDP collections per phase
observe the following, with a live reactive positive control retained in every
case. After owner disposal and releasing returned cleanup references, all targets
are collected in both variants.

| Case while owner/returned cleanup remain alive | Baseline Set retained | Candidate Set retained |
|---|---|---|
| Successful constant effect | Yes | No |
| Reactive effect becomes inert successfully | Yes | No |
| Reactive effect explicitly stopped | Yes | No |
| Queued effect throws before reads | Yes | Yes |

These probes establish reachability of these targets, not exact saved bytes,
whole-application heap reduction, peak commit reduction or universal GC timing.
The source still constructs the same Set and effect record; the change concerns
earlier release, not fewer initial constructions. The read-only Svelte contrast
at commit 0156c5fe38b53b72675e2a7f04535de015fdeed1 is create_effect's treatment of
dependency-free records and its different effect-tree/lifetime contracts. Elnor
does not adopt that tree or change its owner protocol. The inspected source is
retained by hash; no Svelte source or dependencies were modified.

The complete isolated project passes **614 tests, check and build in 55 serial
phases**, including the four new regressions. It uses exact source snapshots,
original project test expectations and existing local dependencies. This is a
candidate gate, not a new public-core gate. The broad cohort passes all list and
application behavior oracles, eight list pairs over 100/1000 and seven actions,
four app preflights, sixteen app pairs and 64 mount/unmount memory cycles. Native
DOM/listener counters return to each warmed unmounted baseline in those cycles.

## Broad comparative CPU

Every cell below is renderer **ThreadTime milliseconds**, medians of seven
action windows after two warmups. They include driver/oracle scheduling windows
and rendering waits; they are not interaction latency. List A/A uses identical
candidate fixtures; application A/A uses identical baseline fixtures, as the
existing collectors specify. Neither control is subtracted from a result. Unlike
actions, orders and cohorts are kept separate. No equivalence margin, confidence
interval, significance or causal interpretation of a small delta is asserted.


## Lists

| Workload/size | Action | A/A AB A/B ms | A/A BA A/B ms | Candidate AB A/B ms (change) | Candidate BA A/B ms (change) |
|---|---|---:|---:|---:|---:|
| 100 | create | 3.509/3.491 (-0.5%) | 3.434/3.564 (+3.8%) | 3.558/3.275 (-8.0%) | 3.273/3.351 (+2.4%) |
| 100 | update | 1.363/1.414 (+3.7%) | 1.386/1.352 (-2.5%) | 1.314/1.285 (-2.2%) | 1.239/1.299 (+4.8%) |
| 100 | select | 1.190/1.182 (-0.7%) | 1.145/1.144 (-0.1%) | 1.300/1.206 (-7.2%) | 1.121/1.105 (-1.4%) |
| 100 | append | 1.651/1.602 (-3.0%) | 1.626/1.654 (+1.7%) | 1.548/1.714 (+10.7%) | 1.571/1.605 (+2.2%) |
| 100 | swap | 1.322/1.444 (+9.2%) | 1.476/1.469 (-0.5%) | 1.386/1.333 (-3.8%) | 1.378/1.334 (-3.2%) |
| 100 | remove | 1.569/1.611 (+2.7%) | 1.640/1.799 (+9.7%) | 1.571/1.557 (-0.9%) | 1.582/1.471 (-7.0%) |
| 100 | clear | 1.252/1.229 (-1.8%) | 1.320/1.316 (-0.3%) | 1.290/1.298 (+0.6%) | 1.217/1.172 (-3.7%) |
| 1000 | create | 21.324/20.343 (-4.6%) | 20.137/19.727 (-2.0%) | 17.902/17.835 (-0.4%) | 19.638/20.259 (+3.2%) |
| 1000 | update | 3.502/3.531 (+0.8%) | 3.572/3.452 (-3.4%) | 3.292/3.429 (+4.2%) | 3.418/3.566 (+4.3%) |
| 1000 | select | 2.051/2.041 (-0.5%) | 2.032/1.991 (-2.0%) | 1.977/1.898 (-4.0%) | 2.111/2.150 (+1.8%) |
| 1000 | append | 4.287/4.094 (-4.5%) | 4.100/4.266 (+4.0%) | 4.388/4.197 (-4.4%) | 4.469/4.372 (-2.2%) |
| 1000 | swap | 2.590/2.543 (-1.8%) | 2.534/2.412 (-4.8%) | 2.537/2.588 (+2.0%) | 2.490/2.727 (+9.5%) |
| 1000 | remove | 3.328/3.459 (+3.9%) | 3.334/3.332 (-0.1%) | 3.216/3.303 (+2.7%) | 3.600/3.394 (-5.7%) |
| 1000 | clear | 3.754/3.066 (-18.3%) | 3.382/3.550 (+5.0%) | 3.527/3.311 (-6.1%) | 3.600/3.870 (+7.5%) |

## Applications

| Workload/size | Action | A/A AB A/B ms | A/A BA A/B ms | Candidate AB A/B ms (change) | Candidate BA A/B ms (change) |
|---|---|---:|---:|---:|---:|
| counter | mount | 1.101/1.023 (-7.1%) | 0.928/0.983 (+5.9%) | 1.009/0.995 (-1.4%) | 0.940/0.953 (+1.4%) |
| counter | increment | 0.893/0.848 (-5.0%) | 0.861/0.881 (+2.3%) | 0.911/0.848 (-6.9%) | 0.831/0.884 (+6.4%) |
| counter | unmount | 0.883/0.853 (-3.4%) | 0.792/0.861 (+8.7%) | 0.902/0.813 (-9.9%) | 0.843/0.855 (+1.4%) |
| form | mount | 1.528/1.406 (-8.0%) | 1.362/1.343 (-1.4%) | 1.418/1.388 (-2.1%) | 1.281/1.584 (+23.7%) |
| form | edit-one | 1.373/1.327 (-3.4%) | 1.223/1.209 (-1.1%) | 1.215/1.166 (-4.0%) | 1.254/1.180 (-5.9%) |
| form | edit-all | 1.529/1.476 (-3.5%) | 1.254/1.305 (+4.1%) | 1.349/1.319 (-2.2%) | 1.272/1.372 (+7.9%) |
| form | invalid | 1.411/1.255 (-11.1%) | 1.256/1.187 (-5.5%) | 1.174/1.252 (+6.6%) | 1.071/1.210 (+13.0%) |
| form | recover | 1.412/1.386 (-1.8%) | 1.169/1.224 (+4.7%) | 1.197/1.325 (+10.7%) | 1.164/1.201 (+3.2%) |
| form | unmount | 1.042/0.942 (-9.6%) | 0.929/0.914 (-1.6%) | 0.944/0.937 (-0.7%) | 0.866/0.874 (+0.9%) |
| composition | mount | 1.160/1.109 (-4.4%) | 1.096/1.085 (-1.0%) | 1.163/1.135 (-2.4%) | 1.109/1.184 (+6.8%) |
| composition | relay | 0.886/0.985 (+11.2%) | 0.870/0.902 (+3.7%) | 0.931/0.914 (-1.8%) | 0.860/0.872 (+1.4%) |
| composition | unmount | 0.904/0.840 (-7.1%) | 0.843/0.875 (+3.8%) | 0.889/0.972 (+9.3%) | 0.802/0.835 (+4.1%) |
| localized | mount | 1.879/1.731 (-7.9%) | 1.897/1.832 (-3.4%) | 2.020/1.933 (-4.3%) | 2.001/2.221 (+11.0%) |
| localized | local-update | 1.048/0.993 (-5.2%) | 1.033/1.098 (+6.3%) | 1.090/1.010 (-7.3%) | 1.048/1.142 (+9.0%) |
| localized | unmount | 0.916/0.946 (+3.3%) | 0.875/0.917 (+4.8%) | 0.936/0.863 (-7.8%) | 0.943/0.907 (-3.8%) |

## Decision and provenance

CPU is mixed, with same-direction higher medians in list-1000 update (+4.2%/+4.3%),
form invalid (+6.6%/+13.0%), form recover (+10.7%/+3.2%) and composition unmount
(+9.3%/+4.1%). Form edit-one and localized unmount are lower in both orders, while
many other actions reverse direction. A/A variation remains visible. No exact
engine cause is assigned to these observations, and CPU neutrality is unproven.
The controlled memory benefit therefore does not justify integration against the
current performance objective. No extra confirmation is launched to select a
favorable result, and the prepared adopt.py is not executed.

Audit covers **92 serial Jobs**: 91 pass and one is the expected red baseline
regression phase. All verify original CPU10%, commit768MiB, 24 processes, host-free
minimum4GiB and kill-on-owner-close. Browser wall/idle remains45/12 seconds; offline
Node phases60/60. Every phase leaves zero owned processes after cleanup. Raw files,
exact producers, sources, fixtures and nonoverlapping intervals are audited.

Public runtime and tests are untouched; the four new tests stay in the private
experiment because three intentionally fail on the public baseline. The historical
610-test/check/build public gate still applies to its exact unchanged source.
The candidate's 614-test gate is not substituted for that source identity. No
public build/preview artifacts were replaced by this experiment.

Source identities:

```json
{
  "baseline": {
    "compiler": "70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95",
    "runtime": "ae44708c9ab1b30e1818011e102f5f0a138220f161fe0a5fab232614c9a91b01"
  },
  "candidate": {
    "compiler": "70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95",
    "runtime": "70186aaa4a10ccb4f546ed272c26c9dcb11c0c78881488e6d954312ec2c44b8c"
  }
}
```

Private evidence: `effect-record-release-study/review-70dc35347960467188d47ec1c3f09240`. These identifiers locate retained internal evidence, not public artifact links.
