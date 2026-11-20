# Local ESM module emission

The subsequent [Surface identity follow-up](SURFACE-IDENTITY.md) replaces the flat
Surface output limits recorded here with source-file output maps and safe aliases.

## Question and result

Can Surface components execute local TypeScript/JavaScript value imports after
their generated output moves away from the source directories?

Yes for the bounded local ESM corpus. Before implementation, all fifteen new
cases failed because ordinary value imports were rejected without packaging, or
because specific transitive-module diagnostics were unavailable. The preceding
210-test suite passed. The final thirty-one-case corpus now exercises actual emitted
module graphs from a separate output directory.

The compiler retains separate ESM files and rewrites their static links. It does
not concatenate modules or implement its own ESM linker. Default, named and
namespace imports, transitive reexports, side-effect imports, singleton identity,
live bindings and the tested deferred cycle execute through the JavaScript module
loader. Imported types are erased using the current TypeScript settings.

## Planning and output identity

`module-plan.mjs` resolves local relative imports with TypeScript, reads their
source, and emits ESM targeting ES2022 through a semantic TypeScript `Program`.
Emission is captured in memory. This is necessary to erase implicit type
reexports across files: an additional test reproduced a missing-export
`SyntaxError` when isolated `transpileModule` retained an interface as a value.
Projection import discovery still uses isolated transpilation; ordinary module
emission resolves imported aliases and reexports semantically. It records a module
before traversing dependencies so graph cycles terminate. Imported declaration
files are not emitted as code: a declaration contract can select an existing JS
implementation, while a declaration without executable source produces an error.

Each ordinary source file maps to `.elnor-modules/<sha256>.mjs`. The hash is based
on its normalized resolved absolute filename, case-folded on Windows. Modules with
equal basenames in different directories remain distinct; shared resolved files
use one emitted identity across the component graph. Static import/reexport paths
inside ordinary modules point to sibling emitted module files. Components point
to those files from their output directory.

Identity and code are deterministic for the same source tree location. This is
not content addressing, reproducibility across different checkout paths, symlink
canonicalization, HMR or invalidation of an existing JavaScript module cache.

The planner and validators never import or evaluate user modules. The language
service supplies its source host, allowing unsaved TypeScript dependencies to
participate in packaging diagnostics. Emission uses the supplied Surface IRs and
reads ordinary dependencies from disk; it is not a versioned editor snapshot.
TypeScript checking enables JS inference
and explicit TS import extensions in its no-emit configuration. JS dependencies
are not subjected to `checkJs` semantic checking.

## APIs and build integration

`emitGraph(graph, outputDir)` in `src/compiler.mjs` emits parsed components,
ordinary module dependencies and the matching runtime. Like `generate`, it is an
emission API: callers must typecheck the complete graph first. Existing CLI
`build` performs that check, prepares all emitted code, then replaces its known
`dist` output and writes the preview assets.

All module planning and component generation complete before output writing
starts. A planning/generation error therefore leaves existing output files intact
in the tested cases. File-write failures are not a transactional filesystem
operation. Low-level `emitGraph` does not clear unrelated existing output files.

Raw `generate(ir)` continues to work for components without ordinary value
dependencies. Components with such dependencies need the module-path context
provided by graph emission; raw generation without it reports
`ELN-IMPORT-RUNTIME`. The exported component API remains `mount`. Its internal
function name is now fresh, allowing an ordinary import itself named `mount`.

## Explicit boundaries

Supported module paths are relative local `.mjs`, `.js`, `.mts` and `.ts`
specifiers. TypeScript's NodeNext resolution supplies the source candidate.
`.ts` and `.js` files must have an ESM package context; `.mts`/`.mjs` explicitly
remain ESM even inside a CommonJS package. Bare packages, URLs, `.cjs`/`.cts`,
declaration-only execution, JSX and module assets are outside this experiment.

| Diagnostic | Boundary |
| --- | --- |
| `ELN-MODULE-PATH` | A retained dependency uses an unsupported path form. |
| `ELN-MODULE-RESOLVE` | Executable source cannot be resolved or read. |
| `ELN-MODULE-PARSE` | An ordinary module does not parse. |
| `ELN-MODULE-EMIT` | TypeScript did not produce executable source. |
| `ELN-MODULE-CJS` | CommonJS context, constructs or unbound environment references. |
| `ELN-MODULE-DYNAMIC` | Dynamic import requires a separate graph contract. |
| `ELN-MODULE-META` | `import.meta`/relative asset semantics are not implemented. |

Transitive-module errors are reported at the importing Surface path, with the
underlying module filename/line in the message. Component dynamic imports and
`import.meta` expressions have their own original ranges. Type-only positions
and locally bound functions named `require` are preserved. Previous Surface
import-form/type/tag-use guards remain in force.

Surface output still uses its legacy flat naming scheme. Emission now detects
duplicate/reserved component output names (`ELN-OUTPUT-COLLISION`) and filename/
declaration mismatches (`ELN-OUTPUT-NAME`) before writing. These are emission
limits, not new Surface language norms; they are not yet shared editor diagnostics.
The next identity experiment should remove those restrictions through a coherent
file-to-output map rather than silently overwrite or mislink components.

## Evidence

`tests/local-esm.test.mjs` contains thirty-one cases covering relocated execution,
imports and reexports, transitive side effects, equal basenames, a deferred cycle,
erased types, singleton/live bindings, shared modules across components, import
name hygiene, TS/JS package formats, JS implementations paired with declarations,
deterministic emission and the unsupported boundaries above. Module side effects
are observed only after explicitly loading emitted output. Failed plans preserve
an existing output marker. Unsaved external edits update/clear editor diagnostics.

The existing import-parity corpus now accepts supported local value imports while
requiring graph context for raw generation. It retains type, shadowing and exact
Unicode-range coverage. The preview server accepts an optional output directory
for testing; HTTP requests verify nested module content, JavaScript MIME and the
existing CSP header. This is transport evidence, not browser execution evidence.

On Windows, `npm run check` checks four components; `npm test` builds and passes
241/241 Node tests. The native VS Code host was not rerun. No general bundler,
arbitrary TypeScript, browser interoperability, package ecosystem, scale or
production performance claim follows.
