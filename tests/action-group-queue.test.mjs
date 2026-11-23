// queue runs every accepted call in order, one at a time, with up to N calls
// waiting. A full queue rejects the newest call. A new owner or unmounting
// drops the waiting calls, which resolve to undefined.
import assert from 'node:assert/strict';
import test from 'node:test';
import {setImmediate as flush} from 'node:timers/promises';
import {parseSurface} from '../src/parser.mjs';
import {cell, createActionGroup, scope} from '../src/runtime.mjs';

function queue(capacity) {
  const owner = cell('A'), owned = scope(), started = [], gates = new Map();
  const group = createActionGroup('queue', () => owner.value, owned, {capacity});
  const send = group.action(() => function* (label) {
    started.push(label);
    const gate = Promise.withResolvers();
    gates.set(label, gate);
    return yield gate.promise;
  }, 'send');
  return {owner, owned, group, send, started, gates};
}

test('queue runs every accepted call in order, one at a time', {timeout: 2000}, async () => {
  const {group, send, started, gates} = queue(5);
  const calls = ['a', 'b', 'c'].map(label => send(label));
  assert.deepEqual(started, ['a']);
  gates.get('a').resolve('sent a');
  assert.equal(await calls[0], 'sent a');
  await flush();
  assert.deepEqual(started, ['a', 'b']);
  assert.equal(group.pending, true);
  gates.get('b').resolve('sent b');
  await calls[1];
  await flush();
  gates.get('c').resolve('sent c');
  assert.deepEqual(await Promise.all(calls), ['sent a', 'sent b', 'sent c']);
  assert.deepEqual(started, ['a', 'b', 'c']);
  assert.equal(group.pending, false);
});

test('a full queue rejects the newest call and keeps the accepted ones', {timeout: 2000}, async () => {
  const {send, started, gates} = queue(2);
  const accepted = ['a', 'b', 'c'].map(label => send(label));
  assert.equal(await send('d'), undefined);
  for (const label of ['a', 'b', 'c']) {
    await flush();
    gates.get(label).resolve(label);
    await accepted[['a', 'b', 'c'].indexOf(label)];
  }
  assert.deepEqual(started, ['a', 'b', 'c']);
});

test('a failure keeps its error and the queue continues', {timeout: 2000}, async () => {
  const {send, started, gates} = queue(5);
  const first = send('a');
  const second = send('b');
  assert.deepEqual(started, ['a']);
  gates.get('a').reject(new Error('offline'));
  assert.equal(await first, undefined);
  await flush();
  assert.deepEqual(started, ['a', 'b']);
  assert.equal(send.status, 'pending');
  gates.get('b').resolve('sent b');
  assert.equal(await second, 'sent b');
});

test('a failed call shows its error until the next queued call starts', {timeout: 2000}, async () => {
  const {send, gates} = queue(5);
  const first = send('a');
  gates.get('a').reject(new Error('offline'));
  await first;
  assert.equal(send.status, 'error');
  assert.equal(send.error.message, 'offline');
});

test('an owner change drops the waiting calls', {timeout: 2000}, async () => {
  const {owner, send, started, gates} = queue(5);
  const first = send('a');
  const waiting = send('b');
  owner.value = 'B';
  gates.get('a').resolve('stale');
  assert.equal(await first, undefined);
  assert.equal(await waiting, undefined);
  await flush();
  assert.deepEqual(started, ['a']);
});

test('a call from a new owner drops the old waiting calls and starts at once', {timeout: 2000}, async () => {
  const {owner, send, started, gates} = queue(5);
  send('a');
  const waiting = send('b');
  owner.value = 'B';
  const fresh = send('c');
  assert.equal(await waiting, undefined);
  assert.deepEqual(started, ['a', 'c']);
  gates.get('c').resolve('sent c');
  assert.equal(await fresh, 'sent c');
});

test('unmounting drops the waiting calls', {timeout: 2000}, async () => {
  const {owned, send, started, gates} = queue(5);
  const first = send('a');
  const waiting = send('b');
  owned.dispose();
  assert.equal(await waiting, undefined);
  gates.get('a').resolve('late');
  await first;
  await flush();
  assert.deepEqual(started, ['a']);
});

const component = policy => `component Chat(post: (text: string) => Promise<void>) {
  state draft = "";
  action group sending(draft) ${policy}

  action async send() in sending {
    await post(draft);
  }

  ui {
    section {
      button "Send" => send()
    }
  }
}
`;

test('queue takes an optional capacity that defaults to 100', () => {
  assert.equal(parseSurface(component('queue')).actionGroups[0].capacity, 100);
  assert.equal(parseSurface(component('queue 20')).actionGroups[0].capacity, 20);
  assert.equal(parseSurface(component('latest')).actionGroups[0].capacity, null);
  for (const invalid of ['latest 3', 'queue 0', 'queue 1.5']) {
    assert.throws(() => parseSurface(component(invalid)), {code: 'ELN-ACTION-GROUP-POLICY'}, invalid);
  }
});

test('a compiled queue applies its declared capacity', {timeout: 20000}, async t => {
  const {default: fs} = await import('node:fs');
  const {default: os} = await import('node:os');
  const {default: path} = await import('node:path');
  const {pathToFileURL} = await import('node:url');
  const {buildSurfaceProject} = await import('../src/project-build.mjs');
  const {FakeNode, findButton, setupDOM} = await import('./fake-dom.mjs');
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-action-queue-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'Chat.eln');
  fs.writeFileSync(file, component('queue 1'));
  const outputDir = path.join(directory, 'build');
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check')});
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const root = new FakeNode('root'), gates = [];
  t.after(module.mount(root, {post() { const gate = Promise.withResolvers(); gates.push(gate); return gate.promise; }}));
  for (let index = 0; index < 3; index++) findButton(root, 'Send').click();
  assert.equal(gates.length, 1);
  gates[0].resolve();
  await flush();
  await flush();
  assert.equal(gates.length, 2);
  gates[1].resolve();
  await flush();
  await flush();
  assert.equal(gates.length, 2);
});
