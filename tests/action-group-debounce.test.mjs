// debounce makes each latest invocation wait for a quiet period before its
// body runs. A newer call retires the waiting or running invocation.
import assert from 'node:assert/strict';
import test from 'node:test';
import {setImmediate as flush} from 'node:timers/promises';
import {parseSurface} from '../src/parser.mjs';
import {cell, createActionGroup, scope} from '../src/runtime.mjs';

function debounced(t, options) {
  t.mock.timers.enable({apis: ['setTimeout']});
  const owner = cell('A'), owned = scope(), started = [], gates = new Map(), signals = new Map();
  const group = createActionGroup('latest', () => owner.value, owned, options);
  const search = group.action(lease => function* (label) {
    started.push(label);
    signals.set(label, lease.bindGroup(group).signal);
    const gate = Promise.withResolvers();
    gates.set(label, gate);
    return yield gate.promise;
  }, 'search');
  const tick = async ms => { t.mock.timers.tick(ms); await flush(); };
  return {group, search, started, gates, signals, tick};
}

test('debounce runs the body only after the quiet period and shows pending meanwhile', async t => {
  const {group, search, started, gates, tick} = debounced(t, {debounce: 300});
  const call = search('a');
  assert.deepEqual(started, []);
  assert.equal(search.status, 'pending');
  assert.equal(group.pending, true);
  await tick(299);
  assert.deepEqual(started, []);
  await tick(1);
  assert.deepEqual(started, ['a']);
  gates.get('a').resolve('found a');
  assert.equal(await call, 'found a');
});

test('a call within the quiet period replaces the waiting one', async t => {
  const {search, started, gates, tick} = debounced(t, {debounce: 300});
  const first = search('a');
  await tick(200);
  const second = search('b');
  await tick(200);
  assert.deepEqual(started, []);
  await tick(100);
  assert.equal(await first, undefined);
  assert.deepEqual(started, ['b']);
  gates.get('b').resolve('found b');
  assert.equal(await second, 'found b');
});

test('a call after the body started retires it and waits again', async t => {
  const {search, started, signals, tick} = debounced(t, {debounce: 300});
  search('a');
  await tick(300);
  search('b');
  await flush();
  assert.equal(signals.get('a').aborted, true);
  await tick(300);
  assert.deepEqual(started, ['a', 'b']);
});

test('the timeout starts counting when the body starts', async t => {
  const {search, started, tick} = debounced(t, {debounce: 100, timeout: 200});
  search('a');
  await tick(100);
  assert.deepEqual(started, ['a']);
  await tick(199);
  assert.equal(search.status, 'pending');
  await tick(1);
  assert.equal(search.error.name, 'TimeoutError');
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

test('debounce takes a duration and only applies to the latest policy', () => {
  const group = policy => parseSurface(component(policy)).actionGroups[0];
  assert.equal(group('latest debounce 300ms').debounce, 300);
  assert.deepEqual([group('latest debounce 1s timeout 5s').debounce, group('latest debounce 1s timeout 5s').timeout], [1000, 5000]);
  assert.equal(group('latest').debounce, null);
  for (const invalid of ['single-flight debounce 300ms', 'queue debounce 1s', 'latest debounce',
    'latest debounce 300', 'latest debounce 1s debounce 2s']) {
    assert.throws(() => parseSurface(component(invalid)), {code: 'ELN-ACTION-GROUP-POLICY'}, invalid);
  }
});

test('a compiled group applies its debounce', {timeout: 20000}, async t => {
  const {default: fs} = await import('node:fs');
  const {default: os} = await import('node:os');
  const {default: path} = await import('node:path');
  const {pathToFileURL} = await import('node:url');
  const {buildSurfaceProject} = await import('../src/project-build.mjs');
  const {FakeNode, findButton, setupDOM} = await import('./fake-dom.mjs');
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-action-debounce-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'Search.eln');
  fs.writeFileSync(file, component('latest debounce 300ms'));
  const outputDir = path.join(directory, 'build');
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check')});
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  t.mock.timers.enable({apis: ['setTimeout']});
  const root = new FakeNode('root'), queries = [];
  t.after(module.mount(root, {query: 'elnor', find: query => { queries.push(query); return new Promise(() => {}); }}));
  for (let index = 0; index < 3; index++) findButton(root, 'Search').click();
  t.mock.timers.tick(299);
  await flush();
  assert.deepEqual(queries, []);
  t.mock.timers.tick(1);
  await flush();
  assert.deepEqual(queries, ['elnor']);
});
