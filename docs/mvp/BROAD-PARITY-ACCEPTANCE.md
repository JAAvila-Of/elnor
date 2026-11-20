# Practical CPU parity in the fixed broad matrix

On 2026-11-16 the project owner selected a CPU margin of at most 10% above
Svelte per scenario, with correctness and Surface DX preserved. The requested
scope is parity in most cases, including complex cases; exceptions are allowed.
This is a runtime-interaction target, not a claim of complete product parity.

The fixed matrix contains ten scenarios in six families: counter, forms,
composition, localized state, lists and stateful lifecycle. Its designated
complex scenarios are keyed1000, form96, composition24, localized240 and
lifecycle32. Keyed100 and the original small scenarios remain included. The
49 measured phases, fixture sources, production versions, preflights, AA
controls and AB/BA orders remain unchanged.

## Working acceptance rule

Assess two independent complete Svelte cohorts of the **same source revision**.
Both cohorts must pass all correctness, immutable-input and resource audits.
In each cohort require:

- More than half of the six family CPU ratios at or below 1.10.
- The aggregate of each of the five complex scenarios at or below 1.10.
- More than half of the measured phases within each complex scenario at or
  below 1.10.

Each phase ratio uses the two order-specific CPU medians retained by the
collector. Scenario ratios are geometric means of their phase ratios; family
ratios are geometric means of their scenario ratios. Families have equal votes,
so seven table operations cannot dominate the majority count. Cohorts are
assessed separately, never pooled. AA changes and per-order ratios remain
visible. This is a practical descriptive rule, not a statistical equivalence
test or a guarantee for other machines and applications.

This rule distinguishes the owner's majority objective from the stricter
diagnostic used during early exploration, which required **every** complex
phase within the margin. The original analyses and that diagnostic remain
intact. A majority result must list persistent and single-cohort exceptions
with absolute times; it must not be described as parity in every operation.
No tolerance is widened and no unfavorable phase is removed.

## Boundaries

CPU means renderer thread CPU during the common action/frame window, not
end-user latency, cold startup wall time or FPS. Correctness/lifetime checks
remain separate from CPU attribution. The owner selected the 10% margin;
the aggregation and two-cohort working rule above are an explicit
interpretation of the requested majority scope, fixed before confirmation.

The broader [competitive performance contract](PERFORMANCE-TARGET.md) still
requires equivalent React comparisons, representative applications, delivery,
startup, memory and development-tooling evidence. This Svelte matrix cannot
establish those dimensions or production readiness. A private backend result
must be identified as private until its public integration is validated.
