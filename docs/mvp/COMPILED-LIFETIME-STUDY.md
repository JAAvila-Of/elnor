# Compiler-selected lifetime layouts: private experiment

**Not integrated.** The candidate avoids per-binding run/disposer/listener-cleanup
function constructions in selected fixed regions, but it does not deliver the
intended consistent creation improvement. Creating 100 rows uses more renderer
thread CPU in both orders; creating 1,000 rows has mixed directions. Clear uses
less CPU in both orders at both sizes. The larger bundle and mixed broad results
do not justify adopting this version. Production stays on the 610-test core.

## Mechanism and distinction from earlier experiments

The compiler emits one module-level layout describing effect and listener slots
for each selected region, and one data frame/values array per region instance.
Only recursively fixed container/text/button/input bodies select it. Structural
blocks, components and slots prevent selection for that body; their independently
fixed children or generated child components can still select their own layouts.
There is no new Surface syntax, extra generated component module, event delegation,
combined reactive effect or change to public mount/renderOwned arity.

Each effect still has its own subscriptions and scheduler entry. Each listener is
still registered and physically removed on its own element. The native owner's
existing cleanup array stores frame/index/private-marker entries at the original
registration positions. A shared dispatcher destroys the specified resource slot;
ordinary public callbacks remain callable and unbound. Errors are accumulated in
the same reverse registration order, including registrations made by user getters.
The plan is therefore not one coarse callback that reorders a region's cleanup.

The original text/button/input/effect helpers retain their code paths. Selected
generated helpers use effect records with a shared run function and no per-effect
disposer function. Foreign or overridden owners get callable per-resource fallback
callbacks. One private WeakMap lookup per frame recognizes native owners without
reading a new property on a foreign owner. Native metadata reuses the scope's
existing cleanup array, rather than adding a registration object/function per
scope. This differs from the rejected compact-DOM-reaction experiment, which
discovered registration through a WeakMap per binding, constructed auxiliary scope
registrations and did not have a compiler-owned resource layout.

The Svelte reference remains the local read-only checkout at commit
0156c5fe38b53b72675e2a7f04535de015fdeed1 (5.57.3). Its create_effect/destroy_effect
in packages/svelte/src/internal/client/reactivity/effects.js make effect records,
dependency teardown and lifetime traversal explicit. Elnor instead experiments
with its compiler's fixed-region knowledge and preserves its own interleaved owner
stack, callback behavior and native listener contract. No Svelte code, flags or
effect-tree implementation is imported. Its performance-investigation guidance
informed one-candidate directed validation before broader measurement; no Svelte
build or branch-switching command ran.

## Correctness and retained failures

Baseline and final candidate each pass 14 new controls plus 168 existing controls
(182). These cover real compiler selection, independent frames across keyed moves
and recreation, input propagation, initial-read cancellation, queued error
isolation, staged-mount rollback, retained listeners, flat cleanup error order,
initialization, name hygiene, native/foreign owners and disposal. This is directed
validation, not a complete candidate gate or proof over every Surface program.

The first harness attempt had a JavaScript fixture syntax error; printing its log
also hit the launcher's Windows output encoding. The next fixture attempt used an
unsupported input arrow and failed in both variants; it was corrected to the
existing grammar. Both attempts are retained. The first candidate then failed an
existing own-only proxy test by reading a private symbol from the foreign owner.
The final revision uses the identity lookup above and passes that same test,
plus new proxy/callable and native-own-accessor controls.

One existing literal-caption test expected the old exact generated helper names.
The private copy changes exactly three expectations to the new exact names:
literalButton → planLiteralButton and two text → planText. Literal-versus-dynamic
selection and all runtime assertions remain. The original failed output and test
bytes are retained; this is reported as an adapted code-generation expectation,
not an unchanged passing suite. No public tests or resource limits were relaxed.

## Work eliminated and added

The diagnostic uses actual generated code and source counters in separate runtime
copies, outside all timing runs. It checks equivalent DOM/text, event delivery,
effect counts and held-listener cleanup in six scenarios. These are **source
construction/registration counts**, not V8 allocated bytes, retained heap savings
or CPU units. Shared functions can change engine optimization and retention.

| Scenario | Effect run functions A/B | Effect disposer functions A/B | Listener cleanup functions A/B | Candidate frames / slots |
|---|---:|---:|---:|---:|
| counter | 1 / 0 | 1 / 0 | 1 / 0 | 1 / 3 |
| form | 11 / 11 | 11 / 11 | 6 / 6 | 0 / 0 |
| composition | 3 / 2 | 3 / 2 | 1 / 0 | 2 / 3 |
| localized | 48 / 0 | 48 / 0 | 24 / 0 | 24 / 96 |
| list-100 | 201 / 1 | 201 / 1 | 100 / 0 | 100 / 400 |
| list-1000 | 2001 / 1 | 2001 / 1 | 1000 / 0 | 1000 / 4000 |

At 1,000 rows, 5,000 source function constructions disappear, while 1,000 frames
and values arrays are added. Each typed resource also occupies three stack entries
instead of one callback entry. The native identity registry adds its own work.
The structural form uses fallback in its initial view and saves no listed
functions. These costs and coverage gaps explain why construction counts alone
cannot decide integration; no exact allocation-byte saving was measured.

## Serial browser comparison

Tables use **ThreadTime milliseconds**, A baseline → B candidate (relative change),
two warmups and seven samples per action/label, isolated visible active pages and
alternating action/round order. AX stays enabled; no trace category is subtracted.
TaskDuration fields in legacy summaries are not substituted. These are descriptive
synthetic measurements, not wall latency, significance tests or a parity verdict.
List A/A compares candidate with itself; matrix A/A compares baseline with itself.
A/A values are not subtracted or converted into a universal noise margin.

The first list attempt timed out at 45 seconds in A/A 1,000 AB, with no result
file and zero owned descendants after cleanup. A single exact retry was declared;
it passed under the same limits and frozen fixtures. The first two completed
A/A 100 cases were retained without rerunning. Only the six missing cases ran in
the recovery, followed by matrix preflight and all 16 matrix comparisons. The
failed attempt remains separate. No measured sample was replaced or dropped.
The timeout's cause is unresolved; a successful retry does not explain it.

| Rows | Action | A/A AB | A/A BA | Change AB | Change BA |
|---:|---|---|---|---|---|
| 100 | create | 8.573 → 8.618 (+0.5%) | 8.605 → 8.707 (+1.2%) | 8.289 → 8.930 (+7.7%) | 8.674 → 9.655 (+11.3%) |
| 100 | update | 1.833 → 1.975 (+7.7%) | 1.962 → 2.005 (+2.2%) | 1.969 → 1.983 (+0.7%) | 1.879 → 2.009 (+6.9%) |
| 100 | select | 1.401 → 1.439 (+2.7%) | 1.568 → 1.410 (-10.1%) | 1.462 → 1.437 (-1.7%) | 1.334 → 1.427 (+7.0%) |
| 100 | append | 2.572 → 2.464 (-4.2%) | 2.469 → 2.579 (+4.5%) | 2.620 → 2.766 (+5.6%) | 2.395 → 2.403 (+0.3%) |
| 100 | swap | 2.071 → 1.781 (-14.0%) | 1.988 → 1.911 (-3.9%) | 1.926 → 1.897 (-1.5%) | 1.914 → 1.874 (-2.1%) |
| 100 | remove | 2.136 → 2.256 (+5.6%) | 2.215 → 2.273 (+2.6%) | 2.149 → 2.298 (+6.9%) | 2.087 → 2.024 (-3.0%) |
| 100 | clear | 2.533 → 2.233 (-11.8%) | 2.191 → 2.295 (+4.7%) | 2.306 → 2.253 (-2.3%) | 2.335 → 2.279 (-2.4%) |
| 1000 | create | 101.814 → 101.249 (-0.6%) | 105.280 → 107.792 (+2.4%) | 106.776 → 106.491 (-0.3%) | 101.207 → 105.477 (+4.2%) |
| 1000 | update | 9.007 → 8.564 (-4.9%) | 8.756 → 8.940 (+2.1%) | 8.764 → 9.406 (+7.3%) | 9.587 → 8.281 (-13.6%) |
| 1000 | select | 2.807 → 2.700 (-3.8%) | 3.059 → 2.787 (-8.9%) | 2.816 → 2.860 (+1.6%) | 3.115 → 2.882 (-7.5%) |
| 1000 | append | 11.984 → 12.047 (+0.5%) | 10.555 → 11.154 (+5.7%) | 11.093 → 11.024 (-0.6%) | 12.968 → 11.639 (-10.2%) |
| 1000 | swap | 3.833 → 3.697 (-3.5%) | 4.390 → 4.100 (-6.6%) | 4.265 → 4.157 (-2.5%) | 4.821 → 4.137 (-14.2%) |
| 1000 | remove | 7.400 → 7.430 (+0.4%) | 7.840 → 8.608 (+9.8%) | 7.742 → 7.660 (-1.1%) | 8.628 → 7.835 (-9.2%) |
| 1000 | clear | 14.021 → 13.477 (-3.9%) | 12.969 → 12.993 (+0.2%) | 13.304 → 12.739 (-4.2%) | 14.149 → 13.006 (-8.1%) |

| Workload | Action | A/A AB | A/A BA | Change AB | Change BA |
|---|---|---|---|---|---|
| counter | mount | 0.993 → 0.992 (-0.1%) | 1.054 → 1.028 (-2.5%) | 1.126 → 1.358 (+20.6%) | 1.027 → 1.052 (+2.4%) |
| counter | increment | 0.989 → 0.949 (-4.0%) | 1.015 → 1.136 (+11.9%) | 1.335 → 1.149 (-13.9%) | 1.018 → 1.107 (+8.7%) |
| counter | unmount | 0.853 → 0.878 (+2.9%) | 0.823 → 0.942 (+14.5%) | 0.943 → 1.130 (+19.8%) | 0.918 → 0.884 (-3.7%) |
| form | mount | 1.474 → 1.547 (+5.0%) | 1.568 → 1.479 (-5.7%) | 1.501 → 1.677 (+11.7%) | 1.922 → 1.771 (-7.9%) |
| form | edit-one | 1.634 → 1.785 (+9.2%) | 1.674 → 1.771 (+5.8%) | 1.691 → 1.729 (+2.2%) | 1.892 → 1.789 (-5.4%) |
| form | edit-all | 1.908 → 1.896 (-0.6%) | 1.813 → 1.833 (+1.1%) | 1.794 → 1.783 (-0.6%) | 1.889 → 1.907 (+1.0%) |
| form | invalid | 1.721 → 1.826 (+6.1%) | 1.757 → 1.663 (-5.4%) | 1.672 → 1.788 (+6.9%) | 1.754 → 1.797 (+2.5%) |
| form | recover | 1.573 → 1.454 (-7.6%) | 1.416 → 1.438 (+1.6%) | 1.416 → 1.489 (+5.2%) | 1.560 → 1.476 (-5.4%) |
| form | unmount | 0.975 → 0.995 (+2.1%) | 0.931 → 0.948 (+1.8%) | 0.900 → 0.924 (+2.7%) | 0.985 → 0.993 (+0.8%) |
| composition | mount | 1.180 → 1.168 (-1.0%) | 1.197 → 1.216 (+1.6%) | 1.279 → 1.255 (-1.9%) | 1.243 → 1.226 (-1.4%) |
| composition | relay | 1.075 → 1.028 (-4.4%) | 0.978 → 1.224 (+25.2%) | 1.366 → 1.032 (-24.5%) | 1.030 → 1.079 (+4.8%) |
| composition | unmount | 0.940 → 0.935 (-0.5%) | 0.911 → 0.915 (+0.4%) | 0.998 → 0.957 (-4.1%) | 0.899 → 0.943 (+4.9%) |
| localized | mount | 2.243 → 1.991 (-11.2%) | 2.345 → 2.075 (-11.5%) | 2.555 → 2.598 (+1.7%) | 2.191 → 2.117 (-3.4%) |
| localized | local-update | 1.223 → 1.262 (+3.2%) | 1.199 → 2.944 (+145.5%) | 1.221 → 1.499 (+22.8%) | 1.091 → 1.208 (+10.7%) |
| localized | unmount | 1.075 → 1.003 (-6.7%) | 1.279 → 1.181 (-7.7%) | 1.385 → 1.115 (-19.5%) | 1.135 → 1.132 (-0.3%) |

The private CSV/JSON additionally retain all 116 action contrasts, all seven raw
round values per label, lower/higher round counts and leave-one-round-out median
percentage ranges. Those ranges are sensitivity diagnostics, not confidence
intervals. Sequential dependence, order and small sample count limit inference.
No further confirmation was used to search for a favorable creation result.

## Lifecycle and delivery

The four application families each retain eight mount/action/unmount cycles per
variant: 64 cycles total. DOM node and native listener counts return exactly to
their own post-import baseline after each cycle. GC heap includes the harness and
browser state; these checks establish neither exact allocated bytes nor universal
absence of leaks. List allocation/retention and startup wall ranking are not
established by these cycles.

| Bundle | Raw bytes A/B | Gzip bytes A/B | Brotli bytes A/B |
|---|---:|---:|---:|
| elnor.mjs | 8050 / 9369 | 3260 / 3741 | 2944 / 3382 |
| counter-elnor.mjs | 3447 / 4369 | 1521 / 1896 | 1343 / 1694 |
| form-elnor.mjs | 6220 / 6963 | 2212 / 2444 | 1936 / 2182 |
| composition-elnor.mjs | 4973 / 6408 | 1877 / 2362 | 1654 / 2100 |
| localized-elnor.mjs | 4547 / 5473 | 1727 / 2099 | 1500 / 1859 |

## Audit and outcome

The review re-extracts raw ThreadTime samples and recomputes every median, paired
direction and LOO range. It checks exact source/fixture/site hashes, source-worker
snapshots, test counts, the helper-name adaptation, all supervisor limits, zero
owned descendants and serial job intervals. The complete failed evidence is
retained alongside successful cases. Browser Jobs keep CPU 10%, commit 768 MiB,
24 processes, host free >=4 GiB, kill-on-owner-close and 45 s wall/12 s idle;
Node/offline checks use 60 s wall/idle within the same resource envelope.

This version is rejected for production because the predicted creation benefit
does not appear consistently and delivery grows. The clear direction is useful
evidence for future lifetime work, but it does not offset creation costs by an
accepted product criterion. There is no whole-application aggregate score or
claim that Svelte parity has been achieved. Production compiler/runtime stay
byte-identical to [the frozen comparison](CURRENT-CORE-COMPARISON.md); the prior
610-test gate was not rerun for unchanged public source.

Private evidence under `elnor/.elnor/mvp/framework-comparison/compiled-lifetime-study/`:

- Final controls: `controls-87d7bbbb556449afbf71c87d9cc8985b`.
- Existing controls (code-generation expectation retained as failed): `existing-8ba3907685034af29b337ad5bb1f4428`.
- Exact planned-helper expectation completion: `existing-completion-16e805c27fe545bdb2b846998b4ab3b7`.
- Source counters: `counts-1d88c82e082c43a1b1a01ac9c3a875c5`.
- Initial interrupted trial: `trial-d1c1f7251fab4721b4800c8f6bdcf47c`.
- Completed recovery: `recovery-ff1c244dc75c4220855cc018d659c8de`.
- Exact report and independent recomputation: `review-2f0953e6a8b44f949f6a3db6e615431c`.

The two fixture/harness failures and earlier foreign-owner candidate are retained in the other `controls-*` and `existing-dd6a7832c1f14531b5d6ab123adb9f89` folders. Compiler and runtime source snapshots identify every tested revision.
