# Check a local Surface entry

From the `elnor` command directory:

```powershell
npm run check:project -- 'H:\path to\my project\App.eln'
```

Relative paths are resolved from the command's working directory. The entry may
be outside `examples/components`; its filename does not select an example or
preview fixture. No authoring setup marker is required.

The command loads the saved entry and recursively follows its Surface imports.
Physical-source identity deduplicates aliases and terminates repeated/cyclic
discovery. Unrelated `.eln` files are not scanned. The existing checker resolves
ordinary TS dependencies from their original directories, not the generated
projection directory. Existing subset/import/runtime restrictions still apply.

Success exits with code 0 and prints the entry and number of Surface components.
Parse/load/type failures exit with code 1 and report the original path, line,
message and checked source context where available. This remains the CLI's
line-oriented mapping; no precise editor range is invented.

Every invocation identifies the `elnor-mvp-fixed` TypeScript profile and states
that `tsconfig.json` is not loaded. It does not infer `include`, `files`, `paths`,
project references or plugins. See the [configuration contract](TYPESCRIPT-CONFIGURATION.md).
Checks read saved disk state, not unsaved editor buffers.

## Writes and boundaries

The CLI does not save or format project sources, execute application imports or
initializers, generate an executable build, launch apps or create a preview.
Generated check projections are retained in unique directories under
`elnor/.elnor/mvp/project-check-runs/run-*`, outside the checked project. They
are not automatically garbage-collected. Dependencies may resolve outside the
entry directory; this is a trusted local-source checker, not filesystem isolation.

The experimental API `checkSurfaceProject(entry, {outputDir})` requires an
explicit generated-output directory owned by its caller. `readSurfaceGraph`
returns strict parsed sources, original snapshots and load diagnostics without
typechecking or emitting. The authoring helper now shares that loader while
retaining its existing generated-directory ownership checks and recovery flow.

The old `npm run check/build/preview -- Component` commands keep their example
layout and behavior. `check:project` does not add general project build/preview,
configuration discovery, watch mode or a new grammar. A subsequent separate
[project-build command](PROJECT-BUILD.md) now emits checked local entries into
an explicit owned output with an entry manifest, without creating a preview.

## Evidence

Eight [project-check regressions](../../tests/project-check.test.mjs) cover an
external entry/path with spaces, untouched source and unrelated malformed files,
original type-error context, parse/missing files, cyclic discovery, physical
aliases, original-directory TS resolution and saved updates, non-execution,
fixed configuration and CLI/API failure handling. The initial CLI regression
failed before implementation. The existing 21 authoring regressions retain
coverage of the shared loader's previous caller.

The person's existing authoring `App.eln` also passed with two components using
this command without source edits. At that increment the headless suite had 402 Node
cases and fifteen native editor tasks; technical evidence does not establish
independent human discoverability or full configured-project support.
The headless gate passed on 2026-11-11 at
`elnor/.elnor/headless/runs/run-cGNheP`, with 402/402 Node cases, zero skips,
all fifteen native tasks and exit code 0. No Windows desktop gate was launched.
