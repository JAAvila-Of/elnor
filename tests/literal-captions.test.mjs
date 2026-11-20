import test from 'node:test';
import assert from 'node:assert/strict';
import {scope,literalText,literalButton} from '../src/runtime.mjs';
import {generate} from '../src/compiler.mjs';
import {parseSurface} from '../src/parser.mjs';
import {setupDOM,FakeNode} from './fake-dom.mjs';

for(const kind of ['text','button']){
  const make=(root,value,owner,run=()=>{})=>kind==='text'
    ?literalText(root,'span',value,owner):literalButton(root,value,run,owner);
  test(`${kind} literal caption preserves primitive normalization and Text identity`,()=>{
    setupDOM();const root=new FakeNode('root'),owner=scope();
    for(const value of ['hello',0,false,null]){
      const node=make(root,value,owner),content=node.firstChild;
      assert.equal(content.nodeType,3);assert.equal(node.textContent,String(value??''));
      assert.equal(node.firstChild,content);
    }
    owner.dispose();
  });
  test(`${kind} literal caption respects disposed native and foreign owners`,()=>{
    setupDOM();const root=new FakeNode('root'),native=scope();native.dispose();
    for(const owner of [native,{own(fn){fn();}}]){
      let clicks=0;const node=make(root,'hidden',owner,()=>clicks++);
      assert.equal(node.textContent,'');node.click();assert.equal(clicks,0);
    }
  });
  test(`${kind} literal caption honors an overridden native owner registration`,()=>{
    setupDOM();const root=new FakeNode('root'),owner=scope();
    owner.own=fn=>{fn();return fn;};
    const node=make(root,'hidden',owner);
    assert.equal(node.textContent,'');
    owner.dispose();
  });
  test(`${kind} literal caption keeps foreign cleanup and native listener lifetime`,()=>{
    setupDOM();const root=new FakeNode('root');
    for(const native of [true,false]){
      const callbacks=[],owner=native?scope():{own(fn){callbacks.push(fn);}};
      let clicks=0;const node=make(root,'caption',owner,()=>clicks++);
      node.click();assert.equal(clicks,kind==='button'?1:0);
      if(native)owner.dispose();else for(const fn of callbacks.reverse())fn();
      node.click();assert.equal(clicks,kind==='button'?1:0);
    }
  });
  test(`${kind} literal caption supports ownerless rendering and own-only proxies`,()=>{
    setupDOM();const root=new FakeNode('root');
    assert.equal(make(root,'ownerless',undefined).textContent,'ownerless');
    const callbacks=[],accesses=[],owner=new Proxy({own(fn){callbacks.push(fn);}},{get(target,key,receiver){
      accesses.push(key);assert.equal(key,'own');return Reflect.get(target,key,receiver);
    }});
    const node=make(root,'proxy',owner);assert.equal(node.textContent,'proxy');
    assert.ok(accesses.length>0);for(const callback of callbacks.reverse())callback();
    assert.equal(node.listeners.click?.length??0,0);
  });
  test(`${kind} literal caption preserves registration failures and LIFO cleanup`,()=>{
    setupDOM();const root=new FakeNode('root'),failure=new Error('registration');
    assert.throws(()=>make(root,'caption',{own(){throw failure;}}),error=>error===failure);
    const owner=scope(),order=[];owner.own(()=>order.push('first'));
    const node=make(root,'caption',owner);owner.own(()=>order.push(node.listeners.click?.length??0));
    owner.dispose();assert.deepEqual(order,[kind==='button'?1:0,'first']);
    assert.equal(node.listeners.click?.length??0,0);owner.dispose();
  });
}

test('compiler specializes only closed primitive literal captions',()=>{
  const ir=parseSurface('component App(value: string) {\n ui {\n section {\n h1 "Title"\n p (false)\n span value\n small ("a" + "b")\n button "Click" => console.log(value)\n }\n }\n}\n','App.eln');
  const output=generate(ir);
  assert.match(output,/runtime_literalText\([^\n]*"Title"/);
  assert.match(output,/runtime_literalText\([^\n]*false/);
  assert.match(output,/runtime_literalButton\([^\n]*"Click"/);
  assert.match(output,/runtime_text\([^\n]*\(\) => \([^\n]*\.value/);
  assert.match(output,/runtime_text\([^\n]*\(\) => \([^\n]*"a" \+ "b"/);
});

test('generated literals preserve escapes, template text, numbers and null without binding rewrites',async()=>{
  setupDOM();
  const source='component App() {\n ui {\n section {\n h1 "quote\\\" \\u0061"\n p `template`\n span 1e2\n small null\n strong (true)\n }\n }\n}\n';
  const output=generate(parseSurface(source,'Literals.eln'),{runtimeImport:new URL('../src/runtime.mjs',import.meta.url).href});
  const {mount}=await import('data:text/javascript,'+encodeURIComponent(output));
  const root=new FakeNode('root'),stop=mount(root,{});
  assert.equal(root.textContent,'quote" atemplate100true');stop();assert.equal(root.childNodes.length,0);
});

test('generated shadowed undefined and nonliteral expressions retain evaluation',async()=>{
  setupDOM();
  const source='component App(undefined: string) {\n ui {\n section {\n span undefined\n p ("a" + "b")\n }\n }\n}\n';
  const output=generate(parseSurface(source,'Dynamic.eln'),{runtimeImport:new URL('../src/runtime.mjs',import.meta.url).href});
  const {mount}=await import('data:text/javascript,'+encodeURIComponent(output));
  const root=new FakeNode('root'),stop=mount(root,{undefined:'defined'});
  assert.equal(root.textContent,'definedab');stop();assert.equal(root.childNodes.length,0);
});
