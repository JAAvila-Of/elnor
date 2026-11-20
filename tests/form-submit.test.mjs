import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';import {generate} from '../src/compiler.mjs';import {analyzeRegion,analyzeSequentialRegion} from '../src/region-compiler.mjs';import {createSurfaceLanguageService} from '../src/language-service.mjs';import {typecheckGraph} from '../src/checker.mjs';import {formatSurface,applyFormatEdits} from '../src/formatter.mjs';import {setupDOM,FakeNode,tick,findButton} from './fake-dom.mjs';
import {validateGraph} from '../src/semantic-validation.mjs';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {mountScalarRegion} from '../src/region-runtime.mjs';
const base=`component Create() {
 state count = 0;
 state title = "";
 state locked = false;
 state visible = true;
 action create(amount: number) { count += amount; }
 action lock() { locked = !locked; }
 action hide() { visible = false; }
 ui {
 section {
 if visible {
 form class=("composer") => create(2) {
 input "Title" <-> title
 submit disabled=(locked) "Create"
 button "Ordinary" => lock()
 }
 }
 p count
 button "Hide" => hide()
 }
 }
}`;
function dir(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-form-'));t.after(()=>{assert.equal(path.dirname(d),os.tmpdir());assert.ok(path.basename(d).startsWith('elnor-form-'));fs.rmSync(d,{recursive:true,force:true});});return d;}
async function mounted(t,backend,source=base){const d=dir(t),file=path.join(d,'Create.eln'),ir=parseSurface(source,file),plan=backend==='sequential'?analyzeSequentialRegion(ir):analyzeRegion(ir);if(backend!=='general'){assert.ok(plan.eligible,JSON.stringify(plan));assert.equal(plan.mode,backend);}const out=path.join(d,'Create.mjs');fs.writeFileSync(out,generate(ir,{runtimeImport:new URL('../src/runtime.mjs',import.meta.url).href,...(backend==='general'?{}:{regionRuntimeImport:new URL('../src/region-runtime.mjs',import.meta.url).href,regionPlan:plan})}));setupDOM();const root=new FakeNode('root'),{mount}=await import(pathToFileURL(out)),stop=mount(root,{});t.after(stop);return {root,stop,form:root.descendants('form')[0]};}
test('form and submit preserve UTF-16 spans and typed prefixes',()=>{for(const source of [base,base.replaceAll('\n','\r\n').replace('state count','// 😀\r\n state count')]){const form=parseSurface(source,'Create.eln').ui[0].children[0].children[0];assert.equal(form.tag,'form');assert.equal(source.slice(form.submitSpan.start,form.submitSpan.start+form.submitSpan.length),'create(2)');assert.equal(form.children[1].submit,true);assert.equal(form.children[1].disabledExpr,'locked');}});
test('form rejects local nesting and invalid prefixes',()=>{for(const source of [base.replace('input "Title" <-> title','form => create(1) {\n }'),base.replace('form class=("composer")','form disabled=(locked)'),base.replace('submit disabled=(locked) "Create"','submit "Create" => create(2)')])assert.throws(()=>parseSurface(source,'Create.eln'));});
test('form formatting is idempotent and preserves the single submit action',()=>{const f=formatSurface(base);assert.deepEqual(f.diagnostics,[]);const s=applyFormatEdits(base,f.edits);assert.deepEqual(formatSurface(s).edits,[]);assert.match(s,/form class=\("composer"\) => create\(2\) \{/);assert.match(s,/submit disabled=\(locked\) "Create"/);});
test('form action arguments are checked and mapped in both checker routes',t=>{const d=dir(t),file=path.join(d,'Create.eln'),service=createSurfaceLanguageService({root:d});t.after(()=>service.dispose());service.open(file,base);assert.deepEqual(service.diagnostics(file),[]);assert.deepEqual(typecheckGraph(new Map([[file,parseSurface(base,file)]]),path.join(d,'check')),[]);const bad=base.replace('=> create(2)','=> create("bad")');service.open(file,bad);assert.ok(service.diagnostics(file).some(e=>e.code==='TS2345'&&bad.slice(e.start,e.start+e.length).includes('"bad"')));assert.ok(typecheckGraph(new Map([[file,parseSurface(bad,file)]]),path.join(d,'bad-check')).some(e=>e.code==='TS2345'));});
test('form action definitions and rename use original Surface references',t=>{const d=dir(t),file=path.join(d,'Create.eln'),s=createSurfaceLanguageService({root:d});t.after(()=>s.dispose());s.open(file,base);const at=base.indexOf('=> create(2)')+3;assert.ok(s.definitions(file,at).some(e=>e.start===base.indexOf('create(amount')));s.applyRename(s.rename(file,at,'send'));assert.match(s.text(file),/=> send\(2\)/);assert.deepEqual(s.diagnostics(file),[]);});
test('form and submit host completion preserves the owning form block',t=>{const d=dir(t),file=path.join(d,'Create.eln'),s=createSurfaceLanguageService({root:d});t.after(()=>s.dispose());for(const [source,needle,name] of [[base.replace('class=("composer")','cl'),'form cl','class'],[base.replace('disabled=(locked)','di'),'submit di','disabled']]){s.open(file,source);const item=s.completions(file,source.indexOf(needle)+needle.length).find(i=>i.name===name);assert.ok(item,needle);assert.equal(item.insertText,name+'=(${1})');}s.open(file,base.replace('disabled=(locked)','disabled=()'));assert.ok(s.completions(file,s.text(file).indexOf('disabled=(')+10).some(i=>i.name==='locked'));});
test('submit labels retain arrow-like text and TS expressions',()=>{for(const label of ['"A => B"','(() => "Send")()'])assert.equal(parseSurface(base.replace('"Create"',label),'Create.eln').ui[0].children[0].children[0].children[1].label,label);});
test('nested forms through imported components are rejected at the component reference',t=>{const d=dir(t),file=path.join(d,'Create.eln'),child=path.join(d,'Child.eln'),text='import Child from "./Child.eln";\n'+base.replace('input "Title" <-> title','Child'),source='component Child() {\n action go() {}\n ui {\n form => go() {\n submit "Send"\n }\n }\n}';const errors=validateGraph(new Map([[file,parseSurface(text,file)],[child,parseSurface(source,child)]]));assert.ok(errors.some(e=>e.code==='ELN-FORM-NESTING'&&text.slice(e.start,e.start+e.length)==='Child'));});
test('input-only child components remain valid inside forms',t=>{const d=dir(t),file=path.join(d,'Create.eln'),child=path.join(d,'Child.eln'),text='import Child from "./Child.eln";\n'+base.replace('input "Title" <-> title','Child'),source='component Child() {\n state draft = "";\n ui {\n input "Child field" <-> draft\n }\n}';assert.deepEqual(validateGraph(new Map([[file,parseSurface(text,file)],[child,parseSurface(source,child)]])),[]);});
test('async form action prevents navigation before its first await',async t=>{const source=base.replace('action create(amount: number) { count += amount; }','action async create(amount: number) { await Promise.resolve(); count += amount; }'),{root,form}=await mounted(t,'general',source);let prevented=false;form.listeners.submit[0]({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(root.descendants('p')[0].textContent,'0');await tick();assert.equal(root.descendants('p')[0].textContent,'2');});
test('opt-in submit waits for field errors, skips unavailable controls and cancels stale focus',async t=>{
  const source=base
    .replace('state title = "";','state title = "";\n state notes = "";\n calc error = count > 0 ? "Required" : "";')
    .replace('class=("composer")','class=("composer") focus-invalid=(true)')
    .replace('input "Title" <-> title',`input error=(error) "Hidden" <-> title
      input error=(error) disabled=(true) "Disabled" <-> title
      textarea error=(error) "Notes" <-> notes
      input error=(error) "Later" <-> title`);
  const {root,form,stop}=await mounted(t,'general',source);
  const [hidden,disabled,later]=form.descendants('input');
  const notes=form.descendants('textarea')[0];
  const focused=[];
  const focusRoot={activeElement:null};
  form.isConnected=true;
  form.elements=[hidden,disabled,notes,later];
  for(const field of form.elements){
    field.getRootNode=()=>focusRoot;
    field.matches=selector=>selector===':disabled'&&field.disabled===true;
    field.focus=()=>{
      focused.push(field);
      if(field!==hidden)focusRoot.activeElement=field;
    };
  }
  const event={preventDefault(){}};
  const submit=form.listeners.submit[0];
  submit(event);
  assert.deepEqual(focused,[]);
  await tick();
  assert.deepEqual(focused,[hidden,notes]);
  assert.equal(notes.getAttribute('aria-invalid'),'true');
  assert.match(root.textContent,/Required/);

  focused.length=0;
  submit(event);
  submit(event);
  await tick();
  assert.deepEqual(focused,[hidden,notes]);
  focused.length=0;
  submit(event);
  form.listeners.reset[0](event);
  await tick();
  assert.deepEqual(focused,[]);
  submit(event);
  stop();
  submit(event);
  await tick();
  assert.deepEqual(focused,[]);
});
test('scalar-region submit prevents default and a captured retired callback cannot run',()=>{setupDOM();const root=new FakeNode('root'),form=new FakeNode('form');let calls=0,prevented=0;const stop=mountScalarRegion(root,{initial:[],bindings:[],invalidations:[],events:[{node:0,type:'submit',action:0}],actions:[()=>{calls++;}],instantiate:()=>({root:form,refs:[form]})}),callback=form.listeners.submit[0];callback({preventDefault(){prevented++;}});assert.equal(calls,1);assert.equal(prevented,1);stop();callback({preventDefault(){prevented++;}});assert.equal(calls,1);assert.equal(prevented,1);assert.equal(form.listeners.submit.length,0);});
test('a native form child emits once through the compiled component boundary',async t=>{const d=dir(t),entry=path.join(d,'App.eln');fs.writeFileSync(entry,'import Child from "./Child.eln";\ncomponent App() {\n state count = 0;\n action add(value: number) { count += value; }\n ui {\n section {\n Child {\n on saved(value) => add(value)\n }\n p count\n }\n }\n}');fs.writeFileSync(path.join(d,'Child.eln'),'component Child() {\n event saved(value: number)\n ui {\n form => emit.saved(2) {\n submit "Create"\n }\n }\n}');const out=path.join(d,'build'),built=buildSurfaceProject(entry,{outputDir:out,checkOutputDir:path.join(d,'check')});setupDOM();const {mount}=await import(pathToFileURL(path.join(out,built.entryOutput))),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);let prevented=0;root.descendants('form')[0].listeners.submit[0]({preventDefault(){prevented++;}});await tick();assert.equal(prevented,1);assert.equal(root.descendants('p')[0].textContent,'2');});
for(const backend of ['general','blueprint','sequential']){
 test(backend+' form prevents default synchronously and calls one action',async t=>{const {root,form}=await mounted(t,backend);let prevented=0;form.listeners.submit[0]({preventDefault(){prevented++;}});assert.equal(prevented,1);await tick();assert.equal(root.descendants('p')[0].textContent,'2');assert.equal(form.className,'composer');assert.equal(findButton(root,'Create').type,'submit');assert.equal(findButton(root,'Create').listeners.click?.length??0,0);assert.equal(findButton(root,'Ordinary').type,'button');});
 test(backend+' submit disabled state remains native and reactive',async t=>{const {root}=await mounted(t,backend);assert.equal(findButton(root,'Create').disabled,false);findButton(root,'Ordinary').click();await tick();assert.equal(findButton(root,'Create').disabled,true);});
 test(backend+' removal releases submit listener and captured callback is inert',async t=>{const {root,form,stop}=await mounted(t,backend),callback=form.listeners.submit[0];findButton(root,'Hide').click();await tick();assert.equal(root.descendants('form').length,0);assert.equal(form.listeners.submit.length,0);callback({preventDefault(){}});await tick();assert.equal(root.descendants('p')[0].textContent,'0');stop();stop();assert.equal(root.childNodes.length,0);});
 test(backend+' repeated submits apply their arguments independently',async t=>{const {root,form}=await mounted(t,backend);for(let i=0;i<3;i++)form.listeners.submit[0]({preventDefault(){}});await tick();assert.equal(root.descendants('p')[0].textContent,'6');});
}
