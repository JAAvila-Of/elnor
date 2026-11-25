// Object, function and computed props passed to child components in a
// sequential region. The general renderer, built with regionBackend: false, is
// the oracle for the child's view after parent updates, for child actions that
// read props and for closures that read props later.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {FakeNode, setupDOM} from './fake-dom.mjs';

const types = `export interface Item { id: number; name: string }
export interface Api {
  label(id: number): string;
  save(item: Item): Promise<string>;
  log(entry: string): void;
}
`;

const card = `import type { Api, Item } from "./types.js";

component Card(item: Item, api: Api, caption: string) {
  state saved = "";
  action async save() {
    saved = await api.save(item);
    api.log("saved " + item.name + " " + caption);
  }
  action keep() {
    const kept = (globalThis as any).__elnorKept as Array<() => string>;
    kept.push(() => item.name + "/" + caption + "/" + api.label(item.id));
  }

  ui {
    div {
      p item.name
      p caption
      p (api.label(item.id))
      p saved
      button "Save" => save()
      button "Keep" => keep()
    }
  }
}
`;

const page = `import type { Api, Item } from "./types.js";
import Card from "./Card.eln";

component Page(api: Api) {
  state selected: Item = {id: 1, name: "Ada"};
  state count = 0;
  action next() { selected = {id: selected.id + 1, name: selected.name + "!"}; count++; }

  ui {
    section {
      button "Next" => next()
      Card item=selected api=api caption=(api.label(count))
    }
  }
}
`;

function serialize(node) {
  if (node.tag === '#comment') return '';
  if (node.tag === '#text') return node.textContent;
  const inner = node.childNodes.map(serialize).join('');
  if (node.tag === 'fragment' || node.tag === 'root') return inner;
  return `<${node.tag}>${node._text ?? ''}${inner}</${node.tag}>`;
}

async function run(t, region) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-props-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.writeFileSync(path.join(directory, 'types.ts'), types);
  fs.writeFileSync(path.join(directory, 'Card.eln'), card);
  const file = path.join(directory, 'Page.eln');
  fs.writeFileSync(file, page);
  const outputDir = path.join(directory, 'build');
  // regionBackend: false builds the same components with the general renderer.
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check'), regionBackend: region});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  assert.equal(/region-runtime/.test(output), region);
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const kept = globalThis.__elnorKept = [], log = [], gates = [];
  t.after(() => { delete globalThis.__elnorKept; });
  const api = {
    label: id => `#${id}`,
    save(item) { const gate = Promise.withResolvers(); gates.push({item: item.name, ...gate}); return gate.promise; },
    log: entry => log.push(entry)
  };
  const root = new FakeNode('root');
  const unmount = module.mount(root, {api});
  const settle = async () => { for (let index = 0; index < 4; index++) await new Promise(resolve => setImmediate(resolve)); };
  const click = async label => { root.descendants('button').find(node => node.textContent === label).click(); await settle(); };
  const views = [serialize(root)];
  await click('Keep');
  await click('Save');
  await click('Next'); views.push(serialize(root));
  gates[0].resolve('ok 1'); await settle(); views.push(serialize(root));
  const lateRead = kept[0]();
  await click('Next'); views.push(serialize(root));
  unmount();
  return {views, log, lateRead, afterUnmount: kept[0](), saved: gates.map(gate => gate.item)};
}

test('object, function and computed child props behave like the general renderer', {timeout: 30000}, async t => {
  const oracle = await run(t, false);
  assert.equal(oracle.views.length, 4);
  assert.deepEqual(await run(t, true), oracle);
});

// Callbacks passed to a child that calls them later, and a child without
// late code that receives computed object props.
const picker = `component Picker(onPick: (id: number) => void, onReset: () => void, label: string) {
  state picks = 0;
  action async pick() {
    picks++;
    await Promise.resolve();
    onPick(picks);
    if (picks > 1) onReset();
  }

  ui {
    div {
      p label
      button "Pick" => pick()
    }
  }
}
`;

const badge = `component Badge(text: string, size: number) {
  ui {
    span (text + ":" + size)
  }
}
`;

const host = `import Picker from "./Picker.eln";
import Badge from "./Badge.eln";

component Host(format: (value: number) => string) {
  state picked = 0;
  state resets = 0;
  action reset() { resets++; picked = 0; }

  ui {
    section {
      p picked
      p resets
      Picker onPick=((id: number) => { picked = id * 10; }) onReset=reset label=(format(picked))
      Badge text=(format(resets)) size=(picked + resets)
    }
  }
}
`;

async function runCallbacks(t, region) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-callbacks-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.writeFileSync(path.join(directory, 'Picker.eln'), picker);
  fs.writeFileSync(path.join(directory, 'Badge.eln'), badge);
  const file = path.join(directory, 'Host.eln');
  fs.writeFileSync(file, host);
  const outputDir = path.join(directory, 'build');
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check'), regionBackend: region});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  assert.equal(/region-runtime/.test(output), region);
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const root = new FakeNode('root');
  const unmount = module.mount(root, {format: value => `<${value}>`});
  const settle = async () => { for (let index = 0; index < 4; index++) await new Promise(resolve => setImmediate(resolve)); };
  const views = [serialize(root)];
  for (let index = 0; index < 3; index++) {
    root.descendants('button').find(node => node.textContent === 'Pick').click();
    await settle();
    views.push(serialize(root));
  }
  unmount();
  return views;
}

test('callbacks and computed props reach children like the general renderer', {timeout: 30000}, async t => {
  const oracle = await runCallbacks(t, false);
  assert.notEqual(oracle[1], oracle[0]);
  assert.deepEqual(await runCallbacks(t, true), oracle);
});

test('a row item passed to a child with late code keeps the general fallback', async () => {
  const {parseSurface} = await import('../src/parser.mjs');
  const {analyzeRegion} = await import('../src/region-compiler.mjs');
  const {sourceKey} = await import('../src/source-identity.mjs');
  const list = parseSurface(`import Picker from "./Picker.eln";

component List() {
  state ids = [1, 2];
  action noop() {}

  ui {
    section {
      each id in ids by id {
        div {
          Picker onPick=((value: number) => { void value; }) onReset=noop label=(String(id))
        }
      }
    }
  }
}
`, path.resolve('List.eln'));
  const child = parseSurface(picker, path.resolve('Picker.eln'));
  const plan = analyzeRegion(list, {components: new Map([[sourceKey(list.filename), list], [sourceKey(child.filename), child]])});
  assert.equal(plan.eligible, false);
  assert.match(JSON.stringify(plan), /sequential-component-prop-not-proven/);
});
