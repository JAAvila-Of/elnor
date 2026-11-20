import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';import {generate} from '../src/compiler.mjs';import {analyzeRegion,analyzeSequentialRegion} from '../src/region-compiler.mjs';import {formatSurface,applyFormatEdits} from '../src/formatter.mjs';import {createSurfaceLanguageService} from '../src/language-service.mjs';import {typecheckGraph} from '../src/checker.mjs';import * as runtime from '../src/runtime.mjs';
import {setupDOM,FakeNode,tick,findButton} from './fake-dom.mjs';
const base=`component Checklist() {
 state completed = false;
 state locked = false;
 state visible = true;
 action toggle() { completed = !completed; }
 action hide() { visible = false; }
 ui {
 section {
 checkbox class=("task-toggle") disabled=(locked) "Completed <img src=x>" <-> completed
 p completed
 button "Toggle" => toggle()
 button "Hide" => hide()
 }
 }
}`;
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-checkbox-contract-'));t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('elnor-checkbox-contract-'));fs.rmSync(root,{recursive:true,force:true});});return root;}
function service(t,source=base){const root=fixture(t),file=path.join(root,'Checklist.eln'),s=createSurfaceLanguageService({root});t.after(()=>s.dispose());s.open(file,source);return {root,file,s};}
async function mounted(t,source=base,backend='general'){setupDOM();const dir=fixture(t),file=path.join(dir,'Checklist.eln'),ir=parseSurface(source,file),plan=backend==='sequential'?analyzeSequentialRegion(ir):analyzeRegion(ir);if(backend!=='general')assert.ok(plan.eligible,JSON.stringify(plan));const code=generate(ir,{runtimeImport:new URL('../src/runtime.mjs',import.meta.url).href,...(backend==='general'?{}:{regionRuntimeImport:new URL('../src/region-runtime.mjs',import.meta.url).href,regionPlan:plan})}),output=path.join(dir,'Checklist.mjs');fs.writeFileSync(output,code);const {mount}=await import(pathToFileURL(output)),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);return {root,stop,code,node:root.descendants('input')[0]};}
test('checkbox parses plain and prefixed forms with exact UTF-16 binding ranges',()=>{
 for(const text of [base,base.replace(' class=("task-toggle") disabled=(locked)',''),base.replaceAll('\n','\r\n').replace('state completed','// emoji 😀\r\n state completed')]){const ir=parseSurface(text,'Checklist.eln'),node=ir.ui[0].children[0];assert.equal(node.tag,'checkbox');assert.equal(node.kind,'input');assert.equal(text.slice(node.bindingSpan.start,node.bindingSpan.start+node.bindingSpan.length),'completed');}
});
test('checkbox formatting preserves spelling and is idempotent',()=>{const result=formatSurface(base);assert.deepEqual(result.diagnostics,[]);const next=applyFormatEdits(base,result.edits);assert.match(next,/checkbox class=/);assert.deepEqual(formatSurface(next).edits,[]);});
test('checkbox rejects nested, immutable and missing bindings and unsupported ARIA',()=>{
 for(const source of [base.replace('<-> completed','<-> task.completed'),base.replace('state completed','calc completed'),base.replace('"Completed <img src=x>" <-> completed','<-> completed'),base.replace('class=("task-toggle")','aria-pressed=(completed)')])assert.throws(()=>parseSurface(source,'Checklist.eln'));
});
test('checkbox checks reads and writes, including optional and narrowed literal booleans',t=>{
 const {s,file,root}=service(t);
 for(const declaration of ['state completed = "false";','state completed = 1;','state completed: boolean | undefined = undefined;','state completed: false = false;']){const source=base.replace('state completed = false;',declaration).replace('completed = !completed;','');s.open(file,source);const binding=source.lastIndexOf('<-> completed')+4;assert.ok(s.diagnostics(file).some(d=>d.start===binding&&source.slice(d.start,d.start+d.length)==='completed'),declaration);assert.ok(typecheckGraph(new Map([[file,parseSurface(source,file)]]),path.join(root,'check')).length,declaration);}
 s.open(file,base);assert.deepEqual(s.diagnostics(file),[]);
});
test('checkbox binding resolves state and applies rename without duplicate source edits',t=>{const {s,file}=service(t);const at=base.lastIndexOf('<-> completed')+4;assert.ok(s.definitions(file,at).some(d=>d.start===base.indexOf('completed =')));s.applyRename(s.rename(file,at,'done'));assert.match(s.text(file),/<-> done/);assert.deepEqual(s.diagnostics(file),[]);});
test('checkbox regional plans preserve boolean property and change event explicitly',()=>{const ir=parseSurface(base,'Checklist.eln');for(const plan of [analyzeRegion(ir),analyzeSequentialRegion(ir)]){assert.equal(plan.eligible,true);assert.ok(plan.bindings.some(b=>b.kind==='checked'));assert.ok(plan.events.some(e=>e.type==='change'));assert.ok(plan.nodes.some(n=>n.type==='checkbox'));}});
for(const backend of ['general','blueprint','sequential']){
test(backend+' checkbox mounts native checked state and a literal wrapping label',async t=>{const {root,node}=await mounted(t,base,backend);assert.equal(node.type,'checkbox');assert.equal(node.checked,false);assert.equal(node.className,'task-toggle');assert.equal(node.disabled,false);assert.equal(node.parentNode.tag,'label');assert.deepEqual(node.parentNode.childNodes.map(n=>n.tag),['input','span']);assert.equal(node.parentNode.descendants('span')[0].textContent,'Completed <img src=x>');assert.equal(root.descendants('img').length,0);});
test(backend+' checkbox change writes boolean checked instead of string value',async t=>{const {root,node}=await mounted(t,base,backend);node.value='misleading';node.checked=true;node.dispatch('change');await tick();assert.equal(root.descendants('p')[0].textContent,'true');node.checked=false;node.dispatch('change');await tick();assert.equal(root.descendants('p')[0].textContent,'false');});
test(backend+' checkbox input event alone does not write and programmatic state updates keep identity',async t=>{const {root,node}=await mounted(t,base,backend);node.checked=true;node.dispatch('input');await tick();assert.equal(root.descendants('p')[0].textContent,'false');findButton(root,'Toggle').click();await tick();assert.equal(root.descendants('input')[0],node);assert.equal(node.checked,true);findButton(root,'Toggle').click();await tick();assert.equal(node.checked,false);});
test(backend+' checkbox disposal removes listener and rejects captured late callback',async t=>{const {root,node,stop}=await mounted(t,base,backend);const callback=node.listeners.change[0];stop();stop();assert.equal(node.listeners.change.length,0);node.checked=true;callback();await tick();assert.equal(root.childNodes.length,0);});
test(backend+' conditional checkbox removal cancels queued updates and late writes',async t=>{const line=base.split('\n').find(s=>s.includes('checkbox class='));const {root,node}=await mounted(t,base.replace(line,'if visible {\n'+line+'\n }'),backend);const captured=node.listeners.change[0];findButton(root,'Toggle').click();findButton(root,'Hide').click();await tick();assert.equal(root.descendants('input').length,0);assert.equal(node.listeners.change.length,0);node.checked=false;captured();await tick();assert.equal(root.descendants('p')[0].textContent,'true');});
}
test('checkbox any escape fails at runtime without leaked listeners after owner cleanup',()=>{setupDOM();const root=new FakeNode('root'),owner=runtime.scope();assert.throws(()=>runtime.checkbox(root,'Bad',()=> 'false',()=>assert.fail(),owner),/ELN-CHECKED-TYPE/);owner.dispose();assert.equal(root.descendants('input')[0].listeners.change.length,0);});
test('checkbox unchanged boolean does not rewrite checked',()=>{setupDOM();const root=new FakeNode('root'),owner=runtime.scope(),state=runtime.cell(false),node=runtime.checkbox(root,'Stable',()=>state.value,()=>{},owner);let writes=0,current=node.checked;Object.defineProperty(node,'checked',{get:()=>current,set:v=>{writes++;current=v;}});state.value=false;assert.equal(writes,0);owner.dispose();});

test('checkbox property completion supplies host-specific snippets and exact replacement ranges',t=>{
 const source=base.replace(/checkbox[^\n]+<-> completed/,'checkbox di'),{s,file}=service(t,source),at=source.indexOf('checkbox di')+11;
 const items=s.completions(file,at),entry=items.find(i=>i.name==='disabled');assert.ok(entry);assert.equal(entry.insertText,'disabled=(${1})');assert.equal(source.slice(entry.replacementSpan.start,entry.replacementSpan.start+entry.replacementSpan.length),'di');
 const next=source.slice(0,entry.replacementSpan.start)+entry.insertText.replace('${1}','locked')+' "Done" <-> completed'+source.slice(entry.replacementSpan.start+entry.replacementSpan.length);assert.doesNotThrow(()=>parseSurface(next,file));
 s.open(file,source.replace('checkbox di','checkbox ar'));assert.ok(!s.completions(file,at).some(i=>i.name.startsWith('aria-')));
});
test('checkbox empty and unfinished property values retain TS help without weakening rename or parse',t=>{
 const {s,file}=service(t);
 for(const [line,token,name] of [['checkbox disabled=(flags.','flags.','busy'],['checkbox disabled=() "Done" <-> completed','disabled=(','locked']]){
  const source=base.replace('state locked = false;','state locked = false;\n state flags = {busy:false};').replace(/checkbox[^\n]+<-> completed/,line),at=source.indexOf(token)+token.length;s.open(file,source);
  assert.ok(s.completions(file,at).some(i=>i.name===name),line);assert.equal(s.text(file),source);assert.ok(s.diagnostics(file).some(d=>String(d.code).startsWith('ELN-')));assert.throws(()=>parseSurface(source,file));assert.throws(()=>s.rename(file,source.indexOf('locked ='),'busy'),/incomplete|invalid/);
 }
});
