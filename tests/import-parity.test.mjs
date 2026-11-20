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
import {setupDOM,FakeNode} from './fake-dom.mjs';

function fixture(t,header,params,expression,modules,actions = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'elnor-import-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
  for (const [name,source] of Object.entries(modules)) {
    const file = path.join(root,name); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,source);
  }
  const file = path.join(root,'components','Screen.eln'); fs.mkdirSync(path.dirname(file),{recursive:true});
  const source = `${header}\r\ncomponent Screen(${params}) {\r\n  // café 😀\r\n  ${actions}\r\n  ui {\r\n    ${expression}\r\n  }\r\n}`;
  fs.writeFileSync(file,source);
  const graph = new Map([[file,parseSurface(source,file)]]);
  for (const name of Object.keys(modules).filter(name=>name.endsWith('.eln'))) {
    const dependency = path.join(root,name); graph.set(dependency,parseSurface(fs.readFileSync(dependency,'utf8'),dependency));
  }
  const service = createSurfaceLanguageService({root}); t.after(()=>service.dispose()); service.open(file,source);
  const ir = graph.get(file);
  return {root,file,source,ir,graph,service,
    cli:typecheckGraph(graph,path.join(root,'unrelated','check')),
    editor:service.diagnostics(file)};
}

async function mountParentOnly(f,props) {
  const output = path.join(f.root,'output'); fs.mkdirSync(output);
  fs.copyFileSync('src/runtime.mjs',path.join(output,'runtime.mjs'));
  fs.writeFileSync(path.join(output,'Screen.mjs'),generate(f.ir));
  const {mount} = await import(pathToFileURL(path.join(output,'Screen.mjs')).href);
  setupDOM(); const root = new FakeNode('root'), dispose = mount(root,props);
  assert.equal(root.textContent,'Ready'); dispose(); assert.equal(root.childNodes.length,0);
}

const modelModule = 'export interface Model {label: string;}\nexport default class DefaultModel {label = "Default";}\nexport function make(label: string) {return label;}\nthrow new Error("Tooling and type-only output must not execute this module");';
const helperModule = 'export interface Model {label: string;}\nexport function make(label: string) {return label;}\nexport default make;\nthrow new Error("Tooling must not execute this module");';
for (const [name,header,type] of [
  ['default explicit type','import type Model from "../models/Model.mjs";','Model'],
  ['default value import used only as a type','import Model from "../models/Model.mjs";','Model'],
  ['named type','import type {Model} from "../models/Model.mjs";','Model'],
  ['namespace type','import type * as Models from "../models/Model.mjs";','Models.Model'],
  ['mixed unused value and type','import {type Model, make} from "../models/Model.mjs";','Model'],
]) {
  test(`type import resolves from original source and never loads at runtime: ${name}`,async t => {
    const f = fixture(t,header,`model: ${type}`,'span model.label',{'models/Model.mts':modelModule});
    assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
    await mountParentOnly(f,{model:{label:'Ready'}});
  });
}

for (const [name,header,params,expression,actions] of [
  ['default','import make from "../helpers/helper.mjs";','','span make("Ready")',''],
  ['named alias','import {make as format} from "../helpers/helper.mjs";','','span format("Ready")',''],
  ['namespace','import * as helpers from "../helpers/helper.mjs";','','span helpers.make("Ready")',''],
  ['action use','import {make} from "../helpers/helper.mjs";','','span inspect()','action inspect() { return make("Ready"); }'],
  ['mixed type and value','import {type Model, make} from "../helpers/helper.mjs";','model: Model','span make(model.label)',''],
]) {
  test(`local runtime import is accepted but raw generation requires its packaging plan: ${name}`,t => {
    const f = fixture(t,header,params,expression,{'helpers/helper.mts':helperModule},actions);
    assert.deepEqual(f.cli,[]);assert.deepEqual(f.editor,[]);
    assert.throws(()=>generate(f.ir),/ELN-IMPORT-RUNTIME/);
  });
}

test('a missing type module remains an original-file TypeScript error',t => {
  const f = fixture(t,'import type Model from "../missing.mjs";','model: Model','span "Ready"',{});
  assert.ok(f.cli.some(d=>d.code==='TS2307' && d.file===f.file));
  const error = f.editor.find(d=>d.code==='TS2307'); assert.ok(error);
  assert.ok(f.source.slice(error.start,error.start+error.length).includes('../missing.mjs'));
});

test('using an explicit type import as a value remains a TypeScript error',t => {
  const f = fixture(t,'import type Model from "../models/Model.mjs";','','span new Model().label',{'models/Model.mts':modelModule});
  assert.ok(f.cli.some(d=>d.code==='TS1361')); assert.ok(f.editor.some(d=>d.code==='TS1361'));
});

const child = 'component Child(label: string) {\n  ui {\n    span label\n  }\n}';
test('type-only Surface dependency does not become a runtime mount import',async t => {
  const f = fixture(t,'import type Child from "./Child.eln";','factory?: typeof Child','span "Ready"',{'components/Child.eln':child});
  assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
  assert.ok(!generate(f.ir).includes('Child.mjs'));
  await mountParentOnly(f,{});
});

test('rendering a type-only Surface dependency has a shared error',t => {
  const f = fixture(t,'import type Child from "./Child.eln";','','Child label="Ready"',{'components/Child.eln':child});
  assert.ok(f.cli.some(d=>d.code==='ELN-IMPORT-TYPE'));
  const error = f.editor.find(d=>d.code==='ELN-IMPORT-TYPE'); assert.ok(error);
  assert.equal(error.start,f.source.lastIndexOf('Child label'));
  assert.throws(()=>generate(f.ir),/ELN-IMPORT-TYPE/);
});

for (const declaration of ['import {default as Child} from "./Child.eln";','import * as Child from "./Child.eln";']) {
  test(`unsupported Surface import form is explicit: ${declaration}`,t => {
    const f = fixture(t,declaration,'','span "Ready"',{'components/Child.eln':child});
    assert.ok(f.cli.some(d=>d.code==='ELN-IMPORT-FORM'));
    assert.ok(f.editor.some(d=>d.code==='ELN-IMPORT-FORM'));
    assert.throws(()=>generate(f.ir),/ELN-IMPORT-FORM/);
  });
}

test('a shadowed imported name does not require runtime packaging',async t => {
  const f = fixture(t,'import {make} from "../helpers/helper.mjs";','','span inspect()',{'helpers/helper.mts':helperModule},'action inspect() { const make = (label: string) => label; return make("Ready"); }');
  assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]); await mountParentOnly(f,{});
});

test('transitive .ts type dependencies resolve in their original directories',async t => {
  const f = fixture(t,'import type Model from "../models/Model.js";','model: Model','span model.label',{
    'models/Model.ts':'import type {Label} from "./nested/labels.js";\nexport default interface Model {label: Label;}',
    'models/nested/labels.ts':'export type Label = string;\nthrow new Error("Type modules must not load");',
  });
  assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]); await mountParentOnly(f,{model:{label:'Ready'}});
});

test('external unsaved type edits invalidate original-source diagnostics',t => {
  const f = fixture(t,'import type Model from "../models/Model.mjs";','model: Model','span upper',{'models/Model.mts':modelModule},'calc upper = model.label.toUpperCase();');
  assert.deepEqual(f.cli,[]); assert.deepEqual(f.editor,[]);
  const dependency = path.join(f.root,'models/Model.mts');
  f.service.open(dependency,modelModule.replace('label = "Default"','label = 1'));
  const error = f.service.diagnostics(f.file).find(d=>d.code==='TS2339'); assert.ok(error);
  assert.equal(f.source.slice(error.start,error.start+error.length),'toUpperCase');
  f.service.open(dependency,modelModule); assert.deepEqual(f.service.diagnostics(f.file),[]);
});

test('shared runtime import ranges remain exact after Unicode in an earlier path',t => {
  const f = fixture(t,'import type Model from "../models/café😀.mjs";\r\nimport {make} from "../helpers/helper.mjs";','model: Model','span make(model.label)',{
    'models/café😀.mts':modelModule,'helpers/helper.mts':'import value from "some-package";\nexport const make = value;',
  });
  const cli = f.cli.find(d=>d.code==='ELN-MODULE-PATH'), editor = f.editor.find(d=>d.code==='ELN-MODULE-PATH');
  assert.ok(cli); assert.ok(editor); assert.equal(cli.start,editor.start);
  assert.equal(editor.start,f.source.indexOf('../helpers/helper.mjs'));
  assert.equal(f.source.slice(editor.start,editor.start+editor.length),'../helpers/helper.mjs');
});

for (const [expression,actions] of [
  ['span Child',''],
  ['span JSON.stringify({Child})',''],
  ['span inspect()','action inspect() { return Child({label:"Ready"}); }'],
]) {
  test(`Surface import runtime use outside a tag is explicit: ${expression}, ${actions}`,t => {
    const f = fixture(t,'import Child from "./Child.eln";','',expression,{'components/Child.eln':child},actions);
    assert.ok(f.cli.some(d=>d.code==='ELN-IMPORT-USAGE'));
    const error = f.editor.find(d=>d.code==='ELN-IMPORT-USAGE'); assert.ok(error);
    assert.equal(f.source.slice(error.start,error.start+error.length),'Child');
    assert.throws(()=>generate(f.ir),/ELN-IMPORT-USAGE/);
  });
}
