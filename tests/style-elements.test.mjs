import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';import {generate,emitGraph} from '../src/compiler.mjs';import {analyzeSequentialRegion} from '../src/region-compiler.mjs';import {projectSurface} from '../src/language-projection.mjs';import {formatSurface,applyFormatEdits} from '../src/formatter.mjs';import {typecheckGraph} from '../src/checker.mjs';
import {setupDOM,FakeNode,findInput,findButton,tick} from './fake-dom.mjs';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
const runtime=new URL('../src/runtime.mjs',import.meta.url).href,regional=new URL('../src/region-runtime.mjs',import.meta.url).href;
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-style-elements-'));t.after(()=>{assert.ok(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('elnor-style-elements-'));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
const body=`component Controls() {
 state active = false;
 state draft = "Keep";
 calc tone = active ? "active" : "idle";
 action toggle() { active = !active; }
 ui {
 section {
 h2 class=(tone) "Heading"
 p class=("literal-class") "Text"
 input class=(tone) "Draft" <-> draft
 button class=(tone) "Toggle" => toggle()
 }
 }
}`;
test('editor completes partial class members, renames state references and maps class diagnostics',t=>{
 const dir=fixture(t),file=path.join(dir,'Editor.eln'),service=createSurfaceLanguageService({root:dir});t.after(()=>service.dispose());
 const source='component Editor() {\n state appearance = {panel:"p-4",button:"p-2"};\n ui {\n section {\n button class=(appearance.panel) "Save" => appearance = {panel:"p-3",button:"p-1"}\n }\n }\n}';
 service.open(file,source);assert.deepEqual(service.diagnostics(file),[]);
 const offset=source.indexOf('appearance.panel')+'appearance.'.length;
 assert.ok(service.completions(file,offset).some(c=>c.name==='panel'));
 const plan=service.rename(file,source.indexOf('appearance ='),'visuals');service.applyRename(plan);assert.match(service.text(file),/class=\(visuals.panel\)/);assert.deepEqual(service.diagnostics(file),[]);
 const partial=source.replace('appearance.panel','appearance.');service.open(file,partial);assert.ok(service.completions(file,partial.indexOf('appearance.)')+'appearance.'.length).some(c=>c.name==='button'));
 const invalid=source.replace('appearance.panel','42');service.open(file,invalid);const diagnostic=service.diagnostics(file).find(d=>d.code==='TS2345');assert.ok(diagnostic,JSON.stringify(service.diagnostics(file)));assert.equal(invalid.slice(diagnostic.start,diagnostic.start+diagnostic.length),'42');
});
test('styled leaves retain expression, label and binding ranges',()=>{
 const ir=parseSurface(body,'Controls.eln');for(const node of ir.ui[0].children){for(const key of ['classSpan','exprSpan','labelSpan','bindingSpan'])if(node[key])assert.ok(body.slice(node[key].start,node[key].start+node[key].length).length>0);}
 assert.equal(ir.ui[0].children[2].binding,'draft');assert.equal(ir.ui[0].children[3].label,'"Toggle"');
 const tricky=body.replace('h2 class=(tone)','h2 class=(({ x: "class=(a) => b" }).x)');assert.equal(parseSurface(tricky,'Controls.eln').ui[0].children[0].classExpr,'({ x: "class=(a) => b" }).x');
 const result=formatSurface(tricky);assert.deepEqual(result.diagnostics,[]);assert.deepEqual(formatSurface(applyFormatEdits(tricky,result.edits)).edits,[]);
});
test('styled leaves enforce string types in checker and mapped editor projection',t=>{
 const dir=fixture(t),file=path.join(dir,'Controls.eln'),source=body.replaceAll('class=(tone)','class=(42)'),ir=parseSurface(source,file),errors=typecheckGraph(new Map([[file,ir]]),path.join(dir,'check'));
 assert.equal(errors.filter(d=>d.code==='TS2345').length,3,JSON.stringify(errors));
 const p=projectSurface(body,file);assert.equal((p.map.source.match(/__elnor_class: string/g)??[]).length,4);
 for(const node of parseSurface(body,file).ui[0].children){const mapped=p.map.toGenerated(node.classSpan.start);assert.ok(mapped.length);assert.ok(mapped.some(pos=>p.map.toOriginal(pos,node.classSpan.length)?.start===node.classSpan.start));}
});
for(const backend of ['general','region'])test(backend+' styles the actual control and preserves identity, labels, values and disposal',async t=>{
 const dir=fixture(t);setupDOM();const ir=parseSurface(body,path.join(dir,'Controls.eln')),code=generate(ir,{runtimeImport:runtime,...(backend==='region'?{regionRuntimeImport:regional}:{})});if(backend==='region')assert.match(code,/kind:"class"/);
 const file=path.join(dir,'controls.mjs');fs.writeFileSync(file,code);const {mount}=await import(pathToFileURL(file)),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);
 const input=findInput(root,'Draft'),button=findButton(root,'Toggle'),heading=root.descendants('h2')[0],label=input.parentNode;
 assert.equal(label.className,'');assert.equal(input.className,'idle');assert.equal(button.className,'idle');assert.equal(heading.className,'idle');assert.equal(root.descendants('p')[0].className,'literal-class');
 input.value='Edited';input.dispatch('input');await tick();button.click();await tick();assert.equal(findInput(root,'Draft'),input);assert.equal(findButton(root,'Toggle'),button);assert.equal(root.descendants('h2')[0],heading);assert.equal(input.value,'Edited');for(const n of [input,button,heading])assert.equal(n.className,'active');
 stop();button.click();await tick();for(const n of [input,button,heading])assert.equal(n.className,'active');assert.equal(root.childNodes.length,0);
});
test('native owned construction accepts eligible dynamic class tasks',async t=>{
 const dir=fixture(t),childFile=path.join(dir,'Child.eln'),parentFile=path.join(dir,'Parent.eln');
 const child=parseSurface('component Child(tone: string) {\n ui {\n section class=(tone) {\n p class=(tone) "Child"\n }\n }\n}',childFile);
 const parent=parseSurface('import Child from "./Child.eln";\ncomponent Parent(initialTone: string) {\n state tone = initialTone;\n action toggle() { tone = "active"; }\n ui {\n section {\n button "Toggle" => toggle()\n Child tone=(tone)\n }\n }\n}',parentFile);
 const graph=new Map([[parentFile,parent],[childFile,child]]),result=emitGraph(graph,path.join(dir,'out'));
 const sources=fs.readdirSync(path.join(dir,'out')).filter(n=>n.endsWith('.mjs')).map(n=>fs.readFileSync(path.join(dir,'out',n),'utf8'));
 assert.ok(sources.some(s=>s.includes('renderNativeRegionOwned')),'Expected specialized native owned builder for dynamic classes');
 setupDOM();const {mount}=await import(pathToFileURL(path.join(dir,'out/Parent.mjs'))),root=new FakeNode('root'),stop=mount(root,{initialTone:'idle'});t.after(stop);
 const childNode=root.descendants('section')[1],text=root.descendants('p')[0];assert.equal(childNode.className,'idle');assert.equal(text.className,'idle');findButton(root,'Toggle').click();await tick();assert.equal(root.descendants('section')[1],childNode);assert.equal(childNode.className,'active');assert.equal(text.className,'active');
});
test('sequential input construction retains literal classes on the actual input',async t=>{
 const dir=fixture(t);setupDOM();const source=body.replaceAll('class=(tone)','class=("fixed")'),ir=parseSurface(source,path.join(dir,'Controls.eln'));
 const plan=analyzeSequentialRegion(ir);assert.ok(plan.eligible);const code=generate(ir,{runtimeImport:runtime,regionRuntimeImport:regional,regionPlan:plan});
 const file=path.join(dir,'controls.mjs');fs.writeFileSync(file,code);const {mount}=await import(pathToFileURL(file)),root=new FakeNode('root'),stop=mount(root,{});t.after(stop);assert.equal(findInput(root,'Draft').className,'fixed');assert.equal(findInput(root,'Draft').parentNode.className,'');
});
test('missing leaf payloads report their original statement positions',()=>{
 for(const line of ['input class=("x")','button class=("x")','p class=("x")']){
  const source='component Broken() {\n ui {\n '+line+'\n }\n}';assert.throws(()=>parseSurface(source,'Broken.eln'),e=>e.code==='ELN-CLASS-SYNTAX'&&e.start>=source.indexOf(line)&&e.start<=source.indexOf(line)+line.length);
 }
});
test('unclosed class delimiter points to its opening parenthesis and expected closer',()=>{
 const source='component Broken() {\n ui {\n section class=("x" {\n }\n}';
 assert.throws(()=>parseSurface(source,'Broken.eln'),e=>e.code==='ELN-PARSE-002'&&e.start===source.indexOf('(',source.indexOf('class='))&&e.message.includes("expected ')'"));
});
