# Functional core closure

**Subsequent timing follow-up:** [current core comparison](CURRENT-CORE-COMPARISON.md)
now records a complete controlled cohort for this frozen core. Statements below
about no timing rerun describe the functional closure itself.

**Reviewed: 2026-11-12. Verdict: GO for continued work on the supported MVP.**
The reproduced scheduler and mount-lifetime blockers are closed, the complete
Node gate passes, and the changed behavior passes native DOM checks in Edge.
This freezes a functional foundation for further MVP work. It does not close
the [competitive performance requirement](PERFORMANCE-TARGET.md), independent
human DX evaluation or production readiness. The earlier
[MVP readiness review](MVP-READINESS.md) remains a historical workflow audit.

## Retained fixes

An effect already captured in a batch could be queued again by an earlier calc.
Its upcoming execution read the latest values, but the stale invalidation still
caused a second execution or a repeated error. Flush now consumes invalidations
immediately before each live effect runs. Writes during or after that execution
remain pending; self-invalidation and later dependency updates still work.
Captured order remains observable: general topological ordering, atomic updates
and cycle detection are not supplied.

The public mount disposer previously retained its captured nodes and ran node
removal on every call. A second call could remove a node reused elsewhere;
reentrant cleanup could detach DOM before the remaining callbacks observed it.
The disposer now releases its owner and node collection before cleanup begins.
Repeated calls are inert, including after an exception. The first call still
attempts all cleanup and removes the captured nodes, preserving error identity
or aggregation. Disposed effects also release their stored user callback.

Seven new regression cases produced **five failures before the change and zero
after it**. They cover consumed versus later invalidations, self-invalidation,
single error reporting/recovery, repeated unmount, throwing cleanup and reentry.

## Closure coverage

| Boundary | Current evidence | Limit |
|---|---|---|
| Reactive state and calcs | Dependency growth/shrinkage, nested tracking, coalescing, errors, disposal and the new batch-consumption regressions | Reassignment-based tracking; no deep mutation tracking or general transaction semantics |
| Components and compilation | Full parser/checker/emission, props/events/slots, initialization, identity and name-hygiene regressions | The [implemented subset](../surface/MVP-SUBSET.md), not full proposed Surface v0.3 |
| Structural DOM | Keyed reconciliation, ownership guards, failed list/conditional cleanup and retry; native Edge checks for ordinary and detached rows | Tested recovery boundaries, not cancellation of arbitrary application async work |
| Lifetime and DOM updates | Scope cleanup, rollback, text write guards, listeners and public unmount cases; native Edge confirmation | Browser application code executes normally; this is not a hostile-code sandbox |
| Retained references | Controlled V8 observation with retained disposers: old callback payload/node remain reachable; candidate payload/node are collected | Node v24.21.0, forced GC, two isolated objects; not a general heap audit or a cross-framework memory comparison |
| Tooling and local workflow | Check/build plus all project/editor API, worker, formatter and preview Node regressions | Native editor tasks were not rerun in this closure; their historical evidence remains separate |

## Reproducible evidence

All paths below are relative to
`elnor/.elnor/mvp/framework-comparison/`:

- Before-change regressions: `test-runs/core-closure-before-06d10479e9a44d90881f43346eeb0d8e`.
- After-change directed gate: `test-runs/core-closure-targeted-c447311135e2401d8688877f8723354c`.
- Complete gate: `test-runs/run-fd04fb3502964523940da779d83230ac`:
  **550 tests across 46 files**, plus check/build, **48 passing phases**.
- Closure evidence: `diagnostics/core-closure-8517258fb59e4c7089ed7f4e4af82adf`.
  Its aggregate result passes build, **42 preflight checks** across three
  frameworks/two sizes, structural/text/listener recovery in Edge, new native
  scheduler/unmount cases and the controlled reference-retention observation.
- Frozen fixture: `run-RuBGXZ`; its manifest and raw runtime/compiler snapshots
  identify the exact sources. Browser results match the frozen runtime hash.
  Baseline is `run-sPU8kb`; the compiler is unchanged.
- Producer: `reports/core-closure/producer.py`, with retained browser cases,
  worker and retention observation. Each output preserves source snapshots and
  supervisor results. The producer accepts the completed gate and a baseline
  runtime source; it refuses incomplete/failed verification or source mismatch.

Executed from the workspace root:

```powershell
python elnor/benchmarks/runtime/test-project-windows.py
python elnor/.elnor/mvp/framework-comparison/reports/core-closure/producer.py --gate elnor/.elnor/mvp/framework-comparison/test-runs/run-fd04fb3502964523940da779d83230ac --baseline elnor/.elnor/mvp/framework-comparison/run-sPU8kb/runtime-source.mjs
```

Heavy phases run serially inside the existing Windows Job limits: CPU 10%,
768 MiB job commit, 24 processes, 4 GiB minimum free host memory, owned-tree
cleanup, browser wall/idle bounds of 45/12 seconds and Node bounds of 60 seconds.
Every completed phase reports zero remaining owned processes.

## Cost and remaining acceptance

The ordinary minified application bundle is **7,156 raw / 3,003 gzip / 2,708
Brotli bytes**, versus 7,056 / 2,959 / 2,674 previously. The 44 gzip bytes buy
correct batch consumption and released, idempotent public mount lifetimes.
This is application fixture output, not the standalone runtime size.

No timing cohort was rerun and no percentage speedup or parity verdict is
accepted. The result establishes fewer redundant executions in the tested
dependency shape and removal of two specific reference-retention paths.
The existing A/A timing variation, representative workloads, acceptance margins
and independent human DX remain open. Continue the remaining MVP against the
[operational contracts](../surface/MVP-CONTRACTS.md); new features need their own
regressions without reopening this bounded closure by default.
