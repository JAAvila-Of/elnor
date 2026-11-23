// Field errors in the region backend. The general renderer, built with
// regionBackend: false, is the oracle for message ids, attributes and text.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {FakeNode, setupDOM} from './fake-dom.mjs';

const field = `component Field(label: string) {
  state value = "";
  action fill() { value = value + "abc"; }

  ui {
    div {
      input error=(value.length > 2 ? "" : label + " is short") "Child" <-> value
      button "Fill" => fill()
    }
  }
}
`;

const form = `import Field from "./Field.eln";

component Profile(required: string) {
  state name = "";
  state notes = "";
  state size = "";
  state shown = false;
  state rows = ["a", "b"];
  action submit() { shown = true; }
  action fix() { name = "Ada"; notes = "x"; size = "s"; }
  action drop() { rows = rows.slice(1); }

  ui {
    form focus-invalid=(true) => submit() {
      input error=(shown && !name ? required : "") "Name" <-> name
      textarea error=(shown && !notes ? "Notes needed" : "") "Notes" <-> notes
      select error=(shown && !size ? "Pick one" : "") "Size" <-> size {
        option "None" => ""
        option "Small" => "s"
      }
      Field label=(required)
      each row in rows by row {
        div {
          Field label=(row)
        }
      }
      submit "Save"
    }
    button "Fix" => fix()
    button "Drop" => drop()
  }
}
`;

function serialize(node) {
  if (node.tag === '#comment') return '';
  if (node.tag === '#text') return node.textContent;
  const inner = node.childNodes.map(serialize).join('');
  if (node.tag === 'fragment' || node.tag === 'root') return inner;
  const attributes = [...(node.attributes ?? new Map())].sort().map(([name, value]) => ` ${name}="${value}"`).join('');
  const className = node.className ? ` className="${node.className}"` : '';
  return `<${node.tag}${className}${attributes}>${node._text ?? ''}${inner}</${node.tag}>`;
}

async function run(t, region) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-field-errors-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.writeFileSync(path.join(directory, 'Field.eln'), field);
  const file = path.join(directory, 'Profile.eln');
  fs.writeFileSync(file, form);
  const outputDir = path.join(directory, 'build');
  // regionBackend: false builds the same components with the general renderer.
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check'), regionBackend: region});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  assert.equal(/region-runtime/.test(output), region);
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const root = new FakeNode('root');
  const unmount = module.mount(root, {required: 'Name required'});
  const settle = async () => { for (let index = 0; index < 4; index++) await new Promise(resolve => setImmediate(resolve)); };
  const views = [serialize(root)];
  root.descendants('form')[0].listeners.submit[0]({preventDefault() {}});
  await settle(); views.push(serialize(root));
  root.descendants('button').filter(node => node.textContent === 'Fill')[1].click();
  await settle(); views.push(serialize(root));
  root.descendants('button').find(node => node.textContent === 'Fix').click();
  await settle(); views.push(serialize(root));
  root.descendants('button').find(node => node.textContent === 'Drop').click();
  await settle(); views.push(serialize(root));
  unmount();
  return views;
}

test('field errors render the same ids and attributes as the general renderer', {timeout: 30000}, async t => {
  const oracle = await run(t, false);
  assert.match(oracle[1], /aria-invalid="true"/);
  assert.match(oracle[0], /id="elnor-field-error-1"/);
  assert.deepEqual(await run(t, true), oracle);
});
