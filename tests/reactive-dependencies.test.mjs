import test from 'node:test';
import assert from 'node:assert/strict';
import {cell,effect,scope} from '../src/runtime.mjs';
import {tick} from './fake-dom.mjs';

test('zero-dependency effects stay inert and duplicate single-cell reads schedule once',async()=>{
  const owner=scope(),value=cell(1);let inert=0,runs=0,total;
  effect(()=>{inert++;},owner);
  effect(()=>{runs++;total=value.value+value.value+value.value;},owner);
  assert.equal(total,3);value.value=2;value.value=3;await tick();
  assert.equal(inert,1);assert.equal(runs,2);assert.equal(total,9);
  owner.dispose();value.value=4;await tick();assert.equal(runs,2);
});

test('dependency growth and shrinkage remove obsolete subscriptions in read order',async()=>{
  const owner=scope(),mode=cell(0),a=cell(10),b=cell(20),seen=[];
  effect(()=>{const m=mode.value;seen.push(m===0?'empty':m===1?a.value:a.value+b.value);},owner);
  mode.value=1;await tick();assert.deepEqual(seen,['empty',10]);
  mode.value=2;await tick();assert.equal(seen.at(-1),30);
  mode.value=0;await tick();const count=seen.length;
  a.value=11;b.value=21;await tick();assert.equal(seen.length,count);
  mode.value=1;await tick();assert.equal(seen.at(-1),11);
  b.value=22;await tick();assert.equal(seen.length,count+1);
  owner.dispose();a.value=12;mode.value=2;await tick();assert.equal(seen.length,count+1);
});

test('nested effects restore the outer dependency collector',async()=>{
  const owner=scope(),a=cell(0),b=cell(0),c=cell(0);let outer=0,inner=0,created=false;
  effect(()=>{outer++;a.value;if(!created){created=true;effect(()=>{inner++;b.value;},owner);}c.value;},owner);
  b.value=1;await tick();assert.equal(inner,2);assert.equal(outer,1);
  c.value=1;await tick();assert.equal(outer,2);assert.equal(inner,2);
  owner.dispose();a.value=1;b.value=2;await tick();assert.equal(outer,2);assert.equal(inner,2);
});

test('many dependencies deduplicate and remain independently disposable',async()=>{
  const owner=scope(),values=Array.from({length:512},(_,i)=>cell(i));let runs=0,total=0;
  const stop=effect(()=>{runs++;total=0;for(const value of values)total+=value.value+value.value;},owner);
  values[0].value=2;values.at(-1).value=513;await tick();
  assert.equal(runs,2);assert.equal(total,2*(511*512/2+4));
  stop();values[1].value=100;await tick();assert.equal(runs,2);owner.dispose();
});

test('disposing while a run grows its dependencies never resubscribes',async()=>{
  const owner=scope(),a=cell(0),b=cell(0);let runs=0;
  effect(()=>{runs++;a.value;owner.dispose();b.value;},owner);
  a.value=1;b.value=1;await tick();assert.equal(runs,1);
});

test('callbacks keep their original unbound receiver on initial and queued runs',async()=>{
  const owner=scope(),value=cell(0),receivers=[];
  effect(function(){receivers.push(this);value.value;},owner);
  value.value=1;await tick();assert.deepEqual(receivers,[undefined,undefined]);owner.dispose();
});

test('foreign owners receive callable disposers and can stop queued effects',async()=>{
  const callbacks=[],owner={own(callback){assert.equal(typeof callback,'function');callbacks.push(callback);}},value=cell(0);
  let runs=0;const stop=effect(()=>{runs++;value.value;},owner);
  assert.equal(typeof stop,'function');assert.equal(callbacks.length,1);
  value.value=1;callbacks[0]();await tick();assert.equal(runs,1);
  stop();value.value=2;await tick();assert.equal(runs,1);
});
