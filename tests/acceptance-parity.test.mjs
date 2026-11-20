import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';
import {generate} from '../src/compiler.mjs';
import {typecheckGraph} from '../src/checker.mjs';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {setupDOM, FakeNode, tick} from './fake-dom.mjs';

function fixture(t, source, consumer = 'Badge', parentParams = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'elnor-acceptance-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const child = path.join(root, 'Badge.eln'), parent = path.join(root, 'Screen.eln');
  const parentSource = `import Badge from "./Badge.eln";\ncomponent Screen(${parentParams}) {\n  ui {\n    ${consumer}\n  }\n}`;
  const ir = parseSurface(source, child);
  const graph = new Map([[child, ir], [parent, parseSurface(parentSource, parent)]]);
  const service = createSurfaceLanguageService({root});
  t.after(() => service.dispose());
  service.open(child, source); service.open(parent, parentSource);
  return {root, child, parent, ir, service, graph,
    cli: typecheckGraph(graph, path.join(root, 'check')),
    editor: [...service.diagnostics(child), ...service.diagnostics(parent)]};
}

for (const [declaration, expression, consumer, expectedCode] of [
  ['label?: string', 'label ?? "Fallback"', 'Badge', null],
  ['label?: string', 'label ?? "Fallback"', 'Badge label="Ready"', null],
  ['label?: string', 'label ?? "Fallback"', 'Badge label=42', 'TS2322'],
  ['label: string', 'label', 'Badge', 'TS2345'],
]) {
  test(`optional prop acceptance parity: ${declaration}, ${consumer}`, t => {
    const f = fixture(t, `component Badge(${declaration}) {\n  ui {\n    span ${expression}\n  }\n}`, consumer);
    if (expectedCode) {
      assert.ok(f.cli.some(d => d.code === expectedCode));
      assert.ok(f.editor.some(d => d.code === expectedCode));
    } else {
      assert.deepEqual(f.cli, []); assert.deepEqual(f.editor, []);
    }
  });
}

test('optional props execute with omitted, explicit undefined and supplied values', async t => {
  const f = fixture(t, 'component Badge(label?: string) {\n  ui {\n    span label ?? "Fallback"\n  }\n}');
  assert.deepEqual(f.cli, []); assert.deepEqual(f.editor, []);
  fs.copyFileSync('src/runtime.mjs', path.join(f.root, 'runtime.mjs'));
  fs.writeFileSync(path.join(f.root, 'Badge.mjs'), generate(f.ir));
  const {mount} = await import(pathToFileURL(path.join(f.root, 'Badge.mjs')).href);
  setupDOM();
  for (const [props, expected] of [[{}, 'Fallback'], [{label: undefined}, 'Fallback'], [{label: 'Ready'}, 'Ready']]) {
    const root = new FakeNode('root');
    const dispose = mount(root, props);
    assert.equal(root.textContent, expected);
    dispose(); assert.equal(root.childNodes.length, 0);
  }
});

test('optional props preserve reactive getters through component composition', async t => {
  const f = fixture(t, 'component Badge(label?: string) {\n  ui {\n    span label ?? "Fallback"\n  }\n}', 'Badge label=label', 'label?: string');
  assert.deepEqual(f.cli, []); assert.deepEqual(f.editor, []);
  fs.copyFileSync('src/runtime.mjs', path.join(f.root, 'runtime.mjs'));
  for (const ir of f.graph.values()) fs.writeFileSync(path.join(f.root, ir.name + '.mjs'), generate(ir));
  const {mount} = await import(pathToFileURL(path.join(f.root, 'Screen.mjs')).href);
  setupDOM(); const root = new FakeNode('root');
  const dispose = mount(root, {});
  assert.equal(root.textContent, 'Fallback'); dispose();
  const {cell} = await import(pathToFileURL(path.join(f.root, 'runtime.mjs')).href);
  const label = cell(undefined);
  const stop = mount(root, {get label() { return label.value; }});
  assert.equal(root.textContent, 'Fallback');
  label.value = 'Updated'; await tick(); assert.equal(root.textContent, 'Updated');
  label.value = undefined; await tick(); assert.equal(root.textContent, 'Fallback');
  stop(); label.value = 'Disposed'; await tick(); assert.equal(root.childNodes.length, 0);
});

for (const declaration of ['label: string = "Fallback"', 'label = "Fallback"']) {
  test(`unsupported default is diagnosed before code generation: ${declaration}`, t => {
    const source = `component Badge(${declaration}) {\r\n  ui {\r\n    span label\r\n  }\r\n}`;
    const f = fixture(t, source);
    const cli = f.cli.find(d => d.code === 'ELN-PROP-DEFAULT');
    const editor = f.editor.find(d => d.code === 'ELN-PROP-DEFAULT');
    assert.ok(cli); assert.ok(editor);
    assert.equal(cli.message, editor.message);
    assert.equal(source.slice(editor.start, editor.start + editor.length), '"Fallback"');
    assert.throws(() => generate(f.ir), /ELN-PROP-DEFAULT/);
  });
}

for (const action of [
  'action inspect(label: string) { console.log(label); }',
  'action inspect() { const label = "local"; console.log(label); }',
  'action inspect() { const count = 2; console.log(count); }',
]) {
  test(`action shadowing is accepted by CLI, editor and generator: ${action}`, t => {
    const source = `component Badge(label?: string) {\r\n  // café 😀\r\n  state count = 1;\r\n  ${action}\r\n  ui {\r\n    span label ?? "Fallback"\r\n  }\r\n}`;
    const f = fixture(t, source);
    assert.deepEqual(f.cli, []); assert.deepEqual(f.editor, []);
    assert.doesNotThrow(() => generate(f.ir));
    f.service.open(f.child, source.replace(action, 'action inspect() { const local = 2; console.log(local); }'));
    assert.deepEqual(f.service.diagnostics(f.child), []);
  });
}

test('unrelated local variables remain valid and executable', async t => {
  const f = fixture(t, 'component Badge(label?: string) {\n  action inspect() { const local = "Ready"; return local; }\n  ui {\n    span inspect()\n  }\n}');
  assert.deepEqual(f.cli, []); assert.deepEqual(f.editor, []);
  fs.copyFileSync('src/runtime.mjs', path.join(f.root, 'runtime.mjs'));
  fs.writeFileSync(path.join(f.root, 'Badge.mjs'), generate(f.ir));
  const {mount} = await import(pathToFileURL(path.join(f.root, 'Badge.mjs')).href);
  setupDOM(); const root = new FakeNode('root');
  const dispose = mount(root, {});
  assert.equal(root.textContent, 'Ready'); dispose();
});

test('rename can introduce valid lexical shadowing without changing the prop', t => {
  const source = 'component Badge(label?: string) {\n  action inspect() { const local = "Ready"; return local; }\n  ui {\n    span label ?? inspect()\n  }\n}';
  const f = fixture(t, source);
  assert.deepEqual(f.cli, []); assert.deepEqual(f.editor, []);
  const plan = f.service.rename(f.child, source.indexOf('local ='), 'label');
  f.service.applyRename(plan);
  const renamed = f.service.text(f.child);
  assert.equal(renamed, source.replace('const local', 'const label').replace('return local', 'return label'));
  assert.deepEqual(f.service.diagnostics(f.child), []);
  assert.doesNotThrow(() => generate(parseSurface(renamed, f.child)));
});
