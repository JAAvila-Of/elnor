import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';
import {emitGraph} from '../src/compiler.mjs';
import {typecheckGraph} from '../src/checker.mjs';
import {cell,effect,scope,repeat} from '../src/runtime.mjs';
import {setupDOM,FakeNode,tick} from './fake-dom.mjs';

async function fixture(t,main,children={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-detached-'));
  t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(dir).startsWith('elnor-detached-'));fs.rmSync(dir,{recursive:true,force:true});});
  const graph=new Map();
  for(const [name,source] of Object.entries({Main:main,...children})){
    const file=path.join(dir,name+'.eln');fs.writeFileSync(file,source);graph.set(file,parseSurface(source,file));
  }
  assert.deepEqual(typecheckGraph(graph,path.join(dir,'check')),[]);
  const output=path.join(dir,'out'),built=emitGraph(graph,output);
  const load=async name=>import(pathToFileURL(path.join(output,built.components.find(record=>record.name===name).file)).href);
  const {mount}=await load('Main'),runtime=await import(pathToFileURL(path.join(output,'runtime.mjs')).href);
  setupDOM();let fragments=0;const create=document.createDocumentFragment;
  document.createDocumentFragment=()=>{fragments++;return create();};
  return {mount,runtime,load,fragments:()=>fragments};
}

const inline='component Main(rows: number[]) {\n event selected(id: number)\n ui {\n ul {\n each item in rows by item {\n li {\n button String(item) => emit.selected(item)\n small item\n }\n }\n }\n }\n}';

test('plain inline roots allocate no staging fragments and preserve keyed events and disposal',async t=>{
  const f=await fixture(t,inline),values=f.runtime.cell([1,2,3]),events=[],root=new FakeNode('root');
  const dispose=f.mount(root,{get rows(){return values.value;}},{selected:id=>events.push(id)});
  assert.equal(f.fragments(),0);const nodes=root.descendants('li'),held=root.descendants('button')[0];
  values.value=[3,2,1,4];await tick();assert.equal(f.fragments(),0);
  assert.equal(root.descendants('li')[0],nodes[2]);assert.equal(root.descendants('li')[2],nodes[0]);
  held.click();assert.deepEqual(events,[1]);values.value=[];await tick();held.click();assert.deepEqual(events,[1]);
  assert.equal(root.descendants('li').length,0);dispose();assert.equal(root.childNodes.length,0);
});

test('the ordinary graph compiler recognizes an imported plain single-root child',async t=>{
  const main='import Child from "./Child.eln";\ncomponent Main(rows: number[]) {\n event selected(id: number)\n ui {\n ul {\n each item in rows by item {\n Child value=item {\n on selected(id) => emit.selected(id)\n }\n }\n }\n }\n}';
  const child='component Child(value: number) {\n event selected(id: number)\n ui {\n li {\n button String(value) => emit.selected(value)\n small value\n }\n }\n}';
  const f=await fixture(t,main,{Child:child}),root=new FakeNode('root'),events=[];
  const dispose=f.mount(root,{rows:[1,2,3]},{selected:id=>events.push(id)});
  assert.equal(f.fragments(),0);assert.equal(root.descendants('li').length,3);
  root.descendants('button')[1].click();assert.deepEqual(events,[2]);dispose();assert.equal(root.childNodes.length,0);
});

for(const [name,ui,nested] of [
  ['slot','li {\n span value\n slot\n }'],
  ['conditional','li {\n if value > 0 {\n span value\n }\n }'],
  ['child component','li {\n Nested value=value\n }',true],
  ['multiple roots','li {\n span value\n }\n small value'],
])test(`a child with ${name} keeps the ordinary fragment path`,async t=>{
  const main='import Child from "./Child.eln";\ncomponent Main() {\n ui {\n ul {\n each item in [1,2] by item {\n Child value=item {\n'+(name==='slot'?' span "filled"\n':'')+' }\n }\n }\n }\n}';
  const child=(nested?'import Nested from "./Nested.eln";\n':'')+'component Child(value: number) {\n ui {\n'+ui+'\n }\n}';
  const f=await fixture(t,main,{Child:child,...(nested?{Nested:'component Nested(value: number) {\n ui {\n span value\n }\n}'}:{})});
  const root=new FakeNode('root'),dispose=f.mount(root,{});
  assert.ok(f.fragments()>=2);assert.equal(root.descendants('li').length,2);
  dispose();assert.equal(root.childNodes.length,0);
});

test('failed detached rows release both staged and partially created resources',async t=>{
  const source='component Main(read: (item: number) => string, hit: () => void) {\n ui {\n ul {\n each item in [1,2] by item {\n li {\n button "Hit" => hit()\n span read(item)\n }\n }\n }\n }\n}';
  const f=await fixture(t,source),root=new FakeNode('root'),prior=new FakeNode('aside');root.append(prior);
  const value=f.runtime.cell('A'),controls=[],append=FakeNode.prototype.append,failure=new Error('read');let reads=0,hits=0;
  FakeNode.prototype.append=function(...nodes){for(const node of nodes)if(node.tag==='button')controls.push(node);return append.apply(this,nodes);};
  t.after(()=>{FakeNode.prototype.append=append;});
  assert.throws(()=>f.mount(root,{read:item=>{reads++;value.value;if(item===2)throw failure;return 'ok';},hit:()=>hits++}),error=>error===failure);
  assert.equal(f.fragments(),0);assert.deepEqual(root.childNodes,[prior]);assert.equal(controls.length,2);
  controls.forEach(node=>node.click());assert.equal(hits,0);const before=reads;
  value.value='B';await tick();assert.equal(reads,before);
});

test('an invalid detached result preserves prior nodes and cleans subscriptions',async()=>{
  setupDOM();const root=new FakeNode('root'),prior=new FakeNode('aside'),owner=scope(),value=cell(0);let reads=0;
  root.append(prior);
  assert.throws(()=>repeat(root,()=>[1],x=>x,(_item,parent,child)=>{
    assert.equal(parent,null);effect(()=>{reads++;value.value;},child);return prior;
  },owner,false,true),/ELN-RUNTIME-003/);
  assert.deepEqual(root.childNodes,[prior]);value.value=1;await tick();assert.equal(reads,1);owner.dispose();
});

test('a simple root still mounts into an existing target with a public disposer',async t=>{
  const f=await fixture(t,'component Main(label: string) {\n ui {\n li {\n span label\n }\n }\n}');
  const root=new FakeNode('root'),prior=new FakeNode('aside');root.append(prior);
  const value=f.runtime.cell('A'),dispose=f.mount(root,{get label(){return value.value;}});
  assert.equal(typeof dispose,'function');assert.equal(root.textContent,'A');assert.equal(root.childNodes[0],prior);
  value.value='B';await tick();assert.equal(root.textContent,'B');dispose();assert.deepEqual(root.childNodes,[prior]);
});
