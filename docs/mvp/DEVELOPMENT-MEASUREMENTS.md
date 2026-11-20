# Initial development-loop measurements

The owner's [competitive performance target](PERFORMANCE-TARGET.md) requires
parity with Svelte and React while preserving Surface DX. This Elnor-only timing
baseline does not establish that target. Shared runtime/delivery/memory and
development comparisons remain distinct pending work.

**Status:** descriptive baseline, 2026-11-11. No performance budget or language
migration decision is established. The workloads are deliberately small synthetic
candidates, not a person-approved representative application.

From `elnor`:

```sh
npm run measure:dev
```

`--samples <1..10>` selects repetitions (default 3). The command creates an owned
run under `elnor/.elnor/mvp/development-measurements/run-*`, retains plans,
per-worker logs/results and a summary, and opens no browser/editor. It starts only
owned loopback servers and Node workers; timers/connections are closed afterward.
Each fixture's source, JSON and CSS files are restored and hash-checked. Generated
output remains as evidence, not a live preview of those restored sources. The
runner refuses a nonempty foreign destination and never recursively deletes it.

## Workload and timing boundaries

The run used two source graphs: App/Counter (2 components), and the same pair
with six small UI leaves (8 components). Both import one external **type-only**
TypeScript module with nested settings, a literal union and array props. The
fixtures have 815/1,456 source bytes and 4/16 JSON rows respectively. They change
both graph and props size, so differences are not a controlled single-variable
scaling experiment. Runtime ESM packaging in a real app can have different costs.

For each workload, three fresh workers start with check, three different fresh
workers start with build, and one fresh worker exercises development. Each
pipeline worker repeats its operation three times after its first call. All
fourteen workers run serially. The full regression gate is run separately from
measurement, not concurrently.

| Stage | What its interval includes |
|---|---|
| Process to modules ready | Parent spawn request to receipt of the child's ready IPC message, after common checker/build/dev module imports; not the whole CLI startup |
| Process-first check/build | First API call after imports in a fresh worker. Check and build use different fresh workers. This does **not** mean cold OS/filesystem caches |
| Warm check/build | Repeated calls in the same process. Build includes checking, emission, owned publication and captured props-contract creation; it is not incremental compilation |
| Dev create | `createProjectDev`, including initial scan/build/contract capture, before socket binding; one observation per workload |
| Idle poll | An unchanged `dev.poll()` call including source/dependency hashing; no build |
| Save to publication/error/recovery | Saved write completion to the matching controller status callback. Write duration is retained separately |
| First detection | Save completion to first pending callback, including the detecting scan |
| Detection to attempt poll | Pending callback to start of the later poll that builds/checks; includes the stable-content wait |
| Attempt poll | Entire final `dev.poll()` call: scan, checker/build or expected failure, snapshot and callbacks. This is **not** pure compiler CPU time |
| HTTP navigation | Same-worker loopback Fetch through complete HTML response body. Includes file/input/build verification and uncached or cached props checks; excludes browser download of modules, DOM mounting, painting and human reaction |

The harness wraps the real controller `poll()` with a 500 ms timer instead of
changing product instrumentation. It checks publication IDs, expected source
`TS2353` failure and retained manifest, source recovery, HTTP status, `TS2322`
props rejection, compatible retention and corrected props. Different valid
titles force uncached checks; an immediate identical request exercises its cached
verdict before any new source build. Source changes use deterministic small phase
offsets, not randomized event sampling. Segment boundaries differ slightly from
the final ready callback, so their sums need not equal the end-to-end sample.

## Observed Windows baseline

Evidence: `elnor/.elnor/mvp/development-measurements/run-p0qdLc/result.json`
and its worker directories. Environment: Windows `10.0.26200`, x64, Node
`v24.21.0`, Ryzen 5 5600G, 12 logical CPUs, sources/outputs under the project's
`H:` checkout. No controlled idle host, disk-cache flush, GC policy or storage
device characterization was imposed.

The table reports **median milliseconds** and raw sample counts per workload.
For stages with one observation, the entry is that one observation. Min/max and
every raw sample remain in JSON; no percentile or confidence interval is claimed.

| Stage | n per workload | 2 components | 8 components |
|---|---:|---:|---:|
| Process to modules ready | 7 | 221.2 | 224.0 |
| Process-first check | 3 | 436.9 | 496.2 |
| Warm check | 9 | 275.5 | 286.0 |
| Process-first build | 3 | 592.0 | 744.6 |
| Warm build | 9 | 291.7 | 423.5 |
| Dev create | 1 | 668.3 | 764.2 |
| First HTTP navigation | 1 | 255.0 | 300.2 |
| Idle poll | 3 | 5.2 | 15.7 |
| Save to publication | 3 | 1,208.1 | 1,463.2 |
| Source error observation | 3 | 964.3 | 895.7 |
| Source recovery publication | 3 | 1,319.5 | 1,489.5 |
| HTTP with uncached props | 3 | 200.4 | 252.8 |
| HTTP with cached props | 3 | 18.1 | 27.3 |
| HTTP with rejected props/retained pair | 3 | 176.7 | 212.8 |
| HTTP with corrected props | 3 | 199.2 | 215.7 |

For the three saved-source publication samples, first detection ranged from
16.6–433.8 ms (2 components) and 225.6–509.9 ms (8). The subsequent wait to the
attempt poll was 495.1–496.8 ms and 481.1–486.3 ms. Final attempt-poll duration
was 307.9–327.7 ms and 478.0–602.2 ms. These paired raw observations distinguish
configured polling/stability delay from the measured attempt, without treating
independent medians as additive components.

## Interpretation and next decision

Polling/stability delay is a substantial part of the observed save loop. The
existing typed-props cache also makes repeated navigation observably cheaper
in these samples than a changed JSON candidate. These observations identify
places to profile or compare while preserving recovery and version safety.
They do not isolate TypeScript internals, establish unacceptable UX, justify a
new debounce policy, prove large-project behavior or demonstrate a Rust benefit.

Next select/confirm a representative small application and acceptable feedback
targets in the developer workflow. Reproduce measurements with that workload
before choosing an optimization. Keep the human recovery/event/formatting
evaluation open. A synthetic timing baseline does not close the
[MVP readiness review](MVP-READINESS.md).

## Harness verification

Three Node cases check grouping/counts and invalid samples, refusal of unsafe
configuration/foreign output, and a real one-sample three-worker smoke run. The
smoke asserts expected functional outcomes, timing-stage coverage, correlated
IDs, restored files and report success. It is not a latency threshold test.
The initial test run failed before the harness existed. Functional timeouts
(30 seconds for an expected dev outcome, 180 seconds for a worker) prevent hangs;
they are not product response budgets. Failed worker/output records are retained
and must not be reported as successful timings.

After the independent Windows measurements completed, `npm run verify:headless`
passed at `elnor/.elnor/headless/runs/run-4gbXg7`: 463/463 Node cases, zero
skips, the four-component check and all fifteen native tasks, Linux/Xvfb,
exit code 0. Image:
`sha256:152b0e5fd31bd0b7940740e12942fa6aacdfc57e69b74f6cbb57e892b02fd1e4`.
Native trust remained enabled and fixture disk sources unchanged. The gate's
one-sample smoke is functional coverage under test-suite load, not part of the
timing table above. Its platform/Node version is distinct from the measured host.
No desktop editor, browser, screenshot or user-source/server control was used.
