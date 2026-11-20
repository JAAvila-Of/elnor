import test from 'node:test';
import assert from 'node:assert/strict';
import {cell,scope,button,text,repeat,when} from '../src/runtime.mjs';
import {setupDOM,FakeNode,tick} from './fake-dom.mjs';

function list(build){
  setupDOM();const root=new FakeNode('ul'),owner=scope(),values=cell([1,2,3]);
  let replacements=0;
  const content=Object.getOwnPropertyDescriptor(FakeNode.prototype,'textContent');
  Object.defineProperty(root,'textContent',{
    get(){return content.get.call(this);},
    set(value){replacements++;content.set.call(this,value);}
  });
  repeat(root,()=>values.value,x=>x,build,owner,true);
  return {root,owner,values,replacements:()=>replacements};
}

test('exclusive list clears native resources collectively and can refill',async()=>{
  let clicks=0,reads=0;const controls=[];
  const l=list((item,parent,owner)=>{
    controls.push(button(parent,()=>{reads++;return item.value;},()=>clicks++,owner));
    when(parent,()=>true,(p,s)=>text(p,'small',()=>item.value,s),owner);
  });
  const anchor=l.root.childNodes.at(-1);
  controls[0].click();assert.equal(clicks,1);
  l.values.value=[];await tick();assert.equal(l.replacements(),1);
  assert.deepEqual(l.root.childNodes.map(n=>n.tag),['#comment']);
  assert.equal(l.root.childNodes[0],anchor);
  const oldReads=reads;controls[0].click();assert.equal(clicks,1);
  l.values.value=[4];await tick();assert.equal(reads,oldReads+1);
  assert.equal(l.root.descendants('button')[0].textContent,'4');
  l.owner.dispose();assert.equal(l.root.childNodes.length,0);
});

test('user cleanup keeps its DOM observation and order on the ordinary path',async()=>{
  const seen=[];const l=list((item,parent,owner)=>{
    const node=text(parent,'li',()=>item.value,owner);
    owner.own(()=>seen.push([item.value,node.parentNode?.tag]));
  });
  l.values.value=[];await tick();assert.equal(l.replacements(),0);
  assert.deepEqual(seen,[[1,'ul'],[2,'ul'],[3,'ul']]);
  l.owner.dispose();
});

test('throwing user cleanup still removes every row and the owner anchor',()=>{
  const seen=[],failure=new Error('cleanup');
  const l=list((item,parent,owner)=>{
    text(parent,'li',()=>item.value,owner);
    owner.own(()=>{seen.push(item.value);if(item.value===2)throw failure;});
  });
  assert.throws(()=>l.owner.dispose(),error=>error===failure);
  assert.deepEqual(seen,[1,2,3]);assert.equal(l.root.childNodes.length,0);
  assert.equal(l.replacements(),0);l.owner.dispose();
});

test('exclusive hint never removes a foreign sibling',async()=>{
  const l=list((item,parent,owner)=>text(parent,'li',()=>item.value,owner));
  const foreign=new FakeNode('aside');l.root.append(foreign);
  l.values.value=[];await tick();assert.equal(l.replacements(),0);
  assert.ok(l.root.childNodes.includes(foreign));l.owner.dispose();
  assert.deepEqual(l.root.childNodes,[foreign]);
});

test('nested user cleanup disqualifies the enclosing list from bulk removal',async()=>{
  let observed=0;
  const l=list((item,parent,owner)=>when(parent,()=>true,(p,s)=>{
    const node=text(p,'li',()=>item.value,s);
    s.own(()=>{if(node.parentNode?.tag==='ul')observed++;});
  },owner));
  l.values.value=[];await tick();assert.equal(l.replacements(),0);assert.equal(observed,3);
  l.owner.dispose();
});

test('eligible collective clear attempts every native resource after a teardown error',()=>{
  const controls=[],items=[],failure=new Error('listener cleanup');let clicks=0,reads=0;
  const l=list((item,parent,owner)=>{
    items.push(item);controls.push(button(parent,()=>{reads++;return item.value;},()=>clicks++,owner));
  });
  const originalRemove=controls[0].removeEventListener.bind(controls[0]);
  controls[0].removeEventListener=(...args)=>{originalRemove(...args);throw failure;};
  const enqueue=globalThis.queueMicrotask,queued=[];globalThis.queueMicrotask=fn=>queued.push(fn);
  try{
    l.values.value=[];assert.equal(queued.length,1);
    assert.throws(()=>queued.shift()(),error=>error===failure);
    assert.equal(l.replacements(),1);assert.deepEqual(l.root.childNodes.map(node=>node.tag),['#comment']);
    controls.forEach(node=>node.click());assert.equal(clicks,0);
    const before=reads;items.forEach(item=>{item.value=99;});
    while(queued.length)queued.shift()();assert.equal(reads,before);
    l.owner.dispose();assert.equal(l.root.childNodes.length,0);
  }finally{globalThis.queueMicrotask=enqueue;}
});
