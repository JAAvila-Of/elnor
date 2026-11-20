import test from 'node:test';
import assert from 'node:assert/strict';
import {cell,scope,repeat,button,rootElement} from '../src/runtime.mjs';
import {setupDOM} from './fake-dom.mjs';

function fixture(t,failures,{failDOM=false}={}){
 setupDOM();const queue=[],original=globalThis.queueMicrotask;
 globalThis.queueMicrotask=fn=>queue.push(fn);
 const root=document.createElement('ul'),owner=scope(),rows=cell([0,1,2]),held=[];let clicks=0;
 t.after(()=>{try{owner.dispose();}finally{globalThis.queueMicrotask=original;}});
 repeat(root,()=>rows.value,id=>id,(item,parent,child)=>{
  const li=rootElement(null,'li'),node=button(li,()=>item.value,()=>clicks++,child);held.push(node);return li;
 },owner,true,true);
 for(const [index,error] of failures){
  const node=held[index],remove=node.removeEventListener.bind(node);
  node.removeEventListener=(...args)=>{remove(...args);throw error;};
 }
 const domError=new Error('Collective DOM removal failed');
 if(failDOM)root.replaceChildren=()=>{throw domError;};
 const clear=()=>{rows.value=[];assert.equal(queue.length,1);queue.shift()();};
 const verify=()=>{
  assert.equal(root.childNodes.length,1,'Only the each anchor should remain');
  for(const node of held){assert.equal(node.listeners.click.length,0);node.click();}
  assert.equal(clicks,0);owner.dispose();assert.equal(root.childNodes.length,0);
 };
 return {clear,verify,domError};
}
for(const undefinedError of [false,true]){
 test(`collective clear preserves cleanup and DOM errors, undefined=${undefinedError}`,t=>{
  const cleanupError=undefinedError?undefined:new Error('Listener cleanup failed'),f=fixture(t,[[0,cleanupError]],{failDOM:true});
  assert.throws(f.clear,error=>{assert(error instanceof AggregateError);assert.deepEqual(error.errors,[cleanupError,f.domError]);assert.equal(error.cause,cleanupError);assert(Object.hasOwn(error,'cause'));return true;});
  f.verify();
 });
 test(`collective clear preserves a sole cleanup error unchanged, undefined=${undefinedError}`,t=>{
  const cleanupError=undefinedError?undefined:new Error('Listener cleanup failed'),f=fixture(t,[[0,cleanupError]]);
  assert.throws(f.clear,error=>error===cleanupError);f.verify();
 });
}
test('collective clear preserves ordered cleanup errors before DOM failure',t=>{
 const first=new Error('First cleanup failed'),last=new Error('Last cleanup failed'),f=fixture(t,[[0,first],[2,last]],{failDOM:true});
 assert.throws(f.clear,error=>{assert(error instanceof AggregateError);assert(error.errors[0] instanceof AggregateError);assert.deepEqual(error.errors[0].errors,[first,last]);assert.equal(error.errors[1],f.domError);assert.equal(error.cause,error.errors[0]);return true;});
 f.verify();
});
