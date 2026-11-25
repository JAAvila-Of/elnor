// Sequential regions accept general synchronous action bodies. State is read
// and written through the region, so the component keeps the region backend.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';
import {analyzeRegion} from '../src/region-compiler.mjs';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {FakeNode, findButton, setupDOM} from './fake-dom.mjs';

const counter = actions => `component Counter(step: number, notify: (value: number) => void) {
  state value = 0;
  state label = "zero";
  calc doubled = value * 2;
${actions}

  ui {
    section {
      p value
      p label
      p doubled
      button "Go" => go()
    }
  }
}
`;

const general = {
  localConst: '  action go() { const next = value + step; value = next; }',
  ifElse: '  action go() { if (value >= 2) { value = 0; label = "reset"; } else { value += step; label = "up"; } }',
  loop: '  action go() { let total = 0; for (let index = 0; index < 3; index++) total += index; value = total; }',
  tryCatch: '  action go() { try { if (value > 0) throw new Error("x"); value = 5; } catch { value = -1; } finally { label = "done"; } }',
  externalCall: '  action go() { value++; notify(value); }',
  calcRead: '  action go() { const base = doubled; value = base + 1; }',
  closure: '  action go() { const add = (amount: number) => { value += amount; }; add(step); add(step); }',
  shadowed: '  action go() { const value = 10; label = String(value); }',
};

test('general synchronous action bodies keep the sequential region backend', () => {
  for (const [name, action] of Object.entries(general)) {
    const plan = analyzeRegion(parseSurface(counter(action), 'Counter.eln'));
    assert.equal(plan.eligible, true, `${name}: ${JSON.stringify(plan.failures ?? plan.sequentialFailures)}`);
    assert.equal(plan.mode, 'sequential', name);
  }
});

const unsupported = {
  receiver: ['  action go() { value = this === undefined ? 1 : 2; }', /opaque-action-receiver-not-proven/],
  args: ['  action go() { value = arguments.length; }', /opaque-action-receiver-not-proven/],
};

test('action bodies outside the general subset keep the general fallback', () => {
  for (const [name, [action, reason]] of Object.entries(unsupported)) {
    const plan = analyzeRegion(parseSurface(counter(action), 'Counter.eln'));
    assert.equal(plan.eligible, false, name);
    assert.match(JSON.stringify(plan), reason, name);
  }
});

async function mount(t, action) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-actions-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'Counter.eln');
  fs.writeFileSync(file, counter(action));
  const outputDir = path.join(directory, 'build');
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check'), regionBackend: true});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const root = new FakeNode('root'), notified = [];
  t.after(module.mount(root, {step: 2, notify: value => notified.push(value)}));
  return {
    region: /region-runtime/.test(output),
    notified,
    click: () => findButton(root, 'Go').click(),
    view: () => root.descendants('p').map(node => node.textContent)
  };
}

const expectations = {
  localConst: [['2', 'zero', '4'], ['4', 'zero', '8']],
  ifElse: [['2', 'up', '4'], ['0', 'reset', '0']],
  loop: [['3', 'zero', '6'], ['3', 'zero', '6']],
  tryCatch: [['5', 'done', '10'], ['-1', 'done', '-2']],
  externalCall: [['1', 'zero', '2'], ['2', 'zero', '4']],
  calcRead: [['1', 'zero', '2'], ['3', 'zero', '6']],
  closure: [['4', 'zero', '8'], ['8', 'zero', '16']],
  shadowed: [['0', '10', '0'], ['0', '10', '0']],
};

for (const [name, steps] of Object.entries(expectations)) {
  test(`a region runs the ${name} action like the general renderer`, {timeout: 20000}, async t => {
    const view = await mount(t, general[name]);
    assert.equal(view.region, true);
    for (const expected of steps) {
      view.click();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(view.view(), expected);
    }
    if (name === 'externalCall') assert.deepEqual(view.notified, [1, 2]);
  });
}

// The general renderer is the oracle: a closure created by an action keeps
// reading and writing the component's state and props after it unmounts.
const later = `component Later(step: number, keep: (read: () => string, write: (next: number) => string) => void) {
  state value = 1;
  calc doubled = value * 2;
  action go() {
    value += step;
    keep(() => \`\${value}:\${doubled}:\${step}\`, next => { value = next; return \`\${value}:\${doubled}\`; });
  }

  ui {
    section {
      p value
      button "Go" => go()
    }
  }
}
`;

async function mountLater(t, region) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-later-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  // regionBackend: false builds the same component with the general renderer.
  const source = later;
  const file = path.join(directory, 'Later.eln');
  fs.writeFileSync(file, source);
  const outputDir = path.join(directory, 'build');
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check'), regionBackend: region});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  assert.equal(/region-runtime/.test(output), region);
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const root = new FakeNode('root'), kept = [];
  const unmount = module.mount(root, {step: 2, keep: (read, write) => kept.push({read, write})});
  findButton(root, 'Go').click();
  await new Promise(resolve => setImmediate(resolve));
  const before = kept[0].read();
  unmount();
  return {before, afterRead: kept[0].read(), afterWrite: kept[0].write(10), reread: kept[0].read()};
}

test('closures from a region action see state and props after unmount like the general renderer', {timeout: 30000}, async t => {
  const general = await mountLater(t, false);
  const region = await mountLater(t, true);
  assert.deepEqual(general, {before: '3:6:2', afterRead: '3:6:2', afterWrite: '10:6', reread: '10:6:2'});
  assert.deepEqual(region, general);
});

const child = `component Child() {
  state value = 0;
  action go() {
    value++;
    const kept = (globalThis as any).__elnorKept as Array<{read: () => number, write: (next: number) => void}>;
    kept.push({read: () => value, write: next => { value = next; }});
  }

  ui {
    section {
      p value
      button "Child" => go()
    }
  }
}
`;
const parent = `import Child from "./Child.eln";

component Parent() {
  state show = true;
  action toggle() { show = !show; }

  ui {
    section {
      button "Toggle" => toggle()
      if show {
        Child
      }
    }
  }
}
`;

async function reopen(t, region) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-reopen-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.writeFileSync(path.join(directory, 'Child.eln'), child);
  const file = path.join(directory, 'Parent.eln');
  fs.writeFileSync(file, parent);
  const outputDir = path.join(directory, 'build');
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check'), regionBackend: region});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  assert.equal(/region-runtime/.test(output), region);
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const kept = globalThis.__elnorKept = [];
  t.after(() => { delete globalThis.__elnorKept; });
  const root = new FakeNode('root');
  t.after(module.mount(root, {}));
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const text = () => root.descendants('p').map(node => node.textContent);
  findButton(root, 'Child').click();
  await settle();
  findButton(root, 'Toggle').click();
  await settle();
  findButton(root, 'Toggle').click();
  await settle();
  const old = kept[0];
  const result = {afterReopen: text(), oldRead: old.read()};
  old.write(7);
  await settle();
  result.afterOldWrite = text();
  result.oldReread = old.read();
  findButton(root, 'Child').click();
  await settle();
  result.newInstance = [text(), kept[1].read()];
  return result;
}

test('a closure from a closed branch keeps its own state and never reaches the reopened instance', {timeout: 30000}, async t => {
  const general = await reopen(t, false);
  assert.deepEqual(general, {afterReopen: ['0'], oldRead: 1, afterOldWrite: ['0'], oldReread: 7, newInstance: [['1'], 1]});
  assert.deepEqual(await reopen(t, true), general);
});
