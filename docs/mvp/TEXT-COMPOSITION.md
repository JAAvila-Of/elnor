# Native text composition and selection evidence

Verified locally: 2026-11-17. The existing input and textarea bindings were
exercised on the general, blueprint and sequential renderers. No compiler,
runtime, grammar or dependency change was needed. The complete 748-case select
revision remains the source baseline; this follow-up runs 40 relevant existing
Node regressions and a new three-renderer browser regression harness.

## Implemented behavior and DX

Both controls write their current string value on every input event, including
provisional text while composition is active. This is live input binding, not
commit-only binding. State-dependent UI can therefore see intermediate text.
Applications that start expensive work from edits must choose their own trigger,
debounce and stale-response policy; automatic async operation management is not
introduced here.

When state echoes the browser value, the runtime avoids assigning value again.
The native composition range, text selection and caret remain under browser
control in the tested cases. There is no blur, synthetic refocus or manual caret
restoration in Elnor's binding. Explicit state replacement still updates the
control. Composition does not establish a transaction over application state.

## Browser checks

The retained fixture forces all three compiler routes and checks each of input
and textarea with:

- Japanese provisional text, update, commit and cancellation in the middle of
  existing text, with reactive state observed at each stage.
- No JavaScript value setter calls from runtime echo during the tested edits.
- Caret preservation, subsequent arrow/backspace edits and replacement of a
  selection with an emoji using UTF-16 selection positions.
- Multiline textarea insertion, explicit state replacement and conditional
  removal; dispatched input events on retired nodes cannot write live state.
- No observed page errors or CSP violations, with sandboxed headless Edge.

The harness uses Chromium's
[Input protocol](https://chromedevtools.github.io/devtools-protocol/tot/Input/),
including imeSetComposition and insertText. It does not synthesize the tested
input sequence with dispatchEvent. A dispatched retired-node event is used only
for the separate listener-removal check.

### Automation boundary

In this browser/protocol revision, compositionstart, compositionupdate and
composing input events have isTrusted true, while compositionend has isTrusted
false. Two plain HTML reference controls, without Elnor, reproduce the same
compositionend flags for commit and cancellation. The harness requires that
reference match and retains the full event trace.

The first harness expected a trusted compositionend and failed. That failed
evidence is retained; the reference experiment corrects the claim rather than
changing runtime behavior. An intermediate successful browser run then exposed
a Windows report-reader encoding error; the final wrapper explicitly reads
UTF-8 and verifies all source hashes.

This is engine-level protocol evidence. It is not independent human acceptance
with a Windows/Linux/macOS IME, its candidate window or assistive technology.
Firefox/WebKit, other IMEs, external state writes during active composition,
composition-triggered conditional removal, and asynchronous validation races
are not covered. The DOM/forms stage remains incomplete.

## Experimental hot replacement follow-up

The packaged Reading Room fixture uses the same Chromium input protocol while
editing Surface. A commit and a cancellation preserve the field value and caret
across compatible replacements. If several builds are ready during composition,
the latest one is applied when it ends. A full reload caused by an incompatible
state initializer also waits for composition to end, then starts fresh and
displays the reload reason. These checks cover Edge's input engine in headless
mode. The system IME and its candidate window still need human verification.

## Svelte contrast

The inspected local Svelte input binding also handles input by reading the
control value and setting the model, with additional reset, hydration and
async-batch/accessor behavior outside Elnor's present contract. Its implementation
is at src/internal/client/dom/elements/bindings/input.js, SHA256
9adf41ec57c7f5d2518424f2047f1abc9e7bf84d2044aa7a771a19266c27fd86.
This inspection is a mechanism comparison, not a Svelte browser benchmark or
an equivalence claim for every input scenario. No implementation was copied.

## Reproduction and provenance

Evidence lives under elnor/.elnor/mvp/text-composition/:

| Evidence | Revision |
| --- | --- |
| Final three-renderer browser run, fixture, event traces and producer copies | browser-f276efa3848746f7ac48f7e06bbcfe0c |
| 40 existing Node regressions, without failures, cancellations or skips | regressions-e05b4b3dc20643e197ff5f571a13d4bb |
| Exact input/result hashes and unchanged public core | browser-f276efa3848746f7ac48f7e06bbcfe0c/verification.json |
| Initial failed trusted-end assumption | browser-a11b99e6067f458fb918d77f2c42dff6 and browser-31411c52b8274e349101ddb605675dee |
| Passing browser with report-reader encoding failure | browser-e0a7115e140e46e289fa1bdef1c0b328 |

Run regressions.py and run-browser.py in that directory with the existing Python
environment. They retain uniquely named runs and use the existing Windows Job
diagnostic limits. The browser harness uses the installed playwright-cli, a
dedicated session for each renderer, headless mode and Chromium sandbox. It
closes only its own sessions. No screenshot or user desktop interaction is used.
Source hashes must still match baseline.json; a changed core needs a new reviewed
snapshot rather than reusing this revision's evidence.

This increment provides correctness evidence, not new CPU, delivery-size or
memory performance results. Core sources are byte-identical to the baseline.
