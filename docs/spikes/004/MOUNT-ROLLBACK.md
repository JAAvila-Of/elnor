# Cleanup after failed synchronous mounting

The subsequent [import follow-up](IMPORTS.md) addresses original-source contract
resolution and makes the remaining runtime module boundary explicit.

## Question and result

Does a component release effects, listeners and newly created DOM nodes when
initialization or rendering throws before returning a disposer?

Before this increment, no: all eleven new runtime cases failed while the existing
171-test suite passed. A failed first effect run remained subscribed and could
execute again. Mounting left partial nodes and listeners behind. Conditional
fragments and partially built list rows lost their owners, and a throwing user
disposer prevented later cleanup callbacks from running.

The runtime now registers effect disposal before the first run, cleans failed
effects immediately, and rolls back resources owned by a failed synchronous
mount. Fragment and list creation retain cleanup ownership until construction
finishes. Successful existing mounts and prior target children are preserved in
the tested cases. The final sixteen-case corpus passes, including three tests
executing generated components rather than only calling runtime helpers.

## Ownership and failure behavior

- `scope.dispose()` runs owned callbacks once in reverse registration order and
  attempts every callback even if some throw. It rethrows a single cleanup error
  unchanged or collects multiple errors in `AggregateError`. Resources registered
  after disposal are cleaned immediately.
- `effect` registers its disposer before evaluating the first callback. If that
  run fails, its subscriptions and queued work are removed. An effect in an
  already disposed scope does not start, and a disposed active effect cannot
  resubscribe through subsequent signal reads in the same run.
- `mountBoundary` disposes its root owner on a synchronous failure and removes
  newly added direct children while preserving children present before the mount.
  Normal disposal also removes its captured nodes if an owned disposer throws.
- Failed detached fragment construction cleans its owner and fragment nodes.
  Conditional and list cleanup is registered before their first effects run.
  Lists retain newly built rows in a staging set until a successful reconciliation,
  so a later duplicate key or row-construction error does not lose earlier rows.
- Part cleanup attempts both owner disposal and node removal. A parent rollback
  therefore reaches children and slot resources that were already successfully
  mounted and registered with the parent owner.

If cleanup succeeds, the original mounting error is rethrown unchanged, preserving
`ELN-INIT` metadata and error identity. If cleanup also fails, an `AggregateError`
contains the mounting error followed by the cleanup error and exposes the original
mounting error as `cause`. Nested cleanup aggregates retain their own errors.
Exceptions are not swallowed to turn a failed mount into success.

## Evidence

`tests/mount-rollback.test.mjs` contains sixteen tests:

- Failed first-effect execution with subscriptions and queued work; scope disposal
  with multiple errors, idempotence and late resource ownership.
- Effects created in disposed scopes, and disposal during an initial effect run.
- Failed mounting after button/input creation, including inactive retained node
  listeners and signal-read counters after subsequent mutations.
- Preserved preexisting nodes, original errors, aggregated cleanup errors, and
  node removal during a throwing normal disposer.
- Detached conditional construction, duplicate list keys, failed later rows,
  mounted children and standalone initial structural failures.
- Independent successful and failed mounts sharing a target.
- Generated components failing with `ELN-INIT` after an earlier reactive calc,
  including a safe retry and normal subsequent updates/disposal.
- A generated parent failing after child and slot rendering, and a generated list
  failing while creating its second row.

Generated integration tests import their signals from the same copied runtime
module as the generated effects, so subscription checks exercise real tracking
rather than mixing independent module instances. The tests retain nodes and
mutate signals after failure to detect live resources, not merely empty DOM.

On Windows, `npm run check` checks four components; `npm test` builds and passes
187/187 Node tests. The native VS Code host was not rerun. DOM evidence uses the
existing fake DOM; this does not establish browser behavior or measured heap usage.

## Decision and limits

Retain the existing owner model and make synchronous construction exception-safe.
Cleaning only target nodes leaves active subscriptions/listeners; suppressing the
render exception hides a failed mount; replacing the scheduler or runtime
architecture exceeds the demonstrated problem.

Cleanup covers resources registered with these owners and nodes created in their
mount/fragment boundaries. It does not undo arbitrary user effects, restore text
or attributes on preexisting nodes, cancel async actions/network requests, await
asynchronous disposers, or recover from later scheduler/event-handler failures.
Resources created by external callbacks without registering ownership remain the
callback's responsibility. Subsequent list-update atomicity is not established
by initial list-mount rollback tests.

Parser, compiler grammar and generated API are unchanged in this increment. No
production lifetime, performance, browser or general recovery claim follows.
Value/type import execution remains the next independent compiler question.
