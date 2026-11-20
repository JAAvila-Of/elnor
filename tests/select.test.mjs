import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';import {generate} from '../src/compiler.mjs';import {analyzeRegion,analyzeSequentialRegion} from '../src/region-compiler.mjs';import {formatSurface,applyFormatEdits} from '../src/formatter.mjs';import {createSurfaceLanguageService} from '../src/language-service.mjs';import {typecheckGraph} from '../src/checker.mjs';import * as runtime from '../src/runtime.mjs';import {setupDOM,FakeNode,tick,findButton} from './fake-dom.mjs';
const header='select class=("priority") disabled=(locked) "Priority <img src=x>" <-> priority {';
const base=`component Choice() {
 state priority: "normal" | "high" = "normal";
 state locked = false;
 state visible = true;
 action chooseHigh() { priority = "high"; }
 action reset() { priority = "normal"; }
 action hide() { visible = false; }
 ui {
 section {
 ${header}
 option "Normal {value}" => "normal"
 option "High <img src=x>" => "high"
 }
 p priority
 button "High" => chooseHigh()
 button "Reset" => reset()
 button "Hide" => hide()
 }
 }
}`;
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-select-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elnor-select-'));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
function service(t){const root=fixture(t),file=path.join(root,'Choice.eln'),s=createSurfaceLanguageService({root});t.after(()=>s.dispose());return {root,file,s};}
async function compile(t,source,backend){const dir=fixture(t),file=path.join(dir,'Choice.eln'),ir=parseSurface(source,file),plan=backend==='sequential'?analyzeSequentialRegion(ir):analyzeRegion(ir);if(backend!=='general'){assert.ok(plan.eligible,JSON.stringify(plan));assert.equal(plan.mode,backend);}const code=generate(ir,{runtimeImport:new URL('../src/runtime.mjs',import.meta.url).href,...(backend==='general'?{}:{regionRuntimeImport:new URL('../src/region-runtime.mjs',import.meta.url).href,regionPlan:plan})}),output=path.join(dir,'Choice.mjs');fs.writeFileSync(output,code);return (await import(pathToFileURL(output))).mount;}
async function mounted(t,source=base,backend='general'){setupDOM();const mount=await compile(t,source,backend),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);return {root,stop,node:root.descendants('select')[0]};}
test('select preserves labels, option values and UTF-16 spans in plain/prefixed CRLF sources',()=>{for(const text of [base,base.replace('class=("priority") disabled=(locked) ',''),base.replaceAll('\n','\r\n').replace('state locked','// 😀\r\n state locked')]){const node=parseSurface(text,'Choice.eln').ui[0].children[0];assert.equal(node.kind,'input');assert.equal(node.tag,'select');assert.equal(text.slice(node.bindingSpan.start,node.bindingSpan.start+node.bindingSpan.length),'priority');assert.deepEqual(node.options.map(o=>o.value),['normal','high']);for(const o of node.options)assert.equal(JSON.parse(text.slice(o.valueSpan.start,o.valueSpan.start+o.valueSpan.length)),o.value);}});
test('select rejects nonliteral or duplicate options, nested content and immutable bindings',()=>{for(const text of [base.replace('=> "high"','=> "normal"'),base.replace('=> "high"','=> 42'),base.replace('option "Normal {value}" => "normal"','p "Wrong"'),base.replace('option "Normal {value}" => "normal"','each x in [] by x {\n }'),base.replace('state priority: "normal" | "high" = "normal";','calc priority = "normal";')])assert.throws(()=>parseSurface(text,'Choice.eln'),e=>String(e.code).startsWith('ELN-SELECT-')||e.code==='ELN-SEM-BIND');assert.throws(()=>parseSurface(base.replace('<-> priority {','<-> model.priority {'),'Choice.eln'));});
test('select formatter retains option text and braces and remains idempotent',()=>{for(const source of [base,base.replaceAll('\n','\r\n')]){const f=formatSurface(source);assert.deepEqual(f.diagnostics,[]);const next=applyFormatEdits(source,f.edits);assert.match(next,/option "Normal \{value\}" => "normal"/);assert.deepEqual(formatSurface(next).edits,[]);assert.deepEqual(parseSurface(next,'Choice.eln').ui[0].children[0].options.map(o=>o.value),['normal','high']);}});
test('select reads string and writes the option-value union with exact error spans',t=>{const {root,file,s}=service(t);for(const decl of ['state priority = 42;','state priority: "normal" = "normal";','state priority: string | undefined = undefined;']){const source=base.replace('state priority: "normal" | "high" = "normal";',decl).replace('priority = "high";','').replace('priority = "normal";','');s.open(file,source);const at=source.lastIndexOf('<-> priority')+4;assert.ok(s.diagnostics(file).some(d=>d.start===at&&source.slice(d.start,d.start+d.length)==='priority'),decl);assert.ok(typecheckGraph(new Map([[file,parseSurface(source,file)]]),path.join(root,'check')).length,decl);}for(const source of [base,base.replace('state priority: "normal" | "high"','state priority')]){s.open(file,source);assert.deepEqual(s.diagnostics(file),[]);}});
test('select binding supports original definitions and rename without changing option literals',t=>{const {s,file}=service(t);s.open(file,base);const at=base.lastIndexOf('<-> priority')+4;assert.ok(s.definitions(file,at).some(d=>d.start===base.indexOf('priority:')));s.applyRename(s.rename(file,at,'selection'));assert.match(s.text(file),/<-> selection/);assert.match(s.text(file),/=> "normal"/);assert.deepEqual(s.diagnostics(file),[]);});
test('select header completion works with its option block and balanced empty property value',t=>{const {s,file}=service(t),source=base.replace('class=("priority") disabled=(locked)','di');s.open(file,source);const at=source.indexOf('select di')+9,item=s.completions(file,at).find(i=>i.name==='disabled');assert.ok(item);assert.equal(item.insertText,'disabled=(${1})');assert.equal(source.slice(item.replacementSpan.start,item.replacementSpan.start+item.replacementSpan.length),'di');const empty=base.replace('disabled=(locked)','disabled=()');s.open(file,empty);assert.ok(s.completions(file,empty.indexOf('disabled=(')+10).some(i=>i.name==='locked'));assert.equal(s.text(file),empty);assert.throws(()=>s.rename(file,empty.indexOf('priority:'),'selection'),/invalid|incomplete/);});
for(const backend of ['general','blueprint','sequential']){
 test(backend+' select mounts all options before selecting the initial state',async t=>{const {root,node}=await mounted(t,base,backend);assert.ok(node);assert.equal(node.parentNode.tag,'label');assert.deepEqual(node.parentNode.childNodes.map(n=>n.tag),['span','select']);assert.equal(node.parentNode.childNodes[0].textContent,'Priority <img src=x>');assert.equal(node.value,'normal');assert.equal(node.selectedIndex,0);assert.equal(node.options.length,2);assert.equal(node.options[1].textContent,'High <img src=x>');assert.equal(node.className,'priority');assert.equal(node.disabled,false);assert.equal(root.descendants('img').length,0);});
 test(backend+' select change writes string value while input alone does not write',async t=>{const {root,node}=await mounted(t,base,backend);node.value='high';node.dispatch('input');await tick();assert.equal(root.descendants('p')[0].textContent,'normal');node.dispatch('change');await tick();assert.equal(root.descendants('p')[0].textContent,'high');findButton(root,'Reset').click();await tick();assert.equal(root.descendants('select')[0],node);assert.equal(node.value,'normal');});
 test(backend+' unmatched state selects nothing without replacing state or emitting empty string',async t=>{const source=base.replace('state priority: "normal" | "high"','state priority').replace('priority = "high";','priority = "unknown";'),{root,node}=await mounted(t,source,backend);findButton(root,'High').click();await tick();assert.equal(node.selectedIndex,-1);assert.equal(node.value,'');node.dispatch('change');await tick();assert.equal(root.descendants('p')[0].textContent,'unknown');findButton(root,'Reset').click();await tick();assert.equal(node.value,'normal');});
 test(backend+' removal cancels selection work and makes retired change callbacks inert',async t=>{const source=base.replace(header,'if visible {\n'+header).replace('\n p priority','\n }\n p priority'),{root,node,stop}=await mounted(t,source,backend),callback=node.listeners.change[0];findButton(root,'High').click();findButton(root,'Hide').click();await tick();assert.equal(root.descendants('select').length,0);assert.equal(node.listeners.change.length,0);node.value='normal';callback();await tick();assert.equal(root.descendants('p')[0].textContent,'high');stop();stop();assert.equal(root.childNodes.length,0);});
 test(backend+' any escape fails during mount and cleanup removes all owned controls',async t=>{setupDOM();const mount=await compile(t,base.replace('state priority: "normal" | "high" = "normal";','state priority: any = 42;'),backend),root=new FakeNode('root');assert.throws(()=>mount(root,{}),/ELN-SELECT-TYPE/);assert.equal(root.childNodes.length,0);});
}
test('select unchanged selection does not invoke the selectedIndex setter',()=>{setupDOM();const root=new FakeNode('root'),owner=runtime.scope(),state=runtime.cell('normal'),node=runtime.select(root,'Priority',[{label:'Normal',value:'normal'}],()=>state.value,()=>{},owner);let index=node.selectedIndex,writes=0;Object.defineProperty(node,'selectedIndex',{get:()=>index,set:v=>{index=v;writes++;}});runtime.setSelectValue(node,'normal');assert.equal(writes,0);owner.dispose();});
test('select associates a reactive error with the native control and preserves its label',async t=>{
 const message='Choose High for this check.';
 const source=base.replace('disabled=(locked)',`disabled=(locked) error=(priority === "normal" ? "${message}" : "")`);
 const {root,node,stop}=await mounted(t,source);
 const id=node.getAttribute('aria-describedby');
 assert.ok(id);
 const error=root.descendants('span').find(span=>span.getAttribute('id')===id);
 assert.equal(error?.textContent,message);
 assert.equal(error.getAttribute('aria-live'),'polite');
 assert.equal(node.parentNode.textContent,'Priority <img src=x>Normal {value}High <img src=x>');
 assert.equal(node.getAttribute('aria-invalid'),'true');
 node.value='high';
 node.dispatch('change');
 await tick();
 assert.equal(root.descendants('select')[0],node);
 assert.equal(node.getAttribute('aria-invalid'),null);
 assert.equal(node.getAttribute('aria-describedby'),null);
 assert.equal(error.textContent,'');
 findButton(root,'Reset').click();
 await tick();
 assert.equal(node.getAttribute('aria-describedby'),id);
 assert.equal(error.textContent,message);
 stop();
 assert.equal(root.descendants('span').length,0);
});
test('an empty select keeps string state and cannot emit a missing option value',async t=>{const source=base.replace(' option "Normal {value}" => "normal"\n option "High <img src=x>" => "high"\n',''),{root,node}=await mounted(t,source);assert.equal(node.options.length,0);assert.equal(node.selectedIndex,-1);node.dispatch('change');await tick();assert.equal(root.descendants('p')[0].textContent,'normal');});
