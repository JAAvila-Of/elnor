import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {generate} from '../src/compiler.mjs';
import {parseSurface} from '../src/parser.mjs';
import {setupDOM,FakeNode,tick} from './fake-dom.mjs';

async function compile(t,source){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-guard-sharing-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const filename=path.join(root,'Guarded.eln');
 fs.writeFileSync(path.join(root,'Guarded.mjs'),generate(parseSurface(source,filename)));
 fs.copyFileSync(new URL('../src/runtime.mjs',import.meta.url),path.join(root,'runtime.mjs'));
 return {filename,...await import(pathToFileURL(path.join(root,'Guarded.mjs')))};
}

test('initialization diagnostics and pending bindings remain isolated across instances',async t=>{
 const {mount,filename}=await compile(t,`component Guarded(enter: (read: () => number, write: (next: number) => void) => number, seed: number) {
 state first = enter(() => later, (next) => later = next);
 state later = seed;
 ui {
 span first + later
 }
}`);
 setupDOM();const a=new FakeNode('root'),b=new FakeNode('root'),errors=[],saved=[];
 const enter=(read,write)=>{saved.push({read,write});for(const run of [read,read,()=>write(42)])assert.throws(run,error=>{assert(error instanceof ReferenceError);assert.equal(error.code,'ELN-INIT');assert.equal(error.binding,'later');assert.equal(error.kind,'state');assert.equal(error.file,filename);errors.push(error);return true;});return 5;};
 const stopA=mount(a,{enter,seed:1}),stopB=mount(b,{enter,seed:10});assert.equal(a.textContent,'6');assert.equal(b.textContent,'15');assert.equal(new Set(errors).size,6);
 errors[0].binding='changed';assert.equal(errors[1].binding,'later');saved[0].write(3);await tick();assert.equal(a.textContent,'8');assert.equal(b.textContent,'15');assert.equal(saved[1].read(),10);
 let failedRead;const failure=new Error('initializer');assert.throws(()=>mount(new FakeNode('root'),{enter(read){failedRead=read;throw failure;},seed:20}),e=>e===failure);
 assert.throws(failedRead,e=>e.code==='ELN-INIT'&&e.binding==='later');const c=new FakeNode('root'),stopC=mount(c,{enter:()=>5,seed:20});assert.equal(c.textContent,'25');assert.throws(failedRead,e=>e.code==='ELN-INIT'&&e.binding==='later');
 stopA();stopB();stopC();assert.equal(a.childNodes.length+b.childNodes.length+c.childNodes.length,0);
});

test('generated initialization guard aliases do not capture user action names',async t=>{
 const {mount}=await compile(t,`component Guarded() {
 state value = 1;
 action __elnor_guard_state_value() { return value + 5; }
 ui {
 span __elnor_guard_state_value()
 button "Increment" => value++
 }
}`);
 setupDOM();const root=new FakeNode('root'),stop=mount(root,{});assert.equal(root.textContent,'6Increment');root.descendants('button')[0].click();await tick();assert.equal(root.textContent,'7Increment');stop();assert.equal(root.childNodes.length,0);
});
