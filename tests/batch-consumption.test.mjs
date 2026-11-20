import test from 'node:test';
import assert from 'node:assert/strict';
import {cell,computed,effect,scope} from '../src/runtime.mjs';

function capture(t){
  const owner=scope(),queue=[],original=globalThis.queueMicrotask;
  globalThis.queueMicrotask=fn=>queue.push(fn);
  t.after(()=>{try{owner.dispose();while(queue.length)queue.shift()();}finally{globalThis.queueMicrotask=original;}});
  return {owner,queue};
}

test('an invalidation before a captured effect runs is consumed by that execution',t=>{
  const {owner,queue}=capture(t),value=cell(0),double=computed(()=>value.value*2,owner),seen=[];
  effect(()=>seen.push([value.value,double.value]),owner);
  value.value=1;assert.equal(queue.length,1);queue.shift()();
  assert.deepEqual(seen,[[0,0],[1,2]]);assert.equal(queue.length,0);
});

test('an invalidation after a captured effect has run still schedules a later execution',t=>{
  const {owner,queue}=capture(t),value=cell(0),pulse=cell(0),seen=[];
  const double=computed(()=>value.value*2,owner);
  effect(()=>{pulse.value;seen.push([value.value,double.value]);},owner);
  pulse.value=1;value.value=1;queue.shift()();
  assert.equal(queue.length,1);queue.shift()();
  assert.deepEqual(seen,[[0,0],[1,0],[1,2]]);assert.equal(queue.length,0);
});

test('self-invalidation remains pending for the next batch',t=>{
  const {owner,queue}=capture(t),value=cell(0),seen=[];
  effect(()=>{const n=value.value;seen.push(n);if(n>0&&n<3)value.value=n+1;},owner);
  value.value=1;queue.shift()();assert.equal(queue.length,1);
  queue.shift()();assert.equal(queue.length,1);queue.shift()();
  assert.deepEqual(seen,[0,1,2,3]);assert.equal(queue.length,0);
});

test('a failing effect consumes prior invalidations and reports the failure once',t=>{
  const {owner,queue}=capture(t),value=cell(0),double=computed(()=>value.value*2,owner),failure=new Error('render');let runs=0;
  effect(()=>{runs++;if(value.value+double.value>0)throw failure;},owner);
  value.value=1;assert.throws(()=>queue.shift()(),error=>error===failure);
  assert.equal(runs,2);assert.equal(queue.length,0);
  value.value=0;queue.shift()();assert.equal(runs,3);assert.equal(queue.length,0);
});
