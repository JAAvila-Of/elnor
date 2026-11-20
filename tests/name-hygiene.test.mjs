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

function fixture(t, declarations, ui, child) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'elnor-hygiene-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const source = `${child ? 'import Child from "./Child.eln";\r\n' : ''}component Screen(label: string) {\r\n  // café 😀\r\n  state count = 1;\r\n  calc doubled = count * 2;\r\n  ${declarations}\r\n  ui {\r\n${ui}\r\n  }\r\n}`;
  const file = path.join(root, 'Screen.eln');
  const graph = new Map([[file,parseSurface(source,file)]]);
  if (child) {
    const childFile = path.join(root,'Child.eln');
    fs.writeFileSync(childFile,child);
    graph.set(childFile,parseSurface(child,childFile));
  }
  const service = createSurfaceLanguageService({root});
  t.after(() => service.dispose());
  service.open(file,source);
  assert.deepEqual(typecheckGraph(graph,path.join(root,'check')), []);
  for (const name of graph.keys()) assert.deepEqual(service.diagnostics(name), []);
  return {root, file, source, graph, service};
}

async function mountFixture(f, handlers = {}) {
  fs.copyFileSync('src/runtime.mjs',path.join(f.root,'runtime.mjs'));
  for (const ir of f.graph.values()) fs.writeFileSync(path.join(f.root,ir.name+'.mjs'),generate(ir));
  const {mount} = await import(pathToFileURL(path.join(f.root,'Screen.mjs')).href);
  setupDOM(); const root = new FakeNode('root');
  const dispose = mount(root,Object.freeze({label:'Outer'}),handlers);
  return {root,dispose};
}

for (const [name, body, expected] of [
  ['props helper', 'const __props = {label:"Captured"}; return label;', 'Outer'],
  ['state helper', 'const __s = {count:{value:9}}; return count;', '1'],
  ['calc helper', 'const __d = {doubled:{value:9}}; return doubled;', '2'],
  ['new prefix', 'const __elnor_props = {label:"Captured"}; return label;', 'Outer'],
  ['escaped identifier', 'const \\u005f_elnor_props = {label:"Captured"}; return label;', 'Outer'],
  ['nested helper parameter', 'return ((__props: {label:string}) => label)({label:"Captured"});', 'Outer'],
  ['new state prefix', 'const __elnor_state = {count:{value:9}}; return count;', '1'],
  ['successive suffixes', 'const __elnor_props = 1, __elnor_props_1 = 2; return label + (__elnor_props + __elnor_props_1);', 'Outer3'],
  ['code point escape', 'const \\u{5f}_elnor_props = {label:"Captured"}; return label;', 'Outer'],
  ['template expression binding', 'return `${((__elnor_props: string) => label)("Captured")}`;', 'Outer'],
]) {
  test(`inserted references avoid ${name}`, async t => {
    const f = fixture(t,`action inspect() { ${body} }`,'    span inspect()');
    const {root,dispose} = await mountFixture(f);
    assert.equal(root.textContent,expected); dispose();
    assert.equal(root.childNodes.length,0);
  });
}

for (const name of ['text','cell','computed','element','__s','__d','__scope','__n1','__elnor_runtime_cell','uninitializedBinding','__elnor_runtime_uninitializedBinding','mountLiveComponent','__elnor_runtime_mountLiveComponent','nodeBlueprint','__elnor_runtime_nodeBlueprint','__elnor_blueprint0','liveProp','__elnor_runtime_liveProp','rootElement','__elnor_runtime_rootElement','createComponentRoot','__elnor_runtime_createComponentRoot']) {
  test(`generated declarations and runtime imports avoid action ${name}`, async t => {
    const f = fixture(t,`action ${name}() { return "Action"; }`,`    div {\r\n      span ${name}() + label + doubled\r\n    }`);
    const {root,dispose} = await mountFixture(f);
    assert.equal(root.textContent,'ActionOuter2'); dispose();
  });
}

test('each item references avoid lambda parameters and preserve updates', async t => {
  const f = fixture(t,'','    each item in [count] by item {\r\n      span ((__item1: number) => item)(9)\r\n    }\r\n    button "Add" => count++');
  const {root,dispose} = await mountFixture(f);
  assert.equal(root.textContent,'1Add'); root.descendants('button')[0].click();
  await tick(); assert.equal(root.textContent,'2Add'); dispose();
});

test('slot callback parameters do not capture user actions', async t => {
  const child = 'component Child() {\n  ui {\n    slot\n  }\n}';
  const f = fixture(t,'action __slotParent() { return "Content"; }','    Child {\r\n      span __slotParent()\r\n    }',child);
  const {root,dispose} = await mountFixture(f);
  assert.equal(root.textContent,'Content'); dispose();
});

test('child import aliases do not resolve to user actions', async t => {
  const child = 'component Child() {\n  ui {\n    span "Child"\n  }\n}';
  const f = fixture(t,'action __child_Child() { return "Action"; }','    Child\r\n    span __child_Child()',child);
  const {root,dispose} = await mountFixture(f);
  assert.equal(root.textContent,'ChildAction'); dispose();
});

test('event parameters do not capture inserted prop references', async t => {
  const child = 'component Child() {\n  event selected(value: string)\n  ui {\n    button "Select" => emit.selected("Payload")\n  }\n}';
  const f = fixture(t,'','    Child {\r\n      on selected(__props) => count = label.length + __props.length\r\n    }\r\n    span count',child);
  const {root,dispose} = await mountFixture(f);
  root.descendants('button')[0].click(); await tick();
  assert.equal(root.textContent,'Select12'); dispose();
});

test('rename into a generated helper name preserves execution', async t => {
  const f = fixture(t,'action inspect() { const local = "Local"; return local + label; }','    span inspect()');
  f.service.applyRename(f.service.rename(f.file,f.source.indexOf('local ='),'__props'));
  const source = f.service.text(f.file);
  assert.deepEqual(f.service.diagnostics(f.file),[]);
  f.graph.set(f.file,parseSurface(source,f.file));
  assert.deepEqual(typecheckGraph(f.graph,path.join(f.root,'renamed')),[]);
  const {root,dispose} = await mountFixture(f);
  assert.equal(root.textContent,'LocalOuter'); dispose();
});

test('emitter references remain hygienic and output is deterministic', async t => {
  const f = fixture(t,'event changed(value: string)\r\n  action notify() { const __elnor_emit = "Local"; emit.changed(label + __elnor_emit); }','    button "Notify" => notify()');
  const ir = f.graph.get(f.file);
  assert.equal(generate(ir),generate(ir));
  const calls = [];
  const {root,dispose} = await mountFixture(f,{changed:value=>calls.push(value)});
  root.descendants('button')[0].click();
  assert.deepEqual(calls,['OuterLocal']); dispose();
});

for(const name of ['__elnor_runtime_literalText','__elnor_runtime_literalButton']){
  test(`literal helper imports avoid action ${name}`,async t=>{
    const f=fixture(t,`action ${name}() { count++; }`,`    div {\n h1 "Heading"\n button "Add" => ${name}()\n span count\n }`);
    const {root,dispose}=await mountFixture(f);
    assert.equal(root.textContent,'HeadingAdd1');
    root.descendants('button')[0].click();await tick();
    assert.equal(root.textContent,'HeadingAdd2');dispose();assert.equal(root.childNodes.length,0);
  });
}

test('escaped contextual identifiers keep reactive reads and action writes',async t=>{
  const f=fixture(t,'action add() { c\\u006funt++; }','    span c\\u{6f}unt\n    button "Add" => add()');
  const {root,dispose}=await mountFixture(f);
  assert.equal(root.textContent,'1Add');root.descendants('button')[0].click();await tick();
  assert.equal(root.textContent,'2Add');dispose();assert.equal(root.childNodes.length,0);
});

test('context-independent nested functions and templates keep their own bindings',async t=>{
  const f=fixture(t,'action inspect() { const choose = (input: number) => ({message: `v${input}`}); return choose(3).message; }','    span inspect()\n    small Math.max(2, 7)');
  const {root,dispose}=await mountFixture(f);
  assert.equal(root.textContent,'v37');dispose();assert.equal(root.childNodes.length,0);
});
