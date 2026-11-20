import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import fs from 'node:fs';import os from 'node:os';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {checkSurfaceProject} from '../src/project-check.mjs';
import {createSurfaceLanguageService} from '../src/language-service.mjs';import {parseSurface} from '../src/parser.mjs';import {projectSurface} from '../src/language-projection.mjs';import {createAsyncLanguageService} from '../src/async-language-service.mjs';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-dom-editor-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elnor-dom-editor-'));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
const wrap=line=>'component Pilot() {\n state flags = {busy:false};\n state label = "Ready";\n ui {\n section {\n '+line+'\n }\n }\n}';
function query(t,text){const dir=fixture(t),file=path.join(dir,'Pilot.eln'),at=text.indexOf('|');assert.ok(at>=0);const source=text.replace('|',''),service=createSurfaceLanguageService({root:dir});t.after(()=>service.dispose());service.open(file,source);return {source,file,at,service,items:service.completions(file,at)};}
test('property names appear after a bare DOM tag with host-specific snippets',t=>{
 for(const [line,names] of [['button |',['aria-current','aria-pressed','class','disabled']],['input |',['class','disabled','error','on-input']],['textarea |',['class','disabled','error','on-input']],['select |',['class','disabled','error']],['p |',['class']],['output |',['class']]]){
  const q=query(t,wrap(line));assert.deepEqual(q.items.map(i=>i.name).sort(),names);for(const entry of q.items){assert.equal(entry.kind,'property');assert.equal(entry.replacementSpan.file,q.file);assert.equal(entry.replacementSpan.start,q.at);assert.equal(entry.replacementSpan.length,0);assert.equal(entry.insertText,entry.name+'=(${1})');assert.equal(entry.isSnippet,true);}
 }
});
test('on-input completes typed callbacks while preserving the field error expression',t=>{
 const partial=query(t,wrap('input error=(label) on-input=(flags.|'));
 assert.ok(partial.items.some(entry=>entry.name==='busy'));
 const projection=projectSurface(partial.source,partial.file).map.source;
 assert.match(projection,/__elnor_error: string/);
 assert.match(projection,/__elnor_on_input: \(value: string\) => void/);
 const full=query(t,wrap('textarea on-input=((value: number) => undefined) "Notes" <-> label|'));
 fs.writeFileSync(full.file,full.source);
 const cli=checkSurfaceProject(full.file,{outputDir:path.join(path.dirname(full.file),'check')}).diagnostics;
 const diagnostic=full.service.diagnostics(full.file).find(item=>item.code==='TS2345');
 assert.ok(diagnostic);
 assert.match(full.source.slice(diagnostic.start,diagnostic.start+diagnostic.length),/value: number/);
 assert.ok(cli.some(item=>item.code===diagnostic.code&&item.line===diagnostic.line));
 assert.throws(()=>parseSurface(wrap('checkbox on-input=(label) "Marked" <-> label')),error=>error.code==='ELN-DOM-ATTRIBUTE');
});
test('field error expressions are checked as strings in CLI and editor',t=>{
 const root=fixture(t), file=path.join(root,'Pilot.eln');
 const service=createSurfaceLanguageService({root});t.after(()=>service.dispose());
 for(const tag of ['input','textarea','select']){
  const options=tag==='select'?' {\n option "Ready" => "Ready"\n }':'';
  const source=wrap(`${tag} error=(flags.busy) "Title" <-> label${options}`);
  fs.writeFileSync(file,source);
  service.open(file,source);
  const cli=checkSurfaceProject(file,{outputDir:path.join(root,'check')}).diagnostics;
  const editor=service.diagnostics(file);
  for(const diagnostics of [cli,editor])assert.deepEqual(diagnostics.map(({code,line})=>({code,line})),[{code:'TS2345',line:6}]);
  assert.equal(source.slice(editor[0].start,editor[0].start+editor[0].length),'flags.busy');
 }
 assert.throws(()=>parseSurface(wrap('button error=(label) "Save" => undefined')),error=>error.code==='ELN-DOM-ATTRIBUTE');
 assert.throws(()=>parseSurface(wrap('checkbox error=(label) "Marked" <-> label')),error=>error.code==='ELN-DOM-ATTRIBUTE');
});

test('unfinished field errors preserve string context and member completion',t=>{
 for(const tag of ['input','textarea','select']){
  const q=query(t,wrap(`${tag} class=("field") error=(flags.|`));
  assert.ok(q.items.some(item=>item.name==='busy'));
  const projection=projectSurface(q.source,q.file);
  assert.ok(projection.ir);
  assert.match(projection.map.source,/__elnor_error: string/);
 }
});
test('focus-invalid is suggested only on forms and keeps its boolean context',t=>{
 const q=query(t,wrap('form focus-| => undefined {\n submit "Save"\n }'));
 const item=q.items.find(entry=>entry.name==='focus-invalid');
 assert.equal(item?.insertText,'focus-invalid=(${1})');
 const partial=query(t,wrap('form focus-invalid=(flags.|'));
 assert.ok(partial.items.some(entry=>entry.name==='busy'));
 assert.match(projectSurface(partial.source,partial.file).map.source,/__elnor_focus_invalid: boolean/);
 const wrong=wrap('form focus-invalid=(label) => undefined {\n submit "Save"\n }');
 q.service.open(q.file,wrong);
 fs.writeFileSync(q.file,wrong);
 assert.ok(checkSurfaceProject(q.file,{outputDir:path.join(path.dirname(q.file),'check')}).diagnostics.some(diagnostic=>diagnostic.code==='TS2345'));
 const diagnostic=q.service.diagnostics(q.file).find(item=>item.code==='TS2345');
 assert.ok(diagnostic);
 assert.equal(wrong.slice(diagnostic.start,diagnostic.start+diagnostic.length),'label');
 assert.throws(()=>parseSurface(wrap('button focus-invalid=(true) "Save" => undefined')),error=>error.code==='ELN-DOM-ATTRIBUTE');
});
test('partial names replace their whole UTF-16 token including text after the caret',t=>{
 const q=query(t,wrap('button disa|bled "Save" => flags = {busy:true}'));const entry=q.items.find(i=>i.name==='disabled');assert.ok(entry);assert.equal(q.source.slice(entry.replacementSpan.start,entry.replacementSpan.start+entry.replacementSpan.length),'disabled');const next=q.source.slice(0,entry.replacementSpan.start)+entry.insertText.replace('${1}','flags.busy')+q.source.slice(entry.replacementSpan.start+entry.replacementSpan.length);assert.doesNotThrow(()=>parseSurface(next,q.file));
});
test('editing a name before an existing equals does not duplicate its expression',t=>{
 const q=query(t,wrap('button dis|abled=(flags.busy) "Save" => flags = {busy:true}')),entry=q.items.find(i=>i.name==='disabled');assert.ok(entry);assert.equal(entry.insertText,'disabled');assert.equal(entry.isSnippet,false);const next=q.source.slice(0,entry.replacementSpan.start)+entry.insertText+q.source.slice(entry.replacementSpan.start+entry.replacementSpan.length);assert.equal(next,q.source);assert.doesNotThrow(()=>parseSurface(next,q.file));
});
test('dash prefixes filter and exclude complete properties on either side',t=>{
 const q=query(t,wrap('button aria-| aria-current=(false) class=("x") "Save" => flags = {busy:true}'));assert.deepEqual(q.items.map(i=>i.name),['aria-pressed']);
 const other=query(t,wrap('button disabled=(true) | class=("x") "Save" => flags = {busy:true}'));assert.deepEqual(other.items.map(i=>i.name).sort(),['aria-current','aria-pressed']);
});
test('applied suggestions compile for every supported DOM host and property',t=>{
 for(const tag of ['button','input','textarea','select','p','section']){
  const q=query(t,wrap(tag+' |'));assert.ok(q.items.length>0);for(const entry of q.items){const value=entry.name==='on-input'?'() => undefined':entry.name==='class'||entry.name==='error'?'"panel"':'false',payload=tag==='button'?' "Save" => flags = {busy:true}':tag==='select'?' "Label" <-> label {\n option "Ready" => "Ready"\n }':tag==='input'||tag==='textarea'?' "Label" <-> label':tag==='section'?' {\n p "Body"\n }':' "Text"';const next=q.source.slice(0,q.at)+entry.insertText.replace('${1}',value)+payload+q.source.slice(q.at);assert.doesNotThrow(()=>parseSurface(next,q.file));}
 }
});
test('property suggestions do not leak into captions, TypeScript, comments or template text',t=>{
 for(const marked of [wrap('button "di|sabled" => flags = {busy:true}'),wrap('button la|bel => flags = {busy:true}'),wrap('button dis|abled => flags = {busy:true}'),wrap('button disabled=(flags.|busy) "Save" => flags = {busy:true}'),wrap('// button di|'),wrap('p `button di|`'),'component Pilot() {\n action run() {\n button di|\n }\n ui {\n p "Text"\n }\n}','component Pilot() {\n state text = `start ${1}\n button di|\n end`;\n ui {\n p text\n }\n}','component Pilot() {\n /* ui {\n button di|\n } */\n ui {\n p "Text"\n }\n}']){
  const q=query(t,marked);assert.ok(!q.items.some(i=>i.isSnippet),marked);if(marked.includes('flags.|busy'))assert.ok(q.items.some(i=>i.name==='busy'));q.service.dispose();
 }
});
test('unsafe or unsupported property prefixes and component tags are not given DOM templates',t=>{
 for(const line of ['button onclick=(noop) di|','input aria-|','Custom di|','section .panel cl|']){const q=query(t,wrap(line));assert.ok(!q.items.some(i=>i.isSnippet),line);}
});
test('unclosed outer property expressions retain member completion and original diagnostics',t=>{
 const q=query(t,wrap('button disabled=(flags.|'));
 for(const [tag,name] of [['button','class'],['button','disabled'],['button','aria-pressed'],['button','aria-current'],['input','disabled'],['textarea','disabled'],['p','class'],['section','class']]){
  const text=wrap(tag+' '+name+'=(flags.'),at=text.indexOf('flags.')+6;q.service.open(q.file,text);assert.throws(()=>parseSurface(text,q.file));assert.ok(q.service.completions(q.file,at).some(i=>i.name==='busy'),name);assert.ok(q.service.diagnostics(q.file).some(d=>String(d.code).startsWith('ELN-')),name);
 }
});
test('an empty property expression offers TypeScript state names without DOM suggestions',t=>{
 for(const line of ['button disabled=(|','button disabled=(|) \"Save\" => flags = {busy:true}','button class=(|) \"Save\" => flags = {busy:true}','input disabled=(|) \"Label\" <-> label']){const q=query(t,wrap(line));assert.ok(q.items.some(i=>i.name==='flags'),line);assert.ok(!q.items.some(i=>i.isSnippet));assert.throws(()=>parseSurface(q.source,q.file));q.service.dispose();}
});
test('recovery keeps later original ranges and cross-reference rename correct',t=>{
 const q=query(t,wrap('button disabled=(flags.|').replace(' }\n }\n}', ' button "Later" => flags = {busy:true}\n }\n }\n}'));assert.throws(()=>q.service.rename(q.file,q.source.indexOf('flags ='),'status'),/incomplete or invalid/);const later=q.source.indexOf('flags =',q.source.indexOf('Later'));assert.ok(q.service.definitions(q.file,later).some(d=>d.file===q.file&&d.start===q.source.indexOf('flags =')));assert.equal(q.service.text(q.file),q.source);const complete=q.source.replace('disabled=(flags.\n','disabled=(flags.busy) \"Recovered\" => flags = {busy:false}\n');q.service.open(q.file,complete);const plan=q.service.rename(q.file,complete.indexOf('flags ='),'status');q.service.applyRename(plan);const next=q.service.text(q.file);assert.ok(next.includes('disabled=(status.busy)'));assert.ok(next.includes('"Later" => status ='));assert.ok(!next.includes('__elnor_dom_'));assert.doesNotThrow(()=>parseSurface(next,q.file));
});
test('recovery masks synthetic spans instead of copying invented source text',t=>{
 const dir=fixture(t),file=path.join(dir,'Pilot.eln');
 for(const [tag,name] of [['button','disabled'],['input','disabled'],['textarea','disabled'],['p','class'],['section','class']])for(const eol of ['\n','\r\n']){
  const source=wrap(tag+' '+name+'=(flags.').replace('"Ready"','"😀 Ready"').replaceAll('\n',eol),p=projectSurface(source,file);assert.ok(p.ir);assert.equal(p.ir.source,source);
  for(const segment of p.map.segments){assert.ok(segment.originalStart>=0&&segment.originalStart+segment.length<=source.length);assert.equal(p.map.source.slice(segment.generatedStart,segment.generatedStart+segment.length),source.slice(segment.originalStart,segment.originalStart+segment.length));}
  const at=source.indexOf('flags.');assert.ok(p.map.toGenerated(at).some(g=>p.map.toOriginal(g,6)?.start===at));assert.throws(()=>parseSurface(source,file));
 }
 for(const line of ['button disabled=(({busy:flags.','button disabled=("unfinished','button disabled=(/* unfinished','button disabled=(flags.\n button class=(flags.']){const source=wrap(line);assert.equal(projectSurface(source,file).ir,null,line);assert.throws(()=>parseSurface(source,file));}
});
test('CRLF and surrogate pairs preserve the applied property replacement',t=>{
 const q=query(t,wrap('button di| "Save" => flags = {busy:true}').replace('state label = "Ready"','state label = "😀 Ready"').replaceAll('\n','\r\n')),entry=q.items.find(i=>i.name==='disabled');assert.ok(entry);assert.equal(q.source.slice(entry.replacementSpan.start,entry.replacementSpan.start+entry.replacementSpan.length),'di');assert.equal(entry.replacementSpan.start,q.source.indexOf('button di')+7);
});
test('async worker returns property snippets and recovers members after unsaved edits',async t=>{
 const dir=fixture(t),file=path.join(dir,'Pilot.eln'),service=createAsyncLanguageService({root:dir});t.after(()=>service.dispose());const text=wrap('button di');service.open(file,text);const first=await service.query('completions',[file,text.indexOf('button di')+9]);assert.ok(first.value.some(i=>i.name==='disabled'&&i.isSnippet));const next=wrap('button disabled=(flags.');service.open(file,next);const second=await service.query('completions',[file,next.indexOf('flags.')+6]);assert.ok(second.value.some(i=>i.name==='busy'));
});

test('editor recovery never makes a malformed project build replace its valid manifest',t=>{
 const dir=fixture(t),file=path.join(dir,'Pilot.eln'),out=path.join(dir,'build'),check=path.join(dir,'check'),valid=wrap('button disabled=(flags.busy) "Save" => flags = {busy:true}');fs.writeFileSync(file,valid);buildSurfaceProject(file,{outputDir:out,checkOutputDir:check});const manifest=fs.readFileSync(path.join(out,'manifest.json'),'utf8');const invalid=wrap('button disabled=(flags.');fs.writeFileSync(file,invalid);assert.ok(projectSurface(invalid,file).ir);assert.throws(()=>buildSurfaceProject(file,{outputDir:out,checkOutputDir:check}),e=>e.diagnostics?.some(d=>String(d.code).startsWith('ELN-')));assert.equal(fs.readFileSync(path.join(out,'manifest.json'),'utf8'),manifest);
});
