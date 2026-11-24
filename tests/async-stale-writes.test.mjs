// ELN-ASYNC-STALE-WRITE: a write to component state after an await, in an
// async action outside an action group, may apply an obsolete result when the
// action runs again. Writes guarded by a check of current state are accepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createSurfaceLanguageService} from '../src/language-service.mjs';

const component = actions => `component Search(load: (query: string) => Promise<string>) {
  state query = "";
  state result = "";
  state pending = false;
  state generation = 0;
  action group searching(query) latest
${actions}

  ui {
    section {
      p result
    }
  }
}
`;

function warnings(t, actions) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-stale-writes-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const service = createSurfaceLanguageService({root: directory});
  t.after(() => service.dispose());
  const file = path.join(directory, 'Search.eln'), text = component(actions);
  service.open(file, text);
  const diagnostics = service.diagnostics(file);
  assert.ok(diagnostics.every(item => item.severity === 'warning'), JSON.stringify(diagnostics));
  return diagnostics.filter(item => item.code === 'ELN-ASYNC-STALE-WRITE').map(item => ({
    text: text.slice(item.start, item.start + item.length), line: text.slice(0, item.start).split('\n').length, severity: item.severity, message: item.message
  }));
}

test('a write after await outside a group warns at the written state', t => {
  const found = warnings(t, '  action async find() { const value = await load(query); result = value; }');
  assert.equal(found.length, 1);
  assert.equal(found[0].text, 'result');
  assert.equal(found[0].severity, 'warning');
  assert.match(found[0].message, /action group/);
});

test('an unguarded finally after await and a write before await in a loop warn', t => {
  const found = warnings(t, `  action async find() {
    pending = true;
    try {
      result = await load(query);
    } finally {
      pending = false;
    }
  }
  action async poll() {
    for (let index = 0; index < 3; index++) {
      result = "waiting";
      await load(query);
    }
  }`);
  assert.deepEqual(found.map(item => item.text), ['result', 'pending', 'result']);
});

test('grouped actions, guarded writes, locals and writes before await do not warn', t => {
  assert.deepEqual(warnings(t, `  action async grouped() in searching { result = await load(query); }
  action async guarded() {
    pending = true;
    const version = ++generation;
    try {
      const value = await load(query);
      if (version !== generation) return;
      result = value;
    } catch {
      if (version === generation) result = "failed";
    } finally {
      if (version === generation) {
        pending = false;
      }
    }
  }
  action async local() {
    let result = "";
    result = await load(query);
    void result;
  }
  action async early() {
    result = "";
    pending = true;
    await load(query);
  }
  action async nested() {
    await load(query);
    const later = () => { result = "x"; };
    void later;
  }
  action sync() { result = "now"; }`), []);
});

test('guards that read live values count, guards on captured data do not', t => {
  const found = warnings(t, `  action async aborted() {
    const active = new AbortController();
    const value = await load(query);
    if (active.signal.aborted) return;
    result = value;
  }
  action async getter() {
    const token = {get current() { return generation === 0; }};
    const value = await load(query);
    if (!token.current) return;
    result = value;
  }
  action async captured() {
    const response = {ok: true};
    const value = await load(query);
    if (!response.ok) return;
    pending = false;
    void value;
  }`);
  assert.deepEqual(found.map(item => item.text), ['pending']);
});

test('a guard counts only when no await separates it from the write', t => {
  const found = warnings(t, `  action async stale() {
    const version = ++generation;
    const first = await load(query);
    if (version !== generation) return;
    const second = await load(first);
    result = second;
  }
  action async branch() {
    const version = ++generation;
    await load(query);
    if (version === generation) {
      await load(query);
      result = "late";
    }
  }`);
  assert.deepEqual(found.map(item => item.text), ['result', 'result']);
});

test('an entry lock set before the first await keeps the action from overlapping itself', t => {
  const found = warnings(t, `  action async locked() {
    if (pending) return;
    pending = true;
    try {
      result = await load(query);
    } finally {
      pending = false;
    }
  }
  action async unlocked() {
    if (pending) return;
    result = await load(query);
  }`);
  assert.deepEqual(found.map(item => item.text), ['result']);
});

test('a catch counts as guarded when every await reaches it through a live check', t => {
  const found = warnings(t, `  action async covered() {
    const version = ++generation;
    try {
      try {
        await load(query);
      } catch (error) {
        if (version !== generation) return;
        throw error;
      }
      if (version !== generation) return;
      result = "done";
    } catch {
      result = "failed";
    }
  }
  action async uncovered() {
    const version = ++generation;
    try {
      await load(query);
      if (version !== generation) return;
      result = "done";
    } catch {
      result = "failed";
    }
  }`);
  assert.deepEqual(found.map(item => item.line), [29]);
});

test('the repository examples produce no stale write warnings', t => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../examples');
  const files = [];
  const walk = directory => { for (const entry of fs.readdirSync(directory, {withFileTypes: true})) { const file = path.join(directory, entry.name); if (entry.isDirectory()) walk(file); else if (entry.name.endsWith('.eln')) files.push(file); } };
  walk(root);
  const service = createSurfaceLanguageService({root});
  t.after(() => service.dispose());
  const found = [];
  for (const file of files) {
    service.open(file, fs.readFileSync(file, 'utf8'));
    for (const item of service.diagnostics(file)) if (item.code === 'ELN-ASYNC-STALE-WRITE') found.push(`${path.relative(root, file)}:${item.line}`);
  }
  assert.deepEqual(found, []);
});
