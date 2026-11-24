// The intent journal stores durable intents per account scope and reconciles
// them through an injected transport. These tests use an in-memory intent
// store, a lock manager that runs callbacks one at a time and a scripted
// transport.
import assert from 'node:assert/strict';
import test from 'node:test';
import {setImmediate as tick} from 'node:timers/promises';
import {createIntentJournal, indexedDbIntentStore} from '../src/intents.mjs';
import {memoryIntentStore, storedText} from './intent-store.mjs';

const durable = Symbol.for('elnor.durable');
const storageKey = 'elnor-intents:alice';

function serialLocks() {
  let tail = Promise.resolve();
  const names = [];
  return {
    names,
    request(name, callback) {
      names.push(name);
      const run = tail.then(() => callback({name, mode: 'exclusive'}));
      tail = run.catch(() => {});
      return run;
    }
  };
}

// Each answer is an answer object or a function of the request. When the
// script runs out, the request stays in flight until its signal aborts.
function scriptedTransport(answers = []) {
  const requests = [];
  return {
    requests,
    send(request) {
      requests.push(request);
      const next = answers.shift();
      if (next) return Promise.resolve(typeof next === 'function' ? next(request) : next);
      return new Promise((resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason)));
    }
  };
}

function keys() {
  let count = 0;
  return () => `k${++count}`;
}

function stored(storage) {
  const text = storedText(storage, storageKey);
  return text === null ? null : JSON.parse(text);
}

async function until(condition, message = 'condition') {
  for (let turn = 0; turn < 200; turn++) {
    if (condition()) return;
    await tick();
  }
  assert.fail(`timed out waiting for ${message}`);
}

async function settle() {
  for (let turn = 0; turn < 20; turn++) await tick();
}

function setup({storage = memoryIntentStore(), locks = serialLocks(), answers = [], transport = scriptedTransport(answers), version = 1, retry, start = true} = {}) {
  const journal = createIntentJournal({store: storage, scope: 'alice', locks, createKey: keys(), retry});
  const update = journal.operation('tasks.update', {version, transport});
  const hook = update[durable].journal;
  if (start) journal.start();
  return {storage, locks, transport, journal, update, hook};
}

function entry(fields = {}) {
  return {journal: 'task-edit', owner: '"t1"', member: 'save', operation: 'tasks.update', version: 1, params: [{title: 'Draft'}], input: {title: 'Draft'}, ...fields};
}

function record(fields = {}) {
  return {
    format: 1, journal: 'task-edit', scope: 'alice', owner: '"t1"', member: 'save', operation: 'tasks.update', version: 1,
    key: 'old', epoch: 'E1', params: [], input: {title: 'Old'}, state: 'pending', admittedBy: 'earlier-page', ...fields
  };
}

function seeded(records, epoch = 'E1') {
  return memoryIntentStore(new Map([[storageKey, JSON.stringify({format: 1, epoch, records})]]));
}

const applied = (epoch, result = {revision: 2}) => ({kind: 'applied', epoch, result});

test('an operation call returns an inert request and carries the internal hook', () => {
  const {update, transport} = setup({start: false});
  const request = update({title: 'Draft'});
  assert.deepEqual({...request}, {operation: 'tasks.update', input: {title: 'Draft'}});
  assert.equal(update[durable].name, 'tasks.update');
  assert.equal(update[durable].version, 1);
  assert.equal(typeof update[durable].journal.admit, 'function');
  assert.equal(transport.requests.length, 0);
});

test('a journal needs a scope and operations need a unique name, an integer version and a transport', () => {
  assert.throws(() => createIntentJournal({store: memoryIntentStore(), scope: '', locks: serialLocks()}), TypeError);
  const {journal, transport} = setup({start: false});
  assert.throws(() => journal.operation('tasks.update', {version: 1, transport}), /already registered/);
  assert.throws(() => journal.operation('tasks.remove', {version: '1', transport}), /integer version/);
  assert.throws(() => journal.operation('tasks.remove', {version: 1}), /needs a transport/);
});

test('admits once per owner and stores before sending', async () => {
  const {storage, locks, transport, hook} = setup({
    answers: [() => {
      const value = stored(storage);
      assert.equal(value?.records[0]?.key, 'k1', 'the record is stored before the transport sees it');
      return new Promise(() => {});
    }]
  });
  assert.equal(await hook.admit(entry()), 'k1');
  assert.equal(await hook.admit(entry({input: {title: 'Second'}})), undefined);
  await until(() => transport.requests.length === 1, 'the first request');
  const [request] = transport.requests;
  assert.deepEqual({...request, signal: undefined}, {operation: 'tasks.update', key: 'k1', scope: 'alice', epoch: null, input: {title: 'Draft'}, signal: undefined});
  assert.ok(request.signal instanceof AbortSignal);
  const value = stored(storage);
  assert.equal(value.format, 1);
  assert.equal(value.epoch, null);
  assert.equal(value.records.length, 1);
  const {admittedBy, ...fields} = value.records[0];
  assert.equal(typeof admittedBy, 'string');
  assert.deepEqual(fields, {
    format: 1, journal: 'task-edit', scope: 'alice', owner: '"t1"', member: 'save', operation: 'tasks.update', version: 1,
    key: 'k1', epoch: null, params: [{title: 'Draft'}], input: {title: 'Draft'}, state: 'pending'
  });
  assert.ok(locks.names.length > 0 && locks.names.every(name => name === storageKey));
  await settle();
  assert.equal(transport.requests.length, 1);
});

test('a stopped journal refuses admission, while one that never started admits', async () => {
  const {hook, journal, storage} = setup({start: false});
  assert.equal(await hook.admit(entry()), 'k1');
  journal.start();
  journal.stop();
  assert.equal(await hook.admit(entry({owner: '"t2"'})), undefined);
  assert.deepEqual(stored(storage).records.map(item => item.key), ['k1']);
  journal.start();
  assert.equal(await hook.admit(entry({owner: '"t2"'})), 'k2');
  journal.stop();
});

test('another owner or another journal is admitted while one owner is pending', async () => {
  const {hook, storage} = setup();
  assert.equal(await hook.admit(entry()), 'k1');
  assert.equal(await hook.admit(entry({owner: '"t2"'})), 'k2');
  assert.equal(await hook.admit(entry({journal: 'task-notes'})), 'k3');
  assert.equal(stored(storage).records.length, 3);
});

test('an unconsumed outcome does not hold back a new intent for its owner', async () => {
  const {storage, transport, hook} = setup({storage: seeded([]), answers: [applied('E1', {revision: 2}), applied('E1', {revision: 3})]});
  const views = [];
  hook.watch('task-edit', '"t1"', view => views.push(view && [view.id, view.state]));
  const first = await hook.admit(entry());
  await until(() => stored(storage).records[0].state === 'terminal', 'the first outcome');
  const second = await hook.admit(entry({input: {title: 'Again'}}));
  assert.equal(second, 'k2');
  assert.deepEqual(views.at(-1), ['k2', 'pending']);
  await until(() => stored(storage).records.every(item => item.state === 'terminal'), 'the second outcome');
  assert.deepEqual(transport.requests.map(request => request.key), ['k1', 'k2']);
  assert.deepEqual(views.at(-1), ['k1', 'terminal']);
  const delivered = [];
  assert.equal(await hook.consume(second, view => delivered.push(view.id)), false, 'a newer outcome waits for the older one');
  assert.equal(await hook.consume(first, view => delivered.push(view.id)), true);
  assert.deepEqual(views.at(-1), ['k2', 'terminal']);
  assert.equal(await hook.consume(second, view => delivered.push(view.outcome.result.revision)), true);
  assert.deepEqual(delivered, ['k1', 3]);
  assert.deepEqual(views, [null, ['k1', 'pending'], ['k1', 'terminal'], ['k2', 'pending'], ['k1', 'terminal'], ['k2', 'terminal'], null]);
});

test('a first request without epoch is stamped by the 412 and resent', async () => {
  const {storage, transport, hook} = setup({answers: [{kind: 'epoch', epoch: 'E1'}, applied('E1')]});
  await hook.admit(entry());
  await until(() => stored(storage).records[0].state === 'terminal', 'the outcome');
  assert.deepEqual(transport.requests.map(request => request.epoch), [null, 'E1']);
  assert.deepEqual(transport.requests.map(request => request.key), ['k1', 'k1']);
  const value = stored(storage);
  assert.equal(value.epoch, 'E1');
  assert.equal(value.records[0].epoch, 'E1');
  assert.deepEqual(value.records[0].outcome, {status: 'applied', result: {revision: 2}});
});

test('a new intent is stamped with the epoch the journal knows', async () => {
  const {storage, transport, hook} = setup({storage: seeded([], 'E7'), answers: [applied('E7')]});
  await hook.admit(entry());
  await until(() => stored(storage).records[0].state === 'terminal', 'the outcome');
  assert.deepEqual(transport.requests.map(request => request.epoch), ['E7']);
});

test('a stamp written by another tab while a request was out is not taken as a restamp', async () => {
  const storage = memoryIntentStore(), locks = serialLocks(), held = Promise.withResolvers();
  let unstamped = 0;
  const transport = scriptedTransport();
  transport.send = request => {
    transport.requests.push(request);
    if (request.epoch !== null) return Promise.resolve(applied('E1'));
    if (++unstamped === 2) held.resolve();
    return held.promise.then(() => ({kind: 'epoch', epoch: 'E1'}));
  };
  const first = setup({storage, locks, transport});
  const second = setup({storage, locks, transport, start: false});
  await first.hook.admit(entry());
  await until(() => transport.requests.length === 1, 'the first request');
  second.journal.start();
  await until(() => stored(storage).records[0].state !== 'pending', 'a decision');
  await settle();
  const [item] = stored(storage).records;
  assert.equal(item.state, 'terminal');
  assert.equal(item.reason, undefined);
  assert.deepEqual(transport.requests.slice(0, 2).map(request => request.epoch), [null, null]);
  assert.ok(transport.requests.length > 2);
  assert.ok(transport.requests.slice(2).every(request => request.epoch === 'E1'));
});

test('a stamped intent is never restamped', async () => {
  const {storage, transport, hook, journal} = setup({answers: [{kind: 'epoch', epoch: 'E1'}, {kind: 'epoch', epoch: 'E2'}]});
  await hook.admit(entry());
  await until(() => stored(storage).records[0].state === 'blocked', 'the block');
  await settle();
  assert.deepEqual(transport.requests.map(request => request.epoch), [null, 'E1']);
  const value = stored(storage);
  assert.equal(value.records[0].epoch, 'E1');
  assert.equal(value.records[0].reason, 'epoch');
  assert.equal(value.epoch, 'E2');
  assert.deepEqual((await journal.blocked()).map(item => item.reason), ['epoch']);
});

test('an answer under another epoch or a mismatch blocks the record', async () => {
  const {storage, hook} = setup({storage: seeded([]), answers: [applied('E2'), {kind: 'mismatch'}]});
  await hook.admit(entry());
  await hook.admit(entry({owner: '"t2"'}));
  await until(() => stored(storage).records.every(item => item.state === 'blocked'), 'both blocks');
  assert.deepEqual(stored(storage).records.map(item => [item.key, item.reason]), [['k1', 'mismatch'], ['k2', 'mismatch']]);
  assert.equal(stored(storage).records[0].outcome, undefined);
});

test('terminal answers become outcomes with late false in the admitting journal and true in another', async () => {
  const storage = seeded([]), locks = serialLocks();
  const first = setup({storage, locks, answers: [{kind: 'rejected', epoch: 'E1', reason: {kind: 'conflict'}}]});
  const id = await first.hook.admit(entry());
  await until(() => stored(storage).records[0].state === 'terminal', 'the outcome');
  const second = setup({storage, locks, start: false});
  assert.deepEqual((await first.journal.outcomes())[0].outcome, {status: 'rejected', reason: {kind: 'conflict'}, late: false});
  assert.deepEqual((await second.journal.outcomes())[0].outcome, {status: 'rejected', reason: {kind: 'conflict'}, late: true});
  const delivered = [];
  assert.equal(await second.hook.consume(id, view => delivered.push(view)), true);
  assert.deepEqual(delivered, [{id, member: 'save', state: 'terminal', outcome: {status: 'rejected', reason: {kind: 'conflict'}, late: true}, params: [{title: 'Draft'}]}]);
});

test('an unavailable answer is a terminal outcome', async () => {
  const {storage, journal, hook} = setup({storage: seeded([]), answers: [{kind: 'unavailable', epoch: 'E1'}]});
  await hook.admit(entry());
  await until(() => stored(storage).records[0].state === 'terminal', 'the outcome');
  assert.deepEqual((await journal.outcomes())[0].outcome, {status: 'unavailable', late: false});
});

test('consume delivers once and removes', async () => {
  const {storage, hook} = setup({storage: seeded([]), answers: [applied('E1')]});
  const id = await hook.admit(entry());
  await until(() => stored(storage).records[0].state === 'terminal', 'the outcome');
  let deliveries = 0;
  const results = await Promise.all([hook.consume(id, () => deliveries++), hook.consume(id, () => deliveries++)]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(deliveries, 1);
  assert.deepEqual(stored(storage).records, []);
});

test('consume refuses a pending record', async () => {
  const {hook, storage} = setup({start: false});
  const id = await hook.admit(entry());
  assert.equal(await hook.consume(id, () => assert.fail('a pending record is not delivered')), false);
  assert.equal(stored(storage).records.length, 1);
});

test('consume leaves the record when the consumer no longer accepts it under the lock', async () => {
  const {storage, hook} = setup({storage: seeded([]), answers: [applied('E1')]});
  const id = await hook.admit(entry());
  await until(() => stored(storage).records[0].state === 'terminal', 'the outcome');
  assert.equal(await hook.consume(id, () => assert.fail('a declined record is not delivered'), () => false), false);
  assert.equal(stored(storage).records[0].state, 'terminal');
  assert.equal(await hook.consume(id, () => {}, () => true), true);
  assert.deepEqual(stored(storage).records, []);
});

test('a throwing deliver still removes the record and rethrows', async () => {
  const {storage, hook} = setup({storage: seeded([]), answers: [applied('E1')]});
  const id = await hook.admit(entry());
  await until(() => stored(storage).records[0].state === 'terminal', 'the outcome');
  await assert.rejects(hook.consume(id, () => { throw new Error('handler failed'); }), /handler failed/);
  assert.deepEqual(stored(storage).records, []);
});

test('unconsumed outcomes stay until acknowledged', async () => {
  const storage = seeded([]), locks = serialLocks();
  const first = setup({storage, locks, answers: [applied('E1')]});
  const id = await first.hook.admit(entry());
  await until(() => stored(storage).records[0].state === 'terminal', 'the outcome');
  first.journal.stop();
  const later = setup({storage, locks});
  await settle();
  const [outcome] = await later.journal.outcomes();
  assert.deepEqual({...outcome, acknowledge: undefined}, {
    id, journal: 'task-edit', owner: '"t1"', member: 'save', operation: 'tasks.update', input: {title: 'Draft'},
    outcome: {status: 'applied', result: {revision: 2}, late: true}, acknowledge: undefined
  });
  assert.equal(later.transport.requests.length, 0);
  await outcome.acknowledge();
  assert.deepEqual(stored(storage).records, []);
  assert.deepEqual(await later.journal.outcomes(), []);
});

test('blocked records refuse admission until discarded', async () => {
  const {storage, hook, journal} = setup({storage: seeded([]), answers: [{kind: 'key-conflict'}]});
  await hook.admit(entry());
  await until(() => stored(storage).records[0].state === 'blocked', 'the block');
  const [blocked] = await journal.blocked();
  assert.deepEqual({...blocked, export: undefined, discard: undefined}, {
    id: 'k1', journal: 'task-edit', owner: '"t1"', member: 'save', operation: 'tasks.update', reason: 'key-conflict', export: undefined, discard: undefined
  });
  assert.equal(await hook.admit(entry()), undefined);
  assert.equal(blocked.export(), JSON.stringify(stored(storage).records[0]));
  await blocked.discard();
  assert.deepEqual(stored(storage).records, []);
  assert.equal(await hook.admit(entry()), 'k2');
});

test('scope refusal keeps the intent pending and pauses', async () => {
  const {storage, transport, hook, journal} = setup({storage: seeded([]), answers: [{kind: 'scope-refused'}, applied('E1'), applied('E1')]});
  const reasons = [];
  journal.onPaused(reason => reasons.push(reason));
  const unsubscribed = [];
  journal.onPaused(reason => unsubscribed.push(reason))();
  await hook.admit(entry());
  await until(() => reasons.length === 1, 'the pause');
  assert.deepEqual(reasons, ['scope-refused']);
  assert.deepEqual(unsubscribed, []);
  assert.equal(stored(storage).records[0].state, 'pending');
  assert.equal(await hook.admit(entry({owner: '"t2"'})), 'k2');
  await settle();
  assert.equal(transport.requests.length, 1);
  journal.start();
  await until(() => stored(storage).records.every(item => item.state === 'terminal'), 'both outcomes');
  assert.deepEqual(transport.requests.map(request => request.key).sort(), ['k1', 'k1', 'k2']);
});

test('retry backs off and stop aborts', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {transport, hook, journal} = setup({storage: seeded([]), answers: [{kind: 'retry'}, {kind: 'retry'}], retry: {firstMs: 1000, maxMs: 60000}});
  await hook.admit(entry());
  await until(() => transport.requests.length === 1, 'the first request');
  await settle();
  t.mock.timers.tick(999);
  await settle();
  assert.equal(transport.requests.length, 1);
  t.mock.timers.tick(1);
  await until(() => transport.requests.length === 2, 'the second request');
  await settle();
  t.mock.timers.tick(1999);
  await settle();
  assert.equal(transport.requests.length, 2);
  t.mock.timers.tick(1);
  await until(() => transport.requests.length === 3, 'the third request');
  const inFlight = transport.requests[2].signal;
  assert.equal(inFlight.aborted, false);
  journal.stop();
  assert.equal(inFlight.aborted, true);
  journal.stop();
  await settle();
  t.mock.timers.tick(120000);
  await settle();
  assert.equal(transport.requests.length, 3);
});

test('stop sends nothing more, even when an answer arrives after it', async () => {
  const late = Promise.withResolvers();
  const {storage, transport, hook, journal} = setup({answers: [() => late.promise, applied('E1')]});
  await hook.admit(entry());
  await until(() => transport.requests.length === 1, 'the first request');
  journal.stop();
  assert.equal(transport.requests[0].signal.aborted, true);
  // A transport that ignores the signal still answers; the stamp is kept.
  late.resolve({kind: 'epoch', epoch: 'E1'});
  await settle();
  assert.equal(transport.requests.length, 1);
  assert.equal(stored(storage).records[0].epoch, 'E1');
  journal.start();
  await until(() => stored(storage).records[0].state === 'terminal', 'the outcome');
  assert.deepEqual(transport.requests.map(request => request.epoch), [null, 'E1']);
});

test('backoff stops growing at maxMs', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {transport, hook} = setup({storage: seeded([]), answers: [{kind: 'retry'}, {kind: 'retry'}, {kind: 'retry'}], retry: {firstMs: 1000, maxMs: 1500}});
  await hook.admit(entry());
  await until(() => transport.requests.length === 1, 'the first request');
  await settle();
  t.mock.timers.tick(1000);
  await until(() => transport.requests.length === 2, 'the second request');
  await settle();
  t.mock.timers.tick(1499);
  await settle();
  assert.equal(transport.requests.length, 2);
  t.mock.timers.tick(1);
  await until(() => transport.requests.length === 3, 'the third request');
  await settle();
  t.mock.timers.tick(1500);
  await until(() => transport.requests.length === 4, 'the fourth request');
});

test('retry options merge with the defaults and must be positive and finite, with firstMs at most maxMs', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {transport, hook, journal} = setup({storage: seeded([]), answers: [{kind: 'retry'}, {kind: 'retry'}, applied('E1')], retry: {firstMs: 500}});
  await hook.admit(entry());
  await until(() => transport.requests.length === 1, 'the first request');
  await settle();
  t.mock.timers.tick(499);
  await settle();
  assert.equal(transport.requests.length, 1, 'a firstMs without maxMs keeps the default maxMs');
  t.mock.timers.tick(1);
  await until(() => transport.requests.length === 2, 'the second request');
  await settle();
  t.mock.timers.tick(999);
  await settle();
  assert.equal(transport.requests.length, 2);
  journal.stop();
  const create = retry => createIntentJournal({store: memoryIntentStore(), scope: 'alice', locks: serialLocks(), retry});
  for (const retry of [{firstMs: 0, maxMs: 0}, {firstMs: -1}, {firstMs: Number.NaN}, {maxMs: Infinity}, {firstMs: 2000, maxMs: 1000}, {maxMs: 500}, {firstMs: '10'}]) {
    assert.throws(() => create(retry), {name: 'TypeError', message: /retry needs positive finite firstMs and maxMs/}, JSON.stringify(retry));
  }
  assert.doesNotThrow(() => create({firstMs: 5, maxMs: 5}));
});

test('a transport failure or an unknown answer leaves the intent pending and retries', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {storage, transport, hook} = setup({
    storage: seeded([]),
    answers: [() => Promise.reject(new TypeError('network')), {kind: 'teapot'}, applied('E1')],
    retry: {firstMs: 10, maxMs: 100}
  });
  await hook.admit(entry());
  await until(() => transport.requests.length === 1, 'the first request');
  await settle();
  assert.equal(stored(storage).records[0].state, 'pending');
  t.mock.timers.tick(10);
  await until(() => transport.requests.length === 2, 'the second request');
  await settle();
  assert.equal(stored(storage).records[0].state, 'pending');
  t.mock.timers.tick(20);
  await until(() => stored(storage).records[0].state === 'terminal', 'the outcome');
});

test('start reconciles when the browser reports a connection', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const listeners = new Map();
  const original = {add: globalThis.addEventListener, remove: globalThis.removeEventListener};
  globalThis.addEventListener = (type, listener) => listeners.set(type, listener);
  globalThis.removeEventListener = (type, listener) => { if (listeners.get(type) === listener) listeners.delete(type); };
  t.after(() => {
    globalThis.addEventListener = original.add;
    globalThis.removeEventListener = original.remove;
  });
  const {storage, transport, hook, journal} = setup({storage: seeded([]), answers: [{kind: 'retry'}, applied('E1')], retry: {firstMs: 60000, maxMs: 60000}});
  await hook.admit(entry());
  await until(() => transport.requests.length === 1, 'the first request');
  await settle();
  listeners.get('online')({type: 'online'});
  await until(() => stored(storage).records[0].state === 'terminal', 'the outcome');
  assert.equal(transport.requests.length, 2);
  journal.stop();
  assert.equal(listeners.has('online'), false);
  assert.equal(listeners.has('storage'), false);
});

test('a reconciliation whose read fails is retried with the backoff while the journal runs', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const storage = seeded([record()]), read = storage.read;
  let failures = 2;
  storage.read = async key => {
    if (failures > 0) {
      failures--;
      throw new DOMException('Opening the intent database took too long', 'TimeoutError');
    }
    return read(key);
  };
  const {transport, journal} = setup({storage, answers: [applied('E1')], retry: {firstMs: 1000, maxMs: 60000}});
  await settle();
  assert.equal(failures, 1);
  t.mock.timers.tick(999);
  await settle();
  assert.equal(failures, 1);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(failures, 0, 'the second reconciliation reads again and fails');
  assert.equal(transport.requests.length, 0);
  t.mock.timers.tick(1999);
  await settle();
  assert.equal(transport.requests.length, 0, 'the backoff doubles');
  t.mock.timers.tick(1);
  await until(() => stored(storage).records[0].state === 'terminal', 'the outcome of the pending intent');
  assert.deepEqual(transport.requests.map(request => request.key), ['old']);

  // A journal that stops retries nothing more.
  const failing = seeded([record()]);
  let reads = 0;
  failing.read = async () => { reads++; throw new DOMException('Access is denied.', 'SecurityError'); };
  const other = setup({storage: failing, retry: {firstMs: 1000, maxMs: 60000}});
  await settle();
  assert.equal(reads, 1);
  other.journal.stop();
  t.mock.timers.tick(120000);
  await settle();
  assert.equal(reads, 1);
  journal.stop();
});

test('watch reports the record of one owner as it changes', async () => {
  const {storage, hook, journal} = setup({storage: seeded([]), answers: [applied('E1')], start: false});
  const views = [];
  const unwatch = hook.watch('task-edit', '"t1"', view => views.push(view && {state: view.state, status: view.outcome?.status}));
  const other = [];
  hook.watch('task-edit', '"t2"', view => other.push(view));
  const id = await hook.admit(entry());
  journal.start();
  await until(() => stored(storage).records[0].state === 'terminal', 'the outcome');
  await hook.consume(id, () => {});
  unwatch();
  await hook.admit(entry());
  assert.deepEqual(views, [null, {state: 'pending', status: undefined}, {state: 'terminal', status: 'applied'}, null]);
  assert.deepEqual(other, [null]);
});

test('a watch and a consume given the declared members skip outcomes of other members', async () => {
  const outcome = {status: 'applied', result: {revision: 1}};
  const storage = seeded([
    record({key: 'orphan', member: 'old', state: 'terminal', outcome}),
    record({key: 'mine', state: 'terminal', outcome}),
    record({key: 'other', owner: '"t2"', member: 'old', state: 'terminal', outcome})
  ]);
  const {hook, journal} = setup({storage, start: false});
  const members = new Set(['save']);
  const declared = [], all = [], none = [];
  hook.watch('task-edit', '"t1"', view => declared.push(view?.id ?? null), members);
  hook.watch('task-edit', '"t1"', view => all.push(view?.id ?? null));
  hook.watch('task-edit', '"t2"', view => none.push(view?.id ?? null), members);
  await settle();
  assert.deepEqual(declared, ['mine']);
  assert.deepEqual(all, ['orphan'], 'without members every outcome counts');
  assert.deepEqual(none, [null]);
  assert.equal(await hook.consume('mine', () => {}), false, 'without members the oldest outcome goes first');
  assert.equal(await hook.consume('orphan', () => assert.fail('an undeclared member is not delivered'), () => true, members), false);
  assert.equal(await hook.consume('mine', () => {}, () => true, members), true);
  await settle();
  assert.deepEqual(declared, ['mine', null]);
  assert.deepEqual((await journal.outcomes()).map(item => item.id), ['orphan', 'other']);
});

test("another store's committed write notifies a started journal", async () => {
  const values = new Map([[storageKey, JSON.stringify({format: 1, epoch: 'E1', records: []})]]);
  const observer = setup({storage: memoryIntentStore(values), start: false});
  // Another tab writes through its own store on the same database.
  const tab = memoryIntentStore(values);
  const views = [];
  observer.hook.watch('task-edit', '"t1"', view => views.push(view?.state ?? null));
  await settle();
  const journalOf = item => JSON.stringify({format: 1, epoch: 'E1', records: [item]});
  await tab.write(storageKey, journalOf(record({state: 'blocked', reason: 'mismatch'})));
  await settle();
  assert.deepEqual(views, [null], 'a journal that has not started does not follow other tabs');
  observer.journal.start();
  await tab.write('elnor-intents:bob', journalOf(record({scope: 'bob'})));
  await settle();
  assert.deepEqual(views, [null]);
  await tab.write(storageKey, journalOf(record({state: 'terminal', outcome: {status: 'applied', result: {revision: 2}}})));
  await settle();
  assert.deepEqual(views, [null, 'terminal']);
  observer.journal.stop();
  await tab.remove(storageKey);
  await settle();
  assert.deepEqual(views, [null, 'terminal'], 'a stopped journal does not follow other tabs');
});

test('a started journal sends a pending intent that another tab admitted and left', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const values = new Map([[storageKey, JSON.stringify({format: 1, epoch: 'E1', records: []})]]), locks = serialLocks();
  const retry = {firstMs: 1000, maxMs: 1000};
  const closing = setup({storage: memoryIntentStore(values), locks, retry});
  const other = setup({storage: memoryIntentStore(values), locks, retry, answers: [applied('E1')]});
  await settle();
  assert.equal(await closing.hook.admit(entry()), 'k1');
  await until(() => closing.transport.requests.length === 1, 'the request of the admitting tab');
  // The admitting tab closes with its request in flight.
  closing.journal.stop();
  await settle();
  assert.equal(other.transport.requests.length, 0, 'the other tab waits one backoff before it adopts the intent');
  t.mock.timers.tick(1000);
  await until(() => stored(closing.storage).records[0].state === 'terminal', 'the outcome sent by the other tab');
  assert.deepEqual(other.transport.requests.map(request => request.key), ['k1']);
  other.journal.stop();
});

test('an adoption that finds the record no longer pending leaves no backoff behind', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const values = new Map([[storageKey, JSON.stringify({format: 1, epoch: 'E1', records: []})]]);
  const observer = setup({storage: memoryIntentStore(values), retry: {firstMs: 1000, maxMs: 60000}, answers: [applied('E1')]});
  const tab = memoryIntentStore(values);
  const journalOf = records => JSON.stringify({format: 1, epoch: 'E1', records});
  await settle();
  // Another tab admits an intent, then removes it before the adoption fires.
  await tab.write(storageKey, journalOf([record()]));
  await settle();
  await tab.write(storageKey, journalOf([]));
  await settle();
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(observer.transport.requests.length, 0);
  // The same record is left pending again: it is adopted after the first step.
  await tab.write(storageKey, journalOf([record()]));
  await settle();
  t.mock.timers.tick(1000);
  await until(() => observer.transport.requests.length === 1, 'the adopted request after one first step');
  observer.journal.stop();
});

test('an older operation version blocks, while a newer version or an unknown operation waits for a release that knows it', async () => {
  const storage = seeded([
    record({key: 'a'}), record({key: 'b', owner: '"t2"', operation: 'tasks.archive'}), record({key: 'c', owner: '"t3"', version: 3})
  ]);
  const locks = serialLocks();
  const {transport, journal, hook} = setup({storage, locks, version: 2, start: false});
  assert.deepEqual(await journal.blocked(), []);
  const views = [];
  hook.watch('task-edit', '"t3"', view => views.push(view?.state ?? null));
  journal.start();
  await until(() => stored(storage).records[0].state === 'blocked', 'the block of the older version');
  await settle();
  assert.deepEqual(stored(storage).records.map(item => [item.key, item.state, item.reason]), [['a', 'blocked', 'version'], ['b', 'pending', undefined], ['c', 'pending', undefined]]);
  assert.deepEqual((await journal.blocked()).map(item => [item.id, item.reason]), [['a', 'version']]);
  assert.equal(transport.requests.length, 0, 'records this release cannot send are not sent');
  assert.deepEqual(views, ['pending']);
  assert.equal(await hook.admit(entry({owner: '"t3"', version: 2})), undefined, 'the waiting record still holds its owner');
  journal.stop();

  // A tab with the newer release sends what the older one left pending.
  const newer = createIntentJournal({store: storage, scope: 'alice', locks, createKey: keys()});
  const sent = scriptedTransport([applied('E1'), applied('E1')]);
  newer.operation('tasks.update', {version: 3, transport: sent});
  newer.operation('tasks.archive', {version: 1, transport: sent});
  newer.start();
  await until(() => stored(storage).records.filter(item => item.state === 'terminal').length === 2, 'the waiting records sent');
  await settle();
  assert.deepEqual(sent.requests.map(request => request.key).sort(), ['b', 'c']);
  assert.equal(stored(storage).records[0].state, 'blocked');
  newer.stop();
});

test('a decided answer makes a record terminal even if a newer release blocked it meanwhile', async () => {
  const values = new Map([[storageKey, JSON.stringify({format: 1, epoch: 'E1', records: []})]]), locks = serialLocks();
  const held = Promise.withResolvers();
  const older = setup({storage: memoryIntentStore(values), locks, answers: [() => held.promise]});
  assert.equal(await older.hook.admit(entry()), 'k1');
  await until(() => older.transport.requests.length === 1, 'the request of the older release');
  // A tab of the newer release starts while the request is out and blocks the record.
  const newer = setup({storage: memoryIntentStore(values), locks, version: 2});
  await until(() => stored(older.storage).records[0].state === 'blocked', 'the version block');
  assert.equal(stored(older.storage).records[0].reason, 'version');
  held.resolve(applied('E1', {revision: 5}));
  await until(() => stored(older.storage).records[0].state !== 'blocked', 'the decided outcome');
  const [item] = stored(older.storage).records;
  assert.equal(item.state, 'terminal');
  assert.equal(item.reason, undefined);
  assert.deepEqual(item.outcome, {status: 'applied', result: {revision: 5}});
  assert.deepEqual((await newer.journal.blocked()), []);
  assert.deepEqual((await newer.journal.outcomes()).map(outcome => outcome.outcome), [{status: 'applied', result: {revision: 5}, late: true}]);
  assert.equal(newer.transport.requests.length, 0);
  older.journal.stop();
  newer.journal.stop();
});

test('an answer that decides nothing leaves a record blocked by a newer release blocked', async () => {
  const values = new Map([[storageKey, JSON.stringify({format: 1, epoch: 'E1', records: []})]]), locks = serialLocks();
  const answers = [Promise.withResolvers(), Promise.withResolvers()];
  const older = setup({storage: memoryIntentStore(values), locks, answers: answers.map(answer => () => answer.promise)});
  await older.hook.admit(entry());
  await older.hook.admit(entry({owner: '"t2"'}));
  await until(() => older.transport.requests.length === 2, 'both requests');
  const newer = setup({storage: memoryIntentStore(values), locks, version: 2});
  await until(() => stored(older.storage).records.every(item => item.state === 'blocked'), 'the version blocks');
  answers[0].resolve({kind: 'retry'});
  answers[1].resolve(applied('E2'));
  await settle();
  assert.deepEqual(stored(older.storage).records.map(item => [item.key, item.state, item.reason]), [['k1', 'blocked', 'version'], ['k2', 'blocked', 'version']]);
  older.journal.stop();
  newer.journal.stop();
});

test('forget removes every record of the scope and other tabs see it', async () => {
  const values = new Map([[storageKey, JSON.stringify({format: 1, epoch: 'E1', records: [
    record({key: 'p'}), record({key: 't', owner: '"t2"', state: 'terminal', outcome: {status: 'applied', result: 1}}),
    record({key: 'b', owner: '"t3"', state: 'blocked', reason: 'mismatch'})
  ]})], ['elnor-intents:bob', 'kept']]);
  const locks = serialLocks();
  const leaving = setup({storage: memoryIntentStore(values), locks, start: false});
  const other = setup({storage: memoryIntentStore(values), locks, start: false});
  const views = [];
  other.hook.watch('task-edit', '"t1"', view => views.push(view?.state ?? null));
  other.journal.start();
  await settle();
  assert.deepEqual(views, ['pending']);
  locks.names.length = 0;
  await leaving.journal.forget();
  assert.deepEqual(locks.names, [storageKey], 'the removal runs under the scope lock');
  assert.equal(values.has(storageKey), false);
  assert.equal(values.get('elnor-intents:bob'), 'kept', 'other scopes are kept');
  await settle();
  assert.deepEqual(views, ['pending', null], 'a started journal in another tab sees the removal');
  assert.deepEqual(await other.journal.outcomes(), []);
  assert.deepEqual(await other.journal.blocked(), []);
  assert.equal(await other.hook.admit(entry()), 'k1');
  other.journal.stop();
});

test('admission refuses an operation version the journal does not know', async () => {
  const {hook, storage} = setup({start: false});
  assert.equal(await hook.admit(entry({version: 2})), undefined);
  assert.equal(await hook.admit(entry({operation: 'tasks.archive'})), undefined);
  assert.equal(stored(storage), null);
});

test('corrupt records block and are never removed silently', async () => {
  const garbage = {nonsense: true}, unkeyed = {journal: 'task-edit', owner: '"t3"', state: 'pending'};
  const storage = seeded([garbage, unkeyed]);
  const {hook, journal, transport} = setup({storage, answers: [applied('E1')]});
  assert.deepEqual((await journal.blocked()).map(item => item.reason), ['corrupt', 'corrupt']);
  assert.equal((await journal.blocked())[0].export(), JSON.stringify(garbage));
  assert.equal(await hook.admit(entry({owner: '"t3"'})), undefined);
  assert.equal(await hook.admit(entry()), 'k1');
  await until(() => stored(storage).records.some(item => item.state === 'terminal'), 'the outcome');
  assert.deepEqual(stored(storage).records.slice(0, 2), [garbage, unkeyed]);
  assert.equal(transport.requests.length, 1);
  await (await journal.blocked())[1].discard();
  assert.deepEqual(stored(storage).records.slice(0, 1), [garbage]);
  assert.equal(await hook.admit(entry({owner: '"t3"'})), 'k2');
});

test('unreadable storage blocks every admission until discarded', async () => {
  const storage = memoryIntentStore(new Map([[storageKey, 'not json']]));
  const {hook, journal} = setup({storage});
  const [blocked] = await journal.blocked();
  assert.equal(blocked.reason, 'corrupt');
  assert.equal(blocked.export(), 'not json');
  assert.equal(await hook.admit(entry()), undefined);
  assert.equal(storedText(storage, storageKey), 'not json');
  await blocked.discard();
  assert.equal(storedText(storage, storageKey), null);
  assert.equal(await hook.admit(entry()), 'k1');
});

test('a write that rejects refuses admission, sends nothing and is reported', async t => {
  const reported = [], previous = globalThis.reportError;
  globalThis.reportError = error => { reported.push(error); };
  t.after(() => { globalThis.reportError = previous; });
  const storage = memoryIntentStore();
  storage.failWrites = true;
  const {transport, hook} = setup({storage});
  const views = [];
  hook.watch('task-edit', '"t1"', view => views.push(view));
  assert.equal(await hook.admit(entry()), undefined);
  await settle();
  assert.equal(transport.requests.length, 0);
  assert.deepEqual(views, [null]);
  assert.equal(stored(storage), null);
  assert.deepEqual(reported.map(error => error.name), ['QuotaExceededError']);
  const unreadable = memoryIntentStore();
  unreadable.read = async () => { throw new DOMException('Access is denied.', 'SecurityError'); };
  const other = setup({storage: unreadable});
  // A running journal retries its failed reconciliation.
  t.after(() => other.journal.stop());
  const seen = [];
  other.hook.watch('task-edit', '"t1"', view => seen.push(view));
  assert.equal(await other.hook.admit(entry()), undefined);
  await settle();
  assert.equal(other.transport.requests.length, 0);
  assert.deepEqual(seen, [], 'a failed read is not shown as an owner without records');
  assert.deepEqual(reported.map(error => error.name), ['QuotaExceededError', 'SecurityError']);
  // A refusal because the owner is pending is not a failure.
  storage.failWrites = false;
  assert.equal(typeof await hook.admit(entry()), 'string');
  assert.equal(await hook.admit(entry()), undefined);
  assert.equal(reported.length, 2);
  // The host's reads reject instead of reporting an empty journal.
  await assert.rejects(other.journal.outcomes(), {name: 'SecurityError'});
  await assert.rejects(other.journal.blocked(), {name: 'SecurityError'});
});

test('inputs that are not plain JSON values are refused', async () => {
  const {storage, transport, hook} = setup();
  class Edit { constructor() { this.title = 'Draft'; } }
  const cyclic = {};
  cyclic.self = cyclic;
  for (const input of [{a: undefined}, Number.NaN, new Date(), undefined, [1, , 3], new Map(), new Edit(), -0, 10n, cyclic, {[Symbol('tag')]: 1}]) {
    assert.equal(await hook.admit(entry({input})), undefined, `refuses ${String(typeof input === 'object' ? input?.constructor?.name : input)}`);
  }
  assert.equal(await hook.admit(entry({params: [new Date()]})), undefined);
  assert.equal(stored(storage), null);
  await settle();
  assert.equal(transport.requests.length, 0);
  assert.equal(await hook.admit(entry({input: {title: 'Draft', tags: ['a'], done: false, due: null, size: 1.5, notes: Object.assign(Object.create(null), {a: 1})}})), 'k1');
});

test('a journal without Web Locks throws', t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {value: {}, configurable: true, writable: true});
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  });
  assert.throws(() => createIntentJournal({store: memoryIntentStore(), scope: 'alice'}), {name: 'TypeError', message: 'Durable intents need the Web Locks API'});
  assert.throws(() => createIntentJournal({store: memoryIntentStore(), scope: 'alice', locks: null}), {name: 'TypeError', message: 'Durable intents need the Web Locks API'});
});

test('indexedDbIntentStore throws without IndexedDB', () => {
  assert.equal(globalThis.indexedDB, undefined, 'Node.js has no IndexedDB');
  const missing = {name: 'TypeError', message: 'Durable intents need IndexedDB'};
  assert.throws(() => indexedDbIntentStore(), missing);
  assert.throws(() => indexedDbIntentStore({indexedDB: null}), missing);
  // A journal without a store uses the IndexedDB store.
  assert.throws(() => createIntentJournal({scope: 'alice', locks: serialLocks()}), missing);
});

// A minimal IDBFactory: requests and transactions finish on a later turn, and
// a transaction's changes are applied just before its complete event.
function fakeIndexedDB() {
  const databases = new Map(), opened = [], completed = [], requested = [], held = [];
  const later = callback => setImmediate(callback);
  const factory = {
    opened, completed, requested,
    // When set, the next transaction aborts with this error and changes nothing.
    abortNext: null,
    // When set, an open waits for release(); blockNext also fires its blocked event.
    holdOpen: false,
    blockNext: false,
    closed: 0,
    release() { for (const finish of held.splice(0)) later(finish); },
    contents: (name, store) => [...databases.get(name).stores.get(store)],
    open(name, version) {
      opened.push([name, version]);
      const request = {};
      const finish = () => {
        const upgrade = !databases.has(name);
        if (upgrade) databases.set(name, {version, stores: new Map()});
        const database = databases.get(name);
        request.result = {
          createObjectStore(store) { database.stores.set(store, new Map()); },
          transaction(store, mode, options) {
            requested.push([mode, options?.durability]);
            const data = database.stores.get(store), steps = [], transaction = {error: null};
            const queue = step => { const result = {}; steps.push(() => { result.result = step(); }); return result; };
            transaction.objectStore = () => ({
              get: key => queue(() => data.get(key)),
              put: (value, key) => queue(() => { data.set(key, value); }),
              delete: key => queue(() => { data.delete(key); })
            });
            later(() => {
              if (factory.abortNext) {
                transaction.error = factory.abortNext;
                factory.abortNext = null;
                return transaction.onabort();
              }
              for (const step of steps) step();
              completed.push(mode);
              transaction.oncomplete();
            });
            return transaction;
          },
          close() { factory.closed++; }
        };
        if (upgrade) request.onupgradeneeded();
        request.onsuccess();
      };
      if (factory.blockNext) {
        factory.blockNext = false;
        held.push(finish);
        later(() => request.onblocked?.());
      } else if (factory.holdOpen) held.push(finish);
      else later(finish);
      return request;
    }
  };
  return factory;
}

test('opening the IndexedDB store rejects when it is blocked or takes 10 seconds', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const factory = fakeIndexedDB();
  factory.holdOpen = true;
  const store = indexedDbIntentStore({indexedDB: factory, channel: () => assert.fail('reads open no channel')});
  let outcome = 'waiting';
  const first = store.read(storageKey).then(() => { outcome = 'resolved'; }, error => { outcome = error.name; });
  await settle();
  t.mock.timers.tick(9999);
  await settle();
  assert.equal(outcome, 'waiting');
  t.mock.timers.tick(1);
  await first;
  assert.equal(outcome, 'TimeoutError');
  // The connection that opens after the timeout is closed, and the next call opens again.
  factory.release();
  await settle();
  assert.equal(factory.closed, 1);
  factory.holdOpen = false;
  assert.equal(await store.read(storageKey), null);
  assert.equal(factory.opened.length, 2);

  const other = indexedDbIntentStore({indexedDB: factory, channel: () => assert.fail('reads open no channel')});
  factory.blockNext = true;
  await assert.rejects(other.read(storageKey), {name: 'InvalidStateError', message: /blocked/});
  factory.release();
  await settle();
  assert.equal(factory.closed, 2);
  assert.equal(await other.read(storageKey), null);
});

test('the IndexedDB store commits before it resolves and tells the other tabs', async t => {
  const factory = fakeIndexedDB(), channels = [];
  const channel = () => {
    const opened = new BroadcastChannel('elnor-intents-test'), close = opened.close.bind(opened);
    const entry = {closed: false, close};
    channels.push(entry);
    opened.close = () => { entry.closed = true; close(); };
    return opened;
  };
  // An open channel keeps Node.js running, so a failing test closes them all.
  t.after(() => { for (const entry of channels) entry.close(); });
  const one = indexedDbIntentStore({indexedDB: factory, channel});
  const two = indexedDbIntentStore({indexedDB: factory, channel});
  const heard = [];
  const unsubscribe = two.subscribe(key => heard.push(key));
  assert.equal(await one.read(storageKey), null);
  assert.deepEqual(factory.opened, [['elnor-intents', 1]]);
  await one.write(storageKey, 'text');
  assert.deepEqual(factory.contents('elnor-intents', 'journals'), [[storageKey, 'text']], 'the write resolves after it is committed');
  assert.equal(await two.read(storageKey), 'text');
  await until(() => heard.length === 1, 'the notice of the write');
  await one.remove(storageKey);
  assert.deepEqual(factory.contents('elnor-intents', 'journals'), []);
  assert.equal(await two.read(storageKey), null);
  await until(() => heard.length === 2, 'the notice of the removal');
  assert.deepEqual(heard, [storageKey, storageKey]);
  assert.deepEqual(factory.completed, ['readonly', 'readwrite', 'readonly', 'readwrite', 'readonly']);
  // Writes and removals are flushed to disk before they complete.
  assert.deepEqual(factory.requested, [['readonly', undefined], ['readwrite', 'strict'], ['readonly', undefined], ['readwrite', 'strict'], ['readonly', undefined]]);
  factory.abortNext = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  await assert.rejects(one.write(storageKey, 'lost'), {name: 'QuotaExceededError'});
  assert.deepEqual(factory.contents('elnor-intents', 'journals'), []);
  await settle();
  assert.equal(heard.length, 2, 'an aborted write tells no one');
  unsubscribe();
  assert.ok(channels.every(entry => entry.closed), 'every channel is closed once nobody listens');
});
