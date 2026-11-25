# Regression matrix design

Phase 1 of the [roadmap](../ROADMAP.md). The applications in `examples/` are
checked today by Node tests against a fake DOM. Their browser runs were
one-off pilots driven by tools outside the repository, so a change that
breaks an application in a real browser is not caught by anything.

## Goal

One command runs every application's browser flows in a real headless
browser, under the same restrictive CSP the preview sends, and reports each
application on its own line. CI runs it on every pull request. A deliberate
regression in one application fails only that application.

Not goals: performance measurement (the runtime benchmarks keep that role),
visual comparison, and the full durable intents acceptance, which stays a
deeper suite run when the durable runtime changes.

## Approaches considered

- **Playwright library as a pinned development dependency, driving the
  browser already installed on the machine** (chosen). It has reliable
  accessible locators and waits, the earlier pilots already used it, and
  `playwright-core` downloads no browser: Chrome on Linux and macOS, Edge on
  Windows, both preinstalled on CI runners.
- The Chrome DevTools Protocol over Node's built-in `WebSocket`, with no
  dependency. It needs a hand-written layer for waiting, input and
  locators, which is the code most likely to make the gate flaky.
- The Playwright test runner. It brings its own configuration, fixtures and
  reporters on top of `node --test`, a second test system to learn.

## Design

- `tests/browser/<application>.browser.mjs` describes one application: how
  to start it (build and serve, or start its host), and its flows as a list
  of `{name, run(page, app)}`.
- `tests/browser/harness.mjs` builds a project into a temporary directory,
  serves it with `createProjectPreview`, checks the CSP on the first
  response, and records page errors, CSP violations and requests to other
  origins for each application. Any of those fails the application.
- `scripts/browser-matrix.mjs` (`npm run test:browser [application...]`)
  launches one browser, gives each application its own context, runs its
  flows in order, closes its servers and continues with the next
  application whatever the outcome. It prints one line per application,
  writes a JSON report under `.elnor/browser-runs/` and exits nonzero when
  any application fails.
- The browser runs headless with its sandbox enabled. `ELNOR_BROWSER`
  selects `chrome` or `msedge`; the default is Edge on Windows and Chrome
  elsewhere.
- `node --test tests/*.test.mjs` does not enter `tests/browser/`, so
  `npm test` keeps its current scope. A Node test checks that a failing
  flow in one application leaves the others passing, without a browser.
- CI adds a browser job on the three operating systems. The release job
  waits for it as well as for the tests.

## Applications in the first matrix

| Application | Flows |
| --- | --- |
| `authoring` | a child event updates the parent |
| `components` | filter and restore the list, reject an invalid name, save text that looks like markup, cancel and confirm a deletion, the browser blocks inline code, handlers, eval and fetch |
| `durable-save` | a save applies once, a reply lost after the commit, a pending intent resumed after a reload, a conflict kept for review, an intent admitted in a closed tab and sent by another |
| `embedded-widget` (new) | two widgets mount in a page written by hand without changing it, each keeps its own state and reports to the page, disposing removes only the widgets |
| `persistent-task-desk` | an unknown outcome survives a reload, resolves as applied after a provider restart, a remote edit conflicts, a lost request becomes retryable, an outage neither replays nor changes the intent, a retry applies once, a replaced database blocks acknowledgement |
| `task-desk` | search and filter, protect an unsaved draft, validate and save an edit, create and delete, reload restores the seed and the layout fits a phone |

The applications with a provider need Python, as their Node tests already
do. `durable-save` has no host page of its own, so its browser description
writes the one its README describes: one journal for the account and a
same-origin proxy to the provider. The full durable intents acceptance,
with releases, account changes and storage failures, is not part of the
matrix.

`async-save`, `async-search`, `operations` and `recoverable-save` are covered
by Node tests only. They show policies that the applications above already
exercise in a browser.

## Results on 2026-11-25

- The 6 applications, 28 flows, passed in headless Edge 157 and Chrome 157 on
  Windows, with the browser sandbox enabled.
- A deliberate regression in `Counter`, counting by two, failed `authoring`
  while the other five applications passed in the same run. Removing the
  phase check from the persistent desk's submit failed its first flow, and
  removing the review check from `DurableSave`'s Save failed its conflict
  flow; those two were run for their own application only.
- The second regression first passed: the Save button was also disabled
  because the tasks were not loaded after the reload. The flow now checks the
  button before the reload too. A flow is only as strong as the state in
  which it checks, so each new flow should be checked against a regression.
