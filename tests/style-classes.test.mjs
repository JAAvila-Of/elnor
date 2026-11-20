import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {parseSurface} from '../src/parser.mjs';
import {generate} from '../src/compiler.mjs';
import {analyzeRegion} from '../src/region-compiler.mjs';
import {typecheckGraph} from '../src/checker.mjs';
import {projectSurface} from '../src/language-projection.mjs';
import {formatSurface,applyFormatEdits} from '../src/formatter.mjs';
import {setupDOM,FakeNode,findButton,findInput,tick} from './fake-dom.mjs';
const runtime=pathToFileURL(fileURLToPath(new URL('../src/runtime.mjs',import.meta.url))).href;
const regional=pathToFileURL(fileURLToPath(new URL('../src/region-runtime.mjs',import.meta.url))).href;
const simple=expr=>`component Panel() {\n ui {\n section class=(${expr}) {\n p "Body"\n }\n }\n}`;
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-class-prototype-'));t.after(()=>{assert.ok(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('elnor-class-prototype-'));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
test('class expression ranges preserve original UTF-16 text and existing shorthand',()=>{
 const source=simple('"sm:p-4 hover:bg-blue-500"'),ir=parseSurface(source,'Panel.eln'),n=ir.ui[0];
 assert.equal(source.slice(n.classSpan.start,n.classSpan.start+n.classSpan.length),'"sm:p-4 hover:bg-blue-500"');
 assert.equal(n.classExpr,'"sm:p-4 hover:bg-blue-500"');assert.equal(parseSurface(simple('"x"').replace('class=("x")','.panel'),'Panel.eln').ui[0].className,'panel');
 assert.throws(()=>parseSurface(simple('"x"').replace('class=','.panel class='),'Panel.eln'));
 assert.throws(()=>parseSurface(simple('value +'),'Panel.eln'));
});
test('formatter keeps braces inside class expressions opaque and becomes idempotent',()=>{
 const source=simple('({ panel: "p-4" }).panel'),formatted=formatSurface(source);
 assert.deepEqual(formatted.diagnostics,[]);const result=applyFormatEdits(source,formatted.edits);
 assert.equal(parseSurface(result,'Panel.eln').ui[0].classExpr,'({ panel: "p-4" }).panel');assert.deepEqual(formatSurface(result).edits,[]);
});
test('literal classes are constructed without reactive class bindings',()=>{
 const ir=parseSurface(simple('"p-4 hover:bg-blue-500"'),'Panel.eln'),plan=analyzeRegion(ir);
 assert.ok(plan.eligible);assert.equal(plan.bindings.length,0);assert.equal(plan.nodes[0].className,'p-4 hover:bg-blue-500');
 const code=generate(ir,{runtimeImport:runtime});assert.doesNotMatch(code,/runtime_classBinding\w*\(/);
});
for(const backend of ['general','region'])test(backend+' supports imported named classes and ignores unchanged class writes',async t=>{
 const dir=fixture(t);setupDOM();const module=path.join(dir,'appearance.mjs');fs.writeFileSync(module,'export const appearance = {panel:"p-4 hover:bg-blue-500"};');
 const source=`import { appearance } from "./appearance.mjs";\ncomponent Panel() {\n state version = 0;\n action update() { version++; }\n ui {\n section class=(version >= 0 ? appearance.panel : appearance.panel) {\n button "Update" => update()\n }\n }\n}`;
 const ir=parseSurface(source,path.join(dir,'Panel.eln')),code=generate(ir,{runtimeImport:runtime,moduleImports:new Map([['./appearance.mjs',pathToFileURL(module).href]]),...(backend==='region'?{regionRuntimeImport:regional}:{})});
 if(backend==='region')assert.match(code,/kind:"class"/);
 const file=path.join(dir,'panel.mjs');fs.writeFileSync(file,code);const {mount}=await import(pathToFileURL(file)),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);
 const panel=root.descendants('section')[0];assert.equal(panel.className,'p-4 hover:bg-blue-500');let value=panel.className,writes=0;Object.defineProperty(panel,'className',{get:()=>value,set:next=>{writes++;value=next;}});
 findButton(root,'Update').click();await tick();assert.equal(writes,0);assert.equal(panel.className,'p-4 hover:bg-blue-500');
});
for(const backend of ['general','region'])test(backend+' rejects non-string runtime values and cleans a failed mount',async t=>{
 const dir=fixture(t);setupDOM();const ir=parseSurface(simple('({} as any)'),path.join(dir,'Panel.eln'));
 const code=generate(ir,{runtimeImport:runtime,...(backend==='region'?{regionRuntimeImport:regional}:{})});
 if(backend==='region')assert.match(code,/kind:"class"/);
 const file=path.join(dir,'panel.mjs');fs.writeFileSync(file,code);const {mount}=await import(pathToFileURL(file)),root=new FakeNode('root');
 assert.throws(()=>mount(root,{}),/ELN-CLASS-TYPE/);assert.equal(root.childNodes.length,0);
});
for(const backend of ['general','region'])test(backend+' keeps keyed row identity and updates classes after reordering',async t=>{
 const dir=fixture(t);setupDOM();const source=`component Panel() {
 state rows = [{id:1,tone:"first"},{id:2,tone:"second"}];
 action reorder() { rows = [rows[1],rows[0]]; }
 ui {
 section {
 button "Reorder" => reorder()
 ul {
 each row in rows by row.id {
 li class=(row.tone) {
 p row.id
 }
 }
 }
 }
 }
}`;
 const ir=parseSurface(source,path.join(dir,'Panel.eln')),code=generate(ir,{runtimeImport:runtime,...(backend==='region'?{regionRuntimeImport:regional}:{})});
 if(backend==='region')assert.match(code,/kind:"class"/);
 const file=path.join(dir,'panel.mjs');fs.writeFileSync(file,code);const {mount}=await import(pathToFileURL(file)),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);
 const first=root.descendants('li');assert.deepEqual(first.map(n=>n.className),['first','second']);findButton(root,'Reorder').click();await tick();const reordered=root.descendants('li');assert.equal(reordered[0],first[1]);assert.equal(reordered[1],first[0]);assert.deepEqual(reordered.map(n=>n.className),['second','first']);
});
test('non-string class diagnostics map to Surface and expression projection retains symbols',t=>{
 const dir=fixture(t),file=path.join(dir,'Panel.eln'),source=simple('42'),ir=parseSurface(source,file);
 const diagnostics=typecheckGraph(new Map([[file,ir]]),path.join(dir,'check'));
 assert.ok(diagnostics.some(d=>d.code==='TS2345'&&d.file===file&&d.line===3),JSON.stringify(diagnostics));
 const named=simple('tone').replace(' ui {',' state tone = "panel";\n ui {'),p=projectSurface(named,file);
 assert.ok(p.map.source.includes('__elnor_class: string'));const at=named.indexOf('tone)',named.indexOf('ui'));
 const positions=p.map.toGenerated(at);assert.ok(positions.length>0);assert.ok(positions.some(pos=>p.map.toOriginal(pos,4)?.start===at));
});
for(const backend of ['general','region'])test(backend+' changes classes without replacing nodes and disposes callbacks',async t=>{
 const dir=fixture(t);setupDOM();
 const source=`component Panel() {
 state compact = false;
 state draft = "keep me";
 action toggle() { compact = !compact; }
 ui {
 section class=(compact ? "panel compact" : "panel roomy") {
 input "Draft" <-> draft
 output class=("feedback") (compact ? "Compact" : "")
 button "Toggle" => toggle()
 }
 }
}`;
 const ir=parseSurface(source,path.join(dir,'Panel.eln')),plan=analyzeRegion(ir);assert.ok(plan.eligible,JSON.stringify(plan));
 const code=generate(ir,{runtimeImport:runtime,...(backend==='region'?{regionRuntimeImport:regional}:{})});
 if(backend==='region')assert.match(code,/kind:"class"/);
 const output=path.join(dir,'panel.mjs');fs.writeFileSync(output,code);const {mount}=await import(pathToFileURL(output));const root=new FakeNode('root'),stop=mount(root,{});
 const panel=root.descendants('section')[0],input=findInput(root,'Draft'),button=findButton(root,'Toggle');
 const feedback=root.descendants('output')[0];
 assert.equal(feedback.className,'feedback');
 assert.equal(feedback.textContent,'');
 assert.equal(panel.className,'panel roomy');button.click();await tick();assert.equal(panel.className,'panel compact');assert.equal(findInput(root,'Draft'),input);assert.equal(root.descendants('section')[0],panel);assert.equal(input.value,'keep me');
 assert.equal(root.descendants('output')[0],feedback);
 assert.equal(feedback.textContent,'Compact');
 button.click();await tick();assert.equal(feedback.textContent,'');assert.equal(panel.className,'panel roomy');stop();stop();button.click();await tick();assert.equal(panel.className,'panel roomy');assert.equal(root.childNodes.length,0);
});
