import test from 'node:test';
import assert from 'node:assert/strict';
import {scope,text,button} from '../src/runtime.mjs';
import {generate} from '../src/compiler.mjs';
import {parseSurface} from '../src/parser.mjs';
import {setupDOM,FakeNode} from './fake-dom.mjs';

for(const kind of ['text','button']){
  const make=(root,read,owner)=>kind==='text'?text(root,'span',read,owner):button(root,read,()=>{},owner);
  test(`${kind} honors immediate registration cleanup for native overrides and foreign owners`,()=>{
    setupDOM();const native=scope();native.own=fn=>{fn();return fn;};
    for(const owner of [native,{own(fn){fn();return fn;}}]){
      let reads=0;const node=make(new FakeNode('root'),()=>{reads++;return 'caption';},owner);
      assert.equal(reads,0);assert.equal(node.textContent,'');
      assert.equal(node.listeners.click?.length??0,0);
    }
    native.dispose();
  });
  test(`${kind} preserves a foreign registration failure before caption evaluation`,()=>{
    setupDOM();const failure=new Error('registration failed');let reads=0;
    assert.throws(()=>make(new FakeNode('root'),()=>{reads++;return 'caption';},{own(){throw failure;}}),error=>error===failure);
    assert.equal(reads,0);
  });
}

test('generated literal captions support foreign owners exposing only own',async()=>{
  setupDOM();const root=new FakeNode('root'),cleanups=[],accesses=[];
  const owner=new Proxy({own(fn){cleanups.push(fn);return fn;}},{get(target,key,receiver){
    accesses.push(key);assert.equal(key,'own');return Reflect.get(target,key,receiver);
  }});
  const source='component App() {\n ui {\n section {\n h1 "Title"\n button "Click" => console.log("click")\n }\n }\n}\n';
  const generated=generate(parseSurface(source,'App.eln'),{runtimeImport:new URL('../src/runtime.mjs',import.meta.url).href});
  const {renderOwned}=await import('data:text/javascript,'+encodeURIComponent(generated));
  renderOwned(root,{}, {}, {},owner);
  assert.equal(root.descendants('h1')[0].textContent,'Title');
  const node=root.descendants('button')[0];assert.equal(node.textContent,'Click');assert.equal(node.listeners.click.length,1);
  assert.ok(accesses.length>0&&accesses.every(key=>key==='own'));
  for(const cleanup of cleanups.reverse())cleanup();
  assert.equal(node.listeners.click.length,0);
});
