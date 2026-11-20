import test from 'node:test';
import assert from 'node:assert/strict';
import {cell,scope,repeat,button,text,when,rootElement} from '../src/runtime.mjs';
import {setupDOM,tick} from './fake-dom.mjs';
function fixture({exclusive=true,nested=false,foreign=false}={}){
 setupDOM();const root=document.createElement('ul'),owner=scope(),rows=cell([1,2,3]),label=cell('A'),held=[],observations=[];
 let replacements=0,removals=0,clicks=0,reads=0;
 const replace=root.replaceChildren.bind(root);root.replaceChildren=(...nodes)=>{replacements++;replace(...nodes);};
 repeat(root,()=>rows.value,id=>id,(item,parent,child)=>{
  const li=rootElement(null,'li'),remove=li.remove.bind(li);li.remove=()=>{removals++;remove();};
  held.push({li,button:button(li,()=>{reads++;return label.value;},()=>clicks++,child)});
  if(nested)when(li,()=>true,(parent,scope)=>text(parent,'span',()=>label.value,scope),child);
  if(foreign)child.own(()=>observations.push(root.childNodes.length));
  return li;
 },owner,exclusive,true);
 replacements=0;removals=0; // Observe disposal, excluding initial placement.
 return {root,owner,rows,label,held,observations,get replacements(){return replacements;},get removals(){return removals;},get clicks(){return clicks;},get reads(){return reads;}};
}
test('exclusive native region disposal removes roots collectively and cleans held listeners',async()=>{
 const f=fixture();f.owner.dispose();assert.equal(f.replacements,1);assert.equal(f.removals,0);assert.equal(f.root.childNodes.length,0);
 for(const held of f.held){assert.equal(held.li.parentNode,null);assert.equal(held.li.textContent,'A');held.button.click();assert.equal(held.button.listeners.click.length,0);}
 assert.equal(f.clicks,0);const reads=f.reads;f.label.value='B';f.rows.value=[4];await tick();assert.equal(f.reads,reads);f.owner.dispose();assert.equal(f.replacements,1);
});
test('collective disposal preserves ordinary descendant cleanup in retained rows',()=>{
 const f=fixture({nested:true});const spans=f.held.map(x=>x.li.descendants('span')[0]);f.owner.dispose();
 assert.equal(f.replacements,1);assert.equal(f.removals,0);
 for(let i=0;i<3;i++){assert.equal(spans[i].parentNode,null);assert.equal(f.held[i].li.descendants('span').length,0);assert.equal(f.held[i].li.childNodes.length,1);}
});
test('foreign callbacks retain per-row observation order',()=>{
 const f=fixture({foreign:true});f.owner.dispose();assert.equal(f.replacements,0);assert.equal(f.removals,3);assert.deepEqual(f.observations,[4,3,2]);
});
test('unowned sibling prevents collective disposal',()=>{
 const f=fixture(),foreign=document.createElement('aside');f.root.append(foreign);f.owner.dispose();assert.equal(f.replacements,0);assert.equal(f.removals,3);assert.deepEqual(f.root.childNodes,[foreign]);
});
test('nonexclusive region retains its existing disposal path',()=>{
 const f=fixture({exclusive:false});f.owner.dispose();assert.equal(f.replacements,0);assert.equal(f.removals,3);assert.equal(f.root.childNodes.length,0);
});
test('failed collective DOM removal still detaches all owned nodes and cancels effects',async()=>{
 const f=fixture(),error=new Error('replace failed');f.root.replaceChildren=()=>{throw error;};assert.throws(()=>f.owner.dispose(),e=>e===error);
 assert.equal(f.root.childNodes.length,0);for(const held of f.held)held.button.click();assert.equal(f.clicks,0);
 const reads=f.reads;f.label.value='B';await tick();assert.equal(f.reads,reads);
});
test('in-flight cancellation uses staged cleanup rather than collective disposal',()=>{
 setupDOM();const root=document.createElement('ul'),owner=scope();let replacements=0,reads=0;
 const replace=root.replaceChildren.bind(root);root.replaceChildren=(...nodes)=>{replacements++;replace(...nodes);};
 repeat(root,()=>[1,2],id=>id,(item,parent,child)=>{
  const li=rootElement(null,'li');text(li,'span',()=>{reads++;owner.dispose();return 'A';},child);text(li,'small',()=>{reads++;return 'B';},child);return li;
 },owner,true,true);
 assert.equal(replacements,0);assert.equal(reads,1);assert.equal(root.childNodes.length,0);
});

function failingListener(control,error){
 const remove=control.removeEventListener.bind(control);
 control.removeEventListener=(...args)=>{remove(...args);throw error;};
}
for(const cleanupError of [new Error('listener cleanup'),undefined]){
 test(`collective disposal preserves both failures, cleanup=${cleanupError===undefined?'undefined':'Error'}`,()=>{
  const f=fixture(),domError=new Error('collective DOM removal');failingListener(f.held[0].button,cleanupError);
  f.root.replaceChildren=()=>{throw domError;};
  assert.throws(()=>f.owner.dispose(),error=>{
   assert(error instanceof AggregateError);assert.deepEqual(error.errors,[cleanupError,domError]);assert.equal(error.cause,cleanupError);return true;
  });
  assert.equal(f.root.childNodes.length,0);for(const held of f.held)assert.equal(held.button.listeners.click.length,0);
 });
}
test('collective disposal preserves ordered cleanup failures before DOM failure',()=>{
 const f=fixture(),first=new Error('first listener'),last=new Error('last listener'),domError=new Error('DOM');
 failingListener(f.held[0].button,first);failingListener(f.held[2].button,last);f.root.replaceChildren=()=>{throw domError;};
 assert.throws(()=>f.owner.dispose(),error=>{
  assert(error instanceof AggregateError);assert(error.errors[0] instanceof AggregateError);
  assert.deepEqual(error.errors[0].errors,[first,last]);assert.equal(error.errors[1],domError);assert.equal(error.cause,error.errors[0]);return true;
 });assert.equal(f.root.childNodes.length,0);
});
