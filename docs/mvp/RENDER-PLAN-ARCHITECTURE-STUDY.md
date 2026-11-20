# Compiler/runtime contrast and a conservative render plan

**Private compiler prototype. No runtime speedup, global parity or Surface
limitation established. Public src/tests/dist remain unchanged.**

The investigation changes the unit of analysis from individual helpers to the
component's creation, reactive updates and disposal obligations. Six equivalent
Surface/Svelte fixtures retain source, complete generated modules and production
browser bundles. They cover static markup, direct state, a derived value, mixed
literal/live props, conditional content and keyed replacement/reordering.

## Observed generated-code differences

| Case | Elnor's current lowering | Svelte 5.57.3 output observed here |
|---|---|---|
| Static markup | Element/text helpers; activation registration for each literal caption | HTML template factory and append; static captions embedded in template |
| State counter | Cell, caption effect, literal captions and native click listener | State, template factory, template effect and delegated click |
| Derived value | Output cell plus eager computed effect, then a caption effect | Derived node read by a template effect |
| Child with two props | Reader objects, runtime getter adaptation, one caption effect per text | Literal prop field plus live getter in caller; one child template_effect containing two set_text calls |
| Conditional | Structural effect, dynamic region and per-caption initialization | Conditional block plus separate reusable static templates |
| Keyed items | Structural reconciliation and two reactive caption helpers in each item body | Keyed each block; one emitted template_effect containing two text updates in each item body |

These are generated call sites, not total runtime effect/allocation counts or CPU
shares. Framework roots, item branches, derived bookkeeping and other runtime
work are not interchangeable. One emitted template effect versus two helpers
does not imply twice the performance. The props example also shows that Svelte
does not need the earlier Elnor experiment's separate child-module variants to
generate this particular code.

Svelte combines decisions about DOM templates, reactive update units, prop
representation, derived values, event dispatch and lifetime ownership. Replacing
one Elnor data structure or transplanting a template helper alone does not
reproduce that combination. Prior rejected clone/props experiments remain
rejected; this comparison does not retroactively validate them.

## First implemented increment

The private render-plan.mjs builds one per-component plan before emission:

- Source facts distinguish a primitive literal token, direct state, calc, prop,
  loop-local reference and unknown expression.
- Creation, update and disposal obligations are recorded separately for UI sites
  and state/calc declarations.
- Literal captions retain activation-registration obligations; dynamic captions
  retain effect stops. Native listeners, input effects, structural regions,
  inherited child obligations and unknown slot obligations remain explicit.
- Component arguments record caller facts without assuming that the child is
  specialized or that an arbitrary prop getter is pure.
- Nodes are linked to entries by object identity with original source spans;
  parsed IR and source are not mutated.

Its first compiler consumer replaces only the existing literal-caption decision.
It deliberately preserves the old boundary: concatenations, calls, properties,
assertions, BigInt and other unproven expressions remain dynamic. A literal state
initializer does not make the state immutable, and a literal calc does not remove
its computed effect. Source classification is not a complete dependency graph,
purity proof, escape analysis or safe grouping decision.

The plan is an initial representation of current lowering, not a replacement
parser or a finished optimizing IR. Owner provenance and binding-interference
proofs still need work. The prototype currently parses expressions again; its
compiler CPU/memory and editor-feedback cost are not established as improved.
Reusing existing parser/binder work is part of a future adoption decision.

## Contracts constrain valid optimizations

The new getter control keeps two bindings independent: changing the signal read
by row.label reruns that getter but does not reread row.id. Grouping unknown
getters indiscriminately could change read counts, dependencies or side effects.
An optimized grouping therefore needs a safety proof and a conservative fallback.

A separate native helper control exposes a text-observation difference. After
initially rendering "Stable", it externally changes a Text node to "External":

| Operation | Observed text |
|---|---|
| Elnor caption effect reruns, returning the same "Stable" | Stable |
| Svelte set_text is called again with the same "Stable" | External |
| Svelte set_text receives a different "Changed" | Changed |

Svelte's helper compares with a cached value; Elnor's dynamic helper compares with
the current native node value. The control also verifies that Elnor does not
repair text after its owner is disposed. This is a specific helper-contract
comparison, not a universal component/API equivalence claim. It supplies no CPU
cost attribution and does not justify dropping Elnor's current behavior.

The useful design boundary is compiler-controlled DOM/regions versus general
public rendering and arbitrary user expressions. Future optimizations must
describe which contract they preserve and why the selected region qualifies.
Surface already exposes state, calculations, actions and UI structure needed to
begin this analysis. The six examples require no new user syntax or annotations;
they do not prove that every JavaScript behavior can be statically optimized.

## Verification

All six native pairs pass identical normalized DOM schemas and expected values
through 13 stages per framework. Keyed nodes preserve identity across swap and
replacement. Unmount leaves empty roots, and clicks on retained buttons do not
resurrect DOM. Those postconditions do not by themselves prove listener or heap
equivalence between the frameworks.

The plan consumer produces byte-identical generated modules for all six new
graphs (seven Surface components) and 18 existing Surface source files across
examples, lists and the four-family application matrix. The existing-source
census records source sites, not instance execution counts. Runtime bytes are
unchanged, so this revision is not a runtime performance optimization.

The latest plan suite passes 24 tests. The candidate passes 182 existing tests
across ten unchanged files. No full release gate or comparative CPU benchmark is
run for this output-preserving private increment. The historical public
610-test/check/build gate remains historical evidence, not validation of a new
release.

All retained work uses 22 serial Windows Jobs: 21 pass and one initial source
census fails because its launcher omitted the existing TypeScript NODE_PATH.
The corrected launcher uses the installed dependency; no package is installed
and no test is weakened. The failed producer/log remain retained. All Jobs keep
CPU10%, commit768MiB, 24 processes, host-free4GiB, kill-on-owner-close and
browser wall/idle45/12 or offline60/60 seconds. All owned process trees clean up.
Browser cases remain sandboxed headless Edge with GPU disabled and no explicit
accessibility override. No CPU, power or memory ranking is inferred from them.

Generated Svelte output comes from the pinned installed compiler 5.57.3, not a
build or checkout change of the local monorepo. Read-only local reference is
commit 0156c5fe38b53b72675e2a7f04535de015fdeed1: client transform shared/utils.js,
shared/component.js, DOM template.js, render.js and reactivity/deriveds.js.
Exact package/compiler and reference-source hashes are retained. The analysis
follows the local performance-investigation guidance's targeted, single-change
principle; it does not execute its branch-switching benchmark command.

Next: extend the plan with dependency/interference and owner/region provenance
before proposing a lowering that removes an entire update or disposal obligation.
Keep general owners, opaque getters/calls and public entry points on their current
contracts. Evaluate the full cycle and DX cost, with normal A/A-controlled broad
measurements, before promotion. No copied Svelte implementation is introduced.

Private evidence: `render-plan-study/run-6bd8a877ff6e499e877ad822ba0cb92e`,
`coverage-01f5af80682445a785ae532f804b487f`,
`unit-4be2f95e27ab42739cb0c0d498d0ed69`,
`existing-68a00f797d284f8d9260912de06a47cf`,
`cache-bbffd663c1b64b6db5c9f7ca37142a95` and final `render-plan-study/review`.
Public compiler/runtime remain 70abd192/ae44708c. Private compiler consumer:
72cb916184cb250a80ae2cd2202492ae7172a3525b2fdf9c616edfe650bc0ac0.
