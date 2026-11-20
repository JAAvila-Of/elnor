import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {emitGraph} from '../src/compiler.mjs';import {parseSurface} from '../src/parser.mjs';import {setupDOM,FakeNode,findButton} from './fake-dom.mjs';
test('generic dynamic task identity owns tracking and scheduling for only one group activation',async t=>{
 setupDOM();const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-generic-ticket-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const source='component App() {\n state shown=true;\n state value=1;\n action hide(){shown=false;}\n action show(){shown=true;}\n ui {\n section {\n if shown {\n strong globalThis.__genericTicketRead(value)\n }\n button "Hide" => hide()\n button "Show" => show()\n }\n }\n}',file=path.join(dir,'App.eln'),out=path.join(dir,'out');
 const built=emitGraph(new Map([[file,parseSurface(source,file)]]),out),runtime=await import(pathToFileURL(path.join(out,'runtime.mjs'))),external=runtime.cell('A');
 const probe=runtime.createRegionTaskTicket({disposed:false},0,0,()=>{}),prototype=Object.getPrototypeOf(probe),track=prototype.track,run=prototype.run;probe.dispose();
 let active=null,stop;const reads=[],runs=[];prototype.track=function(fn){const previous=active;active=this;try{return track.call(this,fn);}finally{active=previous;}};prototype.run=function(){runs.push(this);return run.call(this);};
 globalThis.__genericTicketRead=value=>{reads.push(active);return external.value+value;};
 const queue=[],microtask=globalThis.queueMicrotask,drain=()=>{while(queue.length)queue.shift()();};
 try{
  const {mount}=await import(pathToFileURL(path.join(out,built.components.find(c=>c.name==='App').file))),root=new FakeNode('root');stop=mount(root,{});
  const first=reads.at(-1);assert.ok(first);assert.equal(first.frame.handles[first.id],first);assert.equal(first.frame.reactions,null);assert.equal(root.descendants('strong')[0].textContent,'A1');
  globalThis.queueMicrotask=job=>queue.push(job);external.value='B';assert.equal(queue.length,1);drain();assert.ok(runs.includes(first));assert.equal(reads.at(-1),first);
  findButton(root,'Hide').click();drain();assert.equal(first.disposed,true);assert.equal(first.deps.size,0);assert.equal(root.descendants('strong').length,0);
  external.value='C';assert.equal(queue.length,0);const count=reads.length;first.run();assert.equal(reads.length,count);
  findButton(root,'Show').click();drain();const second=reads.at(-1);assert.ok(second);assert.notEqual(second,first);assert.equal(root.descendants('strong')[0].textContent,'C1');
  first.run();assert.equal(reads.at(-1),second);external.value='D';drain();assert.equal(reads.at(-1),second);assert.equal(root.descendants('strong')[0].textContent,'D1');
  stop();assert.equal(second.disposed,true);external.value='E';assert.equal(queue.length,0);assert.equal(root.childNodes.length,0);
 }finally{globalThis.queueMicrotask=microtask;stop?.();prototype.track=track;prototype.run=run;delete globalThis.__genericTicketRead;}
});
