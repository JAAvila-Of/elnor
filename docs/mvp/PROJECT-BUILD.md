# Build a local Surface entry

The separate [project preview](PROJECT-PREVIEW.md) can consume this build's
manifest with explicit JSON props and optional CSS. Building alone starts no server.

From `elnor`, run:

```powershell
npm run build:project -- 'H:\my app\App.eln' --out 'H:\my app\generated'
```

The destination is mandatory. It must be a new/empty directory or an output
already owned by this same physical entry. Sources are read from the saved
Surface import graph using the existing checker and fixed TypeScript profile.
`tsconfig.json` is not loaded. Runtime imports retain the bounded local ESM
packaging contract; no grammar or module-system expansion is implied.

Success prints JSON with the output root, manifest path, build ID, relative
`entryOutput`, component count and profile. Consumers read `manifest.json` and
import the module at `entryOutput`; they do not guess a filename from the
component declaration. The emitted module exposes the existing `mount` API.
This command does not create HTML, provide entry props/fixtures, copy arbitrary
assets or styles, start a server or open a browser/editor.

## Output contract

An owned root contains:

```text
generated/
  .elnor-project-output.json
  manifest.json
  builds/<build-id>/
    manifest.json
    runtime.mjs
    .elnor-components/...
    .elnor-modules/...        (when required)
```

The root marker binds ownership to the physical entry. Each successful build
gets a fresh UUID generation; generated files are copied exclusively into it,
with SHA-256 values recorded in the manifest. Component metadata retains its
source, declaration name, generated module and any compatibility alias.
Imports remain relative within that generation.

Checking and emission finish in a unique internal scratch directory before the
destination is adopted. The active root manifest is replaced last, by a rename
of a temporary file, after the generation is complete and root ownership/state
are checked again. A rejected checked build does not replace the previous
manifest or files. Old generations and unrelated files in an owned root remain.
No recursive deletion or automatic garbage collection is performed.

The builder refuses nonempty foreign directories, file destinations, invalid or
mismatched ownership metadata, non-regular metadata, linked output/cache paths,
overlap with entry/imported Surface sources and overlapping output/check cache.
It never adds a force-overwrite mode. Use a new destination rather than copying
or editing ownership markers manually.

This is an experimental local output format, not a published SDK/ABI. Run writers
serially. Publication is not a whole-filesystem transaction, a durability promise
or protection against hostile concurrent filesystem mutation. I/O failures or
interruption can leave unreferenced generations/temp files; they are not made
active by an earlier failed publication. Recorded checksums are not signed
attestation and are not a general output-integrity verifier.
Ordinary TS dependencies are read during checking/planning; this is not a frozen
multi-file source snapshot. Save the intended source state before invoking build.

## Implementation and evidence

`buildSurfaceProject(entry, {outputDir, checkOutputDir})` reuses the project
checker and existing graph emitter. Low-level API callers explicitly own their
scratch directory. The CLI allocates it under
`elnor/.elnor/mvp/project-build-runs/run-*`, outside the checked project.
Compilation reads application code without executing imports or initializers;
the generated application runs normally when a consumer later imports/mounts it.

Ten [project-build regressions](../../tests/project-build.test.mjs) cover CLI paths,
renamed declarations, manifests/checksums, executed updates/events/disposal with
the fake DOM, previous generations and unrelated files, failed checks, foreign
destinations, source overlap, ancestor/generation/metadata links, corrupt owners,
local ESM non-execution and argument failures. The initial CLI case failed before
implementation. The person's authoring App was built into the separate internal
`mvp/local-app-build` destination without source edits or starting its preview.
At completion of the build increment, the headless baseline had 412 Node cases and fifteen native
editor tasks. These tests do not establish a new real-browser preview workflow,
independent human DX or configured-project support.
That increment's final headless gate passed on 2026-11-11 at
`elnor/.elnor/headless/runs/run-wChsM7`: 412/412 Node cases, zero skips and
all fifteen native editor tasks, with exit code 0. No Windows desktop gate ran.
