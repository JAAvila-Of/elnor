# Local project preview

For automatic rebuilding of saved sources, use the separate
[development command](PROJECT-DEVELOPMENT.md). The command below remains a
read-only consumer of existing builds.
That development command also supports [versioned props/CSS updates](PREVIEW-INPUTS.md)
on navigation; the standalone command described here keeps its startup snapshot.

The builder and preview are separate commands. Run from `elnor`:

```sh
npm run build:project -- path/to/App.eln --out path/to/build-output
npm run preview:project -- path/to/build-output --props path/to/props.json --css path/to/style.css
```

`--props` and `--css` are optional. Props default to `{}`; their file must contain
a JSON object. Relative paths resolve from the command directory. The default
address is `http://127.0.0.1:4185`. `--port <number>` selects a port; `--port 0`
requests an available port and prints its address. Some browser ports are
restricted; prefer the default. No environment port is inferred. The command
opens no browser/editor, builds nothing and writes no sources or output files.

## Saved build and reload contract

An owned [project build](PROJECT-BUILD.md) is required. The server validates the
published manifest, ownership, fixed profile, paths and SHA-256 of every listed
module. `entryOutput` selects the entry independently of source/declaration names.
Application imports and initializers execute in the browser, never in the
server. This executes a local application; it is not an untrusted-code sandbox.

Every navigation verifies the current published build. Rebuild, then reload to
adopt a new generation without restarting the server. Open pages retain their
original module/bootstrap bytes. A changed module or entry within an already
served generation is refused. Verification failure returns HTTP 503 with recovery
text instead of silently displaying an old page as current. Previously
snapshotted modules remain available to existing pages.

Props and one explicitly selected CSS file are snapshotted at server startup;
restart to change them. Props contain only JSON values; callbacks, mocks and
root event handlers are not configured here. Required prop types are not checked
against JSON at startup. Mount failures appear in the page status and browser
console; module-loading failures remain in the console. There is no source
freshness check, watch, automatic build, HMR, tsconfig loading or arbitrary asset
directory. A successful page load does not establish that sources are up to date.

## Serving boundary

The CLI binds to `127.0.0.1`, requires its numeric loopback Host/port and accepts
only GET/HEAD. Responses retain the existing restrictive CSP, `nosniff` and
`no-store`: external same-origin scripts/styles, no inline scripts or
`unsafe-eval`, and `connect-src 'none'`. Only snapshotted `.mjs` allowlist entries,
bootstrap, index and the selected CSS are served. Sources, metadata JSON,
unrelated files and directory listings are not exposed. Output/module/metadata/
CSS paths traversing symlinks or junctions are refused. The CLI reads the selected
props JSON file; it is not a public route.

Verified bytes, including older served generations, stay in memory until server
shutdown. Restart releases them; automatic memory/disk collection is not
implemented. Verification reads synchronously on navigation. There is no
production throughput, hostile filesystem race, cross-browser security or
whole-filesystem transaction guarantee. Hashes detect disagreement with the
local manifest; they are not publisher signatures.

## Evidence

Nine Node cases cover entry selection, literal props, explicit CSS, generations,
changed-entry refusal, allowlist/Host/method boundaries, corrupt manifests,
checksums, linked paths, non-execution and CLI behavior. The initial test run
failed before implementation. The existing 31 authoring/build cases passed
independently before this increment.

A headless Edge 157 pilot on 2026-11-11 checked literal props, CSS, increments and
child events, old-page behavior after rebuild, and a new generation after reload.
Inline-script and fetch probes were blocked by CSP. Scripts/evidence are retained
under `elnor/.elnor/mvp/project-preview-pilot/run-20261111a`. No screenshots or
desktop editor were used; the owned browser/server were closed. This is automated
evidence, not independent human DX validation or a browser matrix.

This increment's final full gate, `npm run verify:headless`, passed on 2026-11-11:
421/421 Node cases, zero skips, the four-component check and all fifteen native
editor tasks. Evidence: `elnor/.elnor/headless/runs/run-0nZDqp`, Linux/Xvfb,
exit code 0, image `sha256:589825832a731e99e9f49384f2c8a4da2dd6ef26f6675fec06b8e7aed29571fb`.
No Windows desktop editor gate ran. The preceding `run-lSCh2l` passed 420 cases
before the additional changed-entry regression and guard were added.
