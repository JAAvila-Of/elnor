import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as compiler from '../src/compiler.mjs';
import {parseSurface} from '../src/parser.mjs';
import {typecheckGraph} from '../src/checker.mjs';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {setupDOM,FakeNode} from './fake-dom.mjs';
import {createServer} from '../src/server.mjs';

function fixture(t,header,expression,modules,extra = '') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-esm-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
  for(const [name,text] of Object.entries(modules)){
    const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);
  }
  const file=path.join(root,'components','Screen.eln');fs.mkdirSync(path.dirname(file),{recursive:true});
  const source=`${header}\r\ncomponent Screen() {\r\n  ${extra}\r\n  ui {\r\n    span ${expression}\r\n  }\r\n}`;
  fs.writeFileSync(file,source);
  const graph=new Map([[file,parseSurface(source,file)]]);
  for(const name of Object.keys(modules).filter(name=>name.endsWith('.eln'))){
    const dependency=path.join(root,name);graph.set(dependency,parseSurface(fs.readFileSync(dependency,'utf8'),dependency));
  }
  const service=createSurfaceLanguageService({root});t.after(()=>service.dispose());service.open(file,source);
  const out=path.join(root,'relocated','program','output');
  return {root,file,source,graph,service,out,
    cli:typecheckGraph(graph,path.join(root,'check')),editor:service.diagnostics(file)};
}
function emit(f){
  assert.deepEqual(f.cli,[]);assert.deepEqual(f.editor,[]);
  return compiler.emitGraph(f.graph,f.out);
}
async function execute(f,expected){
  const {mount}=await import(pathToFileURL(path.join(f.out,'Screen.mjs')).href);
  setupDOM();const root=new FakeNode('root'),dispose=mount(root,{});
  assert.equal(root.textContent,expected);dispose();assert.equal(root.childNodes.length,0);
}

for(const [name,header,expression,moduleName,moduleSource] of [
  ['default','import format from "../lib/format.mjs";','format("Ready")','lib/format.mts','export default function format(label: string) {return label;}'],
  ['named','import {format as display} from "../lib/format.mjs";','display("Ready")','lib/format.mts','export function format(label: string) {return label;}'],
  ['namespace','import * as helpers from "../lib/format.mjs";','helpers.format("Ready")','lib/format.mts','export function format(label: string) {return label;}'],
  ['ts source','import format from "../lib/format.js";','format("Ready")','lib/format.ts','export default function format(label: string) {return label;}'],
  ['JavaScript ESM','import format from "../lib/format.mjs";','format("Ready")','lib/format.mjs','export default function format(label) {return label;}'],
  ['js in module package','import format from "../lib/format.js";','format("Ready")','lib/format.js','export default function format(label) {return label;}'],
  ['direct ts extension','import format from "../lib/format.ts";','format("Ready")','lib/format.ts','export default function format(label: string) {return label;}'],
]){
  test(`local ESM imports execute from relocated output: ${name}`,async t=>{
    const f=fixture(t,header,expression,{[moduleName]:moduleSource});emit(f);await execute(f,'Ready');
    assert.equal(fs.readdirSync(path.join(f.out,'.elnor-modules')).length,1);
  });
}

test('transitive reexports and side-effect imports are relocated together',async t=>{
  const f=fixture(t,'import {format} from "../lib/index.mjs";','format()',{
    'lib/index.mts':'export {format} from "./format.mjs";',
    'lib/format.mts':'import "./setup.mjs";\nimport {label} from "./nested/value.mjs";\nexport function format() {return label;}',
    'lib/setup.mts':'export {};',
    'lib/nested/value.mts':'export const label = "Ready";',
  });emit(f);await execute(f,'Ready');assert.equal(fs.readdirSync(path.join(f.out,'.elnor-modules')).length,4);
});

test('same-basename modules keep distinct output identities',async t=>{
  const f=fixture(t,'import a from "../a/value.mjs";\nimport b from "../b/value.mjs";','a + b',{
    'a/value.mts':'export default "Re";','b/value.mts':'export default "ady";',
  });emit(f);await execute(f,'Ready');assert.equal(fs.readdirSync(path.join(f.out,'.elnor-modules')).length,2);
});

test('lazy cyclic ESM references retain linking behavior',async t=>{
  const f=fixture(t,'import {format} from "../lib/a.mjs";','format()',{
    'lib/a.mts':'import {suffix} from "./b.mjs";\nexport function prefix() {return "Re";}\nexport function format() {return suffix();}',
    'lib/b.mts':'import {prefix} from "./a.mjs";\nexport function suffix() {return prefix()+"ady";}',
  });emit(f);await execute(f,'Ready');
});

test('type-only module edges are erased instead of packaged or executed',async t=>{
  const f=fixture(t,'import format from "../lib/format.mjs";','format({label:"Ready"})',{
    'lib/format.mts':'import type Model from "./model.mjs";\nexport default function format(model: Model) {return model.label;}',
    'lib/model.mts':'export default interface Model {label: string;}\nthrow new Error("type-only module executed");',
  });emit(f);await execute(f,'Ready');assert.equal(fs.readdirSync(path.join(f.out,'.elnor-modules')).length,1);
});

test('semantic type reexports are erased across ordinary module barrels',async t=>{
  const f=fixture(t,'import format from "../lib/index.mjs";','format()',{
    'lib/index.mts':'export {format as default, Model} from "./barrel.mjs";',
    'lib/barrel.mts':'import {Model, format} from "./implementation.mjs";\nexport {Model, format};',
    'lib/implementation.mts':'export interface Model {label: string;}\nexport function format() {return "Ready";}',
  });emit(f);await execute(f,'Ready');assert.equal(fs.readdirSync(path.join(f.out,'.elnor-modules')).length,3);
});

test('checking and emitting never execute user modules; imports preserve singleton identity',async t=>{
  t.after(()=>delete globalThis.__elnorEsmProbe);
  const f=fixture(t,'import {left} from "../lib/left.mjs";\nimport {right} from "../lib/right.mjs";','left()+right()',{
    'lib/shared.mts':'(globalThis as any).__elnorEsmProbe = ((globalThis as any).__elnorEsmProbe ?? 0) + 1;\nexport const label = "Ready";',
    'lib/left.mts':'import {label} from "./shared.mjs";\nexport function left() {return label;}',
    'lib/right.mts':'import {label} from "./shared.mjs";\nexport function right() {return label;}',
  });assert.equal(globalThis.__elnorEsmProbe,undefined);emit(f);assert.equal(globalThis.__elnorEsmProbe,undefined);
  await execute(f,'ReadyReady');assert.equal(globalThis.__elnorEsmProbe,1);
  assert.equal(fs.readdirSync(path.join(f.out,'.elnor-modules')).length,3);
});

for(const [name,moduleSource,code] of [
  ['package edge','import value from "some-package";\nexport default value;','ELN-MODULE-PATH'],
  ['dynamic import','export default function format() {return import("./other.mjs");}','ELN-MODULE-DYNAMIC'],
  ['CommonJS','export default function format() {return require("fs");}','ELN-MODULE-CJS'],
  ['import meta assets','export default import.meta.url;','ELN-MODULE-META'],
  ['missing local dependency','export {default} from "./missing.mjs";','ELN-MODULE-RESOLVE'],
]){
  test(`unsupported transitive module behavior is explicit: ${name}`,t=>{
    const f=fixture(t,'import format from "../lib/format.mjs";','format',{'lib/format.mts':moduleSource});
    const cli=f.cli.find(d=>d.code===code),editor=f.editor.find(d=>d.code===code);
    assert.ok(cli);assert.ok(editor);assert.equal(cli.message,editor.message);
    assert.equal(f.source.slice(editor.start,editor.start+editor.length),'../lib/format.mjs');
    fs.mkdirSync(f.out,{recursive:true});fs.writeFileSync(path.join(f.out,'keep.txt'),'Keep');
    assert.throws(()=>compiler.emitGraph(f.graph,f.out),new RegExp(code));
    assert.deepEqual(fs.readdirSync(f.out),['keep.txt']);
  });
}

test('unsaved external module changes update packaging diagnostics without execution',t=>{
  const f=fixture(t,'import format from "../lib/format.mjs";','format()',{'lib/format.mts':'export default function format() {return "Ready";}'});
  assert.deepEqual(f.cli,[]);assert.deepEqual(f.editor,[]);
  const file=path.join(f.root,'lib/format.mts');
  f.service.open(file,'import value from "some-package";\nexport default function format() {return value;}');
  assert.ok(f.service.diagnostics(f.file).some(d=>d.code==='ELN-MODULE-PATH'));
  f.service.open(file,'export default function format() {return "Ready";}');assert.deepEqual(f.service.diagnostics(f.file),[]);
});

test('live ESM bindings update without introducing a generated mount-name collision',async t=>{
  const f=fixture(t,'import mount, {count, advance} from "../lib/state.mjs";','inspect()',{
    'lib/state.mts':'export let count = 0;\nexport function advance() {count++;}\nexport default function label() {return "Ready";}',
  },'action inspect() { advance(); return mount() + count; }');
  emit(f);await execute(f,'Ready1');
});

test('ordinary modules can use a local function named require',async t=>{
  const f=fixture(t,'import format from "../lib/format.mjs";','format()',{
    'lib/format.mts':'function require() {return "Ready";}\nexport default function format() {return require();}',
  });emit(f);await execute(f,'Ready');
});

test('a declaration contract packages its actual JavaScript implementation',async t=>{
  const f=fixture(t,'import format from "../lib/format.mjs";','format()',{
    'lib/format.d.mts':'export default function format(): string;',
    'lib/format.mjs':'export default function format() {return "Ready";}',
  });emit(f);await execute(f,'Ready');
});

test('a declaration without an executable implementation is rejected before writing',t=>{
  const f=fixture(t,'import format from "../lib/format.mjs";','format()',{'lib/format.d.mts':'export default function format(): string;'});
  assert.ok(f.cli.some(d=>d.code==='ELN-MODULE-RESOLVE'));
  assert.ok(f.editor.some(d=>d.code==='ELN-MODULE-RESOLVE'));
  assert.throws(()=>compiler.emitGraph(f.graph,f.out),/ELN-MODULE-RESOLVE/);assert.ok(!fs.existsSync(f.out));
});

for(const [expression,code] of [['import("../lib/format.mjs")','ELN-MODULE-DYNAMIC'],['import.meta.url','ELN-MODULE-META']]){
  test(`component expressions retain explicit unsupported ESM boundaries: ${expression}`,t=>{
    const f=fixture(t,'','inspect()',{'lib/format.mts':'export default "Ready";'},`action inspect() {return ${expression};}`);
    assert.ok(f.cli.some(d=>d.code===code));
    const error=f.editor.find(d=>d.code===code);assert.ok(error);
    assert.equal(f.source.slice(error.start,error.start+error.length),code==='ELN-MODULE-META'?'import.meta':expression);
    assert.throws(()=>compiler.emitGraph(f.graph,f.out),new RegExp(code));assert.ok(!fs.existsSync(f.out));
  });
}

test('CommonJS file paths and environment aliases are rejected explicitly',t=>{
  const f=fixture(t,'import format from "../lib/format.cjs";','format()',{'lib/format.cjs':'module.exports = () => "Ready";'});
  assert.ok(f.cli.some(d=>d.code==='ELN-MODULE-PATH'));
  assert.ok(f.editor.some(d=>d.code==='ELN-MODULE-PATH'));
  const g=fixture(t,'import format from "../lib/format.mjs";','format',{'lib/format.mjs':'const m = module;\nexport default m.exports;'});
  assert.ok(g.cli.some(d=>d.code==='ELN-MODULE-CJS'));assert.ok(g.editor.some(d=>d.code==='ELN-MODULE-CJS'));
});

test('package format is respected for ts sources and explicit mts remains ESM',async t=>{
  const f=fixture(t,'import format from "../lib/format.js";','format()',{
    'lib/package.json':'{"type":"commonjs"}','lib/format.ts':'export default function format() {return "Ready";}',
  });
  assert.ok(f.cli.some(d=>d.code==='ELN-MODULE-CJS'));assert.ok(f.editor.some(d=>d.code==='ELN-MODULE-CJS'));
  assert.throws(()=>compiler.emitGraph(f.graph,f.out),/ELN-MODULE-CJS/);assert.ok(!fs.existsSync(f.out));
  const g=fixture(t,'import format from "../lib/format.mjs";','format()',{
    'lib/package.json':'{"type":"commonjs"}','lib/format.mts':'export default function format() {return "Ready";}',
  });emit(g);await execute(g,'Ready');
});

test('components sharing an ordinary dependency emit one module identity',async t=>{
  const f=fixture(t,'import Child from "./Child.eln";\nimport format from "../lib/format.mjs";','format()',{
    'lib/format.mts':'export default function format() {return "Ready";}',
    'components/Child.eln':'import format from "../lib/format.mjs";\ncomponent Child() {\n  ui {\n    span format()\n  }\n}',
  });
  const source=f.source.replace('span format()','Child\r\n    span format()');f.graph.set(f.file,parseSurface(source,f.file));f.service.open(f.file,source);
  const child=path.join(f.root,'components/Child.eln');f.graph.set(child,parseSurface(fs.readFileSync(child,'utf8'),child));
  assert.deepEqual(typecheckGraph(f.graph,path.join(f.root,'check-composition')),[]);assert.deepEqual(f.service.diagnostics(f.file),[]);
  compiler.emitGraph(f.graph,f.out);await execute(f,'ReadyReady');
  assert.equal(fs.readdirSync(path.join(f.out,'.elnor-modules')).length,1);
});

test('Surface output identities support duplicate, mismatched and reserved names',t=>{
  const f=fixture(t,'','"Ready"',{});
  const duplicate=path.join(f.root,'other/Screen.eln');
  f.graph.set(duplicate,parseSurface('component Screen() {\n  ui {\n    span "Other"\n  }\n}',duplicate));
  fs.mkdirSync(f.out,{recursive:true});fs.writeFileSync(path.join(f.out,'keep.txt'),'Keep');
  const duplicates=compiler.emitGraph(f.graph,f.out);assert.equal(duplicates.components.length,2);
  assert.notEqual(duplicates.components[0].file,duplicates.components[1].file);
  const mismatched=path.join(f.root,'components/Other.eln');
  const mismatch=new Map([[mismatched,parseSurface('component Different() {\n  ui {\n    span "Ready"\n  }\n}',mismatched)]]);
  assert.equal(compiler.emitGraph(mismatch,f.out).components[0].name,'Different');
  const reserved=path.join(f.root,'components/runtime.eln');
  const reservedGraph=new Map([[reserved,parseSurface('component runtime() {\n  ui {\n    span "Ready"\n  }\n}',reserved)]]);
  assert.equal(compiler.emitGraph(reservedGraph,f.out).components[0].alias,undefined);
  assert.equal(fs.readFileSync(path.join(f.out,'keep.txt'),'utf8'),'Keep');
  assert.match(fs.readFileSync(path.join(f.out,'runtime.mjs'),'utf8'),/export function cell/);
});

test('module filenames and emitted code are deterministic within the same source tree',t=>{
  const f=fixture(t,'import format from "../lib/format.mjs";','format()',{'lib/format.mts':'export default function format() {return "Ready";}'});
  const first=emit(f),contents=first.files.map(name=>fs.readFileSync(path.join(f.out,name),'utf8'));
  const second=compiler.emitGraph(f.graph,f.out);assert.deepEqual(second.files,first.files);
  assert.deepEqual(second.files.map(name=>fs.readFileSync(path.join(f.out,name),'utf8')),contents);
});

test('preview transport serves relocated ESM assets with JavaScript MIME and existing CSP',async t=>{
  const f=fixture(t,'import format from "../lib/format.mjs";','format()',{'lib/format.mts':'export default function format() {return "Ready";}'});
  const output=emit(f),server=createServer({dist:f.out});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const name of output.files){
    const response=await fetch(base+'/'+name);assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/^text\/javascript/);
    assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
    assert.equal(await response.text(),fs.readFileSync(path.join(f.out,name),'utf8'));
  }
});
