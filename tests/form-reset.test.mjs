import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';import {generate} from '../src/compiler.mjs';import {analyzeRegion,analyzeSequentialRegion} from '../src/region-compiler.mjs';import {validateGraph} from '../src/semantic-validation.mjs';import {typecheckGraph} from '../src/checker.mjs';import {createSurfaceLanguageService} from '../src/language-service.mjs';import {formatSurface,applyFormatEdits} from '../src/formatter.mjs';import {setupDOM,FakeNode,tick,findButton} from './fake-dom.mjs';
import {formBinding,scope} from '../src/runtime.mjs';import {mountScalarRegion} from '../src/region-runtime.mjs';
import {buildSurfaceProject} from '../src/project-build.mjs';
const base=`component Clear() {
 state title = "initial";
 state checked = true;
 state choice: "normal" | "high" = "high";
 state resets = 0;
 state submits = 0;
 state visible = true;
 state locked = false;
 action clear(amount: number) { title = "cleared"; checked = false; choice = "normal"; resets += amount; }
 action send() { submits++; }
 action hide() { visible = false; }
 action lock() { locked = !locked; }
 ui {
 section {
 if visible {
 form => send() {
 on reset() => clear(2)
 input "Title" <-> title
 textarea "Notes" <-> title
 checkbox "Checked" <-> checked
 select "Priority" <-> choice {
 option "Normal" => "normal"
 option "High" => "high"
 }
 reset class=("clear") disabled=(locked) "Clear draft"
 submit "Send"
 }
 }
 p title
 small resets
 strong submits
 button "Hide" => hide()
 button "Lock" => lock()
 }
 }
}`;
function dir(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-reset-'));t.after(()=>{assert.equal(path.dirname(d),os.tmpdir());assert.ok(path.basename(d).startsWith('elnor-reset-'));fs.rmSync(d,{recursive:true,force:true});});return d;}
async function mount(t,backend,source=base){const d=dir(t),file=path.join(d,'Clear.eln'),ir=parseSurface(source,file),plan=backend==='sequential'?analyzeSequentialRegion(ir):analyzeRegion(ir);if(backend!=='general'){assert.ok(plan.eligible,JSON.stringify(plan));assert.equal(plan.mode,backend);}const out=path.join(d,'Clear.mjs');fs.writeFileSync(out,generate(ir,{runtimeImport:new URL('../src/runtime.mjs',import.meta.url).href,...(backend==='general'?{}:{regionRuntimeImport:new URL('../src/region-runtime.mjs',import.meta.url).href,regionPlan:plan})}));setupDOM();const root=new FakeNode('root'),{mount}=await import(pathToFileURL(out)),stop=mount(root,{});t.after(stop);return {root,stop,form:root.descendants('form')[0]};}
test('reset action and button preserve original spans in CRLF and UTF-16 input',()=>{for(const source of [base,base.replace('state title','// 😀\n state title').replaceAll('\n','\r\n')]){const form=parseSurface(source,'Clear.eln').ui[0].children[0].children[0];assert.equal(source.slice(form.resetSpan.start,form.resetSpan.start+form.resetSpan.length),'clear(2)');assert.ok(!form.children.some(n=>n.kind==='on'));const button=form.children.find(n=>n.reset);assert.equal(source.slice(button.labelSpan.start,button.labelSpan.start+button.labelSpan.length),'"Clear draft"');}});
test('form reset rejects duplicate handlers, payload parameters and unknown native events',()=>{for(const source of [base.replace('on reset() => clear(2)','on reset() => clear(2)\n on reset() => clear(1)'),base.replace('on reset()','on reset(event)'),base.replace('on reset()','on click()')])assert.throws(()=>parseSurface(source,'Clear.eln'),e=>e.code.startsWith('ELN-FORM-'));});
test('reset button in a form without a declared action is rejected by topology validation',()=>{const source=base.replace('on reset() => clear(2)',''),ir=parseSurface(source,'Clear.eln');assert.ok(validateGraph(new Map([['Clear.eln',ir]])).some(e=>e.code==='ELN-FORM-RESET'));});
test('standalone reset is valid and has no invented click action',()=>{const ir=parseSurface('component Button() {\n ui {\n reset "Clear"\n }\n}','Button.eln');assert.equal(ir.ui[0].reset,true);assert.deepEqual(validateGraph(new Map([['Button.eln',ir]])),[]);});
test('reset expression type errors reach checker and editor at the original call',t=>{const d=dir(t),file=path.join(d,'Clear.eln'),s=createSurfaceLanguageService({root:d});t.after(()=>s.dispose());s.open(file,base);assert.deepEqual(s.diagnostics(file),[]);assert.deepEqual(typecheckGraph(new Map([[file,parseSurface(base,file)]]),path.join(d,'check')),[]);const bad=base.replace('clear(2)','clear("wrong")');s.open(file,bad);assert.ok(s.diagnostics(file).some(e=>e.code==='TS2345'&&bad.slice(e.start,e.start+e.length)==='"wrong"'));assert.ok(typecheckGraph(new Map([[file,parseSurface(bad,file)]]),path.join(d,'bad')).some(e=>e.code==='TS2345'));});
test('reset handler definition rename and formatting keep native syntax',t=>{const d=dir(t),file=path.join(d,'Clear.eln'),s=createSurfaceLanguageService({root:d});t.after(()=>s.dispose());s.open(file,base);const at=base.indexOf('=> clear(2)')+3;assert.ok(s.definitions(file,at).some(e=>e.start===base.indexOf('clear(amount')));s.applyRename(s.rename(file,at,'clearDraft'));assert.match(s.text(file),/on reset\(\) => clearDraft\(2\)/);const f=formatSurface(s.text(file));assert.deepEqual(f.diagnostics,[]);const next=applyFormatEdits(s.text(file),f.edits);assert.deepEqual(formatSurface(next).edits,[]);});
test('reset class and disabled snippets retain their form reset handler',t=>{const d=dir(t),file=path.join(d,'Clear.eln'),s=createSurfaceLanguageService({root:d});t.after(()=>s.dispose());const source=base.replace('reset class=("clear") disabled=(locked)','reset di');s.open(file,source);assert.ok(s.completions(file,source.indexOf('reset di')+8).some(i=>i.name==='disabled'&&i.insertText==='disabled=(${1})'));});
test('a reset component is checked against the form handler at each use',t=>{const d=dir(t),file=path.join(d,'App.eln'),child=path.join(d,'Reset.eln'),reset=parseSurface('component Reset() {\n ui {\n reset "Clear"\n }\n}',child);for(const supported of [false,true]){const source='import Reset from "./Reset.eln";\ncomponent App() {\n action clear() {}\n ui {\n form => clear() {\n '+(supported?'on reset() => clear()\n':'')+' Reset\n }\n }\n}',errors=validateGraph(new Map([[file,parseSurface(source,file)],[child,reset]]));assert.equal(errors.some(e=>e.code==='ELN-FORM-RESET'),!supported);if(!supported)assert.ok(errors.some(e=>e.file===file&&source.slice(e.start,e.start+e.length)==='Reset'));}});
test('reset buttons in slots use the containing callee form reset policy',t=>{const d=dir(t),file=path.join(d,'App.eln'),child=path.join(d,'Shell.eln'),source='import Shell from "./Shell.eln";\ncomponent App() {\n ui {\n Shell {\n reset "Clear"\n }\n }\n}';for(const supported of [false,true]){const shell='component Shell() {\n action clear() {}\n ui {\n form => clear() {\n '+(supported?'on reset() => clear()\n':'')+' slot\n }\n }\n}',errors=validateGraph(new Map([[file,parseSurface(source,file)],[child,parseSurface(shell,child)]]));assert.equal(errors.some(e=>e.code==='ELN-FORM-RESET'),!supported);}});
test('orphan reset recursion outside a form does not require a reset policy',t=>{const d=dir(t),file=path.join(d,'App.eln'),child=path.join(d,'Loop.eln'),source='import Loop from "./Loop.eln";\ncomponent App() {\n action go() {}\n ui {\n section {\n form => go() {\n submit "Send"\n }\n Loop\n }\n }\n}',loop='import Loop from "./Loop.eln";\ncomponent Loop() {\n ui {\n section {\n reset "Outside"\n if false {\n Loop\n }\n }\n }\n}';assert.deepEqual(validateGraph(new Map([[file,parseSurface(source,file)],[child,parseSurface(loop,child)]])),[]);});
test('async reset prevents the native algorithm before its first await',async t=>{const source=base.replace('action clear(amount: number) { title','action async clear(amount: number) { await Promise.resolve(); title'),{root,form}=await mount(t,'general',source);let prevented=false;form.listeners.reset[0]({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(root.descendants('small')[0].textContent,'0');await tick();assert.equal(root.descendants('small')[0].textContent,'2');});
test('form cleanup attempts reset removal even when submit removal throws',()=>{setupDOM();const owner=scope(),node=new FakeNode('form');formBinding(node,()=>{},owner,()=>{});const remove=node.removeEventListener.bind(node);node.removeEventListener=(type,callback)=>{if(type==='submit')throw Error('Submit cleanup');remove(type,callback);};assert.throws(()=>owner.dispose(),/Submit cleanup/);assert.equal(node.listeners.reset.length,0);owner.dispose();});
test('scalar-region reset observes cancellation and retirement',()=>{setupDOM();const root=new FakeNode('root'),form=new FakeNode('form');let calls=0;const stop=mountScalarRegion(root,{initial:[],bindings:[],invalidations:[],events:[{node:0,type:'reset',action:0}],actions:[()=>{calls++;}],instantiate:()=>({root:form,refs:[form]})}),callback=form.listeners.reset[0];callback({defaultPrevented:true,preventDefault(){throw Error('Already cancelled');}});callback({preventDefault(){}});assert.equal(calls,1);stop();callback({preventDefault(){throw Error('Retired');}});assert.equal(calls,1);});
test('a native form child prevents reset before emitting to its parent',async t=>{const d=dir(t),entry=path.join(d,'App.eln');fs.writeFileSync(entry,'import Controls from "./Controls.eln";\ncomponent App() {\n state count = 0;\n action cleared(value: number) { count += value; }\n ui {\n section {\n Controls {\n on cleared(value) => cleared(value)\n }\n p count\n }\n }\n}');fs.writeFileSync(path.join(d,'Controls.eln'),'component Controls() {\n event cleared(value: number)\n event sent()\n ui {\n form => emit.sent() {\n on reset() => emit.cleared(2)\n reset "Clear"\n submit "Send"\n }\n }\n}');const out=path.join(d,'build'),built=buildSurfaceProject(entry,{outputDir:out,checkOutputDir:path.join(d,'check')});setupDOM();const {mount}=await import(pathToFileURL(path.join(out,built.entryOutput))),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);let prevented=0;root.descendants('form')[0].listeners.reset[0]({preventDefault(){prevented++;}});await tick();assert.equal(prevented,1);assert.equal(root.descendants('p')[0].textContent,'2');});
for(const backend of ['general','blueprint','sequential']){
 test(backend+' reset prevents default synchronously and applies typed state through one action',async t=>{const {root,form}=await mount(t,backend);let prevented=0;form.listeners.reset[0]({preventDefault(){prevented++;}});assert.equal(prevented,1);await tick();assert.equal(root.descendants('input').find(n=>n.type==='text').value,'cleared');assert.equal(root.descendants('textarea')[0].value,'cleared');assert.equal(root.descendants('input').find(n=>n.type==='checkbox').checked,false);assert.equal(root.descendants('select')[0].value,'normal');assert.equal(root.descendants('small')[0].textContent,'2');assert.equal(root.descendants('strong')[0].textContent,'0');assert.equal(findButton(root,'Clear draft').type,'reset');assert.equal(findButton(root,'Clear draft').listeners.click?.length??0,0);});
 test(backend+' pre-cancelled reset does not run an application action',async t=>{const {root,form}=await mount(t,backend);form.listeners.reset[0]({defaultPrevented:true,preventDefault(){throw Error('Already cancelled');}});await tick();assert.equal(root.descendants('small')[0].textContent,'0');});
 test(backend+' reset respects disabled binding and native button type',async t=>{const {root}=await mount(t,backend);assert.equal(findButton(root,'Clear draft').disabled,false);findButton(root,'Lock').click();await tick();assert.equal(findButton(root,'Clear draft').disabled,true);assert.equal(findButton(root,'Send').type,'submit');});
 test(backend+' retirement removes both native handlers and makes reset callbacks inert',async t=>{const {root,form,stop}=await mount(t,backend),callback=form.listeners.reset[0];findButton(root,'Hide').click();await tick();assert.equal(form.listeners.reset.length,0);assert.equal(form.listeners.submit.length,0);callback({preventDefault(){}});await tick();assert.equal(root.descendants('small')[0].textContent,'0');stop();stop();assert.equal(root.childNodes.length,0);});
}
