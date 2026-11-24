// The runtime of durable action groups. The compiler emits this module next
// to runtime.mjs only when a component of the graph has a durable group, so
// other applications do not load it.
import {cell, effect, runRegionUntracked} from './runtime.mjs';

// A durable group admits intents into the journal its members' operations
// carry under Symbol.for('elnor.durable'), so the runtime never imports the
// journal module. The journal, not the component, owns each intent: an owner
// change or disposal only stops watching it, and a later mount with the same
// owner observes it. The owner is stored with every intent as JSON.
const durableHook = Symbol.for('elnor.durable');
const blockedAction = Object.freeze({status:'blocked'});
const durableStatuses = {applied:'success', rejected:'rejected', unavailable:'unconfirmed'};

// runRegionUntracked runs a function without tracking the cells it reads.
const untracked = runRegionUntracked;
const idleAction = Object.freeze({status:'idle'});
const pendingAction = Object.freeze({status:'pending'});

function reportActionFailure(error) {
  if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
  else queueMicrotask(() => { throw error; });
}

function durableOutcome(view) {
  if (view.state === 'pending') return pendingAction;
  if (view.state === 'blocked') return blockedAction;
  const {status, result, reason} = view.outcome;
  return Object.freeze({status:durableStatuses[status], ...(status === 'applied' && {result}), ...(status === 'rejected' && {reason})});
}

export function createDurableGroup(journal, readOwner, ownerScope) {
  const members = new Map();
  // What the members show: the record the journal reports for the current
  // owner, or the last terminal one after it was consumed.
  const shown = cell(null);
  let last = null;
  // Calls waiting for the outcome of the intent they admitted, by record id.
  const waiting = new Map();
  const consuming = new Set();
  let hook, owner, unwatch, started = false;

  const ownerKey = () => JSON.stringify(readOwner());
  const show = entry => { last = entry; shown.value = entry; };
  const settle = (id, value) => {
    const resolve = waiting.get(id);
    waiting.delete(id);
    resolve?.(value);
  };
  const settleAll = () => {
    for (const resolve of waiting.values()) resolve(undefined);
    waiting.clear();
  };

  function observe(key, view) {
    if (key !== owner) return;
    if (view) show({owner:key, id:view.id, member:view.member, state:view.state, outcome:durableOutcome(view)});
    else if (last?.state !== 'terminal') show(null);
    // No record is left for the owner: every outcome was handled somewhere,
    // and a removal by this instance settles its call once consume returns.
    if (!view) {
      for (const id of waiting.keys()) if (!consuming.has(id)) settle(id, undefined);
    } else if (view.state === 'blocked') settle(view.id, undefined);
    else if (view.state === 'terminal') consume(key, view);
  }

  // The first instance to take the record's lock resumes the body and removes
  // the record; the others only show the outcome. A body that throws still
  // consumes the outcome, so it is reported once and not resumed on every
  // load. If the removal fails after the body ran, a later page resumes it
  // again.
  function consume(key, view) {
    const member = members.get(view.member);
    // A renamed member has no consumer here; the host sees the outcome.
    if (!member || consuming.has(view.id)) return;
    consuming.add(view.id);
    let ran = false, value, failure;
    const deliver = record => {
      ran = true;
      try { value = untracked(() => member.resume(record.outcome, ...record.params)); }
      catch (error) { failure = {error}; }
    };
    // An instance whose owner changed or that was disposed while it waited for
    // the lock leaves the outcome to the next one.
    const accept = () => !ownerScope.disposed && untracked(ownerKey) === key;
    hook.consume(view.id, deliver, accept).then(consumed => {
      if (failure) reportActionFailure(failure.error);
      settle(view.id, consumed ? value : undefined);
    }, error => {
      if (failure) reportActionFailure(failure.error);
      reportActionFailure(error);
      settle(view.id, ran ? value : undefined);
    }).finally(() => { consuming.delete(view.id); });
  }

  function follow(next) {
    if (next === owner) return;
    unwatch?.();
    unwatch = undefined;
    owner = next;
    settleAll();
    show(null);
    if (next !== undefined) unwatch = hook.watch(journal, next, view => observe(next, view));
  }

  // Watching starts after the component's state exists: on the first read of
  // a status, the first call, or the microtask after the group is created.
  function start() {
    if (started || ownerScope.disposed || !hook) return;
    started = true;
    effect(() => {
      const next = ownerKey();
      untracked(() => follow(next));
    }, ownerScope);
  }
  queueMicrotask(start);

  ownerScope.own(() => {
    unwatch?.();
    unwatch = undefined;
    owner = undefined;
    settleAll();
  });

  const visible = name => {
    start();
    const entry = shown.value;
    // A corrupt record names no member and blocks them all.
    if (!entry || (entry.member !== name && entry.member !== '') || entry.owner !== ownerKey()) return idleAction;
    return entry.outcome;
  };

  function member(name, readOperation, request, resume) {
    const operation = untracked(readOperation)?.[durableHook];
    if (!operation?.journal) throw new TypeError(`The durable member '${name}' must call an operation created with journal.operation`);
    if (hook && operation.journal !== hook) throw new TypeError(`The members of the durable group '${journal}' must call operations of one journal`);
    hook = operation.journal;
    members.set(name, {resume});

    // Resolves with the body's return value when this instance consumes the
    // outcome in this page, and with undefined when the call is refused or the
    // outcome is handled elsewhere.
    async function run(...params) {
      if (ownerScope.disposed) return;
      start();
      const key = untracked(ownerKey);
      const requested = untracked(() => request(...params));
      if (requested?.operation !== operation.name) throw new TypeError(`The durable member '${name}' must call the operation it was mounted with`);
      const id = await hook.admit({journal, owner:key, member:name, operation:operation.name, version:operation.version, params, input:requested.input});
      if (id === undefined || ownerScope.disposed || key !== owner) return;
      // The outcome needs at least one more lock grant, which comes after
      // this continuation, so the call is waiting before it can arrive.
      return new Promise(resolve => { waiting.set(id, resolve); });
    }

    return Object.defineProperties(run, {
      name:{value:name, configurable:true},
      status:{get:()=>visible(name).status},
      pending:{get:()=>visible(name).status === 'pending'},
      result:{get:()=>visible(name).result},
      reason:{get:()=>visible(name).reason}
    });
  }

  return {member, get pending() {
    start();
    const entry = shown.value;
    return !!entry && entry.state === 'pending' && entry.owner === ownerKey();
  }};
}
