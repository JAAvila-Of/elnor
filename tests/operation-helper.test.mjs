import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import {getTs} from '../src/typescript.mjs';
const helper=new URL('../examples/operations/operation.ts',import.meta.url);
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function load(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-operation-'));t.after(()=>{assert.equal(path.dirname(d),os.tmpdir());assert.ok(path.basename(d).startsWith('elnor-operation-'));fs.rmSync(d,{recursive:true,force:true});});const file=path.join(d,'operation.mjs');fs.writeFileSync(file,getTs().transpileModule(fs.readFileSync(helper,'utf8'),{compilerOptions:{target:99,module:99}}).outputText);return import(pathToFileURL(file));}
async function fixture(t,policy='latest',extras={}){const {createOperation,idleOperationState}=await load(t),states=[],commits=[],op=createOperation({policy,publish:s=>states.push(s),success:(value,input)=>commits.push([value,input]),...extras});t.after(()=>op.dispose());return {op,states,commits,idleOperationState};}

test('operation construction is lazy and idle snapshots are immutable',async t=>{const f=await fixture(t);assert.deepEqual(f.states,[]);assert.deepEqual(f.commits,[]);assert.equal(f.idleOperationState().status,'idle');assert.equal(Object.isFrozen(f.idleOperationState()),true);});
test('configured work runs only after admission and releases ownership on disposal',async t=>{
 const calls=[],gate=deferred();
 const f=await fixture(t,'single-flight',{
  work:(input,signal)=>{calls.push({input,signal});return gate.promise;}
 });
 assert.deepEqual(calls,[]);
 const first=f.op.run('first');
 assert.deepEqual(await f.op.run('duplicate'),{kind:'ignored'});
 assert.deepEqual(calls.map(call=>call.input),['first']);
 assert.deepEqual(f.states.map(state=>state.status),['pending']);
 f.op.dispose();
 assert.equal(calls[0].signal.aborted,true);
 gate.resolve('late');
 assert.deepEqual(await first,{kind:'disposed'});
 assert.deepEqual(await f.op.run('after disposal'),{kind:'disposed'});
 assert.deepEqual(f.commits,[]);
 assert.equal(calls.length,1);
});
test('pending is published synchronously before accepted work starts',async t=>{const f=await fixture(t),gate=deferred();const run=f.op.run('input',()=>{assert.equal(f.states.at(-1).status,'pending');return gate.promise;});assert.equal(f.states.length,1);assert.equal(Object.isFrozen(f.states[0]),true);gate.resolve('value');assert.deepEqual(await run,{kind:'success',value:'value'});assert.deepEqual(f.commits,[['value','input']]);assert.equal(f.states.at(-1).status,'success');});
test('latest suppresses an older completion without clearing newer pending',async t=>{const f=await fixture(t),a=deferred(),b=deferred();const first=f.op.run('a',()=>a.promise),second=f.op.run('b',()=>b.promise);a.resolve('old');assert.deepEqual(await first,{kind:'superseded'});assert.equal(f.states.at(-1).status,'pending');b.resolve('new');await second;assert.deepEqual(f.commits,[['new','b']]);});
test('latest also discards an old result that completes after the new success',async t=>{const f=await fixture(t),a=deferred(),b=deferred();const first=f.op.run('a',()=>a.promise),second=f.op.run('b',()=>b.promise);b.resolve('new');await second;a.resolve('old');await first;assert.deepEqual(f.commits,[['new','b']]);assert.equal(f.states.filter(s=>s.status==='success').length,1);});
test('an obsolete rejection is caught without becoming the current error',async t=>{const f=await fixture(t),a=deferred(),b=deferred();const first=f.op.run('a',()=>a.promise),second=f.op.run('b',()=>b.promise);a.reject(Error('old'));assert.deepEqual(await first,{kind:'superseded'});assert.equal(f.states.at(-1).status,'pending');b.resolve('ok');await second;assert.equal(f.states.at(-1).status,'success');});
test('single-flight ignores duplicate input without invoking its work function',async t=>{const f=await fixture(t,'single-flight'),gate=deferred();let calls=0;const first=f.op.run('one',()=>{calls++;return gate.promise;});assert.deepEqual(await f.op.run('two',()=>{calls++;return Promise.resolve('two');}),{kind:'ignored'});assert.equal(calls,1);assert.equal(f.states.length,1);gate.resolve('one');await first;});
test('cancellable single-flight ignores duplicate work and admits retry after cancellation',async t=>{
 const f=await fixture(t,'single-flight',{cancellable:true}),firstReply=deferred(),retryReply=deferred();
 let firstSignal;
 const first=f.op.run('first',(_,signal)=>{firstSignal=signal;return firstReply.promise;});
 assert.deepEqual(await f.op.run('duplicate',()=>{throw Error('must not run');}),{kind:'ignored'});
 assert.equal(firstSignal.aborted,false);
 f.op.cancel();
 assert.equal(firstSignal.aborted,true);
 const retry=f.op.run('retry',()=>retryReply.promise);
 firstReply.resolve('late');
 assert.deepEqual(await first,{kind:'cancelled'});
 assert.deepEqual(f.states.map(state=>state.status),['pending','idle','pending']);
 assert.deepEqual(f.commits,[]);
 retryReply.resolve('current');
 assert.deepEqual(await retry,{kind:'success',value:'current'});
 assert.deepEqual(f.commits,[['current','retry']]);
});
test('work rejection is a typed outcome and preserves its original error value',async t=>{const f=await fixture(t),reason={code:'offline'};assert.deepEqual(await f.op.run('one',()=>Promise.reject(reason)),{kind:'error',error:reason});assert.equal(f.states.at(-1).error,reason);assert.equal(f.states.at(-1).status,'error');assert.deepEqual(f.commits,[]);});
test('synchronous work failure follows the operational error path',async t=>{const f=await fixture(t),error=Error('sync');assert.deepEqual(await f.op.run('one',()=>{throw error;}),{kind:'error',error});assert.equal(f.states.at(-1).status,'error');});
test('cancel publishes idle and clears a prior operational error',async t=>{const f=await fixture(t);await f.op.run('one',()=>Promise.reject(Error('failed')));f.op.cancel();assert.equal(f.states.at(-1).status,'idle');assert.equal(f.states.at(-1).error,undefined);});
test('cancel aborts the signal and discards a provider that ignores it',async t=>{const f=await fixture(t),gate=deferred();let signal;const run=f.op.run('one',(_,s)=>{signal=s;return gate.promise;});f.op.cancel();assert.equal(signal.aborted,true);gate.resolve('late');assert.deepEqual(await run,{kind:'cancelled'});assert.deepEqual(f.commits,[]);assert.equal(f.states.at(-1).status,'idle');});
test('dispose aborts without publication and prevents future work',async t=>{const f=await fixture(t),gate=deferred();let signal;const run=f.op.run('one',(_,s)=>{signal=s;return gate.promise;});const count=f.states.length;f.op.dispose();f.op.dispose();assert.equal(signal.aborted,true);assert.deepEqual(await f.op.run('two',()=>{throw Error('must not run');}),{kind:'disposed'});gate.reject(Error('late'));assert.deepEqual(await run,{kind:'disposed'});assert.equal(f.states.length,count);assert.deepEqual(f.commits,[]);});
test('cancel does not pretend to stop the provider physical effect',async t=>{const f=await fixture(t),gate=deferred();let effects=0;const run=f.op.run('one',()=>gate.promise.then(v=>{effects++;return v;}));f.op.cancel();gate.resolve('written');await run;assert.equal(effects,1);assert.deepEqual(f.commits,[]);});
test('disposal during pending publication prevents work from starting',async t=>{let op;const {createOperation}=await load(t);op=createOperation({policy:'latest',publish:()=>op.dispose()});assert.deepEqual(await op.run('one',()=>{throw Error('must not run');}),{kind:'disposed'});});
test('latest reentry during publication makes only the newest work eligible',async t=>{const {createOperation}=await load(t),commits=[];let op,nested,once=false;op=createOperation({policy:'latest',publish(){if(!once){once=true;nested=op.run('inner',()=>Promise.resolve('inner result'));}},success:v=>commits.push(v)});t.after(()=>op.dispose());assert.deepEqual(await op.run('outer',()=>{throw Error('outer must not run');}),{kind:'superseded'});await nested;assert.deepEqual(commits,['inner result']);});
test('an abort listener starting newer work cannot be overwritten by the outer start',async t=>{const f=await fixture(t),first=deferred();let nested;const a=f.op.run('a',(_,signal)=>{signal.addEventListener('abort',()=>{nested=f.op.run('c',()=>Promise.resolve('c'));},{once:true});return first.promise;});const b=f.op.run('b',()=>{throw Error('b lost ownership');});assert.deepEqual(await b,{kind:'superseded'});await nested;first.resolve('a');await a;assert.deepEqual(f.commits,[['c','c']]);});
test('success commits synchronously while current and skips publication after disposal',async t=>{const {createOperation}=await load(t),states=[],commits=[];let op;op=createOperation({policy:'latest',publish:s=>states.push(s.status),success:v=>{commits.push(v);op.dispose();}});assert.deepEqual(await op.run('one',()=>Promise.resolve('ok')),{kind:'success',value:'ok'});assert.deepEqual(commits,['ok']);assert.deepEqual(states,['pending']);});
test('a success callback starting latest work cannot have its pending state cleared',async t=>{const {createOperation}=await load(t),states=[],gate=deferred();let op,nested;op=createOperation({policy:'latest',publish:s=>states.push(s.status),success:(value)=>{if(value==='first')nested=op.run('next',()=>gate.promise);}});t.after(()=>op.dispose());await op.run('one',()=>Promise.resolve('first'));assert.equal(states.at(-1),'pending');gate.resolve('next');await nested;assert.equal(states.at(-1),'success');});
test('single-flight includes the synchronous success callback in its busy lifetime',async t=>{const {createOperation}=await load(t);let op,nested;op=createOperation({policy:'single-flight',publish(){},success(){nested=op.run('nested',()=>{throw Error('must not run');});}});t.after(()=>op.dispose());await op.run('one',()=>Promise.resolve('ok'));assert.deepEqual(await nested,{kind:'ignored'});});
test('a success callback error rejects without becoming a work failure and releases the slot',async t=>{const {createOperation}=await load(t),states=[];let fail=true;const op=createOperation({policy:'single-flight',publish:s=>states.push(s.status),success(){if(fail)throw Error('callback');}});t.after(()=>op.dispose());await assert.rejects(op.run('one',()=>Promise.resolve('ok')),/callback/);assert.deepEqual(states,['pending','success']);fail=false;assert.equal((await op.run('two',()=>Promise.resolve('ok'))).kind,'success');});
test('pending publisher failure rejects before work and releases ownership',async t=>{const {createOperation}=await load(t);let fail=true;const op=createOperation({policy:'single-flight',publish(){if(fail)throw Error('publisher');}});t.after(()=>op.dispose());await assert.rejects(op.run('one',()=>{throw Error('must not run');}),/publisher/);fail=false;assert.equal((await op.run('two',()=>Promise.resolve('ok'))).kind,'success');});
test('a publisher failure on a work error retains both causes',async t=>{const {createOperation}=await load(t),work=Error('work'),publish=Error('publish');const op=createOperation({policy:'latest',publish(s){if(s.status==='error')throw publish;}});t.after(()=>op.dispose());await assert.rejects(op.run('one',()=>Promise.reject(work)),e=>e instanceof AggregateError&&e.errors[0]===work&&e.errors[1]===publish);});
test('cancel reentry from an abort listener cannot clear newer pending state',async t=>{const f=await fixture(t),a=deferred(),b=deferred();let nested;const first=f.op.run('a',(_,signal)=>{signal.addEventListener('abort',()=>{nested=f.op.run('b',()=>b.promise);},{once:true});return a.promise;});f.op.cancel();assert.equal(f.states.at(-1).status,'pending');a.resolve('old');await first;b.resolve('new');await nested;assert.deepEqual(f.commits,[['new','b']]);});
test('single-flight exposes disposal but does not expose cancellation',async t=>{const f=await fixture(t,'single-flight');assert.equal(Object.hasOwn(f.op,'cancel'),false);assert.equal(typeof f.op.dispose,'function');});
test('operations keep per-instance state and disposing one leaves the other active',async t=>{const a=await fixture(t),b=await fixture(t),x=deferred(),y=deferred();const first=a.op.run('a',()=>x.promise),second=b.op.run('b',()=>y.promise);a.op.dispose();x.resolve('a');y.resolve('b');await Promise.all([first,second]);assert.deepEqual(a.commits,[]);assert.deepEqual(b.commits,[['b','b']]);});
