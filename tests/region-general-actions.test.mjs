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
  async: ['  action async go() { value = await Promise.resolve(1); }', /action-signature-not-proven/],
  otherAction: ['  action reset() { value = 0; }\n  action go() { if (value > 1) reset(); }', /opaque-action-call-not-proven/],
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
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check')});
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
