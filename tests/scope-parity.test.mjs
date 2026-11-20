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

function fixture(t, action, expression = 'inspect()', ui) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'elnor-scope-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const file = path.join(root, 'Scope.eln');
  const source = `component Scope(label: string) {\r\n  // café 😀\r\n  state count = 1;\r\n  calc doubled = count * 2;\r\n  ${action}\r\n  ui {\r\n${ui ?? `    span ${expression}`}\r\n  }\r\n}`;
  const ir = parseSurface(source, file);
  const service = createSurfaceLanguageService({root});
  t.after(() => service.dispose());
  service.open(file, source);
  return {root, file, source, ir, service,
    cli:typecheckGraph(new Map([[file, ir]]), path.join(root, 'check')),
    editor:service.diagnostics(file)};
}

async function mountFixture(f) {
  fs.copyFileSync('src/runtime.mjs', path.join(f.root, 'runtime.mjs'));
  fs.writeFileSync(path.join(f.root, 'Scope.mjs'), generate(f.ir));
  const {mount} = await import(pathToFileURL(path.join(f.root, 'Scope.mjs')).href);
  setupDOM(); const root = new FakeNode('root');
  const dispose = mount(root, Object.freeze({label:'Outer'}));
  return {root, dispose};
}

for (const [name, body, expected] of [
  ['arrow parameter', 'return ((label: string) => label)("Inner");', 'Inner'],
  ['nested function parameter', 'function inner(count: number) { return count + 1; } return inner(4);', '5'],
  ['object destructuring', 'const {label} = {label:"Inner"}; return label;', 'Inner'],
  ['array destructuring', 'const [count] = [4]; return count;', '4'],
  ['destructured parameter default', 'return (({label = "Default"}: {label?: string}) => label)({});', 'Default'],
  ['catch binding', 'try { throw "Caught"; } catch (label) { return String(label); }', 'Caught'],
  ['block binding', 'let result = label; { const label = "Inner"; result += label; } return result + label;', 'OuterInnerOuter'],
  ['function name', 'function label() { return "Inner"; } return label();', 'Inner'],
  ['class member key', 'class Local { label = "Inner"; } return new Local().label + label;', 'InnerOuter'],
  ['shorthand capture', 'return JSON.stringify({label, count});', '{"label":"Outer","count":1}'],
  ['state destructuring assignment', '({count = 9} = {}); return count;', '9'],
  ['state array assignment', '[count] = [7]; return count;', '7'],
  ['computed property key', 'return ({[label]:count}).Outer;', '1'],
  ['binding default captures outer prop', 'const {value = label} = {} as {value?:string}; return value;', 'Outer'],
  ['parameter default captures outer prop', 'return ((value: string = label) => value)();', 'Outer'],
  ['local shorthand preserves lexical value', 'const label = "Inner"; return JSON.stringify({label});', '{"label":"Inner"}'],
]) {
  test(`scope execution agrees with both checkers: ${name}`, async t => {
    const f = fixture(t, `action inspect() { ${body} }`);
    assert.deepEqual(f.cli, []); assert.deepEqual(f.editor, []);
    const {root, dispose} = await mountFixture(f);
    assert.equal(root.textContent, expected); dispose();
    assert.equal(root.childNodes.length, 0);
  });
}

for (const statement of ['label = "Changed"', 'label += "!"', 'label ||= "Changed"', '({label} = {label:"Changed"})', '({value:label = "Default"} = {})', '[label] = ["Changed"]', 'for (label of ["Changed"]) {}', 'for (label in {changed:1}) {}']) {
  test(`prop assignment is rejected consistently: ${statement}`, t => {
    const f = fixture(t, `action inspect() { ${statement}; return label; }`);
    const cli = f.cli.find(d => d.code === 'ELN-READONLY');
    const editor = f.editor.find(d => d.code === 'ELN-READONLY');
    assert.ok(cli); assert.ok(editor); assert.equal(cli.message, editor.message);
    assert.equal(f.editor.filter(d => d.code === 'ELN-READONLY').length, 1);
    assert.equal(f.source.slice(editor.start, editor.start + editor.length), 'label');
    assert.equal(editor.start, f.source.indexOf('label', f.source.indexOf('action inspect')));
    assert.throws(() => generate(f.ir), /ELN-READONLY/);
    f.service.open(f.file, f.source.replace(statement, 'const local = "Allowed"'));
    assert.deepEqual(f.service.diagnostics(f.file), []);
  });
}

test('writes to a shadowing local do not mutate a prop', async t => {
  const f = fixture(t, 'action inspect() { let label = "Inner"; label += "!"; return label; }');
  assert.deepEqual(f.cli, []); assert.deepEqual(f.editor, []);
  const {root, dispose} = await mountFixture(f);
  assert.equal(root.textContent, 'Inner!'); dispose();
});

test('UI lambda parameter shadows an each binding', async t => {
  const f = fixture(t, '', '', '    each count in [3] by count {\r\n      span ((count: number) => count + 1)(8) + count\r\n    }');
  assert.deepEqual(f.cli, []); assert.deepEqual(f.editor, []);
  const {root, dispose} = await mountFixture(f);
  assert.equal(root.textContent, '12'); dispose();
});

test('state writes preserve reactivity and calc writes are rejected', async t => {
  const f = fixture(t, 'action increment() { count++; }', '', '    span doubled\r\n    button "Add" => increment()');
  assert.deepEqual(f.cli, []); assert.deepEqual(f.editor, []);
  const {root, dispose} = await mountFixture(f);
  assert.equal(root.textContent, '2Add'); root.descendants('button')[0].click();
  await tick(); assert.equal(root.textContent, '4Add'); dispose();
  const bad = fixture(t, 'action inspect() { doubled++; return doubled; }');
  assert.ok(bad.cli.some(d => d.code === 'ELN-READONLY'));
  assert.ok(bad.editor.some(d => d.code === 'ELN-READONLY'));
  assert.throws(() => generate(bad.ir), /ELN-READONLY/);
});

test('prop writes in UI expressions are rejected before generation', t => {
  const f = fixture(t, '', '', '    button "Change" => label = "Changed"');
  assert.ok(f.cli.some(d => d.code === 'ELN-READONLY'));
  assert.ok(f.editor.some(d => d.code === 'ELN-READONLY'));
  assert.throws(() => generate(f.ir), /ELN-READONLY/);
});

test('renamed local shadows a prop and still executes independently', async t => {
  const f = fixture(t, 'action inspect() { const local = "Inner"; return local; }', 'inspect() + label');
  assert.deepEqual(f.cli, []); assert.deepEqual(f.editor, []);
  f.service.applyRename(f.service.rename(f.file, f.source.indexOf('local ='), 'label'));
  const source = f.service.text(f.file);
  assert.equal(source, f.source.replace('const local', 'const label').replace('return local', 'return label'));
  assert.deepEqual(f.service.diagnostics(f.file), []);
  f.ir = parseSurface(source, f.file);
  assert.deepEqual(typecheckGraph(new Map([[f.file,f.ir]]), path.join(f.root,'renamed')), []);
  const {root, dispose} = await mountFixture(f);
  assert.equal(root.textContent, 'InnerOuter'); dispose();
});
