# Surface file identity and output linking

This records the normalized-path identity increment. The subsequent
[physical identity follow-up](PHYSICAL-IDENTITY.md) resolves real origins and adds
alias ownership/conflict handling for versioned buffers.

## Question and result

Can different Surface files have the same declaration name, or declarations that
differ from their filenames, without losing contracts or overwriting output?

Yes in the tested graph. The preceding suite passed 241 tests, but eleven of
twelve new identity cases failed. The problem also affected checking: two
components named `Badge` shared a temporary `Badge.eln.mts` file, losing one
contract and producing a spurious missing-module diagnostic. Case-only temporary
names collided on Windows. Emission separately rejected duplicate/reserved names
and filename/declaration mismatches.

Contracts and emitted components now use normalized source-file identity.
Declaration names remain metadata and no longer select output modules. The
twelve-case corpus passes after the change, including independent contracts,
generated execution, preview entry selection and reactivity across components.
No Surface grammar or runtime change is required by this increment.

## Identity and contracts

`source-identity.mjs` centralizes absolute path normalization, slash normalization,
Windows case folding and SHA-256 identity. Ordinary ESM output uses the same path
identity rules as before. CLI contract projections now have filenames derived
from the source hash, so equal declaration names cannot overwrite each other.
The existing original-to-virtual module map continues to resolve Surface imports.

Graph records are deduplicated by normalized filename and processed in stable
identity order. Equal source versions for one identity produce one record;
different source versions for that identity produce `ELN-SOURCE-CONFLICT` before
checking/emission can silently choose one. The CLI loader also avoids revisiting
an already normalized filename. This does not introduce persistent document IDs
or replace the editor's versioned document store.

## Emitted modules and compatibility aliases

Every Surface component has a primary output path:

```text
.elnor-components/<source-file-sha256>.mjs
```

Child imports use the graph's file-to-output map. Runtime and ordinary ESM imports
are relative to the component's actual output directory. All components therefore
continue to share the same emitted runtime module and ordinary module identities.
Missing runtime child records produce `ELN-SURFACE-GRAPH` before writing output.

For compatibility, a unique ASCII identifier filename can also have a root-level
alias such as `UserEditor.mjs`. This small module reexports `mount` from the primary
output; it does not create another component implementation or runtime. Aliases
use source filenames rather than declaration names. Ambiguous basenames,
case-only basename variants and reserved runtime/entry names receive no alias.
They remain accessible through their primary output paths.

Consequently, `runtime.eln` can declare `component runtime` without replacing
`runtime.mjs`; two files named `Badge.eln` in separate directories need no shared
flat alias; and a file named `Home.eln` can declare `component Entry` normally.
The former `ELN-OUTPUT-COLLISION` and `ELN-OUTPUT-NAME` guards are removed rather
than treated as permanent language requirements.

`emitGraph` returns `files` plus `components` records containing `source`, `name`,
`file` and an optional `alias`. API source paths are absolute. Raw `generate`
remains a lower-level helper: its default flat import convention is retained for
existing direct-generation fixtures. Graph callers use `emitGraph`, which supplies
the child and runtime import maps; raw generation alone is not a graph linker.

## Entry and preview

CLI `build` finds the requested entry by source filename, not declaration name.
The generated preview entry imports its primary output path. Fixture selection
remains keyed by the requested entry, independently of the component declaration.
`makePreviewScript(entryKey, componentFile)` requires the mapped output explicitly.

The build manifest records `entrySource`, `entryOutput` and per-component source/
output metadata. Manifest source paths are relative to the examples component
root; emission API metadata retains absolute paths. Existing prop/event/slot
metadata and the exported `mount` API remain available.

## Evidence

`tests/surface-identity.test.mjs` contains twelve cases:

- Same-named components with different required props, both accepted and rejected
  consumers, with no spurious diagnostics from the other component.
- Different filename/declaration names for entry and child, reserved names,
  repeated basenames, and source paths containing spaces and Unicode.
- Stable primary paths after graph reordering or declaration renaming.
- Deduplicated normalized source aliases and conflicting in-memory source versions.
- A preview entry executing the mapped component with an independent fixture key.
- Case-only alias conflicts on Windows, shared runtime/ordinary dependencies,
  reactive updates, disposal and HTTP transport of nested component modules.

The local ESM regression now requires duplicate/mismatched/reserved Surface names
to emit successfully while preserving unrelated output. Existing CLI build tests
check the real manifest and preview entry link, and retain the original flat
compatibility aliases for the examples.

On Windows, `npm run check` checks four components; `npm test` builds and passes
253/253 Node tests. Generated execution uses the existing fake DOM. HTTP tests
verify module delivery, not browser rendering. The native VS Code host was not
rerun, and human DX is not established by this corpus.

## Remaining uncertainty

Identity is based on normalized absolute paths, not physical `realpath` or an
inode/file ID. Symlinks and Windows junctions can provide different logical paths
to the same physical module; their loader/editor identity semantics still need
evidence. Moving a source file or checkout changes its hash. Module caching/HMR,
source relocation across checkouts and transactional filesystem writes are not
implemented here. Low-level emission still leaves unrelated preexisting files.

Using declaration names, basenames or conditional flat paths as the primary
identity was rejected because unrelated files can collide or change each other's
links. Compatibility wrappers preserve existing example consumers without
retaining that naming scheme as the graph's identity model.
