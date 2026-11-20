import test from 'node:test';
import assert from 'node:assert/strict';
import {cell,text,element,mountBoundary} from '../src/runtime.mjs';
import {setupDOM,FakeNode,tick} from './fake-dom.mjs';

test('repeated unmount does not remove a node reused after ownership was released',async()=>{
  setupDOM();const target=new FakeNode('root'),reuse=new FakeNode('reuse'),value=cell('Before');let node;
  const stop=mountBoundary(target,(parent,owner)=>{node=text(parent,'span',()=>value.value,owner);});
  stop();reuse.append(node);stop();assert.deepEqual(reuse.childNodes,[node]);
  value.value='After';await tick();assert.equal(node.textContent,'Before');
});

test('a throwing unmount still releases ownership before a repeated call',()=>{
  setupDOM();const target=new FakeNode('root'),reuse=new FakeNode('reuse'),failure=new Error('cleanup');let node;
  const stop=mountBoundary(target,(parent,owner)=>{
    node=text(parent,'span',()=> 'Owned',owner);owner.own(()=>{throw failure;});
  });
  assert.throws(stop,error=>error===failure);assert.equal(target.childNodes.length,0);
  reuse.append(node);assert.doesNotThrow(stop);assert.deepEqual(reuse.childNodes,[node]);
});

test('reentrant unmount leaves DOM attached until every cleanup callback has run',()=>{
  setupDOM();const target=new FakeNode('root'),seen=[];let stop,node;
  stop=mountBoundary(target,(parent,owner)=>{
    node=text(parent,'span',()=> 'Owned',owner);
    owner.own(()=>seen.push(node.parentNode===target));
    owner.own(()=>stop());
  });
  stop();assert.deepEqual(seen,[true]);assert.equal(target.childNodes.length,0);stop();
});

function thrown(fn){
  let didThrow=false,value;
  try{fn();}catch(error){didThrow=true;value=error;}
  assert.equal(didThrow,true,'Expected cleanup to throw');return value;
}

for(const [label,failure] of [['undefined',undefined],['null',null],['zero',0],['false',false],['Error',new Error('owner')]]){
  test(`unmount preserves ${label} owner failures with and without a DOM failure`,()=>{
    for(const domFails of [false,true]){
      setupDOM();const target=new FakeNode('root'),prior=new FakeNode('prior'),seen=[],domFailure=new Error('remove');target.append(prior);
      let first,second;
      const stop=mountBoundary(target,(parent,owner)=>{
        first=element(parent,'span');second=element(parent,'small');
        owner.own(()=>{seen.push([first.parentNode===target,second.parentNode===target]);throw failure;});
      });
      if(domFails)first.remove=()=>{seen.push('remove');throw domFailure;};
      const error=thrown(stop);
      if(domFails){
        assert.ok(error instanceof AggregateError);assert.deepEqual(error.errors,[failure,domFailure]);
        assert.equal(error.message,'Multiple resource cleanup failures');assert.deepEqual(target.childNodes,[prior,first,second]);
      }else{assert.equal(error,failure);assert.deepEqual(target.childNodes,[prior]);}
      assert.deepEqual(seen[0],[true,true]);const count=seen.length;
      assert.doesNotThrow(stop);assert.equal(seen.length,count);
    }
  });
}

test('a DOM-only failure preserves identity and stops removal at the same node',()=>{
  setupDOM();const target=new FakeNode('root'),failure=new Error('remove');let first,second;
  const stop=mountBoundary(target,(parent)=>{first=element(parent,'span');second=element(parent,'small');});
  first.remove=()=>{throw failure;};
  assert.equal(thrown(stop),failure);assert.deepEqual(target.childNodes,[first,second]);assert.doesNotThrow(stop);
});

test('owner aggregates remain nested before a DOM failure',()=>{
  setupDOM();const target=new FakeNode('root'),one=new Error('one'),two=new Error('two'),dom=new Error('DOM');let node;
  const stop=mountBoundary(target,(parent,owner)=>{
    node=element(parent,'span');owner.own(()=>{throw one;});owner.own(()=>{throw two;});
  });
  node.remove=()=>{throw dom;};const error=thrown(stop);
  assert.ok(error instanceof AggregateError);assert.ok(error.errors[0] instanceof AggregateError);
  assert.deepEqual(error.errors[0].errors,[two,one]);assert.equal(error.errors[1],dom);assert.doesNotThrow(stop);
});
