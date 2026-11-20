# Saved TypeScript dependency invalidation

**Follow-up:** the [fifteen-task native suite](NATIVE-VALIDATION.md) passed on
2026-11-11, including real watcher events for unopened transitive changes and
direct dependency deletion/recreation. The initial evidence below predates it.

The first MVP adapter now invalidates Surface analysis when a TypeScript file
changes on disk, even if that file was never opened in the editor. This closes
the demonstrated stale-diagnostics gap; it does not implement a complete project
graph or `tsconfig.json` integration.

## Contract

- In the first trusted local workspace folder, create/change/delete notifications
  for `.ts`, `.tsx`, `.mts` and `.cts` files invalidate the workspace epoch.
  Notifications under `node_modules`, `dist`, `.git`, `.elnor` and
  `.elnor-authoring-output` are ignored. External workspace paths are excluded.
- The synchronous engine exposes `invalidateDisk(file)`. The async client forwards
  it as a mutation and rejects pending queries as stale. Previously issued
  snapshots and rename plans become invalid. Startup/restart reads current disk
  sources while replaying owned editor buffers.
- Invalidation increments a shared disk revision and clears TypeScript's semantic
  cache. Subsequent queries re-read disk snapshots and resolve modules, including
  previously missing modules and transitive imports. This is deliberately coarse;
  no latency or large-project performance claim is made.
- Notifications never adopt a dependency as an editor buffer. Open unsaved TS
  source remains authoritative, including when its saved file changes. Closing
  the last TS view releases its text and invalidates analysis so disk resolution
  resumes without waiting for another watcher notification.
- Surface indexing/reload and existing alias conflict/retarget guards remain in
  place. Reading dependencies does not execute their source or plugins. Rename
  into ordinary or unowned TS declarations remains refused.

## Evidence and limits

`npm run check` checks the four existing components. The complete Node suite has
352 passing cases, including nine added regressions in
[engine/worker tests](../../tests/disk-invalidation.test.mjs) and the
[adapter corpus](../../tests/editor-alias.test.mjs). The initial never-opened
dependency regression failed before the implementation.

Coverage includes saved edits and recovery, transitive dependencies, cached
missing-module creation, deletion/recreation, dirty-buffer precedence and close,
definition offsets, stale rename plans, held worker queries, startup, restart
and excluded directories. Adapter tests inject watcher callbacks through an API
double with the real worker. No native editor or real OS watcher run was performed
for this increment; earlier twelve-task native evidence predates it.

The caller must deliver disk notifications: there is no polling or universal
filesystem freshness guarantee. Full dependency-aware invalidation, package and
configuration changes, external paths, multiple/remote workspaces and general
symlink topology changes remain outside this contract. TypeScript compiler
options remain fixed in the engine under the subsequent
[MVP configuration contract](TYPESCRIPT-CONFIGURATION.md). Native formatting verification is separately
pending and requires an explicit interactive run.
