import test from 'node:test';
import assert from 'node:assert/strict';
import {cell,scope,text,button} from '../src/runtime.mjs';
import {setupDOM,FakeNode,tick} from './fake-dom.mjs';

test('text bindings retain their Text node through empty values and updates',async()=>{
  setupDOM();const root=new FakeNode('root'),owner=scope(),value=cell('First');
  const node=text(root,'span',()=>value.value,owner),content=node.childNodes[0];
  assert.equal(content?.tag,'#text');
  for(const [input,expected] of [[null,''],[0,'0'],[false,'false'],['Last','Last']]){
    value.value=input;await tick();assert.equal(node.textContent,expected);
    assert.equal(node.childNodes[0],content);assert.equal(node.childNodes.length,1);
  }
  owner.dispose();value.value='Disposed';await tick();assert.equal(node.textContent,'Last');
});

test('button labels keep native listeners and independent binding reads',async()=>{
  setupDOM();const root=new FakeNode('root'),owner=scope(),a=cell('A'),b=cell('B');
  let readsA=0,readsB=0,calls=0;
  const control=button(root,()=>{readsA++;return a.value;},function(event){
    assert.equal(event.target,control);calls++;
  },owner);
  text(root,'small',()=>{readsB++;return b.value;},owner);
  const content=control.childNodes[0];assert.equal(content?.tag,'#text');
  a.value='Changed';await tick();assert.equal(readsA,2);assert.equal(readsB,1);
  assert.equal(control.childNodes[0],content);control.click();assert.equal(calls,1);
  owner.dispose();control.click();assert.equal(calls,1);
});
