# CLI action diagnostic source lines

The project checker now reports the original statement/parameter line for
TypeScript errors inside Surface actions. The public diagnostic shape remains
`{code,file,line,message}` with one-based lines. No CLI columns or source ranges
are introduced; native editor mapping uses its separate projection.

## Reproduction and fix

The authoring readiness exercise changed the default priority successfully,
then introduced `priority = "urgent"` in the body of beginCreate. TS2322 was
correctly detected but reported at line 44, the action header, while the failing
assignment was on line 48. The checker mapped every generated action line to
one action.line value.

The checker now retains generated action boundaries and maps the diagnostic's
UTF-16 start through the existing original name/parameter/body spans before
computing the source line. This also handles multiline parameters and gaps
between a signature and its opening brace. Those gaps are collapsed in the
checker projection, so simply adding generated line numbers to the action
header would still misidentify some errors. Parameter and body errors sharing
one generated line can now retain distinct original lines.

The TypeScript projection text and existing exported lineMap arrays remain
byte-for-byte unchanged. The diagnostic path uses additional action metadata;
non-action/ordinary TypeScript diagnostics retain their existing route. Parser,
emitter, runtime and editor implementations are unchanged. This is a bounded
checker correction, not a new grammar, editor integration or stable mapping SDK.

## Evidence and limits

| Gate | Result | Internal evidence |
|---|---|---|
| Focused candidate | 26/26 cases: 8 action lines, 8 project checks, 10 builds | run-205cec954afe48f19de769250fb5ccd9 |
| Complete candidate | Check/build; 1024/1024 tests in 83 files, no skips/cancellations | full-1712960aefdb4b2a81f08232407fb31e |
| Projection/program preservation | 19 example TS projections and legacy lineMap arrays unchanged; four emitted graphs/27 files identical | parity-8a3d823bed124897b9609a7857909c59 |
| Public transfer | Check/build; 165/165 selected project/tooling/async/application regressions | promotion-9ed6f6ffa43d44c39b0aae766edd035d |
| Current exercise | 10 automated readiness checkpoints, original-source line 48, repair and baseline restoration | readiness-9f08f1fb07054449836bd5a81a0a7ffe |

Evidence and producers are retained under `elnor/.elnor/mvp/task-dx/` and its
`checker-lines/` subdirectory. Before/candidate/documentation archives retain the
original inputs. No new runtime timing, browser matrix or native-editor run is
claimed. The emitter/runtime/editor implementation bytes are unchanged.

The new regressions cover separate sync statements; async/await, blank lines,
comments and CRLF/Unicode; multiline parameters; collapsed signature whitespace;
single-line actions; multiple independent actions; ordinary TS/state/UI locations;
and a rejected build preserving its last valid manifest. Readiness now reports
the real line 48, repairs the source and restores the original behavior.

The first readiness attempt incorrectly expected start/length fields from the
project checker, which only exposes lines; that expectation was corrected before
the separate header-line defect was reproduced. A parity producer initially
assumed emitGraph returned its output directory; it was corrected to use its
explicit known directories. Those failed attempts remain retained.

Generated-program comparisons are not a CPU benchmark or a claim of new browser
or native-editor acceptance. Earlier runtime performance and native results keep
their historical scope. User feedback is not inferred from the automated exercise.
See the [authoring evaluation](TASK-DX-EXERCISE.md).
