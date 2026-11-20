import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';import {generate} from '../src/compiler.mjs';import {analyzeRegion,analyzeSequentialRegion} from '../src/region-compiler.mjs';import {formatSurface,applyFormatEdits} from '../src/formatter.mjs';import {createSurfaceLanguageService} from '../src/language-service.mjs';import {typecheckGraph} from '../src/checker.mjs';
import {setupDOM,FakeNode,findButton,tick} from './fake-dom.mjs';
const base=`component Notes() {
 state draft = "first\\nsecond";
 state tone = "plain";
 action reset() { draft = "reset\\nvalue"; tone = "changed"; }
 ui {
 section {
 textarea class=(tone) "Description" <-> draft
 p draft
 button "Reset" => reset()
 }
 }
}`;
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-textarea-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elnor-textarea-'));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
test('textarea preserves binding and class source ranges, plain labels and formatter idempotence',()=>{
 for(const source of [base,base.replace('textarea class=(tone)','textarea')]){
  const ir=parseSurface(source,'Notes.eln'),node=ir.ui[0].children[0];assert.equal(node.kind,'input');assert.equal(node.tag,'textarea');assert.equal(source.slice(node.bindingSpan.start,node.bindingSpan.start+node.bindingSpan.length),'draft');
  const formatted=formatSurface(source);assert.deepEqual(formatted.diagnostics,[]);const next=applyFormatEdits(source,formatted.edits);assert.deepEqual(formatSurface(next).edits,[]);assert.equal(parseSurface(next,'Notes.eln').ui[0].children[0].tag,'textarea');
 }
});
test('textarea refuses immutable and nested bindings and missing labels',()=>{
 const immutable=base.replace('state draft','calc draft');assert.throws(()=>parseSurface(immutable,'Notes.eln'),e=>e.code==='ELN-SEM-BIND'&&e.start===immutable.lastIndexOf('<-> draft')+4);
 for(const source of [base.replace('state draft','calc draft'),base.replace('<-> draft','<-> draft.value'),base.replace('"Description" <-> draft','<-> draft')])assert.throws(()=>parseSurface(source,'Notes.eln'));
});
test('textarea checks both readable and writable string types and maps exact editor errors',t=>{
 const dir=fixture(t),file=path.join(dir,'Notes.eln'),service=createSurfaceLanguageService({root:dir});t.after(()=>service.dispose());
 for(const declaration of ['state draft = 42;','state draft: "only" = "only";']){
  const source=base.replace('state draft = "first\\nsecond";',declaration).replace('draft = "reset\\nvalue";','');
  service.open(file,source);const binding=source.lastIndexOf('<-> draft')+4;
  const errors=service.diagnostics(file);assert.ok(errors.some(d=>d.start===binding&&source.slice(d.start,d.start+d.length)==='draft'),JSON.stringify(errors));
  assert.ok(typecheckGraph(new Map([[file,parseSurface(source,file)]]),path.join(dir,'check')).some(d=>d.line===7));
 }
});
test('textarea binding supports native projection definitions and applied state rename without duplicate edits',t=>{
 const dir=fixture(t),file=path.join(dir,'Notes.eln'),service=createSurfaceLanguageService({root:dir});t.after(()=>service.dispose());service.open(file,base);assert.deepEqual(service.diagnostics(file),[]);
 const position=base.lastIndexOf('<-> draft')+4;assert.ok(service.definitions(file,position).some(d=>d.start===base.indexOf('draft =')));
 const plan=service.rename(file,position,'description');service.applyRename(plan);assert.match(service.text(file),/<-> description/);assert.deepEqual(service.diagnostics(file),[]);
});
for(const backend of ['general','blueprint','sequential']){
 test(backend+' textarea binds multiline values, classes and same-node updates; teardown removes callbacks',async t=>{
  const dir=fixture(t);setupDOM();const file=path.join(dir,'Notes.eln'),ir=parseSurface(base,file),runtimeImport=new URL('../src/runtime.mjs',import.meta.url).href,regionRuntimeImport=new URL('../src/region-runtime.mjs',import.meta.url).href;
  const regionPlan=backend==='sequential'?analyzeSequentialRegion(ir):analyzeRegion(ir);if(backend!=='general'){assert.ok(regionPlan.eligible);assert.equal(regionPlan.mode,backend);}
  const code=generate(ir,{runtimeImport,...(backend==='general'?{}:{regionRuntimeImport,regionPlan})}),output=path.join(dir,'Notes.mjs');fs.writeFileSync(output,code);const {mount}=await import(pathToFileURL(output)),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);
  const node=root.descendants('textarea')[0];assert.ok(node);assert.equal(node.parentNode.tag,'label');assert.equal(node.parentNode.descendants('span')[0].textContent,'Description');assert.equal(node.value,'first\nsecond');assert.equal(node.className,'plain');assert.equal(root.descendants('input').length,0);
  node.value='edited\n<img src=x>';node.dispatch('input');await tick();assert.equal(root.descendants('p')[0].textContent,node.value);assert.equal(root.descendants('img').length,0);
  findButton(root,'Reset').click();await tick();assert.equal(root.descendants('textarea')[0],node);assert.equal(node.value,'reset\nvalue');assert.equal(node.className,'changed');stop();stop();node.value='retired';node.dispatch('input');await tick();assert.equal(root.childNodes.length,0);assert.equal(node.listeners.input.length,0);
 });
}
for(const backend of ['general','region'])test(backend+' conditional textarea removal retires its input handler',async t=>{
 const dir=fixture(t);setupDOM();const source=base.replace('state tone = "plain";','state tone = "plain";\n state visible = true;').replace('textarea class=(tone) "Description" <-> draft','if visible {\n textarea class=(tone) "Description" <-> draft\n }').replace('button "Reset" => reset()','button "Reset" => reset()\n button "Hide" => visible = false'),ir=parseSurface(source,path.join(dir,'Notes.eln'));
 const code=generate(ir,{runtimeImport:new URL('../src/runtime.mjs',import.meta.url).href,...(backend==='region'?{regionRuntimeImport:new URL('../src/region-runtime.mjs',import.meta.url).href}:{})}),output=path.join(dir,'Notes.mjs');fs.writeFileSync(output,code);const {mount}=await import(pathToFileURL(output)),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);
 const node=root.descendants('textarea')[0];findButton(root,'Hide').click();await tick();assert.equal(root.descendants('textarea').length,0);node.value='late';node.dispatch('input');await tick();assert.equal(root.descendants('p')[0].textContent,'first\nsecond');assert.equal(node.listeners.input.length,0);
});

for(const tag of ['input','textarea'])test(tag+' notifies after binding writes and retires the callback with the field',async t=>{
 const dir=fixture(t);
 const source=`component Notes() {
  event changed(text: {value: string; bound: string})
  state draft = "initial";
  state visible = true;
  action notify(value: string) { emit.changed({value, bound: draft}); }
  ui {
    if visible {
      ${tag} on-input=(notify) "Notes" <-> draft
    }
    button "Reset" => draft = "reset"
    button "Hide" => visible = false
  }
}`;
 const ir=parseSurface(source,path.join(dir,'Notes.eln'));
 const scalarSource=base.replace('textarea class=(tone)',tag+' class=(tone) on-input=(() => undefined)');
 const scalar=parseSurface(scalarSource,path.join(dir,'Scalar.eln'));
 for(const plan of [analyzeRegion(scalar),analyzeSequentialRegion(scalar)]){
  assert.equal(plan.eligible,false);
  assert.deepEqual(plan.failures,['input-callback-requires-general-renderer']);
 }
 const output=path.join(dir,'Notes.mjs');
 fs.writeFileSync(output,generate(ir,{runtimeImport:new URL('../src/runtime.mjs',import.meta.url).href}));
 const {mount}=await import(pathToFileURL(output)),root=new FakeNode('root'),calls=[];
 setupDOM();
 t.after(mount(root,{},{changed:({value,bound})=>calls.push([value,bound])}));
 const control=root.descendants(tag)[0];
 const [retiredListener]=control.listeners.input;
 assert.equal(control.listeners.input.length,1);
 assert.deepEqual(calls,[]);
 control.value='edited';
 control.dispatch('input');
 control.dispatch('input');
 assert.deepEqual(calls,[['edited','edited'],['edited','edited']]);
 findButton(root,'Reset').click();
 await tick();
 assert.equal(control.value,'reset');
 assert.equal(calls.length,2);
 findButton(root,'Hide').click();
 await tick();
 assert.equal(control.listeners.input.length,0);
 control.value='late';
 retiredListener();
 assert.equal(calls.length,2);
});
