import test from 'node:test';
import assert from 'node:assert/strict';
import {cell,effect,scope} from '../src/runtime.mjs';

function capture(t){
  const owner=scope(),queue=[],original=globalThis.queueMicrotask;
  globalThis.queueMicrotask=fn=>queue.push(fn);
  const drain=()=>{let rounds=0;while(queue.length){assert.ok(++rounds<20,'Queue must settle');queue.shift()();}};
  t.after(()=>{try{owner.dispose();drain();}finally{globalThis.queueMicrotask=original;}});
  return {owner,queue,drain};
}

test('notification only queues work; a later subscriber does not join a past write',t=>{
  const {owner,queue,drain}=capture(t),value=cell(0),seen=[];
  effect(()=>seen.push(['early',value.value]),owner);
  value.value=1;assert.deepEqual(seen,[['early',0]]);assert.equal(queue.length,1);
  effect(()=>seen.push(['late',value.value]),owner);
  drain();assert.deepEqual(seen,[['early',0],['late',1],['early',1]]);
  value.value=2;drain();assert.deepEqual(seen.slice(-2),[['late',2],['early',2]]);
});

test('a subscriber created during a flush runs initially without being added to the captured batch',t=>{
  const {owner,queue,drain}=capture(t),value=cell(0),seen=[];let child=false;
  effect(()=>{
    const current=value.value;seen.push(['parent',current]);
    if(current===1&&!child){child=true;effect(()=>seen.push(['child',value.value]),owner);}
  },owner);
  value.value=1;drain();assert.deepEqual(seen,[['parent',0],['parent',1],['child',1]]);
  assert.equal(queue.length,0);value.value=2;drain();assert.deepEqual(seen.slice(-2),[['parent',2],['child',2]]);
});

test('reentrant writes settle across queued batches without synchronous subscriber execution',t=>{
  const {owner,queue,drain}=capture(t),value=cell(0),seen=[];
  effect(()=>{const current=value.value;seen.push(current);if(current>0&&current<3)value.value=current+1;},owner);
  value.value=1;assert.deepEqual(seen,[0]);assert.equal(queue.length,1);
  drain();assert.deepEqual(seen,[0,1,2,3]);assert.equal(value.value,3);assert.equal(queue.length,0);
});

test('dependency replacement and disposal between writes leave only live subscribers queued',t=>{
  const {owner,queue,drain}=capture(t),a=cell(0),b=cell(0),select=cell(false),seen=[];
  const stop=effect(()=>seen.push(select.value?b.value:a.value),owner);
  a.value=1;select.value=true;b.value=2;drain();assert.deepEqual(seen,[0,2]);
  a.value=3;assert.equal(queue.length,0);b.value=4;stop();b.value=5;drain();
  assert.deepEqual(seen,[0,2]);assert.equal(queue.length,0);
});
