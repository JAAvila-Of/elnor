// A durable group admits each call as an intent in the journal its operations
// carry, shows the intent's status, and resumes the member's body after the
// awaited call when the outcome arrives, in this page or a later one. These
// tests compile a component, mount it on the fake DOM and drive a journal over
// an in-memory storage, a serial lock manager and a transport answered by hand.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, {before} from 'node:test';
import {setImmediate as tick} from 'node:timers/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createIntentJournal} from '../src/intents.mjs';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {FakeNode, findButton, setupDOM} from './fake-dom.mjs';

const intents = fileURLToPath(new URL('../src/intents.d.mts', import.meta.url));
const storageKey = 'elnor-intents:alice';

const editor = `import type {DurableOperation} from "./intents.d.mts";

component Editor(tasks: {update: DurableOperation<{id: string; title: string}, {revision: number}, {kind: string}>; touch: DurableOperation<{id: string}, null, null>}, log: (line: string) => void, first: string) {
  state taskId = first;
  state revision = 0;
  state message = "";
  action group editing(taskId) durable "task-edit"

  action async save(edit: {id: string; title: string}) in editing {
    const outcome = await tasks.update(edit);
    log(outcome.status + ":" + edit.title + ":" + String(outcome.late));
    if (edit.title === "boom") throw new Error("handler failed");
    if (edit.title === "move") taskId = "t9";
    if (outcome.status === "applied") {
      revision = outcome.result.revision;
      message = "Saved " + edit.title;
      return outcome.result.revision;
    }
    message = "Not saved";
    return 0;
  }

  action async touch() in editing {
    await tasks.touch({id: taskId});
    message = "Touched " + taskId;
  }

  action async submit(title: string) {
    const value = await save({id: taskId, title});
    log("returned:" + String(value));
  }

  action open(id: string) { taskId = id; }

  ui {
    section {
      p (save.status)
      p message
      p (String(revision))
      button "Save A" => submit("A")
      button "Save B" => submit("B")
      button "Save boom" => submit("boom")
      button "Save move" => submit("move")
      button "Open t2" => open("t2")
      button "Touch" => touch()
    }
  }
}
`;

const plain = `component Counter(start: number) {
  state count = start;
  action group work(count) single-flight
  action async bump() in work { count = count + 1; }
  ui {
    section {
      p (String(count))
      button "Bump" => bump()
    }
  }
}
`;

function workspace(prefix) {
  const temp = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temp, prefix));
  fs.copyFileSync(intents, path.join(directory, 'intents.d.mts'));
  return directory;
}

function compile(directory, name, source) {
  const file = path.join(directory, `${name}.eln`);
  fs.writeFileSync(file, source);
  const outputDir = path.join(directory, `build-${name}`);
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, `check-${name}`)});
  return {outputDir, entry: path.join(outputDir, build.entryOutput)};
}

let compiled, directory;
before(async () => {
  directory = workspace('elnor-durable-groups-');
  compiled = compile(directory, 'Editor', editor);
  compiled.module = await import(pathToFileURL(compiled.entry));
  setupDOM();
});
process.on('exit', () => { if (directory) fs.rmSync(directory, {recursive: true, force: true}); });

function memoryStorage(text = JSON.stringify({format: 1, epoch: 'E1', records: []})) {
  const values = new Map(text === null ? [] : [[storageKey, text]]);
  return {
    values,
    // When set, the next write throws instead of storing.
    failNextWrite: false,
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem(key, value) {
      if (this.failNextWrite) {
        this.failNextWrite = false;
        throw new Error('storage write failed');
      }
      values.set(key, String(value));
    },
    removeItem: key => { values.delete(key); }
  };
}

// Runs lock callbacks one at a time. While held, new requests wait for release.
function serialLocks() {
  let tail = Promise.resolve(), gate = null;
  return {
    hold() { gate = Promise.withResolvers(); },
    release() { gate?.resolve(); gate = null; },
    request(name, callback) {
      const waitFor = gate?.promise;
      const run = tail.then(() => waitFor).then(() => callback({name, mode: 'exclusive'}));
      tail = run.catch(() => {});
      return run;
    }
  };
}

// Each request waits until the test answers it, or until its signal aborts.
function manualTransport() {
  const requests = [];
  return {
    requests,
    answer(answer, index = requests.length - 1) { requests[index].resolve(answer); },
    send(request) {
      const pending = Promise.withResolvers();
      request.signal.addEventListener('abort', () => pending.reject(request.signal.reason));
      requests.push({...request, resolve: pending.resolve});
      return pending.promise;
    }
  };
}

function setup({storage = memoryStorage(), locks = serialLocks(), transport = manualTransport()} = {}) {
  const journal = createIntentJournal({storage, scope: 'alice', locks});
  const update = journal.operation('tasks.update', {version: 1, transport});
  const touch = journal.operation('tasks.touch', {version: 1, transport});
  journal.start();
  return {storage, locks, transport, journal, update, touch};
}

function mount(t, {update, touch}, {first = 't1', log = []} = {}) {
  const root = new FakeNode('root');
  const dispose = compiled.module.mount(root, {tasks: {update, touch}, log: line => log.push(line), first});
  let disposed = false;
  const view = {
    root, log,
    dispose() { if (!disposed) { disposed = true; dispose(); } },
    click: label => findButton(root, label).click(),
    status: () => root.descendants('p')[0].textContent,
    message: () => root.descendants('p')[1].textContent,
    revision: () => root.descendants('p')[2].textContent
  };
  t.after(() => view.dispose());
  return view;
}

function records(storage) {
  const text = storage.getItem(storageKey);
  return text === null ? [] : JSON.parse(text).records;
}

async function settle() {
  for (let turn = 0; turn < 20; turn++) await tick();
}

const applied = (revision, epoch = 'E1') => ({kind: 'applied', epoch, result: {revision}});

function stubReportError(t) {
  const reported = [], previous = globalThis.reportError;
  globalThis.reportError = error => { reported.push(error); };
  t.after(() => { globalThis.reportError = previous; });
  return reported;
}

test('a call admits, shows pending, and resumes with the outcome', async t => {
  const journal = setup();
  t.after(() => journal.journal.stop());
  const view = mount(t, journal);
  await settle();
  assert.equal(view.status(), 'idle');
  view.click('Save A');
  await settle();
  assert.equal(view.status(), 'pending');
  assert.equal(journal.transport.requests.length, 1);
  assert.deepEqual(journal.transport.requests[0].input, {id: 't1', title: 'A'});
  const [stored] = records(journal.storage);
  assert.equal(stored.owner, '"t1"');
  assert.equal(stored.member, 'save');
  assert.deepEqual(stored.params, [{id: 't1', title: 'A'}]);
  journal.transport.answer(applied(7));
  await settle();
  assert.equal(view.status(), 'success');
  assert.equal(view.message(), 'Saved A');
  assert.equal(view.revision(), '7');
  assert.deepEqual(view.log, ['applied:A:false', 'returned:7']);
  assert.deepEqual(records(journal.storage), []);
});

test('a reload resumes the body with stored parameters and late true', async t => {
  const storage = memoryStorage();
  const earlier = setup({storage});
  const first = mount(t, earlier);
  first.click('Save B');
  await settle();
  assert.equal(first.status(), 'pending');
  first.dispose();
  earlier.journal.stop();
  await settle();
  assert.deepEqual(first.log, ['returned:undefined']);
  assert.equal(records(storage)[0].state, 'pending');

  const later = setup({storage});
  t.after(() => later.journal.stop());
  const view = mount(t, later);
  await settle();
  assert.equal(view.status(), 'pending');
  assert.equal(later.transport.requests.length, 1);
  assert.deepEqual(later.transport.requests[0].input, {id: 't1', title: 'B'});
  later.transport.answer(applied(3));
  await settle();
  assert.deepEqual(view.log, ['applied:B:true']);
  assert.equal(view.status(), 'success');
  assert.equal(view.message(), 'Saved B');
  assert.equal(view.revision(), '3');
  assert.deepEqual(records(storage), []);
});

test('an owner change keeps the intent and a later mount observes it', async t => {
  const journal = setup();
  t.after(() => journal.journal.stop());
  const view = mount(t, journal);
  view.click('Save A');
  await settle();
  view.click('Open t2');
  await settle();
  assert.equal(view.status(), 'idle');
  assert.deepEqual(view.log, ['returned:undefined']);
  assert.equal(records(journal.storage)[0].state, 'pending');
  assert.equal(journal.transport.requests[0].signal.aborted, false);

  const later = mount(t, journal);
  await settle();
  assert.equal(later.status(), 'pending');
  journal.transport.answer(applied(5));
  await settle();
  assert.deepEqual(later.log, ['applied:A:false']);
  assert.equal(later.status(), 'success');
  assert.deepEqual(view.log, ['returned:undefined']);
  assert.equal(view.status(), 'idle');
  assert.deepEqual(records(journal.storage), []);
});

test('an owner change while the outcome waits for the lock leaves it to the next mount', async t => {
  const storage = memoryStorage(), locks = serialLocks();
  // Hold the lock as soon as the outcome is stored, so the consumer waits.
  const setItem = storage.setItem;
  storage.setItem = function (key, value) {
    setItem.call(this, key, value);
    if (value.includes('"terminal"')) locks.hold();
  };
  const journal = setup({storage, locks});
  t.after(() => journal.journal.stop());
  const view = mount(t, journal);
  view.click('Save A');
  await settle();
  journal.transport.answer(applied(4));
  await settle();
  view.click('Open t2');
  await settle();
  locks.release();
  await settle();
  assert.deepEqual(view.log, ['returned:undefined']);
  assert.equal(records(storage)[0].state, 'terminal');

  const later = mount(t, journal);
  await settle();
  assert.deepEqual(later.log, ['applied:A:false']);
  assert.equal(later.status(), 'success');
  assert.deepEqual(records(storage), []);
});

test('a body that changes the owner still gives the call its value', async t => {
  const journal = setup();
  t.after(() => journal.journal.stop());
  const view = mount(t, journal);
  view.click('Save move');
  await settle();
  journal.transport.answer(applied(8));
  await settle();
  assert.deepEqual(view.log, ['applied:move:false', 'returned:8']);
  assert.equal(view.revision(), '8');
  assert.equal(view.status(), 'idle', 'the new owner has no intent');
  assert.deepEqual(records(journal.storage), []);
});

test('a component disposed after its body ran still gives the call its value', async t => {
  const journal = setup();
  t.after(() => journal.journal.stop());
  const log = [];
  let view;
  // The body logs, and the log disposes the component while the record is
  // still being removed under the lock.
  view = mount(t, journal, {log: {push(line) { log.push(line); if (line.startsWith('applied:')) view.dispose(); }}});
  view.click('Save A');
  await settle();
  journal.transport.answer(applied(5));
  await settle();
  assert.deepEqual(log, ['applied:A:false', 'returned:5']);
  assert.deepEqual(records(journal.storage), []);
});

test('two mounted instances deliver one resume', async t => {
  const journal = setup();
  t.after(() => journal.journal.stop());
  const log = [];
  const one = mount(t, journal, {log}), two = mount(t, journal, {log});
  await settle();
  one.click('Save A');
  await settle();
  assert.equal(one.status(), 'pending');
  assert.equal(two.status(), 'pending');
  journal.transport.answer(applied(9));
  await settle();
  assert.equal(log.filter(line => line.startsWith('applied:')).length, 1);
  assert.equal(one.status(), 'success');
  assert.equal(two.status(), 'success');
  assert.deepEqual(records(journal.storage), []);
});

test('a throwing body is reported once and removed', async t => {
  const reported = stubReportError(t);
  const storage = memoryStorage();
  const journal = setup({storage});
  const view = mount(t, journal);
  view.click('Save boom');
  await settle();
  journal.transport.answer(applied(2));
  await settle();
  assert.equal(reported.length, 1);
  assert.equal(reported[0].message, 'handler failed');
  assert.deepEqual(view.log, ['applied:boom:false', 'returned:undefined']);
  assert.deepEqual(records(storage), []);
  view.dispose();
  journal.journal.stop();

  const later = setup({storage});
  t.after(() => later.journal.stop());
  const again = mount(t, later);
  await settle();
  assert.deepEqual(again.log, []);
  assert.equal(reported.length, 1);
});

test('calls are refused while pending or blocked', async t => {
  const journal = setup();
  t.after(() => journal.journal.stop());
  const view = mount(t, journal);
  view.click('Save A');
  await settle();
  view.click('Save B');
  await settle();
  assert.deepEqual(view.log, ['returned:undefined']);
  assert.equal(journal.transport.requests.length, 1);
  assert.equal(records(journal.storage).length, 1);

  const blockedRecord = {
    format: 1, journal: 'task-edit', scope: 'alice', owner: '"t1"', member: 'save', operation: 'tasks.update', version: 1,
    key: 'old', epoch: 'E1', params: [{id: 't1', title: 'Old'}], input: {id: 't1', title: 'Old'}, state: 'blocked', reason: 'mismatch', admittedBy: 'earlier-page'
  };
  const blocked = setup({storage: memoryStorage(JSON.stringify({format: 1, epoch: 'E1', records: [blockedRecord]}))});
  t.after(() => blocked.journal.stop());
  const other = mount(t, blocked);
  await settle();
  assert.equal(other.status(), 'blocked');
  other.click('Save A');
  await settle();
  assert.deepEqual(other.log, ['returned:undefined']);
  assert.equal(blocked.transport.requests.length, 0);
  assert.equal(records(blocked.storage).length, 1);
});

test('a page that ends between resume and removal resumes once more with late true', async t => {
  const reported = stubReportError(t);
  const storage = memoryStorage();
  const earlier = setup({storage});
  const log = [];
  // The body runs, then the write that removes its record fails, as if the
  // page ended before the removal.
  const first = mount(t, earlier, {log: {push(line) { log.push(line); if (line.startsWith('applied:')) storage.failNextWrite = true; }}});
  first.click('Save A');
  await settle();
  earlier.transport.answer(applied(6));
  await settle();
  assert.deepEqual(log, ['applied:A:false', 'returned:6']);
  assert.equal(records(storage)[0].state, 'terminal');
  assert.deepEqual(reported.map(error => error.message), ['storage write failed']);
  first.dispose();
  earlier.journal.stop();

  const later = setup({storage});
  t.after(() => later.journal.stop());
  const view = mount(t, later);
  await settle();
  assert.deepEqual(view.log, ['applied:A:true']);
  assert.equal(view.status(), 'success');
  assert.deepEqual(records(storage), []);
});

test('a member without parameters or an outcome name resumes its body', async t => {
  const journal = setup();
  t.after(() => journal.journal.stop());
  const view = mount(t, journal);
  view.click('Touch');
  await settle();
  assert.equal(view.status(), 'idle', 'the status belongs to the member that admitted the intent');
  const [stored] = records(journal.storage);
  assert.equal(stored.member, 'touch');
  assert.deepEqual(stored.params, []);
  assert.deepEqual(journal.transport.requests[0].input, {id: 't1'});
  view.click('Save A');
  await settle();
  assert.deepEqual(view.log, ['returned:undefined'], 'members share the owner');
  journal.transport.answer({kind: 'applied', epoch: 'E1', result: null}, 0);
  await settle();
  assert.equal(view.message(), 'Touched t1');
  assert.deepEqual(records(journal.storage), []);
});

test('the members of a group need operations of one journal', t => {
  const one = setup(), two = setup();
  t.after(() => { one.journal.stop(); two.journal.stop(); });
  const props = {log() {}, first: 't1'};
  assert.throws(() => compiled.module.mount(new FakeNode('root'), {...props, tasks: {update: () => ({}), touch: one.touch}}),
    /must call an operation created with journal.operation/);
  assert.throws(() => compiled.module.mount(new FakeNode('root'), {...props, tasks: {update: one.update, touch: two.touch}}),
    /must call operations of one journal/);
});

function emittedFiles(build) {
  const manifest = JSON.parse(fs.readFileSync(path.join(build.outputDir, 'manifest.json'), 'utf8'));
  return manifest.files.map(item => item.file.split('/').slice(2).join('/'));
}

function readEmitted(build, file) {
  const manifest = JSON.parse(fs.readFileSync(path.join(build.outputDir, 'manifest.json'), 'utf8'));
  return fs.readFileSync(path.join(build.outputDir, 'builds', manifest.buildId, file), 'utf8');
}

test('a graph without durable groups emits no durable runtime and imports nothing from it', () => {
  const plainBuild = compile(directory, 'Counter', plain);
  const emitted = fs.readFileSync(plainBuild.entry, 'utf8');
  assert.match(emitted, /createActionGroup/);
  assert.doesNotMatch(emitted, /createDurableGroup|durable-runtime/);
  assert.ok(emittedFiles(plainBuild).includes('runtime.mjs'));
  assert.ok(!emittedFiles(plainBuild).includes('durable-runtime.mjs'), emittedFiles(plainBuild).join(', '));
  const runtime = readEmitted(plainBuild, 'runtime.mjs');
  assert.doesNotMatch(runtime, /createDurableGroup/);
});

test('a graph with a durable group emits the durable runtime next to runtime.mjs and imports from it', () => {
  const files = emittedFiles(compiled);
  assert.ok(files.includes('runtime.mjs') && files.includes('durable-runtime.mjs'), files.join(', '));
  const emitted = fs.readFileSync(compiled.entry, 'utf8');
  assert.match(emitted, /import \{ createDurableGroup as \w+ \} from "\.{1,2}\/(?:\.\.\/)*durable-runtime\.mjs";/);
  assert.doesNotMatch(emitted, /createActionGroup/);
  const runtime = readEmitted(compiled, 'durable-runtime.mjs');
  assert.match(runtime, /from '\.\/runtime\.mjs'/);
});
