# Type-checked development preview props

`dev:project` now checks JSON preview props against the entry's TypeScript
contract before mounting a newly selected input pair. The command is unchanged:

```sh
npm run dev:project -- src/App.eln --out generated --props preview-props.json --css preview.css
```

For `component App(title: string)`, `{"title":42}` is rejected while
`{"title":"Hello"}` is accepted. Missing required fields, incompatible nested
values and excess fields are reported using TypeScript diagnostics. Optional
props, arrays, literal unions and imported interfaces use the existing strict
fixed-profile TypeScript semantics. No separate schema language is introduced.
The same check applies to programmatic `props` and the default `{}`.

## The contract belongs to a published build

During a successful development build, the existing checker captures its source
texts (including projections, declarations and libraries), read metadata and
module-resolution results. A props validator is created before publication and
installed in the controller only after the builder successfully publishes.
Failed builds leave the previous validator in use. Checking JSON against files
currently being edited would otherwise validate a different application from
the compiled modules still served.

The validator creates an in-memory TypeScript probe calling the captured entry
contract with a fresh, computed-key JSON literal. Its compiler host answers from
captured texts/resolutions and never loads a current source/metadata file.
No user import/initializer or JSON-looking code is executed, and no probe is
written/emitted. Diagnostics include `TS...`, the selected props file and a JSON
path such as `$["config"]["mode"]`. Missing-field errors may point to `$` and name
the field in their message. The UI escapes this text; the terminal escapes control
characters. These are JSON field paths, not exact source-file line mappings.

The checker snapshot is session-local and the manifest format is unchanged.
The optional builder `captureProps` capability returns a non-enumerable
`validateProps` function; ordinary build JSON output does not include it. A new
process with failed sources cannot typecheck an earlier output's entry contract:
it shows a recovery page until this session successfully builds. Persisting or
shipping portable type contracts is outside this increment.

## Retention and contract changes

On typed input failure, the last valid props/CSS pair is checked against the
current published contract before reuse. If compatible, it remains visible with
the input-failure notice. Saving a correct JSON object and reloading adopts the
new pair without restarting or rebuilding Surface. CSS remains paired with the
accepted props; a CSS edit accompanying rejected props is withheld.

After a new build changes the contract, the old pair may no longer fit. If both
candidate and fallback fail, navigation returns HTTP 503 with the typed recovery
notice and no mount script. An already open page retains its older modules and
input URLs. Save props compatible with the new contract and reload to recover.
Source-build status and input status remain independent.
After publication the input status becomes pending/unread until navigation
revalidates it; an earlier valid verdict is not reported as current for new types.
The preview also requires the manifest build ID associated with this session's
validator. If another command publishes to the same output, navigation refuses
it with HTTP 503 and a recovery explanation instead of checking the wrong
contract. Use one writer per output; restart development or save a source change
to rebuild in the owning session. This is a read-time identity guard, not a
multi-writer filesystem transaction or lock.

## Boundaries and cost

This checks TypeScript assignability for JSON values, not application-specific
invariants or arbitrary runtime data. `any`, `unknown`, structural typing, index
signatures and an empty props object type retain their normal TS behavior; do not
infer exact-object enforcement for every type. JSON cannot supply a callback or
class instance identity. A structurally assignable value may still violate a
component's runtime assumptions. This is not a security boundary or runtime
validation framework. Standalone `preview:project` remains untyped with fixed
startup inputs; CSS syntax is still handled by the browser.

Each validator caches up to eight serialized-props verdicts. New successful builds
replace the validator/cache. Uncached checks run synchronously and can delay
navigation or source polling. There is no latency/memory SLA or incremental
compilation claim. Capturing checker inputs does not make the existing build's
check/emit filesystem reads an atomic transaction across concurrent saves.
After publication, props checks use only the captured checker snapshot.
No user tsconfig/plugins, runtime package expansion, HMR or
new CSP permissions are introduced.

## Evidence

Nine new regressions cover wrong/missing/excess fields with pair retention,
imported nested objects/arrays/unions/optional fields, initial failure recovery,
frozen imported types through broken source edits and new-contract fallback
refusal, non-execution, programmatic inputs/callback rejection, special-key
refusal/prototype safety, earlier-output/session boundaries and another build
writer's output. Seven initially
failed before implementation; the non-execution case already passed. Existing
special-key serialization coverage now explicitly declares that optional prop.
The initial focused project check/build/preview/development suites passed 65 cases,
without skips or desktop applications. The additional writer-identity case failed
before its guard was added.

The final `npm run verify:headless` gate passed on 2026-11-11 at
`elnor/.elnor/headless/runs/run-Y7xECF`: 460/460 Node cases, zero skips,
the four-component check and all fifteen native editor tasks, Linux/Xvfb,
exit code 0. Image:
`sha256:4519cbb4a8137b7564e8be51a1bf41a057a8ba0121275c966bc76d5690b9bc55`.
Trust remained enabled and native fixture sources unchanged. No Windows desktop
editor gate ran. The earlier `run-9zPkHF` and `run-7eSEgG` passed 459 cases before
the additional writer-identity regression/guard.

A headless Edge 157 pilot at
`elnor/.elnor/mvp/typed-props-pilot/run-20261111a` checked typed field feedback,
compatible-pair/CSS retention, correction without restart, new-contract rejection
of incompatible fallback and recovery with numeric props. Counter clicks and
child events worked throughout valid mounts. Inline-script/fetch CSP probes
remained blocked. Props-only edits kept the compiled manifest unchanged; a saved
source contract change rebuilt automatically. The pilot predates the additional
pending-status and writer-identity guards covered by the final gate. Its named
browser, owned server and timer were closed; no screenshot, user-source edit or
user-server control was involved. This does not establish independent human DX.
