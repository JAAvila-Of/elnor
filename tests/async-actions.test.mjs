import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';
import {generate} from '../src/compiler.mjs';
import {analyzeRegion} from '../src/region-compiler.mjs';
import {typecheckGraph} from '../src/checker.mjs';
import {setupDOM,FakeNode,findInput,findButton,tick} from './fake-dom.mjs';

const example=new URL('../examples/async-search/AsyncSearch.eln',import.meta.url);
const raw=`component Raw(request: (query: string) => Promise<string>, observed: (value: string) => void) {
 state query = "first";
 state result = "";
 state pending = false;
 action async search() {
  pending = true;
  try { result = await request(query); observed(query); }
  finally { pending = false; }
 }
 ui {
 section {
 input "Query" <-> query
 button "Search" => search()
 p result
 small (pending ? "Loading" : "Idle")
 }
 }
}`;
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function provider(cooperative=false){const calls=[];return {calls,request(query,signal){const call={query,signal,...deferred()};calls.push(call);if(cooperative)signal.addEventListener('abort',()=>call.reject(new DOMException('Cancelled','AbortError')),{once:true});return call.promise;}};}
function directory(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-async-actions-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elnor-async-actions-'));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
async function mounted(t,{source,service=provider(),lifetime=new AbortController()}={}){
 const dir=directory(t),sourceText=source??fs.readFileSync(example,'utf8'),ir=parseSurface(sourceText,path.join(dir,'Main.eln')),output=path.join(dir,'Main.mjs');
 fs.writeFileSync(output,generate(ir,{runtimeImport:new URL('../src/runtime.mjs',import.meta.url).href}));
 setupDOM();const root=new FakeNode('root'),events=[],observed=[],{mount}=await import(pathToFileURL(output));
 const stop=mount(root,{request:service.request,lifetime:lifetime.signal,observed:v=>observed.push(v)},{loaded:v=>events.push(v)});t.after(()=>{lifetime.abort();stop();});
 return {root,stop,service,lifetime,events,observed,ir,async query(value){const input=findInput(root,'Query');input.value=value;input.dispatch('input');await tick();},search(){if(source)findButton(root,'Search').click();else root.descendants('form')[0].listeners.submit[0]({preventDefault(){}});},state(){return {result:root.descendants('p')[0].textContent,status:root.descendants('small')[0].textContent,error:root.descendants('strong')[0]?.textContent??''};}};
}

test('async actions keep the sequential region backend as general actions',()=>{const plan=analyzeRegion(parseSurface(raw,'Raw.eln'));assert.equal(plan.eligible,true);assert.equal(plan.mode,'sequential');assert.ok(plan.actions.some(action=>action.kind==='opaque-action'&&action.async));});
test('unguarded reads after await observe current state rather than invocation state',async t=>{const f=await mounted(t,{source:raw});f.search();await f.query('edited');assert.equal(f.service.calls[0].query,'first');f.service.calls[0].resolve('done');await tick();assert.deepEqual(f.observed,['edited']);});
test('unguarded async actions allow an older response to overwrite the newest result',async t=>{const f=await mounted(t,{source:raw});f.search();await f.query('second');f.search();f.service.calls[1].resolve('new');await tick();f.service.calls[0].resolve('old');await tick();assert.equal(f.state().result,'old');});
test('an unguarded older finally clears pending while a newer action is unresolved',async t=>{const f=await mounted(t,{source:raw});f.search();f.search();f.service.calls[0].resolve('old');await tick();assert.equal(f.state().status,'Idle');f.service.calls[1].resolve('new');await tick();});
test('disposal alone does not cancel arbitrary promises or later application effects',async t=>{const f=await mounted(t,{source:raw});f.search();f.stop();f.service.calls[0].resolve('late');await tick();assert.equal(f.root.childNodes.length,0);assert.deepEqual(f.observed,['first']);});

test('the explicit async search example typechecks through the existing DOM profile',t=>{const dir=directory(t),file=path.join(dir,'AsyncSearch.eln'),ir=parseSurface(fs.readFileSync(example,'utf8'),file);assert.deepEqual(typecheckGraph(new Map([[file,ir]]),path.join(dir,'check')),[]);});
test('search sets pending synchronously and a repeated submit replaces rather than drops work',async t=>{const f=await mounted(t);await f.query('one');f.search();assert.equal(f.service.calls.length,1);f.search();assert.equal(f.service.calls.length,2);assert.equal(f.service.calls[0].signal.aborted,true);await tick();assert.equal(f.state().status,'Loading');f.service.calls[1].resolve('two');f.service.calls[0].resolve('one');await tick();});
test('an obsolete completion cannot clear the current loading state',async t=>{const f=await mounted(t);await f.query('one');f.search();await f.query('two');f.search();f.service.calls[0].resolve('obsolete');await tick();assert.deepEqual(f.state(),{result:'',status:'Loading',error:''});f.service.calls[1].resolve('current');await tick();assert.deepEqual(f.events,['current']);assert.equal(f.state().status,'Idle');});
test('a late provider ignoring abort cannot overwrite a newer result',async t=>{const f=await mounted(t);await f.query('one');f.search();await f.query('two');f.search();f.service.calls[1].resolve('new');await tick();f.service.calls[0].resolve('old');await tick();assert.equal(f.state().result,'new');assert.deepEqual(f.events,['new']);});
test('an obsolete rejection is handled without setting the current error',async t=>{const f=await mounted(t);await f.query('one');f.search();f.search();f.service.calls[0].reject(Error('obsolete'));await tick();assert.equal(f.state().error,'');assert.equal(f.state().status,'Loading');f.service.calls[1].resolve('ok');await tick();});
test('a current failure is visible and retry clears it before succeeding',async t=>{const f=await mounted(t);await f.query('one');f.search();f.service.calls[0].reject(Error('offline'));await tick();assert.deepEqual(f.state(),{result:'',status:'Idle',error:'Search failed'});f.search();await tick();assert.equal(f.state().error,'');f.service.calls[1].resolve('recovered');await tick();assert.equal(f.state().result,'recovered');});
test('a synchronous provider error is caught by the same action policy',async t=>{const f=await mounted(t,{service:{request(){throw Error('sync');}}});await f.query('one');f.search();await tick();assert.equal(f.state().error,'Search failed');assert.equal(f.state().status,'Idle');});
test('Cancel aborts a cooperating provider without presenting an error',async t=>{const f=await mounted(t,{service:provider(true)});await f.query('one');f.search();findButton(f.root,'Cancel').click();await tick();assert.equal(f.service.calls[0].signal.aborted,true);assert.equal(f.state().status,'Idle');assert.equal(f.state().error,'');assert.deepEqual(f.events,[]);});
test('Cancel also discards a result from a provider that ignores its signal',async t=>{const f=await mounted(t);await f.query('one');f.search();findButton(f.root,'Cancel').click();f.service.calls[0].resolve('late');await tick();assert.equal(f.state().result,'');assert.deepEqual(f.events,[]);});
test('managed reset invalidates the request and clears fields, result and errors',async t=>{const f=await mounted(t);await f.query('one');f.search();f.service.calls[0].resolve('previous');await tick();f.search();let prevented=false;f.root.descendants('form')[0].listeners.reset[0]({preventDefault(){prevented=true;}});f.service.calls[1].resolve('late');await tick();assert.equal(prevented,true);assert.equal(findInput(f.root,'Query').value,'');assert.deepEqual(f.state(),{result:'',status:'Idle',error:''});assert.deepEqual(f.events,['previous']);});
test('host abort before disposal aborts the signal and prevents late completion effects',async t=>{const f=await mounted(t);await f.query('one');f.search();f.lifetime.abort();f.stop();f.service.calls[0].resolve('late');await tick();assert.equal(f.service.calls[0].signal.aborted,true);assert.deepEqual(f.events,[]);assert.equal(f.root.childNodes.length,0);});
test('an already ended host lifetime starts no request',async t=>{const lifetime=new AbortController();lifetime.abort();const f=await mounted(t,{lifetime});await f.query('one');f.search();await tick();assert.equal(f.service.calls.length,0);assert.equal(f.state().status,'Idle');});
test('search snapshots its input before await without replacing later user edits',async t=>{const f=await mounted(t);await f.query('  first  ');f.search();await f.query('new draft');f.service.calls[0].resolve('first result');await tick();assert.equal(f.service.calls[0].query,'first');assert.equal(findInput(f.root,'Query').value,'new draft');assert.equal(f.state().result,'first result');});
test('two mounted instances have independent request identities and cancellation',async t=>{const a=await mounted(t),b=await mounted(t);await a.query('a');await b.query('b');a.search();b.search();findButton(a.root,'Cancel').click();assert.equal(b.service.calls[0].signal.aborted,false);a.service.calls[0].resolve('ignored');b.service.calls[0].resolve('b result');await tick();assert.deepEqual(a.events,[]);assert.deepEqual(b.events,['b result']);});
test('a blank query starts no request and presents a local validation message',async t=>{const f=await mounted(t);await f.query('  ');f.search();await tick();assert.equal(f.service.calls.length,0);assert.equal(f.state().error,'Enter a query');assert.equal(f.state().status,'Idle');});
test('Cancel between promise settlement and its continuation still prevents a commit',async t=>{const f=await mounted(t);await f.query('one');f.search();f.service.calls[0].resolve('settled');findButton(f.root,'Cancel').click();await tick();assert.deepEqual(f.events,[]);assert.equal(f.state().result,'');});
