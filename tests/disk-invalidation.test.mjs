import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {createAsyncLanguageService} from '../src/async-language-service.mjs';

const model='export interface Model { label: string; }';
const source='import type {Model} from "./Model.mjs"; component Typed(model: Model) { ui { span model.label.toUpperCase() } }';
function fixture(t){
  const root=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'elnor-disk-'));
  const file=path.join(root,'Typed.eln'),dependency=path.join(root,'Model.mts');
  fs.writeFileSync(file,source);fs.writeFileSync(dependency,model);
  t.after(()=>{
    const resolved=path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(fs.realpathSync.native(os.tmpdir()))+path.sep)&&path.basename(resolved).startsWith('elnor-disk-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  return {root,file,dependency};
}

test('sync disk invalidation refreshes diagnostics and definition offsets without owning disk text',t=>{
  const {root,file,dependency}=fixture(t),service=createSurfaceLanguageService({root});
  t.after(()=>service.dispose());service.open(file,source);
  assert.deepEqual(service.diagnostics(file),[]);
  const next='// shifted declaration\n'+model.replace('string','number');fs.writeFileSync(dependency,next);
  service.invalidateDisk(dependency);
  assert.ok(service.diagnostics(file).some(d=>d.code==='TS2339'));
  const found=service.definitions(file,source.indexOf('model.label')+7);
  assert.ok(found.some(d=>d.file===dependency&&d.start===next.indexOf('label:')));
  assert.equal(service.text(dependency),undefined);
  assert.throws(()=>service.rename(file,source.indexOf('model.label')+7,'caption'),/outside the versioned workspace/);
  assert.throws(()=>service.invalidateDisk('Model.js'),/TypeScript disk path/);
});

test('disk invalidation makes an existing Surface rename plan stale',t=>{
  const {root,dependency}=fixture(t),service=createSurfaceLanguageService({root}),file=path.join(root,'Local.eln');
  t.after(()=>service.dispose());const text='component Local(label: string) { ui { span label } }';service.open(file,text);
  const plan=service.rename(file,text.indexOf('label:'),'caption');assert.equal(service.isCurrent(plan),true);
  service.invalidateDisk(dependency);assert.equal(service.isCurrent(plan),false);
  assert.throws(()=>service.applyRename(plan),/Stale rename plan/);assert.equal(service.text(file),text);
});

test('disk changes discard held worker results and invalidate issued snapshots',async t=>{
  const {root,file,dependency}=fixture(t),gate=new Int32Array(new SharedArrayBuffer(8));
  const client=createAsyncLanguageService({root,workerFactory:()=>new Worker(new URL('./fixtures/gated-language-worker.mjs',import.meta.url),{workerData:{root,gate:gate.buffer}})});
  t.after(async()=>{Atomics.store(gate,1,1);Atomics.notify(gate,1);await client.dispose();});
  client.open(file,source);const first=await client.query('diagnostics',[file]);assert.deepEqual(first.value,[]);
  Atomics.store(gate,1,0);Atomics.store(gate,0,1);
  const pending=client.query('diagnostics',[file]),stale=assert.rejects(pending,{name:'StaleResponseError'});
  const deadline=Date.now()+8000;
  while(Atomics.load(gate,0)!==2){assert.ok(Date.now()<deadline,'Worker must reach the test gate');await new Promise(resolve=>setTimeout(resolve,2));}
  fs.writeFileSync(dependency,model.replace('string','number'));client.invalidateDisk(dependency);
  await stale;assert.equal(client.isCurrent(first.snapshot),false);
  Atomics.store(gate,1,1);Atomics.notify(gate,1);
  assert.ok((await client.query('diagnostics',[file])).value.some(d=>d.code==='TS2339'));
  assert.equal(client.text(dependency),undefined);assert.equal(client.text(file),source);
  await client.restart();assert.ok((await client.query('diagnostics',[file])).value.some(d=>d.code==='TS2339'));
});

test('disk notification before worker readiness is reflected by replay without buffer adoption',async t=>{
  const {root,file,dependency}=fixture(t),client=createAsyncLanguageService({root});t.after(()=>client.dispose());
  client.open(file,source);const ready=client.ready();
  fs.writeFileSync(dependency,model.replace('string','number'));client.invalidateDisk(dependency);await ready;
  assert.ok((await client.query('diagnostics',[file])).value.some(d=>d.code==='TS2339'));
  assert.equal(client.text(dependency),undefined);assert.throws(()=>client.invalidateDisk(null),/TypeScript disk path/);
  await client.dispose();assert.throws(()=>client.invalidateDisk(dependency),{name:'DisposedError'});
});
