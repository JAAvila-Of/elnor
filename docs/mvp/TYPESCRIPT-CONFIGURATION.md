# TypeScript configuration contract

The first Surface MVP uses one fixed analysis profile, `elnor-mvp-fixed`, shared
by the checker and language service. It does **not** load `tsconfig.json`.
Keeping that boundary explicit avoids promising configuration that standalone
packaging and preview cannot yet honor.

## Inspect the active profile

Run from the `elnor` command directory:

```sh
npm run config
npm run config -- --root .elnor/mvp/authoring-workspace
```

The command prints JSON containing the loaded TypeScript version, fixed analysis
options, source/emit policies and the presence of `tsconfig.json` directly under
the requested directory. `rootConfig.applied` is always `false`. `--root` selects
the directory to inspect; it does not select a compiler configuration or change
the normal CLI's example entry. Inspection does not read config content, traverse
parent directories, create output or execute project code. Missing roots and
invalid arguments fail with exit code 1. Paths containing spaces must be quoted.

The synchronous and async services expose the same metadata through
`configuration()`, independent of worker startup. Returned objects are copies,
not a way to change the profile.

## Analysis options and consequences

| Setting | Fixed behavior |
| --- | --- |
| `strict: true` | Strict checking remains enabled even if a nearby config disables it |
| `module` / `moduleResolution: NodeNext` | TypeScript resolves ordinary imports with NodeNext rules |
| `target: ES2022` | Default libraries follow this target and the loaded TypeScript version; DOM declarations are available |
| `types: []` | No automatic ambient `@types` inclusion; explicit imports/references are a separate TypeScript mechanism |
| `skipLibCheck: true` | Declaration libraries are not fully checked; this is not proof of their correctness |
| `allowJs: true` | Ordinary JS dependencies may participate; `checkJs` is not enabled |
| `allowImportingTsExtensions: true` | Analysis permits supported TS import extensions; packaging has additional restrictions |
| `noEmit: true` | Analysis produces diagnostics, not executable modules |

`tsconfig` options including `paths`, `baseUrl`, `lib`, `types`, `include`,
`exclude`, `files`, `extends`, project references and compiler plugins are not
loaded. Malformed configs are likewise ignored, not validated. Elnor does not
scan every config filename or infer a nearest ancestor config.

The supplied Surface graph determines checker roots. The adapter indexes local
Surface files in its first trusted workspace and synchronizes supported open
Surface/TS buffers. Imported dependencies are resolved by TypeScript; a config's
`include` does not add unrelated files and its `exclude` cannot hide an explicitly
supplied component or its imported contract. The editor may offer a broader
read-only type view than the runtime packager can emit.

NodeNext can still read `package.json` and dependency declarations as part of
module resolution. Ignoring `tsconfig` is not filesystem isolation or a sandbox.
Package context matters for ordinary `.ts`/`.js` module interpretation; `.mts`
provides an explicit ESM source form. Elnor does not load user compiler plugins
or execute imported source during analysis.

## Emission and editor boundaries

The module planner shares the analysis profile's module-resolution options, but
uses its own emit options. Surface output is ESM targeting ES2022. Runtime
dependencies must satisfy the existing bounded local ESM contract; arbitrary
package imports, path aliases, CommonJS and all JSX forms are not implied by
successful type resolution. See the [operational contracts](../surface/MVP-CONTRACTS.md).

VS Code's ordinary TypeScript extension manages `.ts` diagnostics independently
and may load `tsconfig.json`. Its results can differ from Surface's fixed profile.
The Elnor adapter does not modify workspace settings, rewrite configs, disable
the TS extension or take ownership of ordinary TS diagnostics.

Saved TS content changes follow the [disk invalidation contract](DISK-INVALIDATION.md).
Config changes do not alter this fixed profile and have no watcher integration;
package/config-dependent project invalidation remains unimplemented.

## Evidence and next boundary

Eight [configuration regressions](../../tests/typescript-configuration.test.mjs)
cover read-only inspection, malformed ignored config, strict checking, aliases,
default libraries, ambient packages, include/exclude, worker replay and CLI error
handling. The complete suite passes 360 Node cases and `npm run check` checks the
four original components. Existing local ESM tests cover shared resolution and
packaging behavior. No native editor/browser run was performed for this change.

This defines the initial configuration contract; it does not implement general
configured TypeScript projects. A configurable profile must choose supported
options explicitly and test checker/editor/packaging parity, config dependency
invalidation and failure behavior together. Native formatting/watcher validation
and further human authoring feedback remain open MVP work.
