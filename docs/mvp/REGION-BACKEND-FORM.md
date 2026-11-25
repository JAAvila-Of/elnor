# Real form coverage with eager dynamic calcs

This private continuation of the [region backend](REGION-BACKEND-DESIGN.md)
admits the original matrix form without changing its Surface source. It is a
coverage and compatibility result, **not a demonstrated performance win**.
Public compiler/runtime and the public ownership contract remain unchanged.

## Mechanism and semantic limits

Sequential plans can lower eligible opaque calc expressions with the original
symbol-aware TypeScript rewriter already used for opaque captions. This is not a
special rule for `join`, `includes` or a particular benchmark method.
Conditional expressions use their actual runtime reads as dependencies.

New calc tasks run once, eagerly, in declaration order during initialization.
They use the existing independent region reaction and shared task-ticket queue.
Later reads see the cached output until its queued evaluation runs, matching
Elnor's ordinary `computed` behavior. Equality suppresses downstream updates.
Cleanup is registered before the initial evaluation, so failed initialization
and parent cancellation release subscriptions without constructing tail DOM.
The initializer exits if its staged owner has already disposed the frame.

The compiler requires referenced state/calcs to precede the new calc. Unproven
forward/self references, calc initialization through external props, inline
functions, lexical/state escapes and other unsupported expressions retain the
original general path. State initialization and action-signature rules are not
expanded by this slice.

Direct calls or tagged calls through a reactive binding also retain fallback.
The original generated call can expose its cell as the JavaScript receiver;
an indexed accessor must not silently replace that observable `this` contract.
Tests exercise both direct and parenthesized calls with a function returned by
a calc and verify the original cell behavior.

The local Svelte `reactivity/deriveds.js` was a read-only contrast. Its lazy
derived model was not copied: Elnor retains its existing eager initialization,
cached action reads, queue rounds and error behavior. The implementation and
TypeScript lowering are Elnor's own.

## Real selection and delivery

Final selection audit: `selection-audit-0e747301d0b241a3b2f567e70897df7f`.
It checks the five original benchmark families and fourteen component modules:

| Workload | Current private entry |
| --- | --- |
| Counter | Scalar blueprint |
| Localized panels | Scalar blueprint |
| Form | Sequential regions |
| Composition with slots/events | General fallback |
| Shared keyed list, 100/1000 | General fallback |

This increases selected families from two to three of five. It is not an
adoption rate for arbitrary applications. The form file matches the retained
matrix source byte for byte. Original fallback modules retain their emission.

The form's minified mount-only bundle is 29,928 bytes / **9,292 bytes gzip-9**,
versus 6,503 / **2,212** for the public general-backend entry in the same audit.
The generic sequential runtime still retains more machinery than this form
needs. That delivery cost remains a material limitation.

## CPU screen

Run `cost-form-676d90c5e59f457c86f3db03cbff06fb` compares the original form's
general fallback with regions, using the identical ordinary private runtime,
original driver/CSS, same bundle settings, sandboxed headless Edge and GPU
disabled. It covers normal individual actions, not the 32-instance batch driver.
Two warmup rounds and seven measured rounds run in both AB/BA orders with AA
controls, producing 336 measured samples across four serial browser workers.

The table reports medians of order-specific renderer ThreadTime medians in ms:

| Action | General | Region |
| --- | ---: | ---: |
| Mount | 1.103 | 1.173 |
| Edit one field | 0.957 | 0.973 |
| Edit all six fields | 1.020 | 1.073 |
| Invalid email | 0.950 | 0.960 |
| Recover | 0.978 | 0.947 |
| Unmount | 0.754 | 0.767 |

Mount is +3.3/+9.5% and edit-all +5.6/+4.8% across the two orders. Other actions
are mixed or close to AA variation. The screen establishes no speed advantage;
statistical significance and a parity margin are not established.
ThreadTime includes shared driver/browser/rendering work. Frame-window wall
time includes frame waits. This is not a React/Svelte or cold-start comparison.
The two post-GC memory rows return to their own node/listener baselines over
eight cycles each; that is not an allocation-throughput measurement or proof of
no possible leak.

## Validation and provenance

The final backend suite passes **310 tests**, including the unmodified form,
conditional calc reads, derived chains, eager single initialization, cached
reads before the next queue round, unchanged-output behavior, external-cell
updates, recovery after a calc error, cleanup after initialization failure,
independent work after an error and cancellation during child initialization.
Earlier assertions that dynamic/opaque calcs must always fall back were replaced
with positive compatibility checks for the newly supported behavior. Unsupported
initialization and reactive receiver cases retain explicit fallback controls.

The existing **71 compatibility tests** pass unchanged. The native cohort checks
and executes **43 cases**, including three form/calc cases: **476 recorded DOM
stages and 688 mount/dispose cycles**. Values, native inputs, DOM schemas and
surviving node identity agree with the general renderer.

The receiver guard was added after that browser cohort. All 43 Surface graphs
were then checked and compiled again with the final compiler in new owned
directories. Every resulting private bundle matches the already-executed
browser asset **byte for byte**, verified by SHA-256. `guard-output` retains those
builds and the mapping; no differences were normalized or ignored. Browser
observations are reused for identical assets, not represented as a second fresh
browser cohort. The final source and the receiver regression tests are retained.

Retention checks cover 39 mounted fixtures with **52 disposers held**, plus
existing branch/row/opaque controls. A new eager-calc control retains an external
cell and the disposer while verifying that disposed DOM collects and later
external updates cannot resurrect it.

The review validator verifies 79 serial expensive Windows Jobs: 77 pass and two
historical failing test cohorts remain retained (v15 selection red controls and
obsolete fallback expectations). All Jobs verify CPU 10%, 768 MiB aggregate
commit, at most 24 processes, a 4 GiB host-free-memory floor, kill-on-owner-close
and zero owned processes after cleanup. Node heap remains 192 MiB; browser
wall/idle limits are 45/12 seconds, offline limits 60/60.

Revision v15 was archived and verified before edits. `review-v16/audit.json` and
its seal retain exact sources, test history, selection audits, native assets,
final-compiler identity proof, CPU samples, retention results and producers.

This private feature is not promoted as a performance improvement. Next work
must reduce sequential execution and delivery overhead on the real form while
retaining these semantics. Broad editor, startup, allocation, release and public
promotion gates remain open; parity with Svelte/React remains unproven.

## Field errors and focus-invalid

Sequential regions now render `error=(...)` on `input`, `textarea` and `select`
and accept `focus-invalid=(...)` on forms. Blueprint regions keep the general
renderer for both, because they clone templates and would not allocate message
ids in rendering order.

Both renderers share the runtime helpers. A message is a `span` after the
field's label with an id from one `elnor-field-error-N` sequence, the
`elnor-field-error` class and `aria-live="polite"`. The field's `aria-invalid`
and `aria-describedby` follow the message, and a value that is not a string
throws `ELN-FIELD-ERROR-TYPE`. On submit, the form reads its focus-invalid value,
which must be a boolean, runs the action and, once pending updates have run,
focuses the first enabled field with `aria-invalid="true"`. A newer submit, a
reset or the form's removal cancels a pending focus; a form without a reset
action still cancels on reset without preventing the native reset.

The existing focus-invalid scenario in `tests/form-submit.test.mjs` runs on both
renderers. `tests/region-field-errors.test.mjs` compares ids, attributes and
messages of fields in the form, in a child component and in list rows with the
general renderer.

A child component now counts as running code later only when it has an
`on dispose` hook, an async action, or an action or expression that creates a
function. A child whose general actions are synchronous and create no
functions cannot read its props after the event that runs them, so its props
keep the direct path, including row items.
