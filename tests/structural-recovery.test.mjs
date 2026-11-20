import test from 'node:test';
import assert from 'node:assert/strict';
import {cell,scope,repeat,when,button,text,rootElement} from '../src/runtime.mjs';
import {setupDOM,FakeNode} from './fake-dom.mjs';

function fixture(t){
  setupDOM();const queue=[],owner=scope(),root=new FakeNode('root');
  const original=globalThis.queueMicrotask;
  globalThis.queueMicrotask=fn=>queue.push(fn);
  const drain=()=>{
    const errors=[];let count=0;
    while(queue.length){assert.ok(++count<100,'Reactive work must settle');try{queue.shift()();}catch(error){errors.push(error);}}
    return errors;
  };
  t.after(()=>{try{owner.dispose();}finally{try{drain();}finally{globalThis.queueMicrotask=original;}}});
  return {root,owner,drain};
}

for(const detached of [false,true])for(const cancelAt of ['read','key','build']){
 test(`disposing an each during ${cancelAt} stops construction, detached=${detached}`,t=>{
  const {root,owner,drain}=fixture(t),values=cell([]),label=cell('A'),controls=[];
  let armed=false,reads=0,builds=0,clicks=0;
  repeat(root,()=>{const result=values.value;if(armed&&cancelAt==='read')owner.dispose();return result;},value=>{
   if(armed&&cancelAt==='key')owner.dispose();return value;
  },(item,parent,child)=>{
   builds++;const host=detached?rootElement(null,'li'):parent;
   controls.push(button(host,()=>{reads++;const result=label.value;if(armed&&cancelAt==='build')owner.dispose();return result;},()=>clicks++,child));
   text(host,'small',()=>{reads++;return label.value;},child);return host;
  },owner,false,detached);
  armed=true;values.value=[1,2];assert.deepEqual(drain(),[]);
  assert.equal(builds,cancelAt==='build'?1:0);assert.equal(reads,cancelAt==='build'?1:0);
  assert.equal(root.childNodes.length,0);controls.forEach(n=>n.click());assert.equal(clicks,0);
  const before=reads;label.value='B';values.value=[3];assert.deepEqual(drain(),[]);assert.equal(reads,before);
 });
}

test('disposing a conditional during its build cancels the active part immediately',t=>{
 const {root,owner,drain}=fixture(t),visible=cell(false),label=cell('A'),controls=[];let reads=0,clicks=0;
 when(root,()=>visible.value,(parent,child)=>{
  controls.push(button(parent,()=>{reads++;owner.dispose();return label.value;},()=>clicks++,child));
  text(parent,'small',()=>{reads++;return label.value;},child);
 },owner);
 visible.value=true;assert.deepEqual(drain(),[]);assert.equal(reads,1);assert.equal(root.childNodes.length,0);
 controls.forEach(n=>n.click());assert.equal(clicks,0);label.value='B';assert.deepEqual(drain(),[]);assert.equal(reads,1);
});

for(const detached of [false,true])for(const failureMode of ['duplicate','build','key']){
  test(`failed queued each releases committed and staged resources and can retry: ${failureMode}, detached=${detached}`,t=>{
    const {root,owner,drain}=fixture(t),values=cell([1]),label=cell('Before'),controls=[],disposed=[];
    const before=new FakeNode('aside'),after=new FakeNode('footer'),failure=new Error(failureMode);
    root.append(before);let fail=true,clicks=0,reads=0;
    repeat(root,()=>values.value,value=>{
      if(fail&&failureMode==='key'&&value===3)throw failure;return value;
    },(item,parent,rowOwner)=>{
      const host=detached?rootElement(null,'li'):parent,id=item.value;
      rowOwner.own(()=>disposed.push(id));
      controls.push(button(host,()=>{reads++;return label.value;},()=>clicks++,rowOwner));
      if(fail&&failureMode==='build'&&id===3)throw failure;
      return host;
    },owner,false,detached);
    const anchor=root.childNodes.at(-1);root.append(after);
    values.value=failureMode==='duplicate'?[1,2,2]:[1,2,3];
    const errors=drain();assert.equal(errors.length,1);
    if(failureMode==='duplicate')assert.match(errors[0].message,/duplicate each key/);else assert.equal(errors[0],failure);
    assert.deepEqual(root.childNodes,[before,anchor,after]);
    controls.forEach(control=>control.click());assert.equal(clicks,0);
    const readCount=reads;label.value='After';assert.deepEqual(drain(),[]);assert.equal(reads,readCount);
    assert.equal(disposed.filter(id=>id===1).length,1);assert.equal(disposed.filter(id=>id===2).length,1);
    fail=false;values.value=[1,2,3];assert.deepEqual(drain(),[]);
    assert.equal(root.descendants('button').length,3);assert.equal(root.childNodes.at(-2),anchor);
    root.descendants('button').forEach(control=>control.click());assert.equal(clicks,3);
    owner.dispose();assert.deepEqual(root.childNodes,[before,after]);
  });
}

test('queued conditional build failure can retry the same truthy condition without leaked resources',t=>{
  const {root,owner,drain}=fixture(t),state=cell({show:false}),label=cell('Before'),controls=[];
  let fail=true,clicks=0,reads=0;const failure=new Error('conditional build');
  when(root,()=>state.value.show,(parent,child)=>{
    controls.push(button(parent,()=>{reads++;return label.value;},()=>clicks++,child));
    if(fail)throw failure;
  },owner);
  const anchor=root.childNodes[0];state.value={show:true};assert.deepEqual(drain(),[failure]);
  assert.deepEqual(root.childNodes,[anchor]);controls[0].click();assert.equal(clicks,0);
  const count=reads;label.value='After';assert.deepEqual(drain(),[]);assert.equal(reads,count);
  fail=false;state.value={show:true};assert.deepEqual(drain(),[]);
  assert.equal(root.descendants('button').length,1);assert.equal(root.textContent,'After');
  root.descendants('button')[0].click();assert.equal(clicks,1);
});

test('a conditional teardown error still permits a later true value to rebuild',t=>{
  const {root,owner,drain}=fixture(t),state=cell({show:true}),failure=new Error('teardown');let fail=true;
  when(root,()=>state.value.show,(parent,child)=>{
    text(parent,'span',()=> 'Shown',child);child.own(()=>{if(fail)throw failure;});
  },owner);
  state.value={show:false};assert.deepEqual(drain(),[failure]);assert.equal(root.descendants('span').length,0);
  fail=false;state.value={show:true};assert.deepEqual(drain(),[]);assert.equal(root.textContent,'Shown');
});

test('each failure attempts all cleanup, retains the original cause and retries after cleanup errors',t=>{
  const {root,owner,drain}=fixture(t),values=cell([1]),label=cell(0),failure=new Error('key'),cleanup=new Error('cleanup');
  const controls=[],disposed=[];let fail=true,reads=0,clicks=0;
  repeat(root,()=>values.value,value=>{if(fail&&value===3)throw failure;return value;},(item,parent,child)=>{
    const id=item.value;controls.push(button(parent,()=>{reads++;return label.value;},()=>clicks++,child));
    child.own(()=>{disposed.push(id);if(fail&&id===1)throw cleanup;});
  },owner);
  const anchor=root.childNodes.at(-1);values.value=[1,2,3];const [error]=drain();
  assert.ok(error instanceof AggregateError);assert.equal(error.cause,failure);assert.deepEqual(error.errors,[failure,cleanup]);
  assert.deepEqual(disposed,[1,2]);assert.deepEqual(root.childNodes,[anchor]);
  controls.forEach(control=>control.click());assert.equal(clicks,0);
  const count=reads;label.value=1;assert.deepEqual(drain(),[]);assert.equal(reads,count);
  fail=false;values.value=[1,2];assert.deepEqual(drain(),[]);assert.equal(root.descendants('button').length,2);
});

for(const failureMode of ['invalid array','read'])test(`each resets after a queued ${failureMode} failure`,t=>{
  const {root,owner,drain}=fixture(t),state=cell({rows:[1]}),failure=new Error('read');let control,clicks=0;
  repeat(root,()=>{const value=state.value;if(value.fail)throw failure;return value.rows;},x=>x,
    (item,parent,child)=>{control=button(parent,()=>item.value,()=>clicks++,child);},owner);
  const anchor=root.childNodes.at(-1),old=control;
  state.value=failureMode==='read'?{fail:true}:{rows:null};const errors=drain();assert.equal(errors.length,1);
  if(failureMode==='read')assert.equal(errors[0],failure);else assert.match(errors[0].message,/expects an array/);
  assert.deepEqual(root.childNodes,[anchor]);old.click();assert.equal(clicks,0);
  state.value={rows:[1]};assert.deepEqual(drain(),[]);assert.notEqual(control,old);control.click();assert.equal(clicks,1);
});

test('a queued conditional read error releases the visible part and preserves outside siblings',t=>{
  const {root,owner,drain}=fixture(t),state=cell({show:true}),failure=new Error('read');
  const before=new FakeNode('aside'),after=new FakeNode('footer');root.append(before);
  let control,clicks=0;
  when(root,()=>{const value=state.value;if(value.fail)throw failure;return value.show;},
    (parent,child)=>{control=button(parent,()=> 'Visible',()=>clicks++,child);},owner);
  const anchor=root.childNodes.at(-1),old=control;root.append(after);
  state.value={fail:true};assert.deepEqual(drain(),[failure]);assert.deepEqual(root.childNodes,[before,anchor,after]);
  old.click();assert.equal(clicks,0);
  state.value={show:true};assert.deepEqual(drain(),[]);control.click();assert.equal(clicks,1);
});

for(const block of ['each','when'])test(`${block} releases partially inserted multi-node content and recovers`,t=>{
  const {root,owner,drain}=fixture(t),state=cell(false),label=cell('Before'),controls=[];
  const failure=new Error('insert');let reads=0,clicks=0,armed=true;
  const build=(parent,child)=>{
    for(let i=0;i<2;i++)controls.push(button(parent,()=>{reads++;return label.value;},()=>clicks++,child));
  };
  if(block==='each')repeat(root,()=>state.value?[1,2]:[],x=>x,(_item,parent,child)=>build(parent,child),owner);
  else when(root,()=>state.value,build,owner);
  const anchor=root.childNodes[0],insert=root.insertBefore.bind(root);
  root.insertBefore=(node,reference)=>{insert(node,reference);if(armed){armed=false;throw failure;}};
  state.value=true;assert.deepEqual(drain(),[failure]);assert.deepEqual(root.childNodes,[anchor]);
  controls.forEach(control=>control.click());assert.equal(clicks,0);
  const count=reads;label.value='After';assert.deepEqual(drain(),[]);assert.equal(reads,count);
  state.value=false;assert.deepEqual(drain(),[]);state.value=true;assert.deepEqual(drain(),[]);
  assert.equal(root.descendants('button').length,block==='each'?4:2);
});

test('a removal cleanup error resets all rows and does not reuse disposed row owners',t=>{
  const {root,owner,drain}=fixture(t),values=cell([1,2,3]),failure=new Error('remove'),controls=[],disposed=[];
  let fail=true,clicks=0;
  repeat(root,()=>values.value,x=>x,(item,parent,child)=>{
    const id=item.value;controls.push(button(parent,()=>id,()=>clicks++,child));
    child.own(()=>{disposed.push(id);if(fail&&id===2)throw failure;});
  },owner);
  const anchor=root.childNodes.at(-1);values.value=[1,3];assert.deepEqual(drain(),[failure]);
  assert.deepEqual(root.childNodes,[anchor]);assert.deepEqual([...disposed].sort(),[1,2,3]);
  controls.forEach(control=>control.click());assert.equal(clicks,0);
  fail=false;values.value=[1,3];assert.deepEqual(drain(),[]);root.descendants('button').forEach(control=>control.click());
  assert.equal(clicks,2);assert.equal(root.descendants('button').length,2);
});

test('exclusive clear still removes owned nodes when the collective DOM operation throws',t=>{
  const {root,owner,drain}=fixture(t),values=cell([1,2]),failure=new Error('collective removal'),controls=[];
  let clicks=0;
  repeat(root,()=>values.value,x=>x,(item,parent,child)=>{
    controls.push(button(parent,()=>item.value,()=>clicks++,child));
  },owner,true);
  const anchor=root.childNodes.at(-1),replace=root.replaceChildren.bind(root);let armed=true;
  root.replaceChildren=(...nodes)=>{if(armed){armed=false;throw failure;}replace(...nodes);};
  values.value=[];assert.deepEqual(drain(),[failure]);assert.deepEqual(root.childNodes,[anchor]);
  controls.forEach(control=>control.click());assert.equal(clicks,0);
  values.value=[1];assert.deepEqual(drain(),[]);assert.equal(root.descendants('button').length,1);
});
