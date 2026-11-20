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
import {applyFormatEdits,formatSurface} from '../src/formatter.mjs';
import {setupDOM, FakeNode, tick} from './fake-dom.mjs';

function fixture(t, declarations, expression, params = 'seed: number', ui) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'elnor-init-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const file = path.join(root,'Init.eln');
  const source = `component Init(${params}) {\r\n  // café 😀\r\n${declarations}\r\n  ui {\r\n${ui ?? `    span ${expression}`}\r\n  }\r\n}`;
  const ir = parseSurface(source,file);
  const service = createSurfaceLanguageService({root});
  t.after(() => service.dispose()); service.open(file,source);
  return {root,file,source,ir,service,
    cli:typecheckGraph(new Map([[file,ir]]),path.join(root,'check')),
    editor:service.diagnostics(file)};
}

async function moduleFor(f) {
  fs.copyFileSync('src/runtime.mjs',path.join(f.root,'runtime.mjs'));
  fs.writeFileSync(path.join(f.root,'Init.mjs'),generate(f.ir));
  return import(pathToFileURL(path.join(f.root,'Init.mjs')).href);
}

for (const [name,declarations,expression,expected] of [
  ['multiline state and calc', [
    '  state first = (',
    '    seed + 1',
    '  );',
    '  calc doubled = (',
    '    first * 2',
    '  );',
  ].join('\r\n'), 'doubled', '8'],
  ['prop seed', '  state first = seed;', 'first', '3'],
  ['earlier state', '  state first = seed;\n  state second = first + 1;', 'second', '4'],
  ['state chain', '  state first = seed;\n  state second = first + 1;\n  state third = second + first;', 'third', '7'],
  ['action reads initialized state', '  state first = seed;\n  state second = readFirst();\n  action readFirst() { return first + 1; }', 'second', '4'],
  ['immediate lambda reads initialized state', '  state first = seed;\n  state second = (() => first + 1)();', 'second', '4'],
  ['deferred closure reads later state', '  state readLater = () => later;\n  state later = seed;', 'readLater()', '3'],
  ['earlier calc', '  state first = seed;\n  calc doubled = first * 2;\n  calc result = doubled + first;', 'result', '9'],
  ['states precede calcs regardless of textual interleaving', '  calc doubled = first * 2;\n  state first = seed;', 'doubled', '6'],
  ['calc action tracks initialized state', '  state first = seed;\n  calc doubled = readFirst();\n  action readFirst() { return first * 2; }', 'doubled', '6'],
  ['action updates earlier state during initialization', '  state first = seed;\n  state second = advance();\n  action advance() { first++; return first; }', 'first + second', '8'],
  ['initialized undefined differs from an absent cell', '  state first: number | undefined = undefined;\n  state second = first ?? seed;', 'second', '3'],
]) {
  test(`initialization execution agrees with both projections: ${name}`, async t => {
    const f = fixture(t,declarations,expression);
    assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
    const {mount} = await moduleFor(f); setupDOM(); const root = new FakeNode('root');
    const dispose = mount(root,{seed:3});
    assert.equal(root.textContent,expected); dispose();
    assert.equal(root.childNodes.length,0);
  });
}

test('multiline initializer diagnostics point to the expression in both projections', t => {
  const f = fixture(t, [
    '  state first: number = (',
    '    seed + missingValue',
    '  );',
    '  calc doubled = (',
    '    first * missingFactor',
    '  );',
  ].join('\r\n'), 'doubled');
  for (const diagnostics of [f.cli, f.editor]) {
    const unresolved = diagnostics.filter(d => d.code === 'TS2304');
    assert.deepEqual(unresolved.map(d => d.line), [4, 7]);
  }
});

test('formatter indents multiline initializers and preserves template contents', () => {
  const literal = "\x60first\n  keep these spaces\x60";
  const source = [
    'component Init() {',
    'state text: string = (',
    literal,
    ');',
    'calc length = (',
    'text.length',
    ');',
    'ui { span length }',
    '}',
  ].join('\n');
  const result = formatSurface(source);
  assert.deepEqual(result.diagnostics, []);
  const formatted = applyFormatEdits(source, result.edits);
  assert.ok(formatted.includes('  state text: string = (\n    ' + literal + '\n  );'));
  assert.ok(formatted.includes('  calc length = (\n    text.length\n  );'));
  assert.deepEqual(formatSurface(formatted), {edits: [], diagnostics: []});
});

for (const [name,declarations,token] of [
  ['later state', '  state first = later + 1;\n  state later = seed;', 'later'],
  ['self state', '  state first: number = first + 1;', 'first'],
  ['state cycle', '  state first: number = second + 1;\n  state second: number = first + 1;', 'second'],
  ['later calc', '  state first = seed;\n  calc doubled = result + first;\n  calc result = first * 2;', 'result'],
  ['state reads calc phase', '  calc doubled = seed * 2;\n  state first = doubled;', 'doubled'],
]) {
  test(`both projections reject direct initialization before declaration: ${name}`, t => {
    const f = fixture(t,declarations,'first');
    assert.ok(f.cli.some(d => d.code === 'TS2448'));
    const error = f.editor.find(d => d.code === 'TS2448');
    assert.ok(error);
    assert.equal(f.source.slice(error.start,error.start+error.length),token);
    assert.equal(error.approximate,false);
    f.service.open(f.file,f.source.replace(declarations,'  state first = seed;'));
    assert.deepEqual(f.service.diagnostics(f.file),[]);
  });
}

test('state initialization is once per instance while calc chains remain reactive', async t => {
  const declarations = '  state first = next();\n  state snapshot = first + 1;\n  calc doubled = first * 2;\n  calc result = doubled + 1;';
  const f = fixture(t,declarations,'','next: () => number','    span JSON.stringify([first, snapshot, result])\r\n    button "Add" => first++');
  assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
  const {mount} = await moduleFor(f); setupDOM();
  let calls = 0; const props = {next:()=>++calls};
  const a = new FakeNode('root'), b = new FakeNode('root');
  const stopA = mount(a,props), stopB = mount(b,props);
  assert.equal(calls,2);
  assert.equal(a.textContent,'[1,2,3]Add'); assert.equal(b.textContent,'[2,3,5]Add');
  const button = a.descendants('button')[0]; button.click(); await tick();
  assert.equal(a.textContent,'[2,2,5]Add'); assert.equal(b.textContent,'[2,3,5]Add');
  assert.equal(calls,2);
  stopA(); button.click(); await tick(); assert.equal(a.childNodes.length,0);
  assert.equal(b.textContent,'[2,3,5]Add'); stopB(); assert.equal(b.childNodes.length,0);
});

test('calc action dependencies react after initialization', async t => {
  const f = fixture(t,'  state first = seed;\n  calc doubled = readFirst();\n  action readFirst() { return first * 2; }','','seed: number','    span doubled\r\n    button "Add" => first++');
  assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
  const {mount} = await moduleFor(f); setupDOM(); const root = new FakeNode('root');
  const stop = mount(root,{seed:3}); assert.equal(root.textContent,'6Add');
  root.descendants('button')[0].click(); await tick(); assert.equal(root.textContent,'8Add');
  stop(); assert.equal(root.childNodes.length,0);
});

test('reactive expressions see the declared type of a state initialized to null', async t => {
  const f = fixture(t, [
    '  state feedback: {message: string} | null = null;',
    '  calc observed = feedback;',
    '  calc message = observed?.message ?? "Waiting";',
    '  action finish() { feedback = {message: "Ready"}; }'
  ].join('\r\n'), '', '', [
    '    span message',
    '    span (feedback?.message ?? "")',
    '    button "Finish" => finish()'
  ].join('\r\n'));
  assert.deepEqual(f.cli, []);
  assert.deepEqual(f.editor, []);
  const {mount} = await moduleFor(f);
  setupDOM();
  const root = new FakeNode('root');
  const stop = mount(root, {});
  assert.equal(root.textContent, 'WaitingFinish');
  root.descendants('button')[0].click();
  await tick();
  assert.equal(root.textContent, 'ReadyReadyFinish');
  stop();

  const plan = f.service.rename(f.file, f.source.indexOf('feedback:'), 'notice');
  assert.equal(plan.edits.length, 4);
  f.service.applyRename(plan);
  assert.doesNotMatch(f.service.text(f.file), /feedback/);
  assert.deepEqual(f.service.diagnostics(f.file), []);
});

test('state initializers keep their narrowing and later reads still check for null', t => {
  const f = fixture(t, [
    '  state feedback: {message: string} | null = null;',
    '  state initial: null = feedback;',
    '  calc message = feedback.message;',
    '  action finish() { feedback = {message: "Ready"}; }'
  ].join('\r\n'), 'message', '');
  for (const diagnostics of [f.cli, f.editor]) {
    assert.deepEqual(diagnostics.map(d => [d.code, d.line]), [['TS18047', 5]]);
  }
  const diagnostic = f.editor[0];
  assert.equal(f.source.slice(diagnostic.start, diagnostic.start + diagnostic.length), 'feedback');
  assert.equal(diagnostic.approximate, false);
});

// Static analysis still accepts these programs; execution must identify the
// actual uninitialized binding rather than exposing generated storage errors.
for (const [name,declarations] of [
  ['later state through an action', '  state first = readLater();\n  state later = seed;\n  action readLater() { return later; }'],
  ['later calc through an action', '  state first = seed;\n  calc result = readLater();\n  calc later = first * 2;\n  action readLater() { return later; }'],
  ['state reads calc through an action', '  state first = readLater();\n  calc later = seed * 2;\n  action readLater() { return later; }'],
]) {
  test(`indirect early access produces an explicit initialization error: ${name}`, async t => {
    const f = fixture(t,declarations,'first');
    assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
    const {mount} = await moduleFor(f); setupDOM(); const root = new FakeNode('root');
    assert.throws(() => mount(root,{seed:3}), error => {
      assert.ok(error instanceof ReferenceError);
      assert.equal(error.code,'ELN-INIT');
      assert.equal(error.binding,'later');
      assert.equal(error.file,f.file);
      assert.equal(f.source.slice(error.start,error.start+error.length),'later');
      const binding = [...f.ir.states,...f.ir.calcs].find(b => b.name === 'later');
      assert.equal(error.start,binding.nameSpan.start);
      assert.equal(error.kind,f.ir.states.includes(binding) ? 'state' : 'calc');
      return true;
    });
    assert.equal(root.childNodes.length,0);
  });
}

function assertInitError(f, callback, binding = 'later') {
  assert.throws(callback,error => {
    assert.ok(error instanceof ReferenceError); assert.equal(error.code,'ELN-INIT');
    assert.equal(error.binding,binding); assert.equal(error.file,f.file);
    const declaration = [...f.ir.states,...f.ir.calcs].find(b => b.name === binding);
    assert.equal(error.start,declaration.nameSpan.start);
    assert.equal(error.length,declaration.nameSpan.length);
    return true;
  });
}

for (const [name,action] of [
  ['call chain', 'action readLater() { return middle(); }\n  action middle() { return later; }'],
  ['local function alias', 'action readLater() { const read = middle; return read(); }\n  action middle() { return later; }'],
  ['early write', 'action readLater() { later = 9; return 0; }'],
]) {
  test(`initialization guard follows actual execution: ${name}`,async t => {
    const f = fixture(t,`  state first = readLater();\n  state later = seed;\n  ${action}`,'first');
    assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
    const {mount} = await moduleFor(f); setupDOM();
    assertInitError(f,() => mount(new FakeNode('root'),{seed:3}));
  });
}

test('branch not taken does not reject a safe mount',async t => {
  const f = fixture(t,'  state first = readLater();\n  state later = seed;\n  action readLater() { return seed > 0 ? later : 0; }','JSON.stringify([first,later])');
  assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
  const {mount} = await moduleFor(f); setupDOM(); const root = new FakeNode('root');
  const dispose = mount(root,{seed:-1}); assert.equal(root.textContent,'[0,-1]'); dispose();
  assertInitError(f,() => mount(root,{seed:3})); assert.equal(root.childNodes.length,0);
});

test('eager higher-order callback is guarded at its actual read',async t => {
  const f = fixture(t,'  state first = run(() => later);\n  state later = seed;','first','seed: number, run: (read: () => number) => number');
  assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
  const {mount} = await moduleFor(f); setupDOM();
  assertInitError(f,() => mount(new FakeNode('root'),{seed:3,run:read=>read()}));
});

test('stored callback can read the binding after initialization',async t => {
  const f = fixture(t,'  state first = remember(() => later);\n  state later = seed;','first','seed: number, remember: (read: () => number) => number');
  assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
  const {mount} = await moduleFor(f); setupDOM(); const root = new FakeNode('root');
  let reader; const dispose = mount(root,{seed:3,remember:read=>{reader=read;return 7;}});
  assert.equal(root.textContent,'7'); assert.equal(reader(),3); dispose();
});

test('closure returned by an action is deferred and remains reactive when read by UI',async t => {
  const f = fixture(t,'  state reader = makeReader();\n  state later = seed;\n  action makeReader() { return () => later; }','','seed: number','    span reader()\r\n    button "Add" => later++');
  assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
  const {mount} = await moduleFor(f); setupDOM(); const root = new FakeNode('root');
  const dispose = mount(root,{seed:3}); assert.equal(root.textContent,'3Add');
  root.descendants('button')[0].click(); await tick(); assert.equal(root.textContent,'4Add');
  dispose(); assert.equal(root.childNodes.length,0);
});

test('shadowed local is not an uninitialized component binding',async t => {
  const f = fixture(t,'  state first = readLater();\n  state later = seed;\n  action readLater() { const later = 7; return later; }','JSON.stringify([first,later])');
  assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
  const {mount} = await moduleFor(f); setupDOM(); const root = new FakeNode('root');
  const dispose = mount(root,{seed:3}); assert.equal(root.textContent,'[7,3]'); dispose();
});

test('async action resumes after initialization without a false early-read error',async t => {
  const f = fixture(t,'  state task = readLater();\n  state later = seed;\n  action async readLater() { await Promise.resolve(); report(later); }','later','seed: number, report: (value: number) => void');
  assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
  const {mount} = await moduleFor(f); setupDOM(); const root = new FakeNode('root');
  const values = []; const dispose = mount(root,{seed:3,report:value=>values.push(value)});
  await tick(); assert.deepEqual(values,[3]); assert.equal(root.textContent,'3'); dispose();
});

test('early read inside async action rejects with the same initialization metadata',async t => {
  const f = fixture(t,'  state task = readLater().catch(failure);\n  state later = seed;\n  action async readLater() { return later; }','later','seed: number, failure: (error: unknown) => void');
  assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
  const {mount} = await moduleFor(f); setupDOM(); const root = new FakeNode('root');
  const errors = []; const dispose = mount(root,{seed:3,failure:error=>errors.push(error)});
  await tick(); assert.equal(errors.length,1);
  assertInitError(f,() => {throw errors[0];}); assert.equal(root.textContent,'3'); dispose();
});
