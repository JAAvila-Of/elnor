import test from 'node:test';
import assert from 'node:assert/strict';
import {cell,scope,repeat,text} from '../src/runtime.mjs';
import {setupDOM,FakeNode,tick} from './fake-dom.mjs';

function list(values,{parts=1}={}){
  setupDOM();const root=new FakeNode('root'),owner=scope(),model=cell({rows:values,selected:0});
  let moves=0,disposed=[];const insert=root.insertBefore.bind(root);
  root.insertBefore=(node,anchor)=>{moves++;insert(node,anchor);};
  repeat(root,()=>model.value.rows,row=>row.id,(item,parent,child)=>{
    for(let part=0;part<parts;part++)text(parent,'span',()=>item.value.label+':'+part,child);
    const id=item.value.id;child.own(()=>disposed.push(id));
  },owner);
  moves=0;return {root,owner,model,disposed,get moves(){return moves;},reset(){moves=0;}};
}
const rows=n=>Array.from({length:n},(_,id)=>({id,label:String(id)}));

test('selection and label updates preserve keyed DOM without relocating unchanged rows',async()=>{
  const l=list(rows(100)),nodes=[...l.root.childNodes];
  l.model.value={...l.model.value,selected:50};await tick();
  assert.equal(l.moves,0,'selection must not move list nodes');
  l.model.value={...l.model.value,rows:l.model.value.rows.map((row,i)=>i%10===0?{...row,label:row.label+'!'}:row)};
  await tick();assert.equal(l.moves,0,'label updates must not move list nodes');
  assert.deepEqual(l.root.childNodes,nodes);assert.equal(nodes[0].textContent,'0!:0');
  l.owner.dispose();assert.equal(l.root.childNodes.length,0);
});

test('swapping distant keyed rows relocates only the two displaced rows',async()=>{
  const l=list(rows(100)),nodes=l.root.descendants('span');
  const next=[...l.model.value.rows];[next[0],next[99]]=[next[99],next[0]];
  l.model.value={rows:next,selected:0};await tick();
  assert.equal(l.moves,2);assert.equal(l.root.descendants('span')[0],nodes[99]);
  assert.equal(l.root.descendants('span')[99],nodes[0]);l.owner.dispose();
});

test('append/removal keep surviving multi-node rows stationary and dispose removed rows once',async()=>{
  const l=list(rows(5),{parts:2}),nodes=l.root.descendants('span');
  l.model.value={rows:[...l.model.value.rows,{id:5,label:'5'}],selected:0};await tick();
  assert.equal(l.moves,2);l.reset();
  l.model.value={rows:l.model.value.rows.filter(row=>row.id!==2),selected:0};await tick();
  assert.equal(l.moves,0);assert.deepEqual(l.disposed,[2]);
  assert.equal(l.root.descendants('span')[0],nodes[0]);
  assert.deepEqual(l.root.descendants('span').map(n=>n.textContent),['0:0','0:1','1:0','1:1','3:0','3:1','4:0','4:1','5:0','5:1']);
  l.owner.dispose();assert.equal(l.root.childNodes.length,0);
  assert.equal(l.disposed.length,6);assert.equal(new Set(l.disposed).size,6);
});

test('all five-key permutations retain identity and multi-node row order',async()=>{
  const values=rows(5),l=list(values,{parts:2}),nodes=l.root.descendants('span');
  function* permutations(values){if(!values.length){yield [];return;}for(let i=0;i<values.length;i++)for(const tail of permutations(values.filter((_,j)=>j!==i)))yield [values[i],...tail];}
  for(const order of permutations(values)){
    l.model.value={rows:order,selected:0};await tick();
    const actual=l.root.descendants('span');
    assert.deepEqual(actual.map(n=>n.textContent),order.flatMap(row=>[row.label+':0',row.label+':1']));
    for(let i=0;i<order.length;i++){assert.equal(actual[2*i],nodes[order[i].id*2]);assert.equal(actual[2*i+1],nodes[order[i].id*2+1]);}
  }
  assert.deepEqual(l.disposed,[]);l.owner.dispose();assert.equal(l.root.childNodes.length,0);
});

test('in-place array edits with mixed insertion/removal retain surviving keyed groups',async()=>{
  const values=rows(5),l=list(values,{parts:2}),nodes=l.root.descendants('span');
  const next=[values[4],{id:8,label:'8'},values[1],values[0]];
  values.splice(0,values.length,...next);l.model.value={rows:values,selected:1};await tick();
  const actual=l.root.descendants('span');
  assert.deepEqual(actual.map(n=>n.textContent),['4:0','4:1','8:0','8:1','1:0','1:1','0:0','0:1']);
  assert.equal(actual[0],nodes[8]);assert.equal(actual[4],nodes[2]);assert.equal(actual[6],nodes[0]);
  assert.deepEqual(l.disposed,[2,3]);l.owner.dispose();assert.equal(l.root.childNodes.length,0);
  assert.equal(l.disposed.length,6);assert.equal(new Set(l.disposed).size,6);
});
