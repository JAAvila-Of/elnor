// A group timeout retires an invocation that runs too long: its signal aborts
// with a TimeoutError, the member reports that error and the group is free.
import assert from 'node:assert/strict';
import test from 'node:test';
import {setImmediate as flush} from 'node:timers/promises';
import {parseSurface} from '../src/parser.mjs';
import {cell, createActionGroup, scope} from '../src/runtime.mjs';

function timed(t, policy, options) {
  t.mock.timers.enable({apis: ['setTimeout']});
  const owner = cell('A'), owned = scope(), started = [], gates = new Map(), signals = new Map(), log = [];
  const group = createActionGroup(policy, () => owner.value, owned, options);
  const load = group.action(lease => function* (label) {
    started.push(label);
    signals.set(label, lease.bindGroup(group).signal);
    const gate = Promise.withResolvers();
    gates.set(label, gate);
    try {
      return yield gate.promise;
    } finally {
      log.push(`finally ${label}`);
    }
  }, 'load');
  return {owner, owned, group, load, started, gates, signals, log, tick: ms => t.mock.timers.tick(ms)};
}

test('a timeout retires the invocation, aborts its signal and reports a TimeoutError', async t => {
  const {group, load, gates, signals, log, tick} = timed(t, 'latest', {timeout: 1000});
  const call = load('a');
  tick(999);
  assert.equal(signals.get('a').aborted, false);
  tick(1);
  assert.equal(signals.get('a').aborted, true);
  assert.equal(signals.get('a').reason.name, 'TimeoutError');
  assert.equal(load.status, 'error');
  assert.equal(load.error.name, 'TimeoutError');
  assert.equal(group.pending, false);
  gates.get('a').resolve('late');
  assert.equal(await call, undefined);
  assert.deepEqual(log, ['finally a']);
  assert.equal(load.status, 'error');
});

test('a timed out single-flight invocation frees the group before it unwinds', async t => {
  const {load, started, gates, tick} = timed(t, 'single-flight', {timeout: 50});
  load('a');
  load('b');
  assert.deepEqual(started, ['a']);
  tick(50);
  const next = load('c');
  assert.deepEqual(started, ['a', 'c']);
  assert.equal(load.status, 'pending');
  gates.get('c').resolve('ok');
  assert.equal(await next, 'ok');
});

test('an invocation that finishes in time clears its timeout', async t => {
  const {load, gates, signals, tick} = timed(t, 'latest', {timeout: 100});
  const call = load('a');
  gates.get('a').resolve('ok');
  assert.equal(await call, 'ok');
  tick(500);
  assert.equal(load.status, 'success');
  assert.equal(signals.get('a').aborted, false);
});

test('a queue starts the next waiting call when the running one times out', async t => {
  const {load, started, gates, tick} = timed(t, 'queue', {capacity: 5, timeout: 100});
  load('a');
  const waiting = load('b');
  assert.deepEqual(started, ['a']);
  tick(100);
  await flush();
  assert.deepEqual(started, ['a', 'b']);
  tick(50);
  gates.get('b').resolve('ok');
  assert.equal(await waiting, 'ok');
});

const component = policy => `component Search(query: string, find: (query: string) => Promise<string>) {
  action group search(query) ${policy}

  action async run() in search {
    return await find(query);
  }

  ui {
    section {
      button "Search" => run()
    }
  }
}
`;

test('timeout takes a duration in milliseconds or seconds after any policy', () => {
  const group = policy => parseSurface(component(policy)).actionGroups[0];
  assert.equal(group('latest timeout 10s').timeout, 10000);
  assert.equal(group('single-flight timeout 250ms').timeout, 250);
  assert.deepEqual([group('queue 5 timeout 2s').capacity, group('queue 5 timeout 2s').timeout], [5, 2000]);
  assert.equal(group('queue timeout 2s').capacity, 100);
  assert.equal(group('latest').timeout, null);
  for (const invalid of ['latest timeout', 'latest timeout 10', 'latest timeout 0s', 'latest timeout 2h',
    'latest timeout 1s timeout 2s', 'latest fast', 'latest timeout 3601s']) {
    assert.throws(() => parseSurface(component(invalid)), {code: 'ELN-ACTION-GROUP-POLICY'}, invalid);
  }
});

test('a compiled group applies its timeout and the UI shows the TimeoutError', {timeout: 20000}, async t => {
  const {default: fs} = await import('node:fs');
  const {default: os} = await import('node:os');
  const {default: path} = await import('node:path');
  const {pathToFileURL} = await import('node:url');
  const {buildSurfaceProject} = await import('../src/project-build.mjs');
  const {FakeNode, findButton, setupDOM} = await import('./fake-dom.mjs');
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-action-timeout-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'Search.eln');
  fs.writeFileSync(file, component('latest timeout 50ms').replace('      button "Search" => run()',
    '      p (run.error instanceof Error ? run.error.name : run.status)\n      button "Search" => run()'));
  const outputDir = path.join(directory, 'build');
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check')});
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  t.mock.timers.enable({apis: ['setTimeout']});
  const root = new FakeNode('root');
  t.after(module.mount(root, {query: 'elnor', find: () => new Promise(() => {})}));
  findButton(root, 'Search').click();
  await flush();
  assert.equal(root.descendants('p')[0].textContent, 'pending');
  t.mock.timers.tick(50);
  await flush();
  assert.equal(root.descendants('p')[0].textContent, 'TimeoutError');
});
