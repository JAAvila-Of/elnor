import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchLocalProcess} from '../examples/persistent-task-desk/local-process.mjs';

const provider = fileURLToPath(new URL('../examples/durable-save/provider_fixture.py', import.meta.url));
const prefix = 'elnor-durable-provider-';

async function start(db) {
  const run = launchLocalProcess(process.env.ELNOR_TEST_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'),
    ['-u', provider, '--db', db, '--faults'], {label: 'Durable provider'});
  const ready = await run.ready();
  return {...ready, url: 'http://127.0.0.1:' + ready.port, stop: run.stop};
}

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const file = path.join(dir, 'ledger.sqlite');
  let server;
  t.after(async () => {
    await server?.stop();
    assert.equal(path.dirname(dir), os.tmpdir());
    assert.ok(path.basename(dir).startsWith(prefix));
    fs.rmSync(dir, {recursive: true, force: true});
  });
  server = await start(file);
  return {
    get server() { return server; },
    async restart(command) {
      await server.stop(command);
      server = await start(file);
      return server;
    },
    // An explicit undefined omits the header; an absent option sends the default.
    async put(key, input, options = {}) {
      const {scope = 'alice', fault, operation = 'notes.save'} = options;
      const epoch = 'epoch' in options ? options.epoch : server.epoch;
      const account = 'account' in options ? options.account : scope;
      const headers = {'Content-Type': 'application/json', 'Intent-Scope': scope};
      if (epoch !== undefined) headers['Intent-Epoch'] = epoch;
      if (account !== undefined) headers['X-Fixture-Account'] = account;
      if (fault) headers['X-Fixture-Fault'] = fault;
      return fetch(server.url + '/' + operation + '/' + key, {method: 'PUT', headers, body: JSON.stringify({input})});
    },
    async stats() { return (await fetch(server.url + '/stats')).json(); }
  };
}

const save = (text, revision = 0) => ({text, revision});

test('applies a new key and replays it without a second effect', async t => {
  const f = await fixture(t);
  const first = await f.put('one', save('first'));
  const second = await f.put('one', save('first'));
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.deepEqual(await second.json(), body);
  assert.equal(body.status, 'applied');
  assert.equal(body.result.revision, 1);
  assert.deepEqual([body.scope, body.key, body.epoch], ['alice', 'one', f.server.epoch]);
  assert.equal((await f.stats()).effects, 1);
});

test('refuses a request without an epoch or with a wrong one', async t => {
  const f = await fixture(t);
  for (const epoch of [undefined, 'obsolete']) {
    const response = await f.put('one', save('first'), {epoch});
    assert.equal(response.status, 412);
    assert.equal((await response.json()).epoch, f.server.epoch);
  }
  assert.equal((await f.stats()).effects, 0);
});

test('a lost reply after commit replays to the same answer', async t => {
  const f = await fixture(t);
  await assert.rejects(f.put('one', save('first'), {fault: 'after'}));
  const replay = await (await f.put('one', save('first'))).json();
  assert.equal(replay.status, 'applied');
  assert.equal((await f.stats()).effects, 1);
});

test('a request lost before commit applies once on replay', async t => {
  const f = await fixture(t);
  await assert.rejects(f.put('one', save('first'), {fault: 'before'}));
  assert.equal((await f.stats()).effects, 0);
  assert.equal((await (await f.put('one', save('first'))).json()).status, 'applied');
  assert.equal((await f.stats()).effects, 1);
});

test('rollback leaves no effect and no key', async t => {
  const f = await fixture(t);
  assert.equal((await f.put('one', save('first'), {fault: 'rollback'})).status, 503);
  assert.deepEqual(await f.stats(), {epoch: f.server.epoch, effects: 0, intents: 0});
  assert.equal((await (await f.put('one', save('first'))).json()).status, 'applied');
  assert.equal((await f.stats()).effects, 1);
});

test('rejects short text and stale revisions with typed reasons', async t => {
  const f = await fixture(t);
  const short = await f.put('short', save('x'));
  assert.equal(short.status, 422);
  const invalid = await short.json();
  assert.equal(invalid.status, 'rejected');
  assert.deepEqual(invalid.reason, {kind: 'invalid', message: 'Use at least 3 characters'});
  assert.equal((await (await f.put('one', save('first'))).json()).result.revision, 1);
  const stale = await f.put('two', save('second', 0));
  assert.equal(stale.status, 422);
  const conflict = (await stale.json()).reason;
  assert.equal(conflict.kind, 'conflict');
  assert.deepEqual(conflict.current, {text: 'first', revision: 1});
  assert.equal((await f.stats()).effects, 1);
});

test('the same key with another input is a key conflict', async t => {
  const f = await fixture(t);
  await f.put('one', save('first'));
  const response = await f.put('one', save('second', 1));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).status, 'key-conflict');
  // The document still holds the original text and revision 1.
  const probe = await (await f.put('two', save('third', 0))).json();
  assert.equal(probe.reason.current.text, 'first');
  assert.equal(probe.reason.current.revision, 1);
  assert.equal((await f.stats()).effects, 1);
});

test('concurrent replays converge on one effect', async t => {
  const f = await fixture(t);
  const responses = await Promise.all(Array.from({length: 8}, () => f.put('one', save('first'))));
  const bodies = await Promise.all(responses.map(r => r.json()));
  assert.ok(bodies.every(body => body.status === 'applied' && body.result.revision === 1));
  assert.equal((await f.stats()).effects, 1);
});

test('a retired key answers unavailable and is never applied again', async t => {
  const f = await fixture(t);
  await f.put('one', save('first'));
  await f.restart('retire\nstop\n');
  const replay = await f.put('one', save('first'));
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), {status: 'unavailable', scope: 'alice', key: 'one', epoch: f.server.epoch});
  assert.equal((await f.stats()).effects, 1);
});

test('a scope that is not the session account is refused without effect', async t => {
  const f = await fixture(t);
  for (const account of ['bob', undefined]) {
    const response = await f.put('one', save('first'), {scope: 'alice', account});
    assert.equal(response.status, 403);
    assert.equal((await response.json()).status, 'scope-refused');
  }
  assert.equal((await f.stats()).effects, 0);
});

test('restart keeps epoch and answers', async t => {
  const f = await fixture(t);
  const before = await (await f.put('one', save('first'))).json();
  const epoch = f.server.epoch;
  await f.restart();
  assert.equal(f.server.epoch, epoch);
  assert.deepEqual(await (await f.put('one', save('first'))).json(), before);
  assert.equal((await f.stats()).effects, 1);
});
