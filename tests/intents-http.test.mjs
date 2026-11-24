// The HTTP transport and the journal against the loopback reference provider.
// The journal runs on an in-memory store with a serial lock manager and short
// retry delays, so every wait is bounded.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {launchLocalProcess} from '../examples/persistent-task-desk/local-process.mjs';
import {createIntentJournal, httpIntentTransport} from '../src/intents.mjs';
import {memoryIntentStore} from './intent-store.mjs';

const durable = Symbol.for('elnor.durable');
const provider = fileURLToPath(new URL('../examples/durable-save/provider_fixture.py', import.meta.url));
const python = process.env.ELNOR_TEST_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const prefix = 'elnor-intents-http-';

function serialLocks() {
  let tail = Promise.resolve();
  return {
    request(name, callback) {
      const run = tail.then(() => callback({name, mode: 'exclusive'}));
      tail = run.catch(() => {});
      return run;
    }
  };
}

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

// A provider on a fixed port, so a restart keeps the same base URL.
async function providerFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const file = path.join(dir, 'ledger.sqlite');
  const port = await freePort();
  let run;
  const start = async () => {
    run = launchLocalProcess(python, ['-u', provider, '--db', file, '--port', String(port), '--faults'], {label: 'Durable provider'});
    return run.ready();
  };
  t.after(async () => {
    await run?.stop().catch(() => {});
    assert.ok(path.basename(dir).startsWith(prefix));
    fs.rmSync(dir, {recursive: true, force: true});
  });
  const ready = await start();
  const url = 'http://127.0.0.1:' + port;
  return {
    url, file, epoch: ready.epoch,
    start,
    stop: command => run.stop(command),
    async stats() { return (await fetch(url + '/stats')).json(); }
  };
}

function setup({url, headers, scope = 'alice', retry = {firstMs: 20, maxMs: 40}, fetch}) {
  const journal = createIntentJournal({store: memoryIntentStore(), scope, locks: serialLocks(), retry});
  const save = journal.operation('notes.save', {version: 1, transport: httpIntentTransport({baseUrl: url, headers, fetch})});
  const hook = save[durable].journal;
  const admit = input => hook.admit({journal: 'notes', owner: '"n1"', member: 'save', operation: 'notes.save', version: 1, params: [input], input});
  return {journal, admit};
}

async function until(condition, message) {
  for (let turn = 0; turn < 200; turn++) {
    if (await condition()) return;
    await sleep(25);
  }
  assert.fail(`timed out waiting for ${message}`);
}

const note = (text, revision = 0) => ({text, revision});

test('a journal applies through HTTP and replays after a lost reply', async t => {
  const f = await providerFixture(t);
  let sent = 0;
  const {journal, admit} = setup({url: f.url, headers: () => ({'X-Fixture-Account': 'alice', ...(sent++ === 1 && {'X-Fixture-Fault': 'after'})})});
  t.after(() => journal.stop());
  journal.start();
  assert.ok(await admit(note('first')));
  await until(async () => (await journal.outcomes()).length === 1, 'the outcome');
  const [{outcome}] = await journal.outcomes();
  assert.equal(outcome.status, 'applied');
  assert.equal(outcome.result.revision, 1);
  assert.ok(sent >= 3, 'the unstamped request, the lost reply and the replay');
  assert.equal((await f.stats()).effects, 1);
});

test('an outage keeps the intent pending until the provider returns', async t => {
  const f = await providerFixture(t);
  const {journal, admit} = setup({url: f.url, headers: () => ({'X-Fixture-Account': 'alice'})});
  t.after(() => journal.stop());
  journal.start();
  await f.stop();
  assert.ok(await admit(note('first')));
  await sleep(150);
  assert.equal((await journal.outcomes()).length, 0);
  assert.equal((await journal.blocked()).length, 0);
  await f.start();
  await until(async () => (await journal.outcomes()).length === 1, 'the outcome');
  assert.equal((await journal.outcomes())[0].outcome.status, 'applied');
  assert.equal((await f.stats()).effects, 1);
});

test('a provider reset blocks a stamped intent', async t => {
  const f = await providerFixture(t);
  const {journal, admit} = setup({url: f.url, headers: () => ({'X-Fixture-Account': 'alice'})});
  t.after(() => journal.stop());
  journal.start();
  await admit(note('first'));
  await until(async () => (await journal.outcomes()).length === 1, 'the first outcome');
  await (await journal.outcomes())[0].acknowledge();
  await f.stop();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(f.file + suffix, {force: true});
  const fresh = await f.start();
  assert.notEqual(fresh.epoch, f.epoch);
  await admit(note('second'));
  await until(async () => (await journal.blocked()).length === 1, 'the blocked record');
  assert.equal((await journal.blocked())[0].reason, 'epoch');
  assert.equal((await f.stats()).effects, 0);
});

test('a retired receipt resolves as unavailable', async t => {
  const f = await providerFixture(t);
  let sent = 0;
  const {journal, admit} = setup({
    url: f.url, retry: {firstMs: 60000, maxMs: 60000},
    headers: () => ({'X-Fixture-Account': 'alice', ...(sent++ === 1 && {'X-Fixture-Fault': 'after'})})
  });
  t.after(() => journal.stop());
  journal.start();
  await admit(note('first'));
  await until(async () => sent >= 2 && (await f.stats()).effects === 1, 'the applied effect with a lost reply');
  journal.stop();
  await f.stop('retire\nstop\n');
  await f.start();
  journal.start();
  await until(async () => (await journal.outcomes()).length === 1, 'the outcome');
  assert.equal((await journal.outcomes())[0].outcome.status, 'unavailable');
  assert.equal((await f.stats()).effects, 1);
});

test('a session for another account pauses the journal', async t => {
  const f = await providerFixture(t);
  const {journal, admit} = setup({url: f.url, headers: () => ({'X-Fixture-Account': 'bob'})});
  t.after(() => journal.stop());
  let paused = 0;
  journal.onPaused(() => { paused++; });
  journal.start();
  await admit(note('first'));
  await until(() => paused === 1, 'the pause');
  assert.equal((await journal.outcomes()).length, 0);
  assert.equal((await journal.blocked()).length, 0);
  assert.equal((await f.stats()).effects, 0);
});

test('a body that is not JSON or echoes another key blocks', async t => {
  const replies = [
    response => response.end('not json'),
    (response, key) => response.end(JSON.stringify({status: 'applied', result: {}, scope: 'alice', key: key + '-other', epoch: null}))
  ];
  const server = http.createServer((request, response) => {
    request.resume();
    response.writeHead(200, {'Content-Type': 'application/json'});
    replies.shift()(response, request.url.split('/').pop());
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const {journal, admit} = setup({url: 'http://127.0.0.1:' + server.address().port});
  t.after(() => journal.stop());
  journal.start();
  for (const turn of [1, 2]) {
    assert.ok(await admit(note('first')), `admission ${turn}`);
    await until(async () => (await journal.blocked()).length === 1, `block ${turn}`);
    assert.equal((await journal.blocked())[0].reason, 'mismatch');
    await (await journal.blocked())[0].discard();
  }
});

test('an HTML 403 from outside the protocol pauses the journal and keeps the intent pending', async t => {
  let refused = true;
  const server = http.createServer((request, response) => {
    request.resume();
    if (refused) {
      response.writeHead(403, {'Content-Type': 'text/html'});
      return response.end('<html>Forbidden</html>');
    }
    response.writeHead(200, {'Content-Type': 'application/json'});
    response.end(JSON.stringify({status: 'applied', result: {revision: 1}, scope: 'alice', key: request.url.split('/').pop(), epoch: null}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const {journal, admit} = setup({url: 'http://127.0.0.1:' + server.address().port});
  t.after(() => journal.stop());
  let paused = 0;
  journal.onPaused(() => { paused++; });
  journal.start();
  assert.ok(await admit(note('first')));
  await until(() => paused === 1, 'the pause');
  assert.equal((await journal.blocked()).length, 0);
  refused = false;
  journal.start();
  await until(async () => (await journal.outcomes()).length === 1, 'the outcome after the session returns');
});

test('the transport maps answers and sends the documented request', async () => {
  const request = {operation: 'notes.save', key: 'a b', scope: 'alice', epoch: 'E1', input: {text: 'x'}, signal: new AbortController().signal};
  const echo = {scope: 'alice', key: 'a b', epoch: 'E1'};
  const reply = (status, body) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), {status});
  const map = (status, body) => httpIntentTransport({baseUrl: 'http://x.test/api/', fetch: reply(status, body)}).send(request);
  assert.deepEqual(await map(200, {status: 'applied', result: 7, ...echo}), {kind: 'applied', epoch: 'E1', result: 7});
  assert.deepEqual(await map(422, {status: 'rejected', reason: 'no', ...echo}), {kind: 'rejected', epoch: 'E1', reason: 'no'});
  assert.deepEqual(await map(200, {status: 'unavailable', ...echo}), {kind: 'unavailable', epoch: 'E1'});
  assert.deepEqual(await map(412, {status: 'epoch-mismatch', epoch: 'E2', scope: 'alice', key: 'a b'}), {kind: 'epoch', epoch: 'E2'});
  assert.deepEqual(await map(409, {status: 'key-conflict', ...echo}), {kind: 'key-conflict'});
  assert.deepEqual(await map(403, {status: 'scope-refused', ...echo}), {kind: 'scope-refused'});
  assert.deepEqual(await map(200, {status: 'applied', result: 7, ...echo, epoch: 'E9'}), {kind: 'mismatch'});
  assert.deepEqual(await map(200, {status: 'applied', result: 7, ...echo, scope: 'bob'}), {kind: 'mismatch'});
  assert.deepEqual(await map(200, 'not json'), {kind: 'mismatch'});
  assert.deepEqual(await map(422, '<html>Unprocessable</html>'), {kind: 'mismatch'});
  assert.deepEqual(await map(422, {status: 'rejected', reason: 'no', ...echo, key: 'other'}), {kind: 'mismatch'});
  // A proxy, a firewall or an expired session answers 403 or 409 outside the
  // protocol; nothing was applied, so the intent is not blocked.
  assert.deepEqual(await map(403, '<html>Forbidden</html>'), {kind: 'scope-refused'});
  assert.deepEqual(await map(403, {error: 'csrf'}), {kind: 'scope-refused'});
  assert.deepEqual(await map(403, {status: 'scope-refused', ...echo, scope: 'bob'}), {kind: 'scope-refused'});
  assert.deepEqual(await map(409, '<html>Conflict</html>'), {kind: 'retry'});
  assert.deepEqual(await map(409, {error: 'conflict'}), {kind: 'retry'});
  assert.deepEqual(await map(409, {status: 'busy', ...echo}), {kind: 'retry'});
  // A protocol 409 that echoes another intent may come from an endpoint that
  // applied it under another identity, as a 200 with a wrong echo may.
  assert.deepEqual(await map(409, {status: 'key-conflict', ...echo, key: 'other'}), {kind: 'mismatch'});
  assert.deepEqual(await map(409, {status: 'key-conflict', ...echo, scope: 'bob'}), {kind: 'mismatch'});
  assert.deepEqual(await map(409, {status: 'key-conflict', ...echo, epoch: 'E9'}), {kind: 'mismatch'});
  assert.deepEqual(await map(409, {status: 'key-conflict', scope: 'alice', key: 'a b'}), {kind: 'mismatch'});
  for (const status of [404, 500, 503]) assert.deepEqual(await map(status, {status: 'x'}), {kind: 'retry'});
  assert.deepEqual(await map(200, {status: 'surprise', ...echo}), {kind: 'retry'});
  const failing = httpIntentTransport({baseUrl: 'http://x.test', fetch: async () => { throw new TypeError('network'); }});
  assert.deepEqual(await failing.send(request), {kind: 'retry'});

  let seen;
  const spy = httpIntentTransport({
    baseUrl: 'http://x.test/api/', headers: () => ({'X-Extra': '1'}),
    fetch: async (url, init) => { seen = {url, init}; return new Response('{}', {status: 500}); }
  });
  await spy.send(request);
  assert.equal(seen.url, 'http://x.test/api/notes.save/a%20b');
  assert.equal(seen.init.method, 'PUT');
  assert.equal(seen.init.cache, 'no-store');
  assert.equal(seen.init.signal, request.signal);
  assert.equal(seen.init.headers['Intent-Scope'], 'alice');
  assert.equal(seen.init.headers['Intent-Epoch'], 'E1');
  assert.equal(seen.init.headers['X-Extra'], '1');
  assert.equal(seen.init.body, JSON.stringify({input: {text: 'x'}}));
  await spy.send({...request, epoch: null});
  assert.equal('Intent-Epoch' in seen.init.headers, false);
});
