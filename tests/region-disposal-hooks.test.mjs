// on dispose in the region backend. The general renderer is the oracle for the
// hook order, the state a hook reads, calls from a hook and hook failures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';
import {analyzeRegion} from '../src/region-compiler.mjs';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {FakeNode, setupDOM} from './fake-dom.mjs';

const child = `component Child() {
  state count = 0;
  on dispose() => release()
  action add() { count++; }
  action release() {
    const log = (globalThis as any).__elnorLog as string[];
    log.push("child " + count);
    count = 100;
    log.push("child after " + count);
  }

  ui {
    div {
      p count
      button "Add" => add()
    }
  }
}
`;

const failing = `component Failing() {
  state label = "failing";
  on dispose() => explode()
  action explode() { throw new Error("hook " + label); }

  ui {
    p label
  }
}
`;

const parent = `import Child from "./Child.eln";
import Failing from "./Failing.eln";

component Parent(log: (entry: string) => void) {
  state show = true;
  state broken = true;
  state value = 1;
  on dispose() => log("parent " + value)
  action toggle() { show = !show; }
  action breakOff() { broken = false; }
  action bump() { value++; }

  ui {
    section {
      button "Toggle" => toggle()
      button "Break" => breakOff()
      button "Bump" => bump()
      if show {
        Child
      }
      if broken {
        Failing
      }
      Child
    }
  }
}
`;

test('components with on dispose keep the sequential region backend', () => {
  for (const [name, source] of [['Child', child], ['Failing', failing]]) {
    const plan = analyzeRegion(parseSurface(source, `${name}.eln`));
    assert.equal(plan.eligible, true, `${name}: ${JSON.stringify(plan.sequentialFailures ?? plan.failures)}`);
  }
});

async function run(t, region) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-dispose-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  // regionBackend: false builds the same components with the general renderer.
  fs.writeFileSync(path.join(directory, 'Child.eln'), child);
  fs.writeFileSync(path.join(directory, 'Failing.eln'), failing);
  const file = path.join(directory, 'Parent.eln');
  fs.writeFileSync(file, parent);
  const outputDir = path.join(directory, 'build');
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check'), regionBackend: region});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  assert.equal(/region-runtime/.test(output), region);
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const log = globalThis.__elnorLog = [];
  t.after(() => { delete globalThis.__elnorLog; });
  const root = new FakeNode('root');
  const unmount = module.mount(root, {log: entry => log.push(entry)});
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const click = async (label, index = 0) => { root.descendants('button').filter(node => node.textContent === label)[index].click(); await settle(); };
  await click('Add', 0);
  await click('Add', 1);
  await click('Add', 1);
  await click('Bump');
  await click('Toggle');
  const afterToggle = [...log];
  await click('Toggle');
  let unmountError = null;
  try { unmount(); } catch (error) { unmountError = `${error.name}: ${error.message}`; }
  return {afterToggle, log: [...log], unmountError};
}

test('on dispose runs in the order and with the state of the general renderer', {timeout: 30000}, async t => {
  const oracle = await run(t, false);
  assert.deepEqual(oracle.afterToggle, ['child 1', 'child after 100']);
  assert.ok(oracle.log.includes('parent 2'));
  assert.deepEqual(await run(t, true), oracle);
});
