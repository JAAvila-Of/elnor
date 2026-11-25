# Elnor goals and boundaries

## Purpose and priorities

Demonstrate that Surface, a human-oriented declarative UI language, can provide
an excellent developer experience through a maintainable, predictable
implementation. Syntax does not need to improve execution speed to justify its
existence. DX comes first, followed by security and performance; compiler and
runtime optimization are separate questions.

Elnor's [vision](docs/VISION.md) is to make asynchronous work declarative:
every operation has an owner, a policy, a lifecycle and a destination, and the
compiler checks the guarantees that follow from them.

The [capability backlog](docs/mvp/ECOSYSTEM-ROADMAP.md#owner-requested-capability-backlog-dx-throughout)
keeps future state, schema, development-tool and server capabilities mapped,
including Server Components and Server Actions. Exceptional DX is required
throughout their authoring, composition, diagnostics and recovery; implementation
and scheduling remain separate decisions.

**Required product target:** performance at least on par with Svelte and React,
with the ambition of materially outperforming them, while preserving Surface's
human-oriented syntax and DX. DX-first does not make performance optional.
The [competitive performance contract](docs/mvp/PERFORMANCE-TARGET.md) requires
equivalent workloads and explicit comparison boundaries. Parity/superiority
has not been demonstrated as a product-wide claim. On 2026-11-16 the owner
accepted a 10% CPU margin over Svelte for the fixed broad runtime matrix;
the [majority acceptance rule](docs/mvp/BROAD-PARITY-ACCEPTANCE.md) keeps that
bounded target and its exceptions separate from complete product parity.

That fixed Svelte runtime majority target now has two same-source cohorts and
a [validated public core integration](docs/mvp/CORE-REGION-INTEGRATION.md).
Persistent phase exceptions remain explicit; this does not close the broader
React, representative-app, startup, memory or production-readiness targets.
The general renderer is now the default; it passed the same matrix in two
cohorts before the switch, as recorded in
[General renderer as the default](docs/mvp/GENERAL-RENDERER-DEFAULT.md).

The current phase uses that core as a regression baseline and prioritizes
Surface and application DX. The [Task desk pilot](docs/mvp/TASK-DESK-PILOT.md)
now exercises a typed local application with verified browser flows. Human
authoring feedback remains open; intensive core optimization is closed for
this phase.

The product direction includes typed components, state, props, events, slots
and forms; original-source editor feedback; and independent component previews.
Security features must have explicit trust boundaries and evidence rather than
requiring repetitive syntax from application authors.

## Current viability outcome

The bounded technical investigation is closed with a GO for a small MVP. The
[closure report](docs/spikes/004/VIABILITY-CLOSURE.md) records 287 passing Node
tests, twelve native VS Code tasks and a real-browser UserEditor/CSP pilot.
Those observations establish a workable route for the tested composition and
tooling subset, not full Surface v0.3 or production readiness.

The original editor gates have bounded evidence: mapped TypeScript errors,
cross-component definitions, typed completion, applied Surface rename,
incremental invalidation and regressions for source positions and incomplete
editing. Live TypeScript buffers and alias ownership have additional native
coverage. General recovery and all symbol/workspace forms remain unproven.

Independent human DX and formatting preferences, complete project dependency/configuration
behavior and production performance still require work. Restrictive preview
CSP was exercised in one real browser; broad security, SSR, nonces and sealed
transport were not established.

## Next phase

The [roadmap](docs/ROADMAP.md) is the current plan: the application matrix that
every change runs against, the phases that unlock it, the DX budget each
capability must pass, the decided conventions and the log of direction
changes. Progress notes collected here before 2026-11-25 are kept in the
[phase log](docs/mvp/PHASE-LOG.md).

Use the current JS/TS implementation. A selective Rust port requires a concrete
need, measured benefit and behavior-preserving validation; replacing the
TypeScript semantic engine is not an established requirement.
