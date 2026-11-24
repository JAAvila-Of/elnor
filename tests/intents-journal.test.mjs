// The intent journal stores durable intents per account scope and reconciles
// them through an injected transport. These tests use an in-memory storage, a
// lock manager that runs callbacks one at a time and a scripted transport.
import assert from 'node:assert/strict';
import test from 'node:test';
import {setImmediate as tick} from 'node:timers/promises';
import {createIntentJournal} from '../src/intents.mjs';

const durable = Symbol.for('elnor.durable');
const storageKey = 'elnor-intents:alice';

function memoryStorage(items = {}) {
  const values = new Map(Object.entries(items));
  return {
    values,
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: key => { values.delete(key); }
  };
}

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
  const text = storage.getItem(storageKey);
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

function setup({storage = memoryStorage(), locks = serialLocks(), answers = [], version = 1, retry, start = true} = {}) {
  const transport = scriptedTransport(answers);
  const journal = createIntentJournal({storage, scope: 'alice', locks, createKey: keys(), retry});
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
  return memoryStorage({[storageKey]: JSON.stringify({format: 1, epoch, records})});
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
  assert.throws(() => createIntentJournal({storage: memoryStorage(), scope: '', locks: serialLocks()}), TypeError);
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

test('another owner or another journal is admitted while one owner is pending', async () => {
  const {hook, storage} = setup();
  assert.equal(await hook.admit(entry()), 'k1');
  assert.equal(await hook.admit(entry({owner: '"t2"'})), 'k2');
  assert.equal(await hook.admit(entry({journal: 'task-notes'})), 'k3');
  assert.equal(stored(storage).records.length, 3);
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
  assert.deepEqual(journal.blocked().map(item => item.reason), ['epoch']);
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
  assert.deepEqual(first.journal.outcomes()[0].outcome, {status: 'rejected', reason: {kind: 'conflict'}, late: false});
  assert.deepEqual(second.journal.outcomes()[0].outcome, {status: 'rejected', reason: {kind: 'conflict'}, late: true});
  const delivered = [];
  assert.equal(await second.hook.consume(id, view => delivered.push(view)), true);
  assert.deepEqual(delivered, [{id, member: 'save', state: 'terminal', outcome: {status: 'rejected', reason: {kind: 'conflict'}, late: true}, params: [{title: 'Draft'}]}]);
});

test('an unavailable answer is a terminal outcome', async () => {
  const {storage, journal, hook} = setup({storage: seeded([]), answers: [{kind: 'unavailable', epoch: 'E1'}]});
  await hook.admit(entry());
  await until(() => stored(storage).records[0].state === 'terminal', 'the outcome');
  assert.deepEqual(journal.outcomes()[0].outcome, {status: 'unavailable', late: false});
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
  const [outcome] = later.journal.outcomes();
  assert.deepEqual({...outcome, acknowledge: undefined}, {
    id, journal: 'task-edit', owner: '"t1"', member: 'save', operation: 'tasks.update', input: {title: 'Draft'},
    outcome: {status: 'applied', result: {revision: 2}, late: true}, acknowledge: undefined
  });
  assert.equal(later.transport.requests.length, 0);
  await outcome.acknowledge();
  assert.deepEqual(stored(storage).records, []);
  assert.deepEqual(later.journal.outcomes(), []);
});

test('blocked records refuse admission until discarded', async () => {
  const {storage, hook, journal} = setup({storage: seeded([]), answers: [{kind: 'key-conflict'}]});
  await hook.admit(entry());
  await until(() => stored(storage).records[0].state === 'blocked', 'the block');
  const [blocked] = journal.blocked();
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

test('watch follows writes made by another tab', async t => {
  const listeners = new Map();
  const original = {add: globalThis.addEventListener, remove: globalThis.removeEventListener};
  globalThis.addEventListener = (type, listener) => listeners.set(type, listener);
  globalThis.removeEventListener = (type, listener) => { if (listeners.get(type) === listener) listeners.delete(type); };
  t.after(() => {
    globalThis.addEventListener = original.add;
    globalThis.removeEventListener = original.remove;
  });
  const storage = seeded([]);
  const observer = setup({storage});
  const views = [];
  observer.hook.watch('task-edit', '"t1"', view => views.push(view?.state ?? null));
  // Another tab writes the same storage; this page only hears the storage event.
  storage.setItem(storageKey, JSON.stringify({format: 1, epoch: 'E1', records: [record()]}));
  listeners.get('storage')({type: 'storage', key: 'elnor-intents:bob'});
  assert.deepEqual(views, [null]);
  listeners.get('storage')({type: 'storage', key: storageKey});
  assert.deepEqual(views, [null, 'pending']);
});

test('operation version and unknown operation block', async () => {
  const storage = seeded([record({key: 'a'}), record({key: 'b', owner: '"t2"', operation: 'tasks.archive'})]);
  const {transport, journal} = setup({storage, version: 2, start: false});
  assert.deepEqual(journal.blocked(), []);
  journal.start();
  await until(() => stored(storage).records.every(item => item.state === 'blocked'), 'both blocks');
  await settle();
  assert.deepEqual(stored(storage).records.map(item => [item.key, item.reason]), [['a', 'version'], ['b', 'unknown-operation']]);
  assert.deepEqual(journal.blocked().map(item => [item.id, item.reason]), [['a', 'version'], ['b', 'unknown-operation']]);
  assert.equal(transport.requests.length, 0);
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
  assert.deepEqual(journal.blocked().map(item => item.reason), ['corrupt', 'corrupt']);
  assert.equal(journal.blocked()[0].export(), JSON.stringify(garbage));
  assert.equal(await hook.admit(entry({owner: '"t3"'})), undefined);
  assert.equal(await hook.admit(entry()), 'k1');
  await until(() => stored(storage).records.some(item => item.state === 'terminal'), 'the outcome');
  assert.deepEqual(stored(storage).records.slice(0, 2), [garbage, unkeyed]);
  assert.equal(transport.requests.length, 1);
  await journal.blocked()[1].discard();
  assert.deepEqual(stored(storage).records.slice(0, 1), [garbage]);
  assert.equal(await hook.admit(entry({owner: '"t3"'})), 'k2');
});

test('unreadable storage blocks every admission until discarded', async () => {
  const storage = memoryStorage({[storageKey]: 'not json'});
  const {hook, journal} = setup({storage});
  const [blocked] = journal.blocked();
  assert.equal(blocked.reason, 'corrupt');
  assert.equal(blocked.export(), 'not json');
  assert.equal(await hook.admit(entry()), undefined);
  assert.equal(storage.getItem(storageKey), 'not json');
  await blocked.discard();
  assert.equal(storage.getItem(storageKey), null);
  assert.equal(await hook.admit(entry()), 'k1');
});

test('storage that throws at admission refuses the call and sends nothing', async () => {
  const storage = memoryStorage();
  storage.setItem = () => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };
  const {transport, hook} = setup({storage});
  const views = [];
  hook.watch('task-edit', '"t1"', view => views.push(view));
  assert.equal(await hook.admit(entry()), undefined);
  await settle();
  assert.equal(transport.requests.length, 0);
  assert.deepEqual(views, [null]);
  const unreadable = memoryStorage();
  unreadable.getItem = () => { throw new DOMException('Access is denied.', 'SecurityError'); };
  const other = setup({storage: unreadable});
  assert.equal(await other.hook.admit(entry()), undefined);
  await settle();
  assert.equal(other.transport.requests.length, 0);
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
  assert.throws(() => createIntentJournal({storage: memoryStorage(), scope: 'alice'}), {name: 'TypeError', message: 'Durable intents need the Web Locks API'});
  assert.throws(() => createIntentJournal({storage: memoryStorage(), scope: 'alice', locks: null}), {name: 'TypeError', message: 'Durable intents need the Web Locks API'});
});
