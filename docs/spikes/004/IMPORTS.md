# Import contracts and execution boundaries

This records the historical boundary increment. The subsequent
[local ESM follow-up](LOCAL-ESM.md) implements bounded local value-module emission
and replaces the blanket ordinary-runtime-import rejection with specific limits.

## Question and result

Do imports accepted by CLI/editor correspond to imports that generated modules
can resolve and execute?

Not generally. The preceding 187-test suite passed, but thirteen of sixteen new
cases failed the initial import corpus. CLI projections were checked from a
temporary directory, so ordinary relative type dependencies resolved differently
from the editor. A special copy of `../types.ts` only covered the example layout.
The generator emits runtime and Surface component imports, but does not package
ordinary executable module dependencies.

This increment repairs type resolution and makes the execution boundaries
explicit. It **does not implement ordinary runtime module packaging**. The final
23-case corpus passes, including generated execution with type dependencies absent
from the output directory.

## Resolution and import metadata

CLI checking still emits its temporary projection files, but its TypeScript
compiler host now resolves ordinary imports from each component's original
filename. Imports between Surface projections resolve through the loaded graph's
original-to-virtual filename map. External TypeScript dependencies retain their
own original filenames and directories for transitive resolution. The special
`../types.ts` copy is removed.

The parser reads import declaration metadata with TypeScript's AST instead of a
default-import regex that missed named and namespace declarations. It records
the original local/path ranges, type-only flag and single-default-import shape.
The existing line-oriented header boundary remains; this is not a general parser
replacement or a promise of multiline import support.

## Shared boundaries

`import-validation.mjs` uses TypeScript transpilation with the current ESNext/
ES2022 settings to identify imports retained as executable dependencies. It does
not evaluate source or load modules. This follows the spike's current default
TypeScript import-elision behavior, without `verbatimModuleSyntax`.

| Diagnostic | Current boundary |
| --- | --- |
| `ELN-IMPORT-RUNTIME` | An ordinary module import survives TypeScript import elision, but this generator does not package that dependency. |
| `ELN-IMPORT-FORM` | A Surface component import does not use the single-default-import form currently implemented by the generator. |
| `ELN-IMPORT-TYPE` | A type-only Surface import is used as a runtime value or component tag. |
| `ELN-IMPORT-USAGE` | A Surface default import is used as an ordinary runtime value instead of a component tag. |

These errors are shared by CLI checking, original-source editor diagnostics and
generation. Path or usage ranges point to original UTF-16 source spans. They
describe experimental implementation limits, not changes to the proposed Surface
language or a general prohibition on TypeScript module forms.

Ordinary imports used only as types, including implicit type-only uses of an
ordinary import declaration, remain valid when TypeScript can resolve their
contracts. An unused ordinary value specifier may also be elided under the
current settings. A local shadowing an imported name does not by itself require
the imported module at runtime. Missing modules and ordinary explicit type-only
imports used as values remain TypeScript errors.

Surface component aliases have a separate mount adaptation in generated code;
their projected default contract is not an ordinary executable function export.
Symbol-based usage checks allow mapped component tags, skip type positions and
preserve local shadowing. Type-only Surface imports are explicitly excluded from
generated mount imports. Their source can remain in the checking graph, and the
build can still emit graph files; this is not type-only dependency pruning.

## Evidence

`tests/import-parity.test.mjs` contains 23 tests:

- Default, named and namespace type imports; implicit type uses and mixed
  type/unused-value specifiers.
- Default, named-alias, namespace, action and mixed runtime uses, rejected before
  generation can silently omit their dependencies.
- Missing type modules, ordinary type imports used as values, type-only Surface
  contracts and invalid rendering of those contracts.
- Unsupported Surface namespace/named forms and ordinary value uses of Surface
  imports, including shorthand and action calls.
- Local shadowing, transitive `.ts` type dependencies, `.mjs` specifiers resolving
  `.mts` sources, unsaved external type edits and diagnostic repair.
- Exact shared ranges after Unicode/CRLF in an earlier import path.

Tooling reads modules whose top-level code throws if executed. Type-only generated
components are then mounted from a separate output directory containing only the
component and runtime, confirming that type modules are not loaded. Execution
uses the existing fake DOM, with normal disposal assertions.

On Windows, `npm run check` checks four components; `npm test` builds and passes
210/210 Node tests. The native VS Code host was not rerun. No browser packaging,
package-manager, CommonJS or production module interoperability claim follows.

## Decision and next uncertainty

Resolve contracts from their source context and diagnose executable dependencies
that are not packaged. Keeping the example-specific type copy retains an
accidental layout dependency; preserving ordinary relative import strings in
relocated output breaks runtime resolution; implementing a complete bundler here
would exceed the bounded corpus.

The next experiment should establish a minimal graph of local relative ESM value
imports, including transitive dependencies and output-path identity. Existing
flattened Surface output names, package resolution, external executable modules,
CommonJS, dynamic imports and general first-class component values remain outside
the demonstrated execution boundary. Raw `generate` still does not replace a
full graph check or validate every TypeScript error.
