import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {loadDeskClient} from './task-desk-client-fixture.mjs';
const identity={id:'fixture',scope:'alice',epoch:'epoch-one'},task={id:'TASK-1',title:'First task',assignee:'Ada',description:'',priority:'normal',status:'open'},signal=()=>new AbortController().signal;
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
const store=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
async function fixture(t,transport,storage=store(),owner=identity,snapshot=()=>({tasks:[{...task,revision:1}],tombstones:[]})){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-task-client-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elnor-task-client-'));fs.rmSync(dir,{recursive:true,force:true});});const {createDeskClient}=await loadDeskClient(dir);let serial=0;const calls=[],options={storage,slot:'attempt',identity:owner,baseUrl:'http://fixture',createKey:()=>`key-${++serial}`,fetch:async(url,o)=>{calls.push({url,o});return url.endsWith('/tasks')?reply({scope:owner.scope,epoch:owner.epoch,...snapshot()}):transport(url,o);}};const client=createDeskClient(options);return {client,fresh:()=>createDeskClient(options),storage,calls,options};}
function outcome(o,status='applied',extra={}){return {scope:identity.scope,epoch:identity.epoch,key:'key-1',intent:JSON.parse(o.body),status,...(status==='applied'?{revision:2}:{}),...extra};}
function result(f,o,extra={}){const entry=JSON.parse(f.storage.getItem('attempt')).attempt;return reply({scope:'alice',epoch:identity.epoch,key:entry.key,intent:entry.command,status:'applied',revision:entry.command.kind==='create'?1:entry.command.expectedRevision+1,...extra});}
const input={title:'New task',assignee:'Ada',description:'Draft',priority:'high'};
test('create persists a definitive generated task ID before PUT and reuses it after absence',async t=>{let mode='lost';const f=await fixture(t,(_,o)=>{if(mode==='lost')throw Error('lost');if(o.method==='GET'){const a=JSON.parse(f.storage.getItem('attempt')).attempt;return reply({scope:'alice',epoch:identity.epoch,key:a.key,status:'absent'});}return result(f,o);});await f.client.refresh(signal());await f.client.create(input,signal());const raw=f.storage.getItem('attempt'),body=f.calls.at(-1).o.body,id=JSON.parse(body).task.id;assert.equal(id,'TASK-key-1');assert.equal(JSON.parse(raw).attempt.key,'key-2');const fresh=f.fresh();await fresh.retry(signal());assert.equal(f.calls.length,2);mode='ready';await fresh.recover(signal());assert.equal((await fresh.retry(signal())).phase,'applied');assert.equal(f.calls.at(-1).o.body,body);assert.equal(JSON.parse(f.storage.getItem('attempt')).attempt.command.task.id,id);});
test('delete confirmation adds a tombstone before acknowledgement and prevents stale-list resurrection',async t=>{const f=await fixture(t,(_,o)=>result(f,o,{deleted:true}));await f.client.refresh(signal());assert.equal((await f.client.remove(task.id,1,signal())).phase,'applied');assert.equal(f.client.read().tasks.length,0);assert.deepEqual(f.client.read().tombstones,[{id:task.id,revision:2}]);f.client.acknowledge();await f.client.refresh(signal());assert.equal(f.client.read().tasks.length,0);assert.equal(f.client.read().tombstones[0].revision,2);});
test('delete response without matching revision and deletion proof cannot be acknowledged',async t=>{for(const extra of [{},{deleted:true,revision:9}]){const f=await fixture(t,(_,o)=>result(f,o,extra));await f.client.refresh(signal());assert.notEqual((await f.client.remove(task.id,1,signal())).phase,'applied');assert.ok(f.storage.getItem('attempt'));assert.notEqual(f.client.acknowledge().phase,'empty');}});
test('snapshot removal needs a monotonic tombstone and tombstones cannot disappear',async t=>{let snapshot={tasks:[{...task,revision:1}],tombstones:[]};const f=await fixture(t,()=>{throw Error('unused');},store(),identity,()=>snapshot);await f.client.refresh(signal());snapshot={tasks:[],tombstones:[]};await f.client.refresh(signal());assert.equal(f.client.read().tasks.length,1);snapshot={tasks:[],tombstones:[{id:task.id,revision:2}]};await f.client.refresh(signal());assert.equal(f.client.read().tasks.length,0);snapshot={tasks:[{...task,revision:3}],tombstones:[]};await f.client.refresh(signal());assert.equal(f.client.read().tasks.length,0);assert.equal(f.client.read().tombstones.length,1);});
test('overlapping or duplicate tombstones preserve the last valid list',async t=>{let snapshot={tasks:[{...task,revision:1}],tombstones:[]};const f=await fixture(t,()=>{throw Error('unused');},store(),identity,()=>snapshot);await f.client.refresh(signal());snapshot={tasks:[{...task,revision:1}],tombstones:[{id:task.id,revision:2}]};await f.client.refresh(signal());assert.equal(f.client.read().tombstones.length,0);snapshot={tasks:[],tombstones:[{id:task.id,revision:2},{id:task.id,revision:2}]};await f.client.refresh(signal());assert.equal(f.client.read().tasks.length,1);});
test('create storage failure and pending delete admit no additional mutation',async t=>{let resolve;const gate=new Promise(r=>resolve=r),f=await fixture(t,()=>gate);await f.client.refresh(signal());const pending=f.client.remove(task.id,1,signal());await f.client.create(input,signal());assert.equal(f.calls.length,2);resolve(result(f,f.calls.at(-1).o,{deleted:true}));await pending;const storage=store();storage.setItem=()=>{throw Error('quota');};const g=await fixture(t,()=>{throw Error('PUT forbidden');},storage);await g.client.refresh(signal());await g.client.create(input,signal());assert.equal(g.calls.length,1);});

test('a submit attributes a rejection only to the attempt it saved',async t=>{
  const reason='Choose another title.';
  const issues=[{path:['title'],message:reason}];
  const owned=await fixture(t,(_,options)=>reply(outcome(options,'rejected',{reason,issues}),422));
  await owned.client.refresh(signal());
  const rejected=await owned.client.save(task,1,signal());
  assert.equal(rejected.phase,'rejected');
  assert.equal(rejected.submittedAttemptKey,rejected.attempt.key);
  assert.deepEqual(rejected.issues,issues);
  assert.equal(owned.client.read().submittedAttemptKey,undefined);

  let settle;
  const response=new Promise(resolve=>{settle=resolve;});
  const raced=await fixture(t,()=>response);
  await raced.client.refresh(signal());
  const pending=raced.client.save(task,1,signal());
  const original=raced.calls.at(-1).o;
  const peer=JSON.parse(raced.storage.getItem('attempt'));
  peer.attempt.key='peer-key';
  raced.storage.setItem('attempt',JSON.stringify(peer));
  settle(reply(outcome(original,'rejected',{reason,issues}),422));
  const switched=await pending;
  assert.equal(switched.attempt.key,'peer-key');
  assert.equal(switched.phase,'unknown');
  assert.equal(switched.issues,undefined);
  assert.equal(switched.submittedAttemptKey,undefined);

  const storage=store();
  const write=storage.setItem;
  storage.setItem=(slot,raw)=>{
    const peer=JSON.parse(raw);
    peer.attempt.key='peer-before-put';
    write(slot,JSON.stringify(peer));
  };
  const replaced=await fixture(t,()=>{throw Error('Unexpected PUT');},storage);
  await replaced.client.refresh(signal());
  const notSent=await replaced.client.save(task,1,signal());
  assert.equal(notSent.attempt.key,'peer-before-put');
  assert.equal(notSent.submittedAttemptKey,undefined);
  assert.deepEqual(replaced.calls.map(({o})=>o.method),['GET']);
});
