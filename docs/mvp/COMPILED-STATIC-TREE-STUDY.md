# Compiler-selected static each trees: feasibility and performance

**Private candidate rejected for production.** A real compiler selector and
programmatic tree factory pass the stated selection and semantic controls, but
the minified measurements show no consistent performance benefit across the
selected row/form shapes. Public compiler/runtime sources remain unchanged.
This is not a new React/Svelte ranking or a core speedup claim.

## Actual compiler mechanism and eligibility

The candidate changes an isolated compiler/runtime copy. Only a direct each body
with one container root and a recursively fixed layout can select the new path.
Allowed descendants are the existing bounded container/text/button/input kinds
and tag whitelist. Structural blocks, slots, child components and multiple roots
prevent selection for that body. Nested independent each bodies can still be
considered separately by the normal emitter. There is no new Surface syntax or
public opt-in flag.

The compiler emits a module factory per selected body and direct child-node
references for its bindings. The runtime factory lazily builds a pristine tree
through createElement/createTextNode and keeps it in a WeakMap keyed by document.
Each use clones the entire tree, then binds dynamic text, buttons and inputs in
the original generated order with the existing native scope ownership. Literal
captions retain their cancellation guard. There are no per-node WeakMaps, HTML
string parsing, eval, Svelte imports or eager binding of the cached prototype.

The ordinary element/text/button/input helpers and public mount/renderOwned entry
remain staged. Eight selector controls include simple, nested and empty bodies,
and exclusion of multi-root, conditional, slot, component and public-root cases.
The same new selector expectation first fails against the unchanged compiler.

Twenty-two Node controls and twenty Edge controls use actual baseline/candidate
compiler output. They cover reactive values, input propagation, read order,
cancelled/throwing reads, duplicate keys, writes during initial reads, keyed
identity/order, removal/recreation, listener cleanup and remounts. Node additionally
checks module imports without document, separate document objects and the public
foreign-owner control: child counts [1,2], only A read and A displayed. These are
**50 bounded controls**, not a complete candidate test gate or a proof covering
arbitrary DOM monkeypatches, namespaces, custom elements, hydration or full module
graph integration.

## Reference contrast

Read-only Svelte reference: clean commit
0156c5fe38b53b72675e2a7f04535de015fdeed1. Its template.js exposes from_tree as well
as from_html, with lazy tree preparation and cloning, plus namespace/hydration and
effect-node lifetime handling for its contracts. Elnor's descriptor filter,
compiler references and native binding ownership were implemented separately.
Only the static-structure reuse idea is shared. Svelte's performance-investigation
guidance informed the targeted, one-candidate comparison; no branch-switching
bench command or Svelte modification was performed.

## Matched fixtures and measurement boundary

The usual framework-comparison list renders an imported RowView component per
item, so it is intentionally outside this candidate's direct-body selector.
Measuring that unchanged path as a cloning improvement would be misleading.
Instead, both compilers generate code from the same retained Surface fixtures:
a direct each row with button/detail, and repeated six-input form views.

Counts are 100/1,000 rows and 1/24 form views. The six form state cells belong to
their enclosing component and are shared across its views; these are not the
independently owned forms from the earlier native feasibility probe. The row/form
fixtures have no conditional error branch. No component-boundary removal is
compared against an existing component-based baseline.

Initial exploratory cohorts used unbundled modules. They are preserved below but
are not used to decide production benefit. The authoritative cohorts use minified
ESM bundles produced by the same installed esbuild instance and options for both
variants. Each entry exports its cell from the exact runtime bundled with its
view, avoiding mismatched reactive instances. Loading, parsing and module-level
factory allocation happen before the CPU window; this is not startup/network
measurement.

Each browser case contains a declared A/A or baseline/candidate pair, with AB/BA
seed order. Cached cases use two warmups and seven measured mounts per label.
First-mount cases instead create a fresh context/page per label/sample, import the
module outside timing, and measure its first mount four times per label. There are
zero mount warmups and no private cache-reset API. These are first tree construction
measurements after module load, not cold OS/browser startup.

The window includes data-cell creation, component mount, bindings, insertion, two
animation frames and a height read. Schema checks, node counts, clicks/input edits,
identity checks and disposal checks run outside it. Initial schemas are equal;
each sample has exactly 3+5N row nodes or 3+31N form nodes, including the repeat
anchor comment. Cached remounts reset inputs and outputs after the prior sample's
edits. Prototype contents are not exposed or separately inspected by this test.

Tables use renderer ThreadTime medians in ms; positive changes mean higher CPU.
A/A uses the baseline on both pages. All samples are retained, with no pooling
between different counts, cache states or build modes. A/A is descriptive and is
not subtracted; no equivalence margin or statistical significance is established.

## Minified cached mounts

| Shape/count | Previous ms AB / BA | Candidate ms AB / BA | Change % AB / BA | A/A % AB / BA |
|---|---:|---:|---:|---:|
| row/100 | 7.523 / 5.704 | 7.753 / 6.619 | +3.1 / +16.0 | +2.7 / +1.7 |
| row/1000 | 33.951 / 33.789 | 32.456 / 36.331 | -4.4 / +7.5 | +6.1 / -1.1 |
| form/1 | 1.512 / 1.509 | 1.426 / 1.616 | -5.7 / +7.1 | +20.4 / +8.5 |
| form/24 | 9.355 / 9.833 | 9.019 / 10.187 | -3.6 / +3.6 | +7.3 / +18.1 |


At 100 rows, candidate CPU is higher in both orders (+3.1%/+16.0%). Other cached
comparisons change sign, including 1,000 rows (-4.4%/+7.5%) and 24 form views
(-3.6%/+3.6%). These results do not reproduce the earlier isolated 24-form signal
as a consistent compiled-path benefit.

## Minified first mounts

| Shape/count | Previous ms AB / BA | Candidate ms AB / BA | Change % AB / BA | A/A % AB / BA |
|---|---:|---:|---:|---:|
| row/100 | 11.207 / 11.959 | 11.717 / 13.405 | +4.6 / +12.1 | +5.7 / -4.1 |
| row/1000 | 37.223 / 43.237 | 38.093 / 40.100 | +2.3 / -7.3 | +1.6 / +1.8 |
| form/1 | 13.519 / 10.518 | 11.264 / 11.393 | -16.7 / +8.3 | +0.8 / -9.6 |
| form/24 | 20.588 / 18.397 | 18.130 / 18.330 | -11.9 / -0.4 | -4.0 / -6.5 |


At 100 rows the candidate is again higher in both orders (+4.6%/+12.1%). First
mount of 24 forms is lower by -11.9%/-0.4%, while its A/A is -4.0%/-6.5% and the
cached result changes sign. This is insufficient evidence for adoption or a general
claim that cloning improves repeated forms. It does not prove every future static
tree strategy is ineffective.

## Delivery and retained DOM

| Fixture | Baseline raw / gzip bytes | Candidate raw / gzip bytes |
|---|---:|---:|
| row | 5401 / 2242 | 5748 / 2442 |
| form | 6546 / 2658 | 7342 / 2890 |

These are fixture application bundles only; driver/HTML are excluded. Gzip uses
level9 with deterministic metadata and is a size observation, not measured transfer
latency. The candidate also intentionally retains a pristine DOM tree per body and
live document. Weak document keys do not eliminate that cost while the document is
reachable. No exact heap savings or absence-of-leaks claim is made.

## Preserved exploratory unbundled cohorts

Cached:

| Shape/count | Previous ms AB / BA | Candidate ms AB / BA | Change % AB / BA | A/A % AB / BA |
|---|---:|---:|---:|---:|
| row/100 | 4.986 / 4.451 | 4.123 / 6.837 | -17.3 / +53.6 | +17.7 / +13.3 |
| row/1000 | 26.188 / 26.433 | 26.078 / 26.103 | -0.4 / -1.2 | -12.3 / +18.9 |
| form/1 | 1.426 / 1.390 | 1.394 / 1.491 | -2.2 / +7.3 | +0.4 / +2.9 |
| form/24 | 7.988 / 6.332 | 6.621 / 7.158 | -17.1 / +13.0 | -2.4 / -6.0 |


First mount:

| Shape/count | Previous ms AB / BA | Candidate ms AB / BA | Change % AB / BA | A/A % AB / BA |
|---|---:|---:|---:|---:|
| row/100 | 17.447 / 15.787 | 18.502 / 14.441 | +6.1 / -8.5 | +2.7 / -9.0 |
| row/1000 | 47.617 / 46.725 | 48.962 / 48.189 | +2.8 / +3.1 | +2.0 / +1.1 |
| form/1 | 10.373 / 14.116 | 10.866 / 10.511 | +4.7 / -25.5 | +16.9 / -1.5 |
| form/24 | 19.179 / 16.029 | 18.540 / 18.707 | -3.3 / +16.7 | -6.9 / +2.0 |


These observations remain distinct from the minified cohorts. The reader initially
omitted the repeat anchor from its expected node count. Its corrected structural
oracle counts main, ul and that comment plus the actual row/form subtrees; this
check is outside timing and required no sample changes or reruns. The original
reader is retained. A selector test also initially required a binding helper in an
empty body; that harness assertion was corrected and its failed run preserved.

## Validation, provenance and decision

Seventy supervised phases are retained: **68 passed**, the expected baseline
selector failure, and the empty-body harness failure. There are three selector
runs, two semantic phases, one bundle phase and four independent 16-case cohorts.
All ran serially with verified CPU10%, commit768MiB, maximum24 processes, host-free
minimum4GiB and owner-close cleanup. Browser wall/idle limits remain45s/12s and
Node60s/60s, with GPU disabled, sandbox enabled and accessibility enabled. No test
coverage or resource guard was lowered to obtain a green result.

All evidence and exact producers live under
`elnor/.elnor/mvp/framework-comparison/compiled-tree-study`. The reviewed report
is retained verbatim as reviewed-report.md; verification.json binds sources,
reports and all supervisors. The isolated TypeScript loader forwards to the
existing public loader, so both compiler copies use the installed dependency
without an install. Generated module sources and bundle entries are retained.

The production runtime/compiler and tests are unchanged. The prior **595-test plus
check/build gate** applies to those exact production sources and was not rerun for
this rejected candidate. The candidate is not described as passing that complete
gate. Broad application comparison and production integration were not pursued
after the focused results failed to show a consistent benefit. The normal
component-based list and the global Svelte/React parity requirement remain open.

Retained runtime: `fef7558b628ac2c20be2b3e53e579fb1d7dccfef96cb828f27b67912f54fd1ef`

Retained compiler: `70abd192ecab05ac9942bec862af8df8fe683305ab476568783da5b67dfbfa95`

Private candidate runtime: `284d67fdb56f1542dfab96005e9e7a8e13a88078de9750438f977c712d2a4a14`

Private candidate compiler: `db1c405ea2620eddcded6509fe3f5ddafd6fb27c4c6e7c66a5205a715e6a499b`
