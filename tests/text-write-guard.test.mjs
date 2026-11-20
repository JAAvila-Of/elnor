import test from 'node:test';
import assert from 'node:assert/strict';
import {cell,scope,text,button} from '../src/runtime.mjs';
import {setupDOM,FakeNode,tick} from './fake-dom.mjs';

function fixture(t,kind,initial){
  setupDOM();const owner=scope(),root=new FakeNode('root'),value=cell(initial);
  let reads=0,writes=0,clicks=0;
  const create=document.createTextNode,descriptor=Object.getOwnPropertyDescriptor(FakeNode.prototype,'nodeValue');
  document.createTextNode=value=>{
    const node=create(value);
    Object.defineProperty(node,'nodeValue',{
      get(){return descriptor.get.call(this);},
      set(next){writes++;descriptor.set.call(this,next);}
    });return node;
  };
  const read=()=>{reads++;return value.value.label;};
  const node=kind==='text'?text(root,'span',read,owner):button(root,read,()=>clicks++,owner);
  t.after(()=>owner.dispose());
  return {owner,value,node,get reads(){return reads;},get writes(){return writes;},get clicks(){return clicks;}};
}

for(const kind of ['text','button']){
  test(`${kind} reads and converts once but skips an unchanged DOM text assignment`,async t=>{
    let conversions=0;const label={toString(){conversions++;return 'Same';}};
    const f=fixture(t,kind,{label});assert.equal(f.writes,1);assert.equal(conversions,1);
    f.value.value={label,unrelated:1};await tick();
    assert.equal(f.reads,2);assert.equal(conversions,2);assert.equal(f.writes,1);
    f.value.value={label:'Changed'};await tick();assert.equal(f.writes,2);assert.equal(f.node.textContent,'Changed');
    if(kind==='button'){f.node.click();assert.equal(f.clicks,1);}
    f.owner.dispose();const reads=f.reads;f.value.value={label:'Disposed'};await tick();assert.equal(f.reads,reads);
    if(kind==='button'){f.node.click();assert.equal(f.clicks,1);}
  });

  test(`${kind} preserves nullish, numeric, boolean and Symbol conversion`,async t=>{
    const f=fixture(t,kind,{label:null});assert.equal(f.node.textContent,'');assert.equal(f.writes,0);
    f.value.value={label:undefined};await tick();assert.equal(f.writes,0);
    for(const label of [0,false,Symbol('label'),12n]){
      f.value.value={label};await tick();assert.equal(f.node.textContent,String(label));
    }
    assert.equal(f.writes,4);assert.equal(f.reads,6);
  });

  test(`${kind} repairs external text edits on reevaluation and retains its Text node`,async t=>{
    const f=fixture(t,kind,{label:'Same'}),content=f.node.firstChild;
    content.nodeValue='External';f.value.value={label:'Same',unrelated:1};await tick();
    assert.equal(f.node.firstChild,content);assert.equal(content.nodeValue,'Same');assert.equal(f.writes,3);
    f.value.value={label:'Same',unrelated:2};await tick();assert.equal(f.writes,3);
  });
}
