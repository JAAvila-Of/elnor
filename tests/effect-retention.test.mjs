import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

for(const kind of ['constant','becomes-inert','failed-empty-run'])test(`retained owners release successful inert readers: ${kind}`,()=>{
 const runtime=new URL('../src/runtime.mjs',import.meta.url).href;
 const source=`import assert from 'node:assert/strict';
import {cell,effect,scope} from ${JSON.stringify(runtime)};
const kind=${JSON.stringify(kind)},queue=[];globalThis.queueMicrotask=fn=>queue.push(fn);
const flush=()=>{const errors=[];while(queue.length){try{queue.shift()();}catch(e){errors.push(e);}}return errors;};
function capture(value,source,flag,failure){return ()=>{globalThis.lastValue=value.value;if(flag.throws)throw failure;if(source&&flag.read)source.value;};}
function register(owner,source,flag,failure){const value={value:42},reference=new WeakRef(value);effect(capture(value,source,flag,failure),owner);return reference;}
async function collect(){for(let i=0;i<12;i++){await new Promise(setImmediate);global.gc();}await new Promise(setImmediate);}
const owner=scope(),value=cell(0),flag={read:true,throws:false},failure=new Error('reader');
const control=register(owner,value,{read:true,throws:false},null);
const reference=register(owner,kind==='constant'?null:value,flag,failure);assert.equal(globalThis.lastValue,42);
if(kind!=='constant'){
 await collect();assert(reference.deref(),'Initial reactive positive control');flag.read=false;flag.throws=kind==='failed-empty-run';
 value.value=1;assert.deepEqual(flush(),flag.throws?[failure]:[]);
}
await collect();assert(control.deref(),'Reactive positive control');
assert.equal(reference.deref()!==undefined,kind==='failed-empty-run','Successful inert reader must release its capture');
owner.dispose();await collect();assert.equal(reference.deref(),undefined);assert.equal(control.deref(),undefined);
owner.dispose();let late=false;owner.own(()=>{late=true;});assert(late);
`;
 const result=spawnSync(process.execPath,['--max-old-space-size=192','--expose-gc','--input-type=module','-e',source],{encoding:'utf8',timeout:10000,windowsHide:true});
 assert.equal(result.status,0,result.error?.stack??result.stderr??result.stdout);
});
