# Experimental typed DOM classes

Integrated: 2026-11-17. `class=(stringExpression)` is now available on the
existing supported DOM containers, text elements, buttons and text inputs.
This is an experimental addition to the [implemented subset](../surface/MVP-SUBSET.md).
It does not add arbitrary HTML attributes or a Tailwind/StyleX build pipeline.

## Authoring

```eln
component Panel() {
  state compact = false;
  state draft = "Keep me";
  calc panelClasses = compact ? "panel compact" : "panel roomy";
  action toggle() { compact = !compact; }
  ui {
    section class=(panelClasses) {
      h2 class=("heading") "Tasks"
      input class=("field") "Draft" <-> draft
      button class=("action") "Toggle" => toggle()
    }
  }
}
```

Short expressions stay local. Reusable class strings may live in ordinary
relative TS/ESM modules, with member completion and rename. The `.panel`
container shorthand remains available; combining it with `class=(...)` on
the same node is rejected. An input's class applies to the input itself,
not its generated label. The initial contract accepts strings; objects,
spreads and implicit coercion are outside it. A numeric expression produces
a mapped TypeScript diagnostic on that expression.

DX remains a human acceptance question: long utility strings can obscure `ui`,
while mandatory names add navigation. Neither is mandatory. TypeScript member
completion does not validate CSS utility tokens or provide Tailwind IntelliSense.
Full static tokens can be written today, but no Tailwind extraction/build/watch
or StyleX integration has been verified. See the [DX contract](STYLING-DX-CONTRACT.md).

## Execution and security

Both renderers apply classes through DOM class properties with a string guard.
Literal classes are initialized during construction; dynamic expressions use
existing dependencies and ownership. Equal resulting strings cause no class
write. Class updates retain node identity, input state and focus in the tested
flows. They do not introduce another scheduler or interpret class text as HTML.
Unstyled bundled programs exclude unused class capability code.

The async client's configuration import also became lazy: merely importing
and creating the client no longer evaluates TypeScript in the caller.
Explicit configuration inspection still reports the actual compiler profile
and version. This has a regression test; no numerical memory saving is claimed.

## Validation and provenance

All retained runs below are under `elnor/.elnor/mvp/style-classes/`.

| Gate | Result | Retained run |
| --- | --- | --- |
| Candidate check/build and complete suite | 650 passed, 58 files; zero failures, cancellations or skips | `full-3c41d309d98f4c8281efe2ad78a15a39` |
| Actual public check/build and complete suite after transfer | 650 passed, same 58 files; zero failures, cancellations or skips | `promotion-67e3e895aa024733a60bd776cd1974df` |
| Native VS Code | 15 original checks plus 4 class checks, in two serial editor sessions | `native-complete-8d880b14c26c4bfb81961f5c8bb21d5a` |
| Real browser, both renderer routes | Class writes, node identity, focus, draft, child events, external CSS; no observed page/CSP errors | `browser-45f8d3be771a4f36910e5f8c53fd1091` |
| Supervisor unit and real process rejection probe | Passed | `final-evidence-27df92fe6426442da3ec248527d5162b` |
| Production bundles and structural comparison | Nine workload graphs passed | `cost-d1bb9b86029a4d25b583e4f7fe3b7931`, `proof-08c31b4c3afc4fa99208c7aead973a52` |

The public transfer verifies the prior baseline and unchanged existing tests,
backs up source/tests, then copies the reviewed files byte for byte. Review
`review-7e911b420ff146c38de50217ef159ece/audit.json` verifies current-source
candidate evidence and its archive. The public gate verifies the transferred
source and test hashes again after execution. No package was installed or
published and no editor extension source change was needed.

Windows jobs retain CPU 10%, aggregate commit 768 MiB, Node heap 192 MiB,
24 processes and the existing host-free/time limits. Only the dedicated native
acceptance container uses the owner-approved 1 GiB ceiling, CPU 10%, no swap or
network, unprivileged execution and the reviewed seccomp profile. Its hard
Linux ceiling is 256 tasks including threads; a separate supervisor samples
a 24-process policy every 25 ms. Sampling is not a kernel process quota.
The probe verifies rejection, not exact Windows/Linux enforcement equivalence.

The native profile is disposable: Electron old-space 128 MiB, one built-in
TypeScript server with old-space 192 MiB, 800x600 Xvfb.
The 15 original assertion bodies are preserved; class checks cover completion,
rename, exact-range TS2345 diagnostics and native formatting. Both hosts finish
with Workspace Trust enabled and trusted, without automated trust edits.
Both owned containers are removed. Cgroup reports show no OOM kills but reach
the 1 GiB ceiling; this is correctness evidence with little memory headroom,
not a normal-editor memory budget or a performance claim. Earlier OOM and
timeout attempts remain retained failures. These changes do not alter the
generic public verification launcher's limits or user editor settings.

## Delivery and performance boundaries

The current bundled comparison uses identical production build options for
baseline and candidate. Absolute byte counts vary slightly from earlier runs
because generated module paths affect minification/compression.

| Workload | Baseline gzip bytes | Candidate gzip bytes | Delta |
| --- | ---: | ---: | ---: |
| Counter | 3026 | 3026 | 0 |
| Form | 6534 | 6533 | -1 |
| Composition | 2274 | 2275 | +1 |
| Localized | 5042 | 5042 | 0 |
| Keyed | 10911 | 10910 | -1 |
| Wide form | 15920 | 15920 | 0 |
| Deep composition | 2470 | 2469 | -1 |
| Wide localized | 19761 | 19761 | 0 |
| Lifecycle | 7097 | 7098 | +1 |

All nine bound-identifier AST comparisons pass, preserving globals, properties,
exports and literals. Normalized programs are never executed. This is an
unused-feature cost check, not a fresh numerical runtime comparison.

The [earlier assessment](STYLING-PROMOTION-ASSESSMENT.md) retains the full
12-phase class CPU screen against Svelte and its order/A/A sensitivity.
That screen predates the lazy configuration import and new import-boundary
test; compiler/runtime source files are unchanged from that screen. It is
historical timing evidence, not a fresh whole-source run. No updated React
comparison or product-wide performance parity is established here.

Next: typed DOM/form contracts and a bounded Tailwind build/watch fixture.
Human authoring acceptance, general package resolution, StyleX, broader browser
coverage and production readiness remain open.

The later [native checkbox integration](CHECKBOX-BINDING.md) adds the same
typed property boundary to checkbox, with its own source and native/browser evidence.
