// Async actions without a group in the region backend. The general renderer,
// built with regionBackend: false, is the oracle for state across awaits,
// results that arrive after a branch closes, reopens or the component unmounts,
// awaited calls between actions and rejected work.
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

const hostTypes = `export interface Host {
  wait(label: string): Promise<string>;
  log(entry: string): void;
}
`;

const child = `import type { Host } from "./host.js";

component Loader() {
  state status = "idle";
  state result = "";
  state attempts = 0;
  action async fetchPart(label: string) {
    attempts++;
    return await ((globalThis as any).__elnorHost as Host).wait(label);
  }
  action async load() {
    status = "loading";
    try {
      const first = await fetchPart("first");
      const second = await fetchPart("second");
      result = first + "+" + second;
      status = "done";
    } catch (error) {
      status = "failed " + (error as Error).message;
    } finally {
      ((globalThis as any).__elnorHost as Host).log("finally " + status + " " + attempts);
    }
    return result;
  }

  ui {
    div {
      p status
      p result
      button "Load" => load()
    }
  }
}
`;

const parent = `import Loader from "./Loader.eln";

component Parent() {
  state show = true;
  action toggle() { show = !show; }

  ui {
    section {
      button "Toggle" => toggle()
      if show {
        Loader
      }
    }
  }
}
`;

test('async actions keep the sequential region backend', () => {
  const plan = analyzeRegion(parseSurface(child, 'Loader.eln'));
  assert.equal(plan.eligible, true, JSON.stringify(plan.sequentialFailures ?? plan.failures));
});

function serialize(node) {
  if (node.tag === '#comment') return '';
  if (node.tag === '#text') return node.textContent;
  const inner = node.childNodes.map(serialize).join('');
  if (node.tag === 'fragment' || node.tag === 'root') return inner;
  return `<${node.tag}>${node._text ?? ''}${inner}</${node.tag}>`;
}

async function run(t, region, scenario) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-async-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.writeFileSync(path.join(directory, 'host.ts'), hostTypes);
  fs.writeFileSync(path.join(directory, 'Loader.eln'), child);
  const file = path.join(directory, 'Parent.eln');
  fs.writeFileSync(file, parent);
  const outputDir = path.join(directory, 'build');
  // regionBackend: false builds the same components with the general renderer.
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check'), regionBackend: region});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  assert.equal(/region-runtime/.test(output), region);
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const gates = [], log = [];
  const root = new FakeNode('root');
  globalThis.__elnorHost = {
    wait(label) { const gate = Promise.withResolvers(); gates.push({label, ...gate}); return gate.promise; },
    log(entry) { log.push(entry); }
  };
  t.after(() => { delete globalThis.__elnorHost; });
  const unmount = module.mount(root, {});
  const settle = async () => { for (let index = 0; index < 4; index++) await new Promise(resolve => setImmediate(resolve)); };
  const click = async label => { root.descendants('button').find(node => node.textContent === label).click(); await settle(); };
  const views = [];
  const snap = () => views.push(serialize(root));
  await scenario({click, settle, gates, snap, unmount});
  return {views, log, gates: gates.map(gate => gate.label)};
}

const scenarios = {
  'completes while mounted': async ({click, settle, gates, snap}) => {
    await click('Load'); snap();
    gates[0].resolve('a'); await settle(); snap();
    gates[1].resolve('b'); await settle(); snap();
  },
  'fails while mounted': async ({click, settle, gates, snap}) => {
    await click('Load');
    gates[0].reject(new Error('offline')); await settle(); snap();
  },
  'finishes after its branch closes and reopens': async ({click, settle, gates, snap}) => {
    await click('Load');
    gates[0].resolve('a'); await settle();
    await click('Toggle'); snap();
    await click('Toggle'); snap();
    gates[1].resolve('b'); await settle(); snap();
    await click('Load'); snap();
    gates[2].resolve('c'); await settle();
    gates[3].resolve('d'); await settle(); snap();
  },
  'finishes after unmount': async ({click, settle, gates, snap, unmount}) => {
    await click('Load');
    unmount(); snap();
    gates[0].resolve('a'); await settle();
    gates[1].resolve('b'); await settle(); snap();
  },
};

for (const [name, scenario] of Object.entries(scenarios)) {
  test(`an async region action ${name} like the general renderer`, {timeout: 30000}, async t => {
    const oracle = await run(t, false, scenario);
    assert.ok(oracle.log.length > 0);
    assert.deepEqual(await run(t, true, scenario), oracle);
  });
}
