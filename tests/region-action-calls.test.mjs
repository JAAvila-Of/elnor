// Actions that call other actions. The general renderer is the oracle: the
// region must render the same DOM and closures must keep reaching the instance
// that created them, after a branch closes and reopens and after unmount.
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

const child = `component Counter() {
  state value = 0;
  state log = "";
  calc doubled = value * 2;
  action note(entry: string) { log = log + entry; }
  action bump(by: number = 1) { value += by; note("b"); return value; }
  action twice() { const first = bump(2); if (first < 10) bump(); note(String(doubled)); }
  action countdown(from: number) { if (from <= 0) return; note(String(from)); countdown(from - 1); }
  action keep() {
    const kept = (globalThis as any).__elnorKept as Array<() => string>;
    const run = (step: (by?: number) => number) => step(5);
    kept.push(() => { run(bump); note("k"); return value + ":" + log + ":" + doubled; });
  }
  action same() { const kept = (globalThis as any).__elnorSame as Array<unknown>; kept.push(bump); }

  ui {
    section {
      p value
      p log
      p doubled
      button "Twice" => twice()
      button "Countdown" => countdown(3)
      button "Keep" => keep()
      button "Same" => same()
    }
  }
}
`;

const parent = `import Counter from "./Counter.eln";

component Parent() {
  state show = true;
  action toggle() { show = !show; }

  ui {
    section {
      button "Toggle" => toggle()
      if show {
        Counter
      }
    }
  }
}
`;

test('a component whose actions call each other keeps the sequential region backend', () => {
  const plan = analyzeRegion(parseSurface(child, 'Counter.eln'));
  assert.equal(plan.eligible, true, JSON.stringify(plan.sequentialFailures ?? plan.failures));
});

function serialize(node) {
  if (node.tag === '#comment') return '';
  if (node.tag === '#text') return node.textContent;
  const inner = node.childNodes.map(serialize).join('');
  if (node.tag === 'fragment' || node.tag === 'root') return inner;
  return `<${node.tag}>${node._text ?? ''}${inner}</${node.tag}>`;
}

async function run(t, region) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-calls-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  // A disposal hook keeps the same components on the general renderer.
  const general = source => source.replace(/\n  state /, '\n  on dispose() => void 0\n  state ');
  fs.writeFileSync(path.join(directory, 'Counter.eln'), region ? child : general(child));
  const file = path.join(directory, 'Parent.eln');
  fs.writeFileSync(file, region ? parent : general(parent));
  const outputDir = path.join(directory, 'build');
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check')});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  assert.equal(/region-runtime/.test(output), region);
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const kept = globalThis.__elnorKept = [], same = globalThis.__elnorSame = [];
  t.after(() => { delete globalThis.__elnorKept; delete globalThis.__elnorSame; });
  const root = new FakeNode('root');
  const unmount = module.mount(root, {});
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const click = async label => { root.descendants('button').find(node => node.textContent === label).click(); await settle(); };
  const views = [];
  for (const label of ['Twice', 'Countdown', 'Twice', 'Keep', 'Same', 'Same']) { await click(label); views.push(serialize(root)); }
  const results = {views, sameReference: same[0] === same[1]};
  results.whileMounted = kept[0]();
  await settle();
  results.afterCall = serialize(root);
  await click('Toggle');
  await click('Toggle');
  results.afterReopen = serialize(root);
  results.oldClosure = kept[0]();
  await settle();
  results.afterOldClosure = serialize(root);
  await click('Keep');
  results.newClosure = kept[1]();
  unmount();
  results.afterUnmount = [kept[0](), kept[1]()];
  return results;
}

test('calls between region actions behave like the general renderer', {timeout: 30000}, async t => {
  const oracle = await run(t, false);
  assert.equal(oracle.sameReference, true);
  assert.notEqual(oracle.oldClosure, oracle.newClosure);
  assert.deepEqual(await run(t, true), oracle);
});
