import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {createAsyncLanguageService} from '../src/async-language-service.mjs';
import {childSource, consumerSource} from './fixtures/recovery-cases.mjs';

const root = path.resolve('tests', 'async workspace');
const child = path.join(root, 'Badge.eln'), consumer = path.join(root, 'Screen.eln');
const healthy = consumerSource.replace('Badge la', 'Badge label="Ready"');
function setup(t) {
  const gate = new Int32Array(new SharedArrayBuffer(8));
  const workers = [];
  const events = [];
  const client = createAsyncLanguageService({root, workerFactory() {
    const worker = new Worker(new URL('./fixtures/gated-language-worker.mjs', import.meta.url), {workerData: {root, gate: gate.buffer}});
    workers.push(worker);
    return worker;
  }});
  client.onEvent(event => events.push(event));
  t.after(() => { Atomics.store(gate, 1, 1); Atomics.notify(gate, 1); return client.dispose(); });
  client.open(child, childSource);
  client.open(consumer, healthy);
  return {client, gate, workers, events};
}
function hold(gate) { Atomics.store(gate, 1, 0); Atomics.store(gate, 0, 1); }
function release(gate) { Atomics.store(gate, 1, 1); Atomics.notify(gate, 1); }
async function inFlight(gate) {
  const until = Date.now() + 8000;
  while (Atomics.load(gate, 0) !== 2) {
    if (Date.now() > until) throw Error('Worker never entered the test gate');
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}

test('async service keeps exact source results and the caller timer can run', {timeout: 20000}, async t => {
  const {client, gate} = setup(t);
  await client.ready();
  hold(gate);
  const pending = client.query('diagnostics', [consumer]);
  await inFlight(gate);
  let timerRan = false;
  await new Promise(resolve => setTimeout(() => { timerRan = true; resolve(); }, 0));
  assert.equal(timerRan, true);
  release(gate);
  const response = await pending;
  assert.deepEqual(response.value, []);
  assert.equal(client.isCurrent(response.snapshot), true);
  const definitions = await client.query('definitions', [consumer, healthy.indexOf('Badge label') + 2]);
  assert.ok(definitions.value.some(d => d.file === child && d.start === childSource.indexOf('Badge')));
});

test('an edit discards in-flight diagnostics immediately and only the new version is returned', {timeout: 20000}, async t => {
  const {client, gate} = setup(t);
  await client.ready();
  hold(gate);
  const old = client.query('diagnostics', [consumer]);
  const discarded = assert.rejects(old, {name: 'StaleResponseError'});
  await inFlight(gate);
  const invalid = healthy.replace('label=', 'missing=');
  client.open(consumer, invalid);
  await discarded;
  release(gate);
  const response = await client.query('diagnostics', [consumer]);
  const diagnostic = response.value.find(d => d.code === 'TS2353');
  assert.equal(invalid.slice(diagnostic.start, diagnostic.start + diagnostic.length), 'missing');
  assert.equal(client.isCurrent(response.snapshot), true);
});

test('an edit in a dependency invalidates definitions, completions and rename snapshots', {timeout: 20000}, async t => {
  const {client, gate} = setup(t);
  await client.ready();
  for (const [method, args] of [
    ['definitions', [consumer, healthy.indexOf('Badge label') + 2]],
    ['completions', [consumer, healthy.indexOf('label=') + 2]],
    ['rename', [child, childSource.indexOf('label: string'), 'caption']],
  ]) {
    hold(gate);
    const old = client.query(method, args);
    const discarded = assert.rejects(old, {name: 'StaleResponseError'});
    await inFlight(gate);
    client.open(child, client.text(child) + '\n');
    await discarded;
    release(gate);
    await client.query('diagnostics', [consumer]);
  }
  const rename = await client.query('rename', [child, childSource.indexOf('label: string'), 'caption']);
  assert.equal(rename.value.edits.length, 3);
  client.open(consumer, healthy + '\n');
  assert.equal(client.isCurrent(rename.snapshot), false);
});

test('cancellation rejects a running request without pretending to interrupt TypeScript', {timeout: 20000}, async t => {
  const {client, gate, events} = setup(t);
  await client.ready();
  hold(gate);
  const controller = new AbortController();
  const pending = client.query('diagnostics', [consumer], {signal: controller.signal});
  const rejected = assert.rejects(pending, {name: 'CancelledError'});
  await inFlight(gate);
  controller.abort();
  await rejected;
  assert.equal(client.status().pending, 0);
  release(gate);
  assert.deepEqual((await client.query('diagnostics', [consumer])).value, []);
  assert.ok(events.some(e => e.type === 'cancelled'));
});

test('worker death rejects pending work; next request replays the latest unsaved sources', {timeout: 20000}, async t => {
  const {client, gate, workers} = setup(t);
  await client.ready();
  hold(gate);
  const pending = client.query('diagnostics', [consumer]);
  const rejected = assert.rejects(pending, {name: 'WorkerExitedError'});
  await inFlight(gate);
  const generation = client.status().generation;
  await workers.at(-1).terminate();
  await rejected;
  const invalid = healthy.replace('label=', 'missing=');
  client.open(consumer, invalid);
  release(gate);
  const recovered = await client.query('diagnostics', [consumer]);
  assert.ok(recovered.value.some(d => d.code === 'TS2353'));
  assert.ok(recovered.snapshot.generation > generation);
  assert.equal(client.text(consumer), invalid);
});

test('explicit restart and close reject pending work and invalidate old tokens', {timeout: 20000}, async t => {
  const {client, gate} = setup(t);
  const token = (await client.query('diagnostics', [consumer])).snapshot;
  hold(gate);
  const pending = client.query('diagnostics', [consumer]);
  const rejected = assert.rejects(pending, {name: 'WorkerRestartedError'});
  await inFlight(gate);
  release(gate);
  await client.restart();
  await rejected;
  assert.equal(client.isCurrent(token), false);
  assert.deepEqual((await client.query('diagnostics', [consumer])).value, []);
  hold(gate);
  const closing = client.query('diagnostics', [consumer]);
  const disposed = assert.rejects(closing, {name: 'DisposedError'});
  await inFlight(gate);
  await client.dispose();
  await disposed;
  await assert.rejects(client.query('diagnostics', [consumer]), {name: 'DisposedError'});
  assert.equal(client.status().pending, 0);
  assert.equal(client.text(consumer), undefined, 'shutdown releases source snapshots');
});

test('startup snapshots follow edits and removed files are not replayed', {timeout: 20000}, async t => {
  const {client} = setup(t);
  const first = client.query('diagnostics', [consumer]);
  const stale = assert.rejects(first, {name: 'StaleResponseError'});
  client.open(consumer, healthy.replace('label=', 'missing='));
  await stale;
  const current = await client.query('diagnostics', [consumer]);
  assert.ok(current.value.some(d => d.code === 'TS2353'));
  client.close(consumer);
  await client.restart();
  assert.equal(client.text(consumer), undefined);
  await assert.rejects(client.query('diagnostics', [consumer]), /not open/);
});

test('a startup failure settles requests and a later request can create a new worker', {timeout: 20000}, async t => {
  let attempts = 0;
  const client = createAsyncLanguageService({root, workerFactory() {
    return new Worker(new URL(++attempts === 1 ? './fixtures/missing-worker.mjs' : '../src/language-worker.mjs', import.meta.url), {workerData: {root}});
  }});
  t.after(() => client.dispose());
  client.open(child, childSource);
  client.open(consumer, healthy);
  await assert.rejects(client.query('diagnostics', [consumer]), {name: 'WorkerExitedError'});
  assert.equal(client.status().pending, 0);
  assert.deepEqual((await client.query('diagnostics', [consumer])).value, []);
});

test('rename rejects an imported on-disk component not owned by the caller document store', {timeout: 20000}, async t => {
  const {client} = setup(t);
  const component = path.relative(root, path.resolve('examples/components/Panel.eln')).replaceAll('\\', '/');
  const source = `import Badge from "${component}";\ncomponent Screen() {\n  ui {\n    Badge title="Ready"\n  }\n}\n`;
  client.open(consumer, source);
  await assert.rejects(client.query('rename', [consumer, source.indexOf('title=') + 2, 'heading']), /outside the versioned editor workspace/);
  assert.equal(client.text(consumer), source);
});
