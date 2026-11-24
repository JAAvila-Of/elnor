// The durable save example: DurableSave.eln with host.ts, compiled and mounted
// on the fake DOM against the loopback reference provider. The journal runs on
// an in-memory storage with a serial lock manager, so each test controls when
// a page ends and another one starts on the same storage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, {after, before} from 'node:test';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {launchLocalProcess} from '../examples/persistent-task-desk/local-process.mjs';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {getTs} from '../src/typescript.mjs';
import {FakeNode, findButton, findInput, setupDOM} from './fake-dom.mjs';

const folder = new URL('../examples/durable-save/', import.meta.url);
const view = fileURLToPath(new URL('DurableSave.eln', folder));
const host = fileURLToPath(new URL('host.ts', folder));
const provider = fileURLToPath(new URL('provider_fixture.py', folder));
const intents = pathToFileURL(fileURLToPath(new URL('../src/intents.mjs', import.meta.url))).href;
const python = process.env.ELNOR_TEST_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const prefix = 'elnor-durable-save-surface-';

let directory, mount, createNotes;
before(async () => {
  directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
  const outputDir = path.join(directory, 'build');
  const built = buildSurfaceProject(view, {outputDir, checkOutputDir: path.join(directory, 'check')});
  ({mount} = await import(pathToFileURL(path.join(outputDir, built.entryOutput))));
  // The host is TypeScript; the test runs its transpiled output, with the
  // journal module resolved from the repository.
  const source = fs.readFileSync(host, 'utf8');
  const output = getTs().transpileModule(source, {compilerOptions: {module: 99, target: 99}}).outputText;
  assert.match(output, /"\.\.\/\.\.\/src\/intents\.mjs"/);
  const file = path.join(directory, 'host.mjs');
  fs.writeFileSync(file, output.replace('"../../src/intents.mjs"', JSON.stringify(intents)));
  ({createNotes} = await import(pathToFileURL(file)));
  setupDOM();
});
after(() => {
  if (!directory) return;
  assert.ok(path.basename(directory).startsWith(prefix));
  fs.rmSync(directory, {recursive: true, force: true});
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: key => { values.delete(key); }
  };
}

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

async function providerFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const run = launchLocalProcess(python, ['-u', provider, '--db', path.join(dir, 'ledger.sqlite'), '--faults'], {label: 'Durable provider'});
  t.after(async () => {
    await run.stop().catch(() => {});
    assert.ok(path.basename(dir).startsWith(prefix));
    fs.rmSync(dir, {recursive: true, force: true});
  });
  const ready = await run.ready();
  const url = 'http://127.0.0.1:' + ready.port;
  return {
    url, epoch: ready.epoch,
    async stats() { return (await fetch(url + '/stats')).json(); }
  };
}

// Records every request and adds the fault header to the first one that
// carries an epoch, which is the first one the provider can apply.
function recordingFetch(fault) {
  const requests = [];
  let faulted = !fault;
  const send = async (url, init) => {
    const headers = {...init.headers};
    if (!faulted && headers['Intent-Epoch']) {
      faulted = true;
      headers['X-Fixture-Fault'] = fault;
    }
    const request = {url: String(url), headers, settled: false};
    requests.push(request);
    try { return await fetch(url, {...init, headers}); }
    finally { request.settled = true; }
  };
  return {requests, send};
}

function page(t, provider, storage, fetch) {
  const {journal, notes} = createNotes({storage, account: 'alice', baseUrl: provider.url, fetch: fetch.send, locks: serialLocks()});
  const root = new FakeNode('root');
  const dispose = mount(root, {notes});
  let ended = false;
  const view = {
    root,
    end() { if (!ended) { ended = true; dispose(); journal.stop(); } },
    async fill(text) {
      const input = findInput(root, 'Text');
      input.value = text;
      input.dispatch('input');
      await sleep(0);
    },
    submit() { root.descendants('form')[0].listeners.submit[0]({preventDefault() {}}); },
    label: () => root.descendants('small')[0].textContent,
    message: () => root.descendants('strong')[0].textContent,
    text: () => root.descendants('p').map(node => node.textContent).join(' ')
  };
  t.after(() => view.end());
  return view;
}

async function until(check, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) assert.fail(message);
    await sleep(10);
  }
}

const keyOf = request => request.url.split('/').at(-1);

test('saves once across a lost reply and a remount', async t => {
  const provider = await providerFixture(t), storage = memoryStorage();
  const lossy = recordingFetch('after');
  const first = page(t, provider, storage, lossy);
  assert.equal(first.label(), 'Ready');
  await first.fill('first draft');
  first.submit();
  await until(() => lossy.requests.some(request => request.headers['X-Fixture-Fault'] && request.settled), 'the faulted request did not end');
  assert.equal(first.label(), 'Saving');
  first.end();

  const reliable = recordingFetch();
  const second = page(t, provider, storage, reliable);
  await until(() => second.label() === 'Saved', 'the remounted view did not show the outcome: ' + second.label());
  assert.equal(keyOf(reliable.requests[0]), keyOf(lossy.requests.at(-1)), 'the replay reuses the stored key');
  assert.deepEqual(await provider.stats(), {epoch: provider.epoch, effects: 1, intents: 1});
});

// Writes the note through another key, as another device of the account would.
async function writeElsewhere(provider, key, input) {
  const response = await fetch(provider.url + '/notes.save/' + key, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json', 'Intent-Scope': 'alice', 'Intent-Epoch': provider.epoch, 'X-Fixture-Account': 'alice'},
    body: JSON.stringify({input})
  });
  return (await response.json()).result.revision;
}

test('shows a conflict and saves again with a new key', async t => {
  const provider = await providerFixture(t), storage = memoryStorage();
  assert.equal(await writeElsewhere(provider, 'theirs', {text: 'their text', revision: 0}), 1);

  const recorded = recordingFetch();
  const view = page(t, provider, storage, recorded);
  await view.fill('my text');
  view.submit();
  await until(() => view.label() === 'Rejected', 'the view did not show the rejection: ' + view.label());
  assert.match(view.message(), /Someone else changed this note/);
  assert.match(view.text(), /their text/);
  assert.equal(findButton(view.root, 'Save').disabled, true, 'saving waits for the review');

  findButton(view.root, 'Keep my text').click();
  await sleep(0);
  assert.equal(findInput(view.root, 'Text').value, 'my text');
  assert.equal(findButton(view.root, 'Save').disabled, false);
  view.submit();
  await until(() => view.label() === 'Saved', 'the second save did not apply: ' + view.label());
  const keys = [...new Set(recorded.requests.map(keyOf))];
  assert.equal(keys.length, 2, keys.join(', '));
  assert.notEqual(keys[0], 'theirs');
  assert.equal((await provider.stats()).effects, 2);

  // Another conflict, resolved by taking the other text.
  assert.equal(await writeElsewhere(provider, 'theirs-again', {text: 'their second text', revision: 2}), 3);
  await view.fill('my second text');
  view.submit();
  await until(() => view.label() === 'Rejected', 'the view did not show the second rejection: ' + view.label());
  findButton(view.root, 'Use their text').click();
  await sleep(0);
  assert.equal(findInput(view.root, 'Text').value, 'their second text');
  view.submit();
  await until(() => view.label() === 'Saved', 'the save after taking their text did not apply: ' + view.label());
  assert.equal(new Set(recorded.requests.map(keyOf)).size, 4);
  assert.equal((await provider.stats()).effects, 4);
});

test('a blocked record shows Blocked and keeps Save disabled', async t => {
  const record = {
    format: 1, journal: 'notes', scope: 'alice', owner: '"note"', member: 'save', operation: 'notes.save', version: 1,
    key: 'old', epoch: 'E1', params: [{text: 'old text', revision: 0}], input: {text: 'old text', revision: 0},
    state: 'blocked', reason: 'epoch', admittedBy: 'earlier-page'
  };
  const storage = memoryStorage();
  storage.setItem('elnor-intents:alice', JSON.stringify({format: 1, epoch: 'E1', records: [record]}));
  const recorded = recordingFetch();
  // Nothing is sent for a blocked record, so no provider is needed.
  const view = page(t, {url: 'http://127.0.0.1:9'}, storage, recorded);
  await until(() => view.label() === 'Blocked', 'the view did not show the blocked record: ' + view.label());
  assert.equal(findButton(view.root, 'Save').disabled, true, "the group's pending is false, so the status keeps Save disabled");
  await view.fill('new text');
  view.submit();
  await sleep(20);
  assert.equal(recorded.requests.length, 0);
  assert.equal(JSON.parse(storage.getItem('elnor-intents:alice')).records.length, 1);
});

test('the example meets the DX criterion', () => {
  const nonblank = file => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line.trim()).length;
  const lines = nonblank(view) + nonblank(host);
  assert.ok(lines <= 98, `DurableSave.eln and host.ts have ${lines} nonblank lines`);
});

test('the example has no editor warnings or errors', t => {
  const service = createSurfaceLanguageService({root: fileURLToPath(folder)});
  t.after(() => service.dispose());
  service.open(view, fs.readFileSync(view, 'utf8'));
  assert.deepEqual(service.diagnostics(view), []);
});

// The README states this limit: the durable checks read declared types, so
// `any` passes the owner and JSON checks and `{}` passes the JSON checks.
test('the durable checks cannot see through any or {}', t => {
  const workspace = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
  t.after(() => fs.rmSync(workspace, {recursive: true, force: true}));
  fs.copyFileSync(fileURLToPath(new URL('../src/intents.d.mts', import.meta.url)), path.join(workspace, 'intents.d.mts'));
  const file = path.join(workspace, 'Probe.eln');
  const probe = (owner, value) => `import type {DurableOperation} from "./intents.d.mts";
component Probe(id: ${owner}, ops: {save: DurableOperation<${value}, ${value}, null>}) {
  state message = "";
  action group saving(id) durable "probe"
  action async save(input: ${value}) in saving {
    const outcome = await ops.save(input);
    message = outcome.status;
  }
  ui {
    p message
  }
}
`;
  const service = createSurfaceLanguageService({root: workspace});
  t.after(() => service.dispose());
  const codes = (owner, value) => {
    service.open(file, probe(owner, value));
    return service.diagnostics(file).map(item => item.code);
  };
  assert.deepEqual(codes('string', 'Date'), ['ELN-DURABLE-TYPE', 'ELN-DURABLE-TYPE', 'ELN-DURABLE-TYPE']);
  assert.deepEqual(codes('any', 'any'), []);
  assert.deepEqual(codes('string', '{}'), []);
  assert.deepEqual(codes('{}', 'string'), ['ELN-DURABLE-TYPE']);
});
