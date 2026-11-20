import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';
import {generate} from '../src/compiler.mjs';
import * as runtime from '../src/runtime.mjs';
import {setupDOM,FakeNode,tick} from './fake-dom.mjs';

test('live prop descriptors stay lazy, enumerable, nonconfigurable and readonly without freezing the object',()=>{
  let props,reads=0,value='A';
  runtime.renderComponent(null,(_parent,received)=>{props=received;},
    {label:()=>{reads++;return value;}},{},{},runtime.scope());
  assert.equal(reads,0);
  assert.equal(props.label,'A');value='B';assert.equal(props.label,'B');assert.equal(reads,2);
  const descriptor=Object.getOwnPropertyDescriptor(props,'label');
  assert.equal(descriptor.enumerable,true);assert.equal(descriptor.configurable,false);
  assert.equal(descriptor.set,undefined);assert.equal(typeof descriptor.get,'function');
  assert.throws(()=>{props.label='X';},TypeError);
  assert.throws(()=>Object.defineProperty(props,'label',{value:'X'}),TypeError);
  assert.equal(Object.isExtensible(props),true);props.extra=1;assert.equal(props.extra,1);
});

test('compiled props preserve deferred reads, slots, events and a user Object import',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-prop-adapter-'));
  t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(dir).startsWith('elnor-prop-adapter-'));fs.rmSync(dir,{recursive:true,force:true});});
  const source='import Object from "./shadow.mjs";\nimport Child from "./Child.eln";\ncomponent Main(read: () => string, hit: (value: string) => void) {\n ui {\n span Object()\n Child value=(read()) {\n on selected(value) => hit(value)\n span read()\n }\n }\n}';
  fs.writeFileSync(path.join(dir,'shadow.mjs'),'export default function Object(){return "Shadow";}');
  fs.writeFileSync(path.join(dir,'Child.eln'),'component Child(value: string) {\n event selected(value: string)\n ui {\n span value\n slot\n }\n}');
  const code=generate(parseSurface(source,path.join(dir,'Main.eln')),{
    moduleImports:new Map([['./shadow.mjs','./shadow.mjs']]),
    componentImports:new Map([['./Child.eln','./child.mjs']]),
  });
  fs.copyFileSync(new URL('../src/runtime.mjs',import.meta.url),path.join(dir,'runtime.mjs'));
  fs.writeFileSync(path.join(dir,'Main.mjs'),code);
  fs.writeFileSync(path.join(dir,'child.mjs'),`import {text,button} from './runtime.mjs';
export const descriptors=[];
export function renderOwned(parent,props,handlers,slots,owner){
  descriptors.push(Object.getOwnPropertyDescriptor(props,'value'));
  text(parent,'small',()=>props.value,owner);
  button(parent,()=>props.value,()=>handlers.selected(props.value),owner);
  slots.default(parent,owner);
}`);
  const {mount}=await import(pathToFileURL(path.join(dir,'Main.mjs')).href);
  const child=await import(pathToFileURL(path.join(dir,'child.mjs')).href);
  const {cell}=await import(pathToFileURL(path.join(dir,'runtime.mjs')).href);
  setupDOM();const root=new FakeNode('root'),value=cell('A'),events=[];let reads=0;
  const dispose=mount(root,{read:()=>{reads++;return value.value;},hit:v=>events.push(v)});
  assert.equal(root.textContent,'ShadowAAA');assert.equal(reads,3);
  assert.equal(child.descriptors[0].enumerable,true);assert.equal(child.descriptors[0].configurable,false);
  value.value='B';await tick();assert.equal(root.textContent,'ShadowBBB');assert.equal(reads,6);
  const control=root.descendants('button')[0];control.click();assert.deepEqual(events,['B']);
  dispose();const before=reads;value.value='C';await tick();control.click();
  assert.equal(reads,before);assert.deepEqual(events,['B']);assert.equal(root.childNodes.length,0);
});
