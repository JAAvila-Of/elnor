# Elnor vision: declarative work

React made the interface declarative: the UI is a function of state. Elnor
aims to make the *work* declarative too. In Elnor, every asynchronous
operation is part of the language. It has an **owner**, a **policy**, a
**lifecycle** and a **destination**.

Most defects in real applications do not come from rendering. They come from
work that the application has to coordinate by hand:

- an older response overwrites a newer one;
- a form is submitted twice, or an autosave sends one request per keystroke;
- work keeps running after the user leaves the screen or switches context;
- a cleanup is cut short, so a connection or a lock stays open;
- a write is lost on reload, or a retry repeats it;
- data crosses the client and server boundary without types or validation.

Mainstream UI frameworks leave these to application code or to separate
libraries. Elnor addresses them in the language, through three parts.

## 1. Structured concurrency by data

Work belongs to a piece of data, such as `customer.id`, not only to the
lifetime of a view. When that data changes or the component unmounts, the
work is retired. Its request is aborted, its writes to component state are
discarded and its cleanup still completes. A policy declared once on the
group states what happens to concurrent calls.

```elnor
action group search(query) latest debounce 300ms timeout 10s

action async find() in search {
  const response = await fetch(`/api/search?q=${query}`, {signal: search.signal});
  return await response.json();
}
```

This part exists. [Action groups](mvp/ASYNC-POLICY.md#action-groups) provide
owners as expressions or lists, the `single-flight`, `latest`, `keep-latest`
and `queue` policies, `timeout` and `debounce`, an `AbortSignal` per
invocation, cleanup that retirement never interrupts, typed `status`,
`result` and `error`, and editor warnings for owners compared by identity.

## 2. Durable intents

The UI does not send requests; it records intents. An intent has an identity,
survives a reload or a crash, is retried without being duplicated and is
reconciled with the server's authoritative state.

The building blocks exist as application patterns: the
[recovery journal](mvp/RECOVERY-JOURNAL.md), which retries the same intent only
after confirming that it was not applied, and versioned writes in the
[persistent Task desk](mvp/PERSISTENT-TASK-DESK.md). The
[durable intents design](mvp/DURABLE-INTENTS-DESIGN.md) turns them into a
`durable` action group policy and defines the protocol that both the client
and a future server half speak. The client half is implemented: a
[durable group](mvp/ASYNC-POLICY.md#durable-intents) stores each call in a
journal, sends it until the provider decides and resumes the body with the
outcome after a reload. [DurableSave](../examples/durable-save/README.md)
rewrites the recovery example in 67 nonblank lines instead of 196. Node.js
tests cover it against a reference provider, and the
[acceptance in headless Edge](mvp/DURABLE-INTENTS-DESIGN.md#results) passed
all 26 checks in 5 consecutive runs at commit `c5ae4c2`. The server
half waits for the server actions of CAP-08.

## 3. Verified guarantees

The compiler checks the properties that the first two parts make explicit, in
the way Elm rules out runtime exceptions:

- a write to state after an `await`, outside a group, may apply a stale result;
- async work without an owner may outlive its component;
- a write that should survive a reload is not durable.

Diagnostics are warnings unless a construct is unsound, and they suggest the
declaration that fixes the problem. Three exist: an action group owner that
is an object is compared by identity; a write to state after an `await`
outside a group may apply a stale result; and an interval, listener,
subscription, connection or observer that nothing releases
[outlives its component](mvp/COMPONENT-DISPOSAL.md#work-that-outlives-the-component).
The stale write warning found two real races in the repository's own
`UserEditor` example.

## What Elnor does not compete on

Raw rendering speed is not Elnor's differentiator. The
[performance target](mvp/PERFORMANCE-TARGET.md) still requires at least parity
with Svelte and React, and outperforming them remains an ambition, but the
difference Elnor offers lies in the guarantees above. Rendering is a base that
has to be correct, small and fast.

The general renderer is the default rendering path. Measurements of the
region backend found no CPU advantage over it in any measured workload,
including lists of 1,000 rows, while its runtime is 2.5 to 3 times larger.
Before the switch, the general renderer
[passed the fixed Svelte parity matrix](mvp/GENERAL-RENDERER-DEFAULT.md) in two
cohorts. The region backend remains an experiment. Techniques that prove
useful, such as cloning templates for static structure, move to the general
renderer one at a time and with measurements. Its static analysis can also feed
the verified guarantees, as it already does for the experimental hot update.

## Principles

- DX comes first, followed by security and performance.
- Correctness over cost applies to every pillar: the correct solution wins
  over the cheaper one, and a known divergence is fixed, not documented.
- Every guarantee needs a test that would fail without it.

## Next steps

1. More compiler diagnostics for the guarantees in part 3, after the stale
   write and unowned work warnings.
2. The client half of [durable intents](mvp/DURABLE-INTENTS-DESIGN.md),
   tested against the reference provider.
