// keep-latest runs the current invocation to completion, then only the last
// call made while it was running. Older deferred calls resolve to undefined.
import assert from 'node:assert/strict';
import test from 'node:test';
import {setImmediate as flush} from 'node:timers/promises';
import {parseSurface} from '../src/parser.mjs';
import {cell, createActionGroup, scope} from '../src/runtime.mjs';

function keepLatest() {
  const owner = cell('A'), owned = scope(), started = [], gates = new Map();
  const group = createActionGroup('keep-latest', () => owner.value, owned);
  const member = name => group.action(() => function* (label) {
    started.push(`${name} ${label}`);
    const gate = Promise.withResolvers();
    gates.set(label, gate);
    return yield gate.promise;
  }, name);
  return {owner, owned, group, started, gates, save:member('save'), publish:member('publish')};
}

test('keep-latest finishes the running invocation and then runs only the last deferred call', {timeout:2000}, async () => {
  const {group, save, started, gates} = keepLatest();
  const first = save('a');
  const dropped = save('b');
  const last = save('c');
  assert.deepEqual(started, ['save a']);
  assert.equal(group.pending, true);
  assert.equal(await dropped, undefined);
  gates.get('a').resolve('saved a');
  assert.equal(await first, 'saved a');
  await flush();
  assert.deepEqual(started, ['save a', 'save c']);
  assert.equal(save.status, 'pending');
  gates.get('c').resolve('saved c');
  assert.equal(await last, 'saved c');
  assert.equal(save.status, 'success');
  assert.equal(save.result, 'saved c');
  assert.equal(group.pending, false);
});

test('keep-latest defers a call to another member of the same group', {timeout:2000}, async () => {
  const {save, publish, started, gates} = keepLatest();
  const first = save('a');
  const next = publish('b');
  assert.deepEqual(started, ['save a']);
  gates.get('a').resolve('saved a');
  await first;
  await flush();
  assert.deepEqual(started, ['save a', 'publish b']);
  gates.get('b').resolve('published b');
  assert.equal(await next, 'published b');
});

test('keep-latest drops the deferred call when the owner changes', {timeout:2000}, async () => {
  const {owner, save, started, gates} = keepLatest();
  const first = save('a');
  const deferred = save('b');
  owner.value = 'B';
  gates.get('a').resolve('stale');
  assert.equal(await first, undefined);
  assert.equal(await deferred, undefined);
  await flush();
  assert.deepEqual(started, ['save a']);
});

test('keep-latest drops a deferred call of the old owner when the new owner calls', {timeout:2000}, async () => {
  const {owner, save, started, gates} = keepLatest();
  save('a');
  const deferred = save('b');
  owner.value = 'B';
  const fresh = save('c');
  assert.equal(await deferred, undefined);
  assert.deepEqual(started, ['save a', 'save c']);
  gates.get('c').resolve('saved c');
  assert.equal(await fresh, 'saved c');
});

test('keep-latest drops the deferred call when the component unmounts', {timeout:2000}, async () => {
  const {owned, save, started, gates} = keepLatest();
  const first = save('a');
  const deferred = save('b');
  owned.dispose();
  assert.equal(await deferred, undefined);
  gates.get('a').resolve('late');
  await first;
  await flush();
  assert.deepEqual(started, ['save a']);
});

test('keep-latest runs a call immediately when nothing is running', {timeout:2000}, async () => {
  const {save, started, gates} = keepLatest();
  const first = save('a');
  gates.get('a').resolve('saved a');
  await first;
  const second = save('b');
  assert.deepEqual(started, ['save a', 'save b']);
  gates.get('b').resolve('saved b');
  assert.equal(await second, 'saved b');
});

test('keep-latest is accepted as an action group policy', () => {
  const ir = parseSurface(`component Draft(text: string, save: (text: string) => Promise<void>) {
  action group autosave(text) keep-latest

  action async persist() in autosave {
    await save(text);
  }

  ui {
    section {
      button "Save" => persist()
    }
  }
}
`);
  assert.equal(ir.actionGroups[0].policy, 'keep-latest');
});
