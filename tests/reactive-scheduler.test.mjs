import test from 'node:test';
import assert from 'node:assert/strict';
import {cell,effect,scope} from '../src/runtime.mjs';

function capture(t){
  const original=globalThis.queueMicrotask,queue=[],owner=scope();
  globalThis.queueMicrotask=callback=>queue.push(callback);
  t.after(()=>{
    owner.dispose();
    // Drain callbacks after disposal so a failed assertion cannot leave the
    // module scheduler armed for a later test. Errors remain tested explicitly.
    try{for(let n=0;queue.length&&n<100;n++){try{queue.shift()();}catch{}}}
    finally{globalThis.queueMicrotask=original;}
  });
  return {queue,owner};
}

test('one failed reaction does not discard independent updates and later writes recover',t=>{
  const {queue,owner}=capture(t),value=cell(0),seen=[],failure=new Error('reaction');
  effect(()=>{if(value.value===1)throw failure;},owner);
  effect(()=>seen.push(value.value),owner);
  value.value=1;assert.equal(queue.length,1);
  assert.throws(()=>queue.shift()(),error=>error===failure);
  assert.deepEqual(seen,[0,1]);
  value.value=2;assert.equal(queue.length,1);queue.shift()();
  assert.deepEqual(seen,[0,1,2]);assert.equal(queue.length,0);
});

test('multiple reaction failures are reported in order after every live effect is attempted',t=>{
  const {queue,owner}=capture(t),value=cell(false),seen=[],second=new Error('second');
  effect(()=>{if(value.value){seen.push('first');throw undefined;}},owner);
  effect(()=>{if(value.value){seen.push('second');throw second;}},owner);
  effect(()=>{if(value.value)seen.push('healthy');},owner);
  value.value=true;
  assert.throws(()=>queue.shift()(),error=>{
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors,[undefined,second]);return true;
  });
  assert.deepEqual(seen,['first','second','healthy']);assert.equal(queue.length,0);
});

test('chained writes schedule exactly one follow-up microtask even after an error',t=>{
  const {queue,owner}=capture(t),start=cell(false),next=cell(0),seen=[],failure=new Error('chain');
  effect(()=>{if(start.value){next.value=1;throw failure;}},owner);
  effect(()=>seen.push(next.value),owner);
  start.value=true;assert.equal(queue.length,1);
  assert.throws(()=>queue.shift()(),error=>error===failure);
  assert.equal(queue.length,1);queue.shift()();
  assert.deepEqual(seen,[0,1]);assert.equal(queue.length,0);
});

test('successful cascades do not queue a redundant empty flush and disposed work stays skipped',t=>{
  const {queue,owner}=capture(t),start=cell(false),next=cell(0),seen=[];
  effect(()=>{if(start.value)next.value=1;},owner);
  const stop=effect(()=>seen.push(next.value),owner);
  start.value=true;queue.shift()();assert.equal(queue.length,1);
  stop();queue.shift()();assert.equal(queue.length,0);assert.deepEqual(seen,[0]);
});

test('an error does not revive an effect disposed earlier in the same batch',t=>{
  const {queue,owner}=capture(t),value=cell(false),seen=[],failure=new Error('dispose');
  let stop;
  effect(()=>{if(value.value){stop();throw failure;}},owner);
  stop=effect(()=>{if(value.value)seen.push('disposed');},owner);
  effect(()=>{if(value.value)seen.push('healthy');},owner);
  value.value=true;assert.throws(()=>queue.shift()(),error=>error===failure);
  assert.deepEqual(seen,['healthy']);assert.equal(queue.length,0);
});

test('a single thrown undefined remains observable rather than being treated as no error',t=>{
  const {queue,owner}=capture(t),value=cell(false);
  effect(()=>{if(value.value)throw undefined;},owner);
  value.value=true;let caught=false;
  try{queue.shift()();}catch(error){caught=true;assert.equal(error,undefined);}
  assert.equal(caught,true);assert.equal(queue.length,0);
  value.value=false;assert.equal(queue.length,1);queue.shift()();assert.equal(queue.length,0);
});

test('writes without subscribers do not queue empty work, including after disposal',t=>{
  const {queue,owner}=capture(t),value=cell(0);
  value.value=1;assert.equal(queue.length,0);
  let seen;effect(()=>{seen=value.value;},owner);
  value.value=2;assert.equal(queue.length,1);queue.shift()();assert.equal(seen,2);
  owner.dispose();value.value=3;assert.equal(queue.length,0);assert.equal(seen,2);
});
