import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {loadDeskClient} from './task-desk-client-fixture.mjs';
const identity={id:'fixture',scope:'alice',epoch:'epoch-one'},task={id:'TASK-1',title:'First task',assignee:'Ada',description:'',priority:'normal',status:'open'},signal=()=>new AbortController().signal;
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
const store=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
async function fixture(t,transport,storage=store(),owner=identity,snapshot=()=>[{...task,revision:1}]){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-task-client-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elnor-task-client-'));fs.rmSync(dir,{recursive:true,force:true});});const {createDeskClient}=await loadDeskClient(dir);let serial=0;const calls=[],options={storage,slot:'attempt',identity:owner,baseUrl:'http://fixture',createKey:()=>`key-${++serial}`,fetch:async(url,o)=>{calls.push({url,o});return url.endsWith('/tasks')?reply({scope:owner.scope,epoch:owner.epoch,tasks:snapshot()}):transport(url,o);}};const client=createDeskClient(options);return {client,fresh:()=>createDeskClient(options),storage,calls,options};}
function outcome(o,status='applied',extra={}){return {scope:identity.scope,epoch:identity.epoch,key:'key-1',intent:JSON.parse(o.body),status,...(status==='applied'?{revision:2}:{}),...extra};}
test('construction is lazy; no save admitted before an authoritative load',async t=>{const f=await fixture(t,()=>{throw Error('unexpected');});await f.client.save(task,1,signal());assert.equal(f.calls.length,0);assert.equal(f.client.read().loaded,false);await f.client.refresh(signal());assert.equal(f.client.read().tasks[0].revision,1);});
test('journal is written before sending and terminal acknowledgement is explicit',async t=>{let persisted;const f=await fixture(t,(_,o)=>{persisted=JSON.parse(f.storage.getItem('attempt'));return reply(outcome(o));});await f.client.refresh(signal());const result=await f.client.save(task,1,signal());assert.equal(result.phase,'applied');assert.deepEqual(persisted.attempt.command.task,task);assert.equal(f.client.read().tasks[0].revision,1);assert.ok(f.storage.getItem('attempt'));assert.equal(f.client.acknowledge().phase,'empty');});

test('draft validation blocks admission without rewriting an accepted command', async t => {
  const f = await fixture(t, () => { throw Error('lost'); });
  await f.client.refresh(signal());
  const invalid = await f.client.save({...task, title: ' a '}, 1, signal());
  assert.match(invalid.message, /Check title/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.storage.getItem('attempt'), null);

  const draft = {...task, title: '  First task  '};
  const result = await f.client.save(draft, 1, signal());
  assert.equal(result.phase, 'unknown');
  assert.deepEqual(f.fresh().read().attempt.command.task, draft);
});
test('storage failure sends no write',async t=>{const s=store();s.setItem=()=>{throw Error('quota');};const f=await fixture(t,()=>{throw Error('PUT');},s);await f.client.refresh(signal());assert.equal((await f.client.save(task,1,signal())).phase,'blocked');assert.equal(f.calls.length,1);});
test('reload restores exact command and never replays without authoritative absence',async t=>{const f=await fixture(t,()=>{throw Error('lost');});await f.client.refresh(signal());await f.client.save(task,1,signal());const fresh=f.fresh();assert.equal(fresh.read().phase,'unknown');assert.deepEqual(fresh.read().attempt.command.task,task);await fresh.retry(signal());assert.equal(f.calls.length,2);});
test('absence permits exact same command and key retry',async t=>{let mode='lost';const f=await fixture(t,(_,o)=>{if(mode==='lost')throw Error('lost');if(o.method==='GET')return reply({scope:'alice',epoch:identity.epoch,key:'key-1',status:'absent'});return reply(outcome(o));});await f.client.refresh(signal());await f.client.save(task,1,signal());const body=f.calls.at(-1).o.body;mode='ready';assert.equal((await f.client.recover(signal())).phase,'retryable');assert.equal((await f.client.retry(signal())).phase,'applied');assert.equal(f.calls.at(-1).o.body,body);});
test('404 and service outage never authorize replay',async t=>{let code=404;const f=await fixture(t,()=>reply({status:'absent'},code));await f.client.refresh(signal());await f.client.save(task,1,signal());assert.equal((await f.client.recover(signal())).phase,'unknown');code=503;assert.equal((await f.client.recover(signal())).phase,'unknown');const count=f.calls.length;await f.client.retry(signal());assert.equal(f.calls.length,count);});

test('an unavailable receipt revokes retry eligibility and keeps the original attempt', async t => {
  let unavailable = false;
  const f = await fixture(t, (_, options) => {
    if (options.method === 'PUT') throw Error('Lost reply');
    return reply({
      scope: identity.scope, epoch: identity.epoch, key: 'key-1',
      status: unavailable ? 'receipt-unavailable' : 'absent'
    }, unavailable ? 410 : 200);
  });
  await f.client.refresh(signal());
  await f.client.save(task, 1, signal());
  const raw = f.storage.getItem('attempt');
  assert.equal((await f.client.recover(signal())).phase, 'retryable');
  unavailable = true;
  const blocked = await f.client.recover(signal());
  assert.equal(blocked.phase, 'blocked');
  assert.match(blocked.message, /no longer has the receipt/);
  assert.equal((await f.client.refresh(signal())).message, blocked.message);
  const count = f.calls.length;
  await f.client.retry(signal());
  assert.equal(f.client.acknowledge().phase, 'blocked');
  assert.equal(f.calls.length, count);
  assert.equal(f.storage.getItem('attempt'), raw);
  const restored = f.fresh();
  assert.equal(restored.read().phase, 'unknown');
  assert.equal((await restored.recover(signal())).phase, 'blocked');
  assert.equal(f.storage.getItem('attempt'), raw);
});

test('receipt unavailability must be correlated to the stored attempt', async t => {
  const f = await fixture(t, (_, options) => {
    if (options.method === 'PUT') throw Error('Lost reply');
    return reply({scope: identity.scope, epoch: identity.epoch, key: 'different-key', status: 'receipt-unavailable'}, 410);
  });
  await f.client.refresh(signal());
  await f.client.save(task, 1, signal());
  const result = await f.client.recover(signal());
  assert.equal(result.phase, 'blocked');
  assert.match(result.message, /identity or result mismatch/);
  assert.equal((await f.client.refresh(signal())).receiptReview, undefined);
  assert.equal(f.client.discardUnavailable(signal(), 'key-1').phase, 'blocked');
  assert.ok(f.storage.getItem('attempt'));
});

test('discard requires a fresh same-history snapshot and clears only the reviewed journal', async t => {
  let outage = false;
  const f = await fixture(t, (_, options) => {
    if (options.method === 'PUT') throw Error('Lost reply');
    return reply({scope: identity.scope, epoch: identity.epoch, key: 'key-1', status: 'receipt-unavailable'}, 410);
  }, store(), identity, () => {
    if (outage) throw Error('Offline');
    return [{...task, revision: 2}];
  });
  await f.client.refresh(signal());
  await f.client.save(task, 1, signal());
  const raw = f.storage.getItem('attempt');
  assert.equal((await f.client.recover(signal())).receiptReview, 'needs-refresh');
  f.client.discardUnavailable(signal(), 'key-1');
  assert.equal(f.storage.getItem('attempt'), raw);
  assert.equal((await f.client.refresh(signal())).receiptReview, 'ready');
  outage = true;
  assert.equal((await f.client.refresh(signal())).receiptReview, 'needs-refresh');
  f.client.discardUnavailable(signal(), 'key-1');
  assert.equal(f.storage.getItem('attempt'), raw);
  outage = false;
  assert.equal((await f.client.refresh(signal())).receiptReview, 'ready');

  const fresh = f.fresh();
  fresh.discardUnavailable(signal(), 'key-1');
  assert.equal(f.storage.getItem('attempt'), raw);
  const aborted = new AbortController();
  aborted.abort();
  f.client.discardUnavailable(aborted.signal, 'key-1');
  f.client.discardUnavailable(signal(), 'stale-key');
  assert.equal(f.storage.getItem('attempt'), raw);

  const changed = JSON.parse(raw);
  changed.attempt.command.task.title = 'Different set of saved bytes';
  const replacement = JSON.stringify(changed);
  f.storage.setItem('attempt', replacement);
  assert.equal(f.client.discardUnavailable(signal(), 'key-1').phase, 'unknown');
  assert.equal(f.storage.getItem('attempt'), replacement);
  f.storage.setItem('attempt', raw);
  await f.client.recover(signal());
  await f.client.refresh(signal());
  const count = f.calls.length;
  const done = f.client.discardUnavailable(signal(), 'key-1');
  assert.equal(done.discardedAttemptKey, 'key-1');
  assert.equal(done.phase, 'empty');
  assert.equal(f.storage.getItem('attempt'), null);
  assert.equal(f.calls.length, count);
});

test('a write can return an unavailable receipt after an earlier absence', async t => {
  let puts = 0;
  const f = await fixture(t, (_, options) => {
    const envelope = {scope: identity.scope, epoch: identity.epoch, key: 'key-1'};
    if (options.method === 'GET') return reply({...envelope, status: 'absent'});
    if (++puts === 1) throw Error('Lost reply');
    return reply({...envelope, status: 'receipt-unavailable'}, 410);
  });
  await f.client.refresh(signal());
  await f.client.save(task, 1, signal());
  const raw = f.storage.getItem('attempt');
  assert.equal((await f.client.recover(signal())).phase, 'retryable');
  const blocked = await f.client.retry(signal());
  assert.equal(blocked.phase, 'blocked');
  assert.match(blocked.message, /no longer has the receipt/);
  assert.equal(f.storage.getItem('attempt'), raw);
  await f.client.retry(signal());
  assert.equal(puts, 2);
});
test('retained conflict is terminal and does not permit another save until acknowledged',async t=>{const f=await fixture(t,(_,o)=>reply(outcome(o,'conflict',{currentRevision:2}),409));await f.client.refresh(signal());assert.equal((await f.client.save(task,1,signal())).phase,'conflict');await f.client.save({...task,title:'later'},2,signal());assert.equal(f.calls.length,2);assert.equal(f.client.acknowledge().phase,'empty');});
test('wrong payload and epoch block acknowledgement without deleting journal',async t=>{for(const wrong of ['payload','epoch']){const f=await fixture(t,(_,o)=>{const value=outcome(o);if(wrong==='epoch')value.epoch='foreign';else value.intent.task.title='foreign';return reply(value);});await f.client.refresh(signal());assert.equal((await f.client.save(task,1,signal())).phase,'blocked');assert.notEqual(f.client.acknowledge().phase,'empty');assert.ok(f.storage.getItem('attempt'));}});
test('foreign owner and corrupt journal never issue a recovery command',async t=>{const s=store();s.setItem('attempt','{broken');const f=await fixture(t,()=>{throw Error('unexpected');},s);assert.equal(f.client.read().phase,'blocked');await f.client.recover(signal());assert.equal(f.calls.length,0);});
test('acknowledgement cannot clear a replaced record',async t=>{const f=await fixture(t,(_,o)=>reply(outcome(o)));await f.client.refresh(signal());await f.client.save(task,1,signal());const entry=JSON.parse(f.storage.getItem('attempt'));entry.attempt.key='different';f.storage.setItem('attempt',JSON.stringify(entry));assert.equal(f.client.acknowledge().phase,'unknown');assert.ok(f.storage.getItem('attempt'));});
test('single flight and abort preserve the original command',async t=>{let resolve;const gate=new Promise(r=>resolve=r),f=await fixture(t,()=>gate);await f.client.refresh(signal());const controller=new AbortController(),first=f.client.save(task,1,controller.signal);await f.client.save({...task,title:'other'},1,signal());assert.equal(f.calls.length,2);controller.abort();resolve(reply(outcome(f.calls.at(-1).o)));assert.equal((await first).phase,'unknown');assert.equal(f.client.read().attempt.command.task.title,task.title);});
test('published task snapshots cannot be mutated by consumers',async t=>{const f=await fixture(t,()=>{throw Error('lost');});await f.client.refresh(signal());assert.throws(()=>f.client.read().tasks.push({...task,revision:9}),TypeError);assert.throws(()=>{f.client.read().tasks[0].title='changed';},TypeError);assert.equal(f.client.read().tasks.length,1);});
test('snapshot regression and refresh failure preserve the last confirmed list',async t=>{let version=2,fail=false;const f=await fixture(t,()=>{throw Error('lost');},store(),identity,()=>{if(fail)throw Error('outage');return [{...task,revision:version}];});await f.client.refresh(signal());version=1;await f.client.refresh(signal());assert.equal(f.client.read().tasks[0].revision,2);fail=true;await f.client.refresh(signal());assert.equal(f.client.read().tasks[0].revision,2);});
test('foreign journal owner blocks new writes and recovery without discarding bytes',async t=>{const f=await fixture(t,()=>{throw Error('lost');});await f.client.refresh(signal());await f.client.save(task,1,signal());const raw=f.storage.getItem('attempt'),other=await fixture(t,()=>{throw Error('unexpected');},f.storage,{...identity,scope:'bob'});assert.equal(other.client.read().phase,'blocked');await other.client.recover(signal());assert.equal(other.calls.length,0);assert.equal(f.storage.getItem('attempt'),raw);});

test('refresh retains blocked journal diagnostics and exposes no foreign attempt', async t => {
  const original = await fixture(t, () => { throw Error('lost'); });
  await original.client.refresh(signal());
  await original.client.save(task, 1, signal());
  const raw = original.storage.getItem('attempt');
  for (const [owner, expected] of [
    [{...identity, scope: 'bob'}, /another provider or workspace/],
    [{...identity, id: 'other'}, /another provider or workspace/],
    [{...identity, epoch: 'epoch-two'}, /Provider history changed/]
  ]) {
    const f = await fixture(t, () => assert.fail('Blocked attempts stay local'), original.storage, owner);
    assert.equal(f.client.read().attempt, undefined);
    const refreshed = await f.client.refresh(signal());
    assert.equal(refreshed.loaded, true);
    assert.equal(refreshed.phase, 'blocked');
    assert.match(refreshed.message, expected);
    await f.client.recover(signal());
    await f.client.retry(signal());
    assert.equal(f.client.acknowledge().phase, 'blocked');
    assert.equal(f.calls.length, 1);
    assert.equal(original.storage.getItem('attempt'), raw);
  }
});

test('a history change during recovery keeps the original command for its provider', async t => {
  const f = await fixture(t, (_, options) => options.method === 'PUT'
    ? reply({error: 'Result unavailable'}, 503)
    : reply({epoch: 'epoch-two', error: 'Epoch mismatch'}, 412));
  await f.client.refresh(signal());
  await f.client.save(task, 1, signal());
  const raw = f.storage.getItem('attempt');
  const blocked = await f.client.recover(signal());
  assert.equal(blocked.phase, 'blocked');
  assert.equal(blocked.loaded, false);
  assert.match(blocked.message, /Provider history changed/);
  assert.deepEqual(blocked.attempt.command.task, task);
  await f.client.retry(signal());
  assert.equal(f.client.acknowledge().phase, 'blocked');
  assert.equal(f.calls.length, 3);
  assert.equal(f.storage.getItem('attempt'), raw);
  f.storage.removeItem('attempt');
  await f.client.save(task, 1, signal());
  assert.equal(f.calls.length, 3);
});
test('correlated rejection and missing results require explicit acknowledgement',async t=>{for(const status of ['rejected','missing']){const f=await fixture(t,(_,o)=>reply(outcome(o,status,status==='rejected'?{reason:'Provider rule'}:{}),status==='rejected'?422:409));await f.client.refresh(signal());assert.equal((await f.client.save(task,1,signal())).phase,status);assert.ok(f.storage.getItem('attempt'));assert.equal(f.client.acknowledge().phase,'empty');}});

test('correlated rejection keeps its reason if optional field issue paths are invalid', async t => {
  const f = await fixture(t, (_, options) => reply(outcome(options, 'rejected', {
    reason: 'Provider rule',
    issues: [{path: ['title'], message: 'Invalid title'}, {path: ['task', 'title'], message: 'Unexpected path'}]
  }), 422));
  await f.client.refresh(signal());
  const rejected = await f.client.save(task, 1, signal());
  assert.equal(rejected.phase, 'rejected');
  assert.equal(rejected.message, 'Provider rule');
  assert.equal(rejected.issues, undefined);
  assert.ok(f.storage.getItem('attempt'));
  assert.equal(f.client.acknowledge().phase, 'empty');
});
