import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';import {generate,emitGraph} from '../src/compiler.mjs';import {analyzeRegion,analyzeSequentialRegion} from '../src/region-compiler.mjs';import {formatSurface,applyFormatEdits} from '../src/formatter.mjs';import {createSurfaceLanguageService} from '../src/language-service.mjs';import {typecheckGraph} from '../src/checker.mjs';import {setupDOM,FakeNode,findButton,findInput,tick} from './fake-dom.mjs';
const runtimeImport=new URL('../src/runtime.mjs',import.meta.url).href,regionRuntimeImport=new URL('../src/region-runtime.mjs',import.meta.url).href;
const source=`component Controls() {
 state locked = false;
 state draft = "Keep";
 state count = 0;
 action lock() { locked = !locked; }
 action increment() { count++; }
 ui {
 section {
 button disabled=(locked) class=("action") "Save" => increment()
 input class=("field") disabled=(locked) "Name" <-> draft
 textarea disabled=(locked) "Notes" <-> draft
 button "Toggle" => lock()
 button disabled=(false) "Increment" => increment()
 button disabled=(true) "Locked" => increment()
 p count
 }
 }
}`;
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-disabled-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elnor-disabled-'));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
const grouped=source.replace('section {','section {\n fieldset class=("group") disabled=(locked) {\n legend "Group"')
 .replace(' button "Toggle"',' }\n button "Toggle"');
test('fieldset disabled requires a boolean and retains its original span',t=>{
 const dir=fixture(t),file=path.join(dir,'Controls.eln');
 const bad=grouped.replace('disabled=(locked) {','disabled=(42) {');
 const group=parseSurface(bad,file).ui[0].children[0];
 assert.equal(bad.slice(group.disabledSpan.start,group.disabledSpan.start+group.disabledSpan.length),'42');
 const service=createSurfaceLanguageService({root:dir});t.after(()=>service.dispose());
 service.open(file,bad);
 const issue=service.diagnostics(file).find(d=>d.code==='TS2345');
 assert.ok(issue);
 assert.equal(bad.slice(issue.start,issue.start+issue.length),'42');
});
for(const backend of ['general','blueprint','sequential'])test('fieldset disabled updates the native group in '+backend,async t=>{
 const dir=fixture(t),file=path.join(dir,'Controls.mjs');
 const ir=parseSurface(grouped,path.join(dir,'Controls.eln'));
 const plan=backend==='sequential'?analyzeSequentialRegion(ir):analyzeRegion(ir);
 if(backend!=='general'){assert.ok(plan.eligible);assert.equal(plan.mode,backend);}
 fs.writeFileSync(file,generate(ir,{runtimeImport,...(backend==='general'?{}:{regionRuntimeImport,regionPlan:plan})}));
 setupDOM();
 const {mount}=await import(pathToFileURL(file)),root=new FakeNode('root'),stop=mount(root,{});
 t.after(stop);
 const group=root.descendants('fieldset')[0],input=findInput(root,'Name');
 assert.equal(group.disabled,false);
 findButton(root,'Toggle').click();
 await tick();
 assert.equal(group.disabled,true);
 assert.equal(findInput(root,'Name'),input);
 findButton(root,'Toggle').click();
 await tick();
 assert.equal(group.disabled,false);
});
test('disabled prefixes combine with classes in either order and preserve exact ranges and formatting',()=>{
 const ir=parseSurface(source,'Controls.eln');for(const n of ir.ui[0].children.filter(n=>n.disabledSpan))assert.equal(source.slice(n.disabledSpan.start,n.disabledSpan.start+n.disabledSpan.length),n.disabledExpr);
 assert.equal(ir.ui[0].children[0].classExpr,'"action"');assert.equal(ir.ui[0].children[1].disabledExpr,'locked');
 const nested=source.replace('disabled=(locked)','disabled=(({busy:false}).busy)'),formatted=formatSurface(nested);assert.deepEqual(formatted.diagnostics,[]);const text=applyFormatEdits(nested,formatted.edits);assert.deepEqual(formatSurface(text).edits,[]);assert.equal(parseSurface(text,'Controls.eln').ui[0].children[0].disabledExpr,'({busy:false}).busy');
});
test('disabled rejects duplicates, unsupported hosts and malformed values at the original prefix',()=>{
 for(const line of ['button disabled=(true) disabled=(false) "Save" => increment()','button disabled="false" "Save" => increment()','p disabled=(true) "Text"','button onclick=(increment) "Save" => increment()','button style=("color:red") "Save" => increment()']){
  const text=source.replace('button disabled=(locked) class=("action") "Save" => increment()',line);assert.throws(()=>parseSurface(text,'Controls.eln'),e=>e.start>=text.indexOf(line));
 }
});
test('disabled boolean diagnostics, member completion and state rename map to their original expressions',t=>{
 const dir=fixture(t),file=path.join(dir,'Controls.eln'),service=createSurfaceLanguageService({root:dir});t.after(()=>service.dispose());const bad=source.replaceAll('disabled=(locked)','disabled=(42)');service.open(file,bad);const errors=service.diagnostics(file).filter(d=>d.code==='TS2345');assert.equal(errors.length,3);for(const e of errors)assert.equal(bad.slice(e.start,e.start+e.length),'42');assert.equal(typecheckGraph(new Map([[file,parseSurface(bad,file)]]),path.join(dir,'check')).filter(d=>d.code==='TS2345').length,3);
 const named=source.replace('state locked = false;','state flags = {busy:false};').replaceAll('locked','flags.busy');service.open(file,named);assert.deepEqual(service.diagnostics(file),[]);const position=named.indexOf('flags.busy)')+'flags.'.length;assert.ok(service.completions(file,position).some(c=>c.name==='busy'));
 const plan=service.rename(file,named.indexOf('flags ='),'status');service.applyRename(plan);assert.match(service.text(file),/disabled=\(status.busy\)/);assert.deepEqual(service.diagnostics(file),[]);
});
for(const backend of ['general','blueprint','sequential'])test(backend+' applies actual boolean properties to controls, preserves identity and disposes handlers',async t=>{
 const dir=fixture(t);setupDOM();const ir=parseSurface(source,path.join(dir,'Controls.eln')),plan=backend==='sequential'?analyzeSequentialRegion(ir):analyzeRegion(ir);if(backend!=='general'){assert.ok(plan.eligible);assert.equal(plan.mode,backend);}
 const code=generate(ir,{runtimeImport,...(backend==='general'?{}:{regionRuntimeImport,regionPlan:plan})}),file=path.join(dir,'Controls.mjs');fs.writeFileSync(file,code);const {mount}=await import(pathToFileURL(file)),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);
 const input=findInput(root,'Name'),area=root.descendants('textarea')[0],save=findButton(root,'Save');for(const n of [input,area,save])assert.equal(n.disabled,false);assert.notEqual(input.parentNode.disabled,true);assert.equal(findButton(root,'Increment').disabled,false);assert.equal(findButton(root,'Locked').disabled,true);
 input.value='Edited';input.dispatch('input');await tick();assert.equal(area.value,'Edited');findButton(root,'Toggle').click();await tick();for(const n of [input,area,save])assert.equal(n.disabled,true);
 assert.equal(findInput(root,'Name'),input);assert.equal(root.descendants('textarea')[0],area);assert.equal(findButton(root,'Save'),save);assert.equal(input.value,'Edited');findButton(root,'Toggle').click();await tick();assert.equal(save.disabled,false);save.click();await tick();assert.equal(root.descendants('p')[0].textContent,'1');stop();save.click();input.dispatch('input');await tick();assert.equal(root.childNodes.length,0);assert.equal(save.listeners.click.length,0);
});
for(const backend of ['general','region'])test(backend+' rejects an any-cast string disabled value at runtime and cleans the failed mount',async t=>{
 const dir=fixture(t);setupDOM();const text=source.replace('state locked = false;','state locked: any = "false";'),ir=parseSurface(text,path.join(dir,'Controls.eln')),file=path.join(dir,'Controls.mjs');fs.writeFileSync(file,generate(ir,{runtimeImport,...(backend==='region'?{regionRuntimeImport}:{})}));const {mount}=await import(pathToFileURL(file)),root=new FakeNode('root');const leaves=e=>e instanceof AggregateError?e.errors.flatMap(leaves):[e];assert.throws(()=>mount(root,{}),e=>{const errors=leaves(e);return errors.length===(backend==='region'?3:1)&&errors.every(e=>/ELN-DISABLED-TYPE/.test(e.message));});assert.equal(root.childNodes.length,0);
});
for(const backend of ['general','region'])test(backend+' avoids property writes when the resulting boolean is unchanged',async t=>{
 const dir=fixture(t);setupDOM();const text=source.replace('disabled=(locked)','disabled=(count >= 0)'),ir=parseSurface(text,path.join(dir,'Controls.eln')),file=path.join(dir,'Controls.mjs');fs.writeFileSync(file,generate(ir,{runtimeImport,...(backend==='region'?{regionRuntimeImport}:{})}));const {mount}=await import(pathToFileURL(file)),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);const button=findButton(root,'Save');let value=button.disabled,writes=0;Object.defineProperty(button,'disabled',{get:()=>value,set:next=>{value=next;writes++;}});findButton(root,'Increment').click();await tick();assert.equal(writes,0);assert.equal(button.disabled,true);
});
test('eligible native owned children retain disabled bindings and literal false properties',async t=>{
 const dir=fixture(t),childFile=path.join(dir,'Child.eln'),parentFile=path.join(dir,'Parent.eln');
 const child=parseSurface('component Child(locked: boolean) {\n event fired()\n ui {\n section {\n button disabled=(locked) "Child" => emit.fired()\n button disabled=(false) "Always" => emit.fired()\n }\n }\n}',childFile),parent=parseSurface('import Child from "./Child.eln";\ncomponent Parent() {\n state locked = false;\n action toggle() { locked = !locked; }\n ui {\n section {\n button "Toggle" => toggle()\n Child locked=(locked)\n }\n }\n}',parentFile);
 emitGraph(new Map([[parentFile,parent],[childFile,child]]),path.join(dir,'build'));assert.ok(fs.readdirSync(path.join(dir,'build')).filter(n=>n.endsWith('.mjs')).some(n=>fs.readFileSync(path.join(dir,'build',n),'utf8').includes('renderNativeRegionOwned')));
 setupDOM();const {mount}=await import(pathToFileURL(path.join(dir,'build/Parent.mjs'))),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);assert.equal(findButton(root,'Child').disabled,false);assert.equal(findButton(root,'Always').disabled,false);findButton(root,'Toggle').click();await tick();assert.equal(findButton(root,'Child').disabled,true);assert.equal(findButton(root,'Always').disabled,false);
});
for(const backend of ['general','region'])test(backend+' retires queued disabled writes when a conditional control is removed',async t=>{
 const dir=fixture(t);setupDOM();const text=source.replace('action lock()', 'action hide() { visible = false; locked = true; }\n action lock()').replace('state locked = false;','state locked = false;\n state visible = true;').replace('button disabled=(locked) class=("action") "Save" => increment()','if visible {\n button disabled=(locked) class=("action") "Save" => increment()\n }').replace('button "Toggle" => lock()','button "Toggle" => lock()\n button "Hide" => hide()'),ir=parseSurface(text,path.join(dir,'Controls.eln')),file=path.join(dir,'Controls.mjs');fs.writeFileSync(file,generate(ir,{runtimeImport,...(backend==='region'?{regionRuntimeImport}:{})}));const {mount}=await import(pathToFileURL(file)),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);
 if(backend==='region')assert.ok(analyzeRegion(ir).eligible);
 const retired=findButton(root,'Save');let value=retired.disabled,writes=0;Object.defineProperty(retired,'disabled',{get:()=>value,set:next=>{value=next;writes++;}});findButton(root,'Hide').click();await tick();assert.equal(findButton(root,'Save'),undefined);assert.equal(writes,0);assert.equal(retired.listeners.click.length,0);retired.click();await tick();assert.equal(root.descendants('p')[0].textContent,'0');
});
