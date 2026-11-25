import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';import {generate,emitGraph} from '../src/compiler.mjs';import {analyzeRegion,analyzeSequentialRegion} from '../src/region-compiler.mjs';import {formatSurface,applyFormatEdits} from '../src/formatter.mjs';import {createSurfaceLanguageService} from '../src/language-service.mjs';import {typecheckGraph} from '../src/checker.mjs';import {setupDOM,FakeNode,findButton,tick} from './fake-dom.mjs';
const runtimeImport=new URL('../src/runtime.mjs',import.meta.url).href,regionRuntimeImport=new URL('../src/region-runtime.mjs',import.meta.url).href;
const source=`component Choices() {
 state selected = false;
 state count = 0;
 action toggle() { selected = !selected; }
 action increment() { count++; }
 ui {
 section {
 button class=("pick") aria-pressed=(selected) aria-current=(selected) disabled=(false) "Pick" => toggle()
 button aria-current=(true) aria-pressed=(false) "Static" => increment()
 button "No change" => increment()
 p count
 }
 }
}`;
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-aria-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elnor-aria-'));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
test('ARIA prefixes preserve ranges, mixed property order and formatter idempotence',()=>{
 const node=parseSurface(source,'Choices.eln').ui[0].children[0];for(const name of ['ariaPressed','ariaCurrent'])assert.equal(source.slice(node[name+'Span'].start,node[name+'Span'].start+node[name+'Span'].length),'selected');assert.equal(node.disabledExpr,'false');
 const nested=source.replace('aria-pressed=(selected)','aria-pressed=(({selected:false}).selected)'),result=formatSurface(nested);assert.deepEqual(result.diagnostics,[]);const next=applyFormatEdits(nested,result.edits);assert.deepEqual(formatSurface(next).edits,[]);assert.equal(parseSurface(next,'Choices.eln').ui[0].children[0].ariaPressedExpr,'({selected:false}).selected');
});
test('ARIA rejects duplicates, non-button hosts, unsupported names and unparenthesized values at their prefixes',()=>{
 for(const line of ['button aria-pressed=(true) aria-pressed=(false) "Pick" => toggle()','p aria-current=(true) "Text"','button aria-label=("Name") "Pick" => toggle()','button aria-current="true" "Pick" => toggle()']){const text=source.replace('button class=("pick") aria-pressed=(selected) aria-current=(selected) disabled=(false) "Pick" => toggle()',line);assert.throws(()=>parseSurface(text,'Choices.eln'),e=>e.start>=text.indexOf(line));}
});
test('ARIA boolean diagnostics map to exact expressions and support member completion and applied rename',t=>{
 const dir=fixture(t),file=path.join(dir,'Choices.eln'),service=createSurfaceLanguageService({root:dir});t.after(()=>service.dispose());const bad=source.replaceAll('=(selected)','=(42)');service.open(file,bad);const diagnostics=service.diagnostics(file).filter(d=>d.code==='TS2345');assert.equal(diagnostics.length,2);for(const d of diagnostics)assert.equal(bad.slice(d.start,d.start+d.length),'42');assert.equal(typecheckGraph(new Map([[file,parseSurface(bad,file)]]),path.join(dir,'check')).filter(d=>d.code==='TS2345').length,2);
 const named=source.replace('state selected = false;','state flags = {selected:false};').replaceAll('selected = !selected','flags = {selected:!flags.selected}').replaceAll('=(selected)','=(flags.selected)');service.open(file,named);assert.deepEqual(service.diagnostics(file),[]);const at=named.indexOf('flags.selected)')+'flags.'.length;assert.ok(service.completions(file,at).some(c=>c.name==='selected'));
 const plan=service.rename(file,named.indexOf('flags ='),'status');service.applyRename(plan);assert.match(service.text(file),/aria-current=\(status.selected\)/);assert.deepEqual(service.diagnostics(file),[]);
 const partial=named.replace('aria-pressed=(flags.selected)','aria-pressed=(flags.)');service.open(file,partial);assert.ok(service.completions(file,partial.indexOf('flags.)')+'flags.'.length).some(c=>c.name==='selected'));
});
for(const backend of ['general','blueprint','sequential'])test(backend+' serializes true and false ARIA tokens, updates existing buttons and disposes callbacks',async t=>{
 const dir=fixture(t);setupDOM();const ir=parseSurface(source,path.join(dir,'Choices.eln')),plan=backend==='sequential'?analyzeSequentialRegion(ir):analyzeRegion(ir);if(backend!=='general'){assert.ok(plan.eligible);assert.equal(plan.mode,backend);}
 const file=path.join(dir,'Choices.mjs');fs.writeFileSync(file,generate(ir,{runtimeImport,...(backend==='general'?{}:{regionRuntimeImport,regionPlan:plan})}));const {mount}=await import(pathToFileURL(file)),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);const pick=findButton(root,'Pick'),fixed=findButton(root,'Static');assert.equal(pick.getAttribute('aria-pressed'),'false');assert.equal(pick.getAttribute('aria-current'),'false');assert.equal(fixed.getAttribute('aria-current'),'true');assert.equal(fixed.getAttribute('aria-pressed'),'false');assert.equal(pick.disabled,false);
 pick.click();await tick();assert.equal(findButton(root,'Pick'),pick);assert.equal(pick.getAttribute('aria-pressed'),'true');assert.equal(pick.getAttribute('aria-current'),'true');pick.click();await tick();assert.equal(pick.getAttribute('aria-pressed'),'false');assert.equal(pick.getAttribute('aria-current'),'false');stop();pick.click();await tick();assert.equal(root.childNodes.length,0);assert.equal(pick.listeners.click.length,0);
});
test('the ARIA setter rejects unknown names and non-booleans without writing',async()=>{
 const {setAriaBoolean}=await import('../src/runtime.mjs'),node=new FakeNode('button');let writes=0;node.setAttribute=()=>writes++;assert.throws(()=>setAriaBoolean(node,'onclick',true),/ELN-ARIA-NAME/);for(const value of ['false',null,undefined,0,{}])assert.throws(()=>setAriaBoolean(node,'aria-pressed',value),/ELN-ARIA-TYPE/);assert.equal(writes,0);
});
for(const backend of ['general','region'])test(backend+' rejects any-cast ARIA strings and cleans a failed mount',async t=>{
 const dir=fixture(t);setupDOM();const text=source.replace('state selected = false;','state selected: any = "false";'),ir=parseSurface(text,path.join(dir,'Choices.eln')),file=path.join(dir,'Choices.mjs');fs.writeFileSync(file,generate(ir,{runtimeImport,...(backend==='region'?{regionRuntimeImport}:{})}));const {mount}=await import(pathToFileURL(file)),root=new FakeNode('root'),leaves=e=>e instanceof AggregateError?e.errors.flatMap(leaves):[e];assert.throws(()=>mount(root,{}),e=>leaves(e).length===(backend==='region'?2:1)&&leaves(e).every(e=>/ELN-ARIA-TYPE/.test(e.message)));assert.equal(root.childNodes.length,0);
});
for(const backend of ['general','region'])test(backend+' skips attribute writes when the resulting ARIA boolean is unchanged',async t=>{
 const dir=fixture(t);setupDOM();const text=source.replace('aria-pressed=(selected)','aria-pressed=(count >= 0)'),ir=parseSurface(text,path.join(dir,'Choices.eln')),file=path.join(dir,'Choices.mjs');fs.writeFileSync(file,generate(ir,{runtimeImport,...(backend==='region'?{regionRuntimeImport}:{})}));const {mount}=await import(pathToFileURL(file)),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);const pick=findButton(root,'Pick'),set=pick.setAttribute.bind(pick);let writes=0;pick.setAttribute=(...args)=>{writes++;set(...args);};findButton(root,'No change').click();await tick();assert.equal(writes,0);assert.equal(pick.getAttribute('aria-pressed'),'true');
});
for(const backend of ['general','region'])test(backend+' removes queued ARIA writes with conditional controls',async t=>{
 const dir=fixture(t);setupDOM();const text=source.replace('state selected = false;','state selected = false;\n state visible = true;').replace('action toggle()','action hide() { visible = false; selected = true; }\n action toggle()').replace('button class=("pick") aria-pressed=(selected) aria-current=(selected) disabled=(false) "Pick" => toggle()','if visible {\n button aria-pressed=(selected) "Pick" => toggle()\n }').replace('button "No change" => increment()','button "No change" => increment()\n button "Hide" => hide()'),ir=parseSurface(text,path.join(dir,'Choices.eln'));if(backend==='region')assert.ok(analyzeRegion(ir).eligible);const file=path.join(dir,'Choices.mjs');fs.writeFileSync(file,generate(ir,{runtimeImport,...(backend==='region'?{regionRuntimeImport}:{})}));const {mount}=await import(pathToFileURL(file)),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);const pick=findButton(root,'Pick'),set=pick.setAttribute.bind(pick);let writes=0;pick.setAttribute=(...args)=>{writes++;set(...args);};findButton(root,'Hide').click();await tick();assert.equal(findButton(root,'Pick'),undefined);assert.equal(writes,0);assert.equal(pick.listeners.click.length,0);
});
test('native owned child module emits and updates ARIA bindings and literal false',async t=>{
 const dir=fixture(t),childFile=path.join(dir,'Child.eln'),parentFile=path.join(dir,'Parent.eln');const child=parseSurface('component Child(active: boolean) {\n event fired()\n ui {\n section {\n button aria-pressed=(active) aria-current=(false) "Child" => emit.fired()\n }\n }\n}',childFile),parent=parseSurface('import Child from "./Child.eln";\ncomponent Parent() {\n state active = false;\n action toggle() { active = !active; }\n ui {\n section {\n button "Toggle" => toggle()\n Child active=(active)\n }\n }\n}',parentFile);
 const out=path.join(dir,'build');emitGraph(new Map([[parentFile,parent],[childFile,child]]),out,{regionBackend:true});const facade=fs.readFileSync(path.join(out,'Child.mjs'),'utf8'),ref=/from ("[^"]+");/.exec(facade);assert.ok(ref);const code=fs.readFileSync(path.resolve(out,JSON.parse(ref[1])),'utf8');assert.match(code,/import \{renderNativeRegionOwned as /);
 setupDOM();const {mount}=await import(pathToFileURL(path.join(out,'Parent.mjs'))),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);const button=findButton(root,'Child');assert.equal(button.getAttribute('aria-pressed'),'false');assert.equal(button.getAttribute('aria-current'),'false');findButton(root,'Toggle').click();await tick();assert.equal(findButton(root,'Child'),button);assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(button.getAttribute('aria-current'),'false');
});
