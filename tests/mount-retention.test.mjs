import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

test('a successful mounted disposer does not retain its emptied staging fragment',()=>{
  const runtime=process.env.ELNOR_RETENTION_RUNTIME_SOURCE?pathToFileURL(process.env.ELNOR_RETENTION_RUNTIME_SOURCE):new URL('../src/runtime.mjs',import.meta.url);
  const dom=new URL('./fake-dom.mjs',import.meta.url);
  const source=`import assert from 'node:assert/strict';
import {cell,mountBoundary,text} from ${JSON.stringify(runtime.href)};
import {setupDOM,FakeNode,tick} from ${JSON.stringify(dom.href)};
setupDOM();const host=new FakeNode('root'),value=cell('Before');
function stage(){
  const fragment=document.createDocumentFragment(),reference=new WeakRef(fragment);
  const dispose=mountBoundary(fragment,(parent,owner)=>{text(parent,'span',()=>value.value,owner);});
  host.append(...fragment.childNodes);return {reference,dispose};
}
const mounted=stage();
for(let i=0;i<12;i++){await new Promise(setImmediate);global.gc();}
await new Promise(setImmediate);
assert.equal(mounted.reference.deref(),undefined,'Mounted disposer retains a detached staging fragment');
value.value='After';await tick();assert.equal(host.textContent,'After');
mounted.dispose();assert.equal(host.childNodes.length,0);
`;
  const result=spawnSync(process.execPath,['--expose-gc','--input-type=module','-e',source],{encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(result.status,0,result.error?.stack??result.stderr??result.stdout);
});

test('regions registered after owner disposal do not retain detached anchors',()=>{
  const runtime=process.env.ELNOR_RETENTION_RUNTIME_SOURCE?pathToFileURL(process.env.ELNOR_RETENTION_RUNTIME_SOURCE):new URL('../src/runtime.mjs',import.meta.url);
  const dom=new URL('./fake-dom.mjs',import.meta.url);
  const source=`import assert from 'node:assert/strict';
import {scope,when,repeat} from ${JSON.stringify(runtime.href)};
import {setupDOM,FakeNode} from ${JSON.stringify(dom.href)};
setupDOM();const owner=scope(),references=[];owner.dispose();
const createComment=document.createComment;
document.createComment=value=>{const node=createComment(value);references.push(new WeakRef(node));return node;};
function stage(){
  const parent=new FakeNode('root');
  when(parent,()=>true,()=>{throw Error('disposed region ran');},owner);
  repeat(parent,()=>[],x=>x,()=>{throw Error('disposed region ran');},owner,true);
  assert.equal(parent.childNodes.length,0);
}
stage();document.createComment=createComment;
for(let i=0;i<12;i++){await new Promise(setImmediate);global.gc();}
await new Promise(setImmediate);
assert.ok(references.every(reference=>reference.deref()===undefined),'Disposed owner retains region anchors');
let ran=false;owner.own(()=>{ran=true;});assert.equal(ran,true);
`;
  const result=spawnSync(process.execPath,['--expose-gc','--input-type=module','-e',source],{encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(result.status,0,result.error?.stack??result.stderr??result.stdout);
});
