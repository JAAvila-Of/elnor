import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {scope} from '../src/runtime.mjs';

test('reentrant disposal and late registration preserve LIFO and error order',()=>{
  const owner=scope(),calls=[],first=new Error('first'),late=new Error('late');
  owner.own(()=>{calls.push('first');throw first;});
  owner.own(()=>{
    calls.push('second');owner.dispose();
    owner.own(()=>{calls.push('late');throw late;});
  });
  assert.throws(()=>owner.dispose(),error=>{
    assert.ok(error instanceof AggregateError);assert.deepEqual(error.errors,[late,first]);return true;
  });
  assert.deepEqual(calls,['second','late','first']);owner.dispose();
  assert.deepEqual(calls,['second','late','first']);
  owner.own(()=>calls.push('after'));assert.equal(calls.at(-1),'after');
});

test('scope cleanup callbacks retain their unbound receiver',()=>{
  const owner=scope(),receivers=[];
  owner.own(function(){receivers.push(this);});
  owner.own(function(){receivers.push(this);});
  owner.dispose();owner.own(function(){receivers.push(this);});
  assert.deepEqual(receivers,[undefined,undefined,undefined]);
});

for(const throws of [false,true])test(`a retained scope releases callback captures after ${throws?'throwing':'normal'} disposal`,()=>{
  const runtime=new URL('../src/runtime.mjs',import.meta.url).href;
  const source=`import assert from 'node:assert/strict';
import {scope} from ${JSON.stringify(runtime)};
function capture(value,failure){return ()=>{globalThis.lastValue=value.value;if(failure)throw failure;};}
function register(owner,failure){const value={value:41},reference=new WeakRef(value);owner.own(capture(value,failure));return reference;}
async function collect(){for(let i=0;i<12;i++){await new Promise(setImmediate);global.gc();}await new Promise(setImmediate);}
const owner=scope(),failure=${throws?'new Error("cleanup")':'null'},reference=register(owner,failure);
await collect();assert(reference.deref(),'Live callback positive control');reference.deref().value=42;
${throws?'assert.throws(()=>owner.dispose(),error=>error===failure);':'owner.dispose();'}
assert.equal(globalThis.lastValue,42);await collect();
assert.equal(reference.deref(),undefined,'Disposed owner retains callback payload');
owner.dispose();let late=false;owner.own(()=>{late=true;});assert(late);
`;
  const result=spawnSync(process.execPath,['--max-old-space-size=192','--expose-gc','--input-type=module','-e',source],{encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(result.status,0,result.error?.stack??result.stderr??result.stdout);
});
