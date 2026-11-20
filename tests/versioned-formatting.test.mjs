import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Worker} from 'node:worker_threads';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {createAsyncLanguageService} from '../src/async-language-service.mjs';
import {applyFormatEdits} from '../src/formatter.mjs';

const root=path.resolve('tests/format workspace'),file=path.join(root,'Counter.eln');
const canonical=fs.readFileSync('examples/authoring/Counter.eln','utf8').replace('count++;','count += 2;');
const dirty=canonical.replace(/^ +/gm,'');
function setup(t){
  const gate=new Int32Array(new SharedArrayBuffer(8)),workers=[];
  const client=createAsyncLanguageService({root,workerFactory(){
    const worker=new Worker(new URL('./fixtures/gated-language-worker.mjs',import.meta.url),{workerData:{root,gate:gate.buffer}});
    workers.push(worker);return worker;
  }});
  client.open(file,dirty);
  t.after(async()=>{Atomics.store(gate,1,1);Atomics.notify(gate,1);await client.dispose();});
  return {client,gate,workers};
}
function hold(gate){Atomics.store(gate,1,0);Atomics.store(gate,0,1);}
function release(gate){Atomics.store(gate,1,1);Atomics.notify(gate,1);}
async function inFlight(gate){
  const deadline=Date.now()+8000;
  while(Atomics.load(gate,0)!==2){if(Date.now()>deadline)throw Error('Formatting never reached the worker gate');await new Promise(resolve=>setTimeout(resolve,2));}
}
test('sync engine formats unsaved source without changing its buffer or revision',t=>{
  const service=createSurfaceLanguageService({root});t.after(()=>service.dispose());service.open(file,dirty);
  const rename=service.rename(file,dirty.indexOf('count ='),'total');
  const result=service.format(file);assert.deepEqual(result.diagnostics,[]);assert.ok(result.edits.length);
  assert.equal(applyFormatEdits(dirty,result.edits),canonical);assert.equal(service.text(file),dirty);
  assert.equal(service.isCurrent(rename),true);
});
test('worker formats unsaved buffers with a current snapshot and leaves the source untouched',async t=>{
  const {client}=setup(t),epoch=client.status().epoch;
  const response=await client.query('format',[file]);
  assert.deepEqual(response.value.diagnostics,[]);assert.equal(applyFormatEdits(dirty,response.value.edits),canonical);
  assert.equal(client.text(file),dirty);assert.equal(client.status().epoch,epoch);assert.equal(client.isCurrent(response.snapshot),true);
});
test('format refusals retain diagnostics and the real source filename',async t=>{
  const {client}=setup(t);client.open(file,dirty.slice(0,dirty.lastIndexOf('}')));
  const {value}=await client.query('format',[file,{filename:'wrong.eln'}]);
  assert.deepEqual(value.edits,[]);assert.equal(value.diagnostics[0].code,'ELN-FORMAT-PARSE');assert.equal(value.diagnostics[0].file,file);
});
test('an edit in flight rejects formatting before old edits can be exposed',async t=>{
  const {client,gate}=setup(t);await client.ready();hold(gate);
  const pending=client.query('format',[file]),stale=assert.rejects(pending,{name:'StaleResponseError'});
  await inFlight(gate);const next=dirty.replace('Increment','Changed');client.open(file,next);await stale;release(gate);
  const response=await client.query('format',[file]);assert.equal(applyFormatEdits(next,response.value.edits),canonical.replace('Increment','Changed'));
});
test('cancellation discards held formatting and another request can succeed',async t=>{
  const {client,gate}=setup(t);await client.ready();hold(gate);const controller=new AbortController();
  const pending=client.query('format',[file],{signal:controller.signal}),cancelled=assert.rejects(pending,{name:'CancelledError'});
  await inFlight(gate);controller.abort();await cancelled;assert.equal(client.status().pending,0);release(gate);
  assert.ok((await client.query('format',[file])).value.edits.length);
});
test('close rejects held formatting and a closed target is not authorized',async t=>{
  const {client,gate}=setup(t);await client.ready();hold(gate);
  const pending=client.query('format',[file]),closed=assert.rejects(pending,{name:'StaleResponseError'});
  await inFlight(gate);client.close(file);await closed;release(gate);
  await assert.rejects(client.query('format',[file]),/explicitly opened Surface/);
});
test('worker restart invalidates held formatting and replays dirty source',async t=>{
  const {client,gate}=setup(t);await client.ready();const first=(await client.query('format',[file])).snapshot;hold(gate);
  const pending=client.query('format',[file]),restarted=assert.rejects(pending,{name:'WorkerRestartedError'});
  await inFlight(gate);release(gate);await client.restart();await restarted;
  assert.equal(client.isCurrent(first),false);const response=await client.query('format',[file]);
  assert.equal(applyFormatEdits(dirty,response.value.edits),canonical);assert.equal(client.text(file),dirty);
});
test('worker loss rejects formatting and recovery replays the latest buffer',async t=>{
  const {client,gate,workers}=setup(t);await client.ready();hold(gate);
  const pending=client.query('format',[file]),lost=assert.rejects(pending,{name:'WorkerExitedError'});
  await inFlight(gate);await workers.at(-1).terminate();await lost;release(gate);
  const next=dirty.replace('Increment','Recovered');client.open(file,next);
  const response=await client.query('format',[file]);assert.equal(applyFormatEdits(next,response.value.edits),canonical.replace('Increment','Recovered'));
});
test('formatting requires an explicitly owned Surface URI, not an inferred target',async t=>{
  const {client}=setup(t),other=path.join(root,'Other.eln');
  await assert.rejects(client.query('format',[other]),/explicitly opened Surface/);
  client.open(path.join(root,'model.ts'),'export type Model = string;');
  await assert.rejects(client.query('format',[path.join(root,'model.ts')]),/explicitly opened Surface/);
});
test('disposal rejects held formatting and releases its owned source',async t=>{
  const {client,gate}=setup(t);await client.ready();hold(gate);
  const pending=client.query('format',[file]),disposed=assert.rejects(pending,{name:'DisposedError'});
  await inFlight(gate);await client.dispose();await disposed;
  assert.equal(client.text(file),undefined);assert.equal(client.status().pending,0);
});
test('format queries guard acknowledged alias ownership and physical retargeting',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-format-alias-'));
  const source=path.join(directory,'Counter.eln'),alias=path.join(directory,'Alias.eln'),other=path.join(directory,'Other.eln');
  fs.writeFileSync(source,canonical);fs.writeFileSync(other,canonical);fs.symlinkSync(source,alias,'file');
  const client=createAsyncLanguageService({root:directory});
  t.after(async()=>{await client.dispose();fs.unlinkSync(alias);assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(directory).startsWith('elnor-format-alias-'));fs.rmSync(directory,{recursive:true,force:true});});
  client.open(source,dirty);
  await assert.rejects(client.query('format',[alias]),/explicitly opened Surface/);
  client.open(alias,dirty);const next=dirty.replace('Increment','Changed');client.open(source,next);
  await assert.rejects(client.query('format',[source]),/ELN-SOURCE-CONFLICT.*formatting/);
  client.open(alias,next);const response=await client.query('format',[source]);assert.ok(response.value.edits.length);
  fs.unlinkSync(alias);fs.symlinkSync(other,alias,'file');assert.equal(client.isCurrent(response.snapshot),false);
  await assert.rejects(client.query('format',[source]),/ELN-ALIAS-RETARGET/);
  assert.equal(fs.readFileSync(source,'utf8'),canonical);
});
