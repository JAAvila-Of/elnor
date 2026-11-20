# Detached static-tree eligibility and reentrant cancellation

The private whole-tree probe now has differential controls using real compiler
output. It also exposed and led to a production correctness fix: cancelling a
structural region while its first child was being built could leave its active
child scope untracked and attempt insertion through an already removed anchor.
No whole-tree cloning optimization is integrated or claimed as a speedup.

## Production correction

`createPart` and `createRootPart` can register an in-flight part before invoking
user builders. `repeat` tracks that part in its existing staged ownership set;
`when` records its active part before a builder runs. Disposing a region therefore
disposes the child scope immediately, including effects and native listeners
registered later by a builder. Builders remain synchronous JavaScript: cancelling
does not interrupt their arbitrary statements, but newly registered effects do
not execute on a disposed child scope.

Both structural helpers record cancellation and stop later insertion. Lists check
after collection reads, key callbacks, new-part construction and removal cleanup.
Conditionals check after reads, teardown and construction. Existing error cleanup
and duplicate-key diagnostics remain in use. This is not a blanket guarantee for
arbitrary monkeypatched DOM APIs or every possible JavaScript reentrancy point.

Seven new regressions cover cancellation during collection reads, key callbacks
and child reads in fragment and detached list paths, plus conditional construction.
They assert no scheduler exception, no subsequent child-effect read, no remaining
owned DOM, and no retained listener or reactive activity. Before the fix all seven
failed (16 existing tests passed); afterward the full targeted file passes 23/23.
The complete check/build and test gate passes **595 tests across 52 serial phases**.

## Private compiler-output experiment

Two Surface fixtures pass through the actual parser and generator: a keyed row
with a button/caption and a six-input repeated form. Both use the existing internal
detached-root path. Each fixture has separate baseline and experimental runtime
copies. Only in the experimental output, its root-helper import points to a
private prepared-tree helper. A descriptor is derived from that fixture's parsed
tree. The private runtime reuses cloned elements/text placeholders while keeping
the existing effect registration, value comparison and native listener cleanup.

This is a deliberately constrained emission experiment, not a production compiler
selector. Descriptors support container/text/button/input nodes; structural blocks,
slots and child components are rejected. Descriptor matching is asserted at the
private entry. A lazy prototype cache is keyed by the creating document. Reference
maps use weak keys. Text and input bindings are installed in the same generated
order as the baseline, after skeleton construction.

The form's six state cells are component-owned and shared by its repeated views;
it is a semantic fixture, not the previous performance probe's independently
owned forms. No timing or memory inference transfers between those experiments.

Twenty fake-DOM controls and twenty sandboxed headless Edge controls pass after
the correction. They cover initial output, keyed identity/order, replacement,
append/remove/clear/recreate, input propagation, thrown reads, duplicate keys,
cancellation, writes during initial reads, retained-listener cleanup and remounts.
The fake-DOM controls additionally reuse modules across document objects and check
ownerDocument. Real-DOM controls do not claim to validate cross-realm caching.

The first twenty-plus-twenty controls had equal cancellation errors in both
variants. Those results are retained but are not described as successful
cancellation. Revised controls require each scenario's expected outcome as well
as equality, and now cancellation completes without an insertion exception.
Two earlier runs stopped on mistakes in the private Surface fixture (a missing
state semicolon and incorrect input syntax). Those failed runs remain retained.

## Svelte contrast and eligibility limits

The previously inspected Svelte checkout contains both `from_html` and
`from_tree`: the latter also builds a programmatic structure lazily and clones
it. Reusing static structure is a shared optimization idea. Elnor's experimental
descriptor and binding paths remain separate and import no Svelte implementation.

The earlier foreign-owner cancellation control still prevents replacing public
helpers generally. This study narrows attention to native per-row scopes and
detached roots; it does not establish that every structurally simple view is
eligible. External DOM monkeypatches, namespaces, custom elements, hydration,
arbitrary components/slots and general public renderOwned calls remain outside
the demonstrated scope. No new Surface grammar or public opt-in is added.

## Evidence and performance status

Internal root: `elnor/.elnor/mvp/framework-comparison/tree-clone-study`.
Current semantic fixture: `eligibility-22681edf1c514ef0837fa16a68679f2c`.
Current native browser controls: `eligibility-browser-63633229e5724ab78ca98effa2a43bf3`.
Full gate: `run-1fc37ffa1aca47b697a0d708cb59f38e`.
Red/green regression runs: `reentrant-9c9d384ffd654e098e1744b1e7762a50` / `reentrant-f99e1074f07b486ea98a53a17cd539d2`.
`eligibility-verification.json` binds these results, supervisors and source hashes.

Sixty supervised phases are retained: 57 successful phases, two failed fixture
attempts and the expected seven-regression red phase. All ran serially with CPU
10%, commit 768MiB, maximum 24 processes, host-free minimum 4GiB and owned-process
cleanup. Browser limits remain 45s/12s idle with GPU disabled and accessibility
enabled; Node phases use 60s/60s. No limits or test coverage were reduced.

The production runtime changed for correctness; the compiler did not change.
Earlier benchmark tables and creation traces refer to older runtime sources.
There is **no new comparative timing result** for this revision, no claim of
performance neutrality, and no new ranking against React/Svelte. Registering an
in-flight part introduces bookkeeping that needs measurement on the broad matrix.
Before any cloning adoption, implement and test a production eligibility selector,
then compare first/repeated mounts and full workloads against a matching baseline.

Runtime: `fef7558b628ac2c20be2b3e53e579fb1d7dccfef96cb828f27b67912f54fd1ef`

Compiler: `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95`
