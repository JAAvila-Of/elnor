import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {deskProviderFixture, loadDeskClient} from './task-desk-client-fixture.mjs';
const task={id:'TASK-1',title:'Edited task',assignee:'Ada',description:'One\nTwo',priority:'high',status:'in-progress'};
const command=(revision=1,title=task.title)=>({kind:'replace',taskId:task.id,expectedRevision:revision,task:{...task,title}});
const fixture = t => deskProviderFixture(t, command);
test('HTTP snapshot and edit use revisions; applied task survives process restart',async t=>{const f=await fixture(t);assert.equal((await f.snapshot())[0].revision,1);const value=await (await f.put('one')).json();assert.equal(value.revision,2);const epoch=f.server.epoch;await f.restart();assert.equal(f.server.epoch,epoch);assert.deepEqual(await (await f.get('one')).json(),value);assert.equal((await f.snapshot())[0].title,'Edited task');});
test('replay after a later edit returns historical confirmation without restoring old data',async t=>{const f=await fixture(t),one=await (await f.put('one')).json();await f.put('two',command(2,'Later task'));assert.deepEqual(await (await f.put('one')).json(),one);assert.equal((await f.snapshot())[0].revision,3);assert.equal((await f.snapshot())[0].title,'Later task');});
test('two competing writes from the same revision produce applied plus retained conflict',async t=>{const f=await fixture(t),results=await Promise.all(['one','two'].map(key=>f.put(key).then(r=>r.json())));assert.deepEqual(results.map(v=>v.status).sort(),['applied','conflict']);assert.equal((await f.snapshot())[0].revision,2);const loser=results.find(v=>v.status==='conflict');assert.deepEqual(await (await f.get(loser.key)).json(),loser);});
test('eight duplicate HTTP writes advance the task only once',async t=>{
  const f=await fixture(t);
  const responses=await Promise.all(Array.from({length:8},()=>f.put('one')));
  const values=await Promise.all(responses.map(async response=>({code:response.status,...await response.json()})));
  assert.deepEqual(values.map(({code,status,revision,error})=>({code,status,revision,error})),
    Array.from({length:8},()=>({code:200,status:'applied',revision:2,error:undefined})));
  assert.equal((await f.snapshot())[0].revision,2);
});
test('lost acknowledgement is recovered after restart; before-commit loss is absent',async t=>{const f=await fixture(t);await assert.rejects(f.put('one',command(),'after'));await f.restart();assert.equal((await (await f.get('one')).json()).status,'applied');await assert.rejects(f.put('two',command(2),'before'));assert.equal((await (await f.get('two')).json()).status,'absent');assert.equal((await f.snapshot())[0].revision,2);});
test('the unavailable receipt fixture distinguishes a retained command from an absent one', async t => {
  const f = await fixture(t);
  const applied = await (await f.put('one')).json();
  const check = key => fetch(f.server.url + '/scopes/alice/commands/' + key, {
    headers: {'X-Provider-Epoch': f.server.epoch, 'X-Fixture-Fault': 'receipt-unavailable'}
  });
  const unavailable = await check('one');
  assert.equal(unavailable.status, 410);
  assert.deepEqual(await unavailable.json(), {
    scope: 'alice', epoch: f.server.epoch, key: 'one', status: 'receipt-unavailable'
  });
  const absent = await check('other');
  assert.equal(absent.status, 200);
  assert.equal((await absent.json()).status, 'absent');
  assert.deepEqual(await (await f.get('one')).json(), applied);
});
test('injected rollback stores neither updated task nor terminal result',async t=>{const f=await fixture(t);assert.equal((await f.put('one',command(),'rollback')).status,503);await f.restart();assert.equal((await f.snapshot())[0].revision,1);assert.equal((await (await f.get('one')).json()).status,'absent');});
test('rejection, missing task and key conflict preserve the ledger',async t=>{const f=await fixture(t);assert.equal((await f.put('reject',command(1,'x'))).status,422);const missing=command();missing.taskId=missing.task.id='TASK-99';assert.equal((await (await f.put('missing',missing)).json()).status,'missing');await f.put('one');assert.equal((await (await f.put('one',command(2,'Different'))).json()).status,'key-conflict');assert.equal((await f.snapshot())[0].revision,2);});
test('epoch mismatch and malformed command do not authorize a write',async t=>{const f=await fixture(t);assert.equal((await f.put('wrong',command(),undefined,'foreign')).status,412);assert.equal((await f.get('wrong','foreign')).status,412);assert.equal((await f.put('bad',{...command(),expectedRevision:true})).status,400);assert.equal((await (await f.get('bad')).json()).status,'absent');assert.equal((await f.snapshot())[0].revision,1);});
test('real task client restores a journal and refreshes a later revision after historical replay', async t => {
  const f = await fixture(t);
  const {createDeskClient} = await loadDeskClient(path.join(f.dir, 'client'));
  const records = new Map();
  const storage = {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: key => records.delete(key)
  };
  const options = {
    storage, slot: 'attempt', identity: {id: 'fixture', scope: 'alice', epoch: f.server.epoch},
    baseUrl: f.server.url, fetch, createKey: () => 'one'
  };
  const signal = () => new AbortController().signal;
  const client = createDeskClient(options);
  await client.refresh(signal());
  assert.equal((await client.save(task, 1, signal())).phase, 'applied');
  await f.put('two', command(2, 'Newest task'));
  await f.restart();
  const restored = createDeskClient({...options, baseUrl: f.server.url});
  assert.equal(restored.read().phase, 'unknown');
  assert.equal((await restored.recover(signal())).phase, 'applied');
  await restored.refresh(signal());
  assert.equal(restored.read().tasks[0].revision, 3);
  assert.equal(restored.acknowledge().phase, 'empty');
  assert.equal(restored.read().tasks[0].title, 'Newest task');
});
