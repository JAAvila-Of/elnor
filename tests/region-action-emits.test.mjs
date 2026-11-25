// emit from general and async actions in the region backend. The general
// renderer, built with regionBackend: false, is the oracle: an emit calls the
// parent handler even when it happens after the child's branch closed or the
// component unmounted, and the handler runs against the parent instance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {FakeNode, setupDOM} from './fake-dom.mjs';

const editor = `component Editor() {
  event saved(value: number)
  event touched()
  state count = 0;
  action async save() {
    count++;
    const value = count;
    await ((globalThis as any).__elnorWait as () => Promise<void>)();
    emit.saved(value);
    count = value * 10;
  }
  action touch() {
    emit.touched();
    count++;
  }

  ui {
    div {
      p count
      button "Save" => save()
      button "Touch" => touch()
    }
  }
}
`;

const page = `import Editor from "./Editor.eln";

component Page() {
  state show = true;
  state last = 0;
  state touches = 0;
  action toggle() { show = !show; }
  action record(value: number) { last = value; }

  ui {
    section {
      p last
      p touches
      button "Toggle" => toggle()
      if show {
        Editor {
          on saved(value) => record(value)
          on touched() => touches = touches + 1
        }
      }
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
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-emits-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.writeFileSync(path.join(directory, 'Editor.eln'), editor);
  const file = path.join(directory, 'Page.eln');
  fs.writeFileSync(file, page);
  const outputDir = path.join(directory, 'build');
  // regionBackend: false builds the same components with the general renderer.
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check'), regionBackend: region});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  assert.equal(/region-runtime/.test(output), region);
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const gates = [];
  globalThis.__elnorWait = () => { const gate = Promise.withResolvers(); gates.push(gate); return gate.promise; };
  t.after(() => { delete globalThis.__elnorWait; });
  const root = new FakeNode('root');
  const unmount = module.mount(root, {});
  const settle = async () => { for (let index = 0; index < 4; index++) await new Promise(resolve => setImmediate(resolve)); };
  const click = async label => { root.descendants('button').find(node => node.textContent === label).click(); await settle(); };
  const views = [];
  await click('Touch'); views.push(serialize(root));
  await click('Save');
  gates[0].resolve(); await settle(); views.push(serialize(root));
  await click('Save');
  await click('Toggle'); views.push(serialize(root));
  gates[1].resolve(); await settle(); views.push(serialize(root));
  await click('Toggle');
  await click('Save');
  unmount();
  gates[2].resolve(); await settle(); views.push(serialize(root));
  return views;
}

test('emits from general and async region actions reach the parent like the general renderer', {timeout: 30000}, async t => {
  const oracle = await run(t, false);
  assert.notEqual(oracle[1], oracle[0]);
  assert.deepEqual(await run(t, true), oracle);
});
