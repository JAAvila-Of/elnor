import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {formatSurface,applyFormatEdits} from '../src/formatter.mjs';
import {parseSurface} from '../src/parser.mjs';
import {typecheckGraph} from '../src/checker.mjs';
import {emitGraph} from '../src/compiler.mjs';
import {setupDOM,FakeNode,tick} from './fake-dom.mjs';

const counter=fs.readFileSync('examples/authoring/Counter.eln','utf8');
const unindent=source=>source.replace(/^[ \t]+/gm,'');
function formatted(source,options){
  const result=formatSurface(source,options);assert.deepEqual(result.diagnostics,[]);
  for(const edit of result.edits){assert.match(source.slice(edit.start,edit.start+edit.length),/^[ \t]*$/);assert.match(edit.newText,/^ *$/);}
  const text=applyFormatEdits(source,result.edits);assert.deepEqual(formatSurface(text,options),{edits:[],diagnostics:[]});return {text,result};
}
test('formats Surface and action indentation with original UTF-16 edits',()=>{
  const source=unindent(counter),{text,result}=formatted(source);
  assert.equal(text,counter);assert.ok(result.edits.length>0);
});
for(const file of ['UserEditor','UserList','Panel','ConfirmDialog'])test(`already formatted ${file} remains byte-identical`,()=>{
  const source=fs.readFileSync('examples/components/'+file+'.eln','utf8');assert.equal(formatted(source).text,source);
});
for(const file of ['Counter','App'])test(`already formatted authoring ${file} has no edits`,()=>{
  const source=fs.readFileSync('examples/authoring/'+file+'.eln','utf8');assert.deepEqual(formatSurface(source),{edits:[],diagnostics:[]});
});
test('preserves CRLF, BOM, Unicode and absence of final newline',()=>{
  const expected='\uFEFF'+counter.replace('Increment','café 😀').trimEnd().replaceAll('\n','\r\n');
  assert.equal(formatted(unindent(expected)).text,expected);
});
test('four-space indentation is explicit and idempotent',()=>{
  assert.equal(formatted(unindent(counter),{indentSize:4}).text,counter.replace(/^ +/gm,spaces=>' '.repeat(spaces.length*2)));
});
test('normalizes indentation tabs outside literals and preserves final newline presence',()=>{
  const source=counter.replace(/^ +/gm,spaces=>'\t'.repeat(spaces.length/2));
  assert.equal(formatted(source).text,counter);
  assert.equal(formatted(unindent(counter).trimEnd()).text,counter.trimEnd());
});
test('preserves multiline declaration headers and parameter trivia while formatting bodies',()=>{
  const header='component Demo(\n       value: {\n  label: string;\n }\n) {';
  const action='action read(\n      input: {x: number} = {x: 1}\n ) {';
  const source=header+'\n'+action+'\nreturn input.x;\n}\nui {\nspan value.label + read()\n}\n}\n';
  const {text}=formatted(source);assert.ok(text.startsWith(header));assert.ok(text.includes('  '+action));
  assert.ok(text.includes('    return input.x;'));assert.ok(text.includes('    span value.label + read()'));
});
test('protects multiline template and comment contents while indenting their surroundings',()=>{
  const literal='`first {\n \t keep this literal }\n  ${(() => "value")()}\nend`';
  const comment='/* braces { }\n \t comment contents stay\n  */';
  const source='component Demo() {\naction read() {\nconst text = '+literal+';\n'+comment+'\nconst re = /[{}]/;\n// café 😀 { }\nreturn text + re.source;\n}\nui {\nspan read()\n}\n}\n';
  const {text,result}=formatted(source);assert.ok(result.edits.length>0);
  assert.ok(text.includes(literal));assert.ok(text.includes(comment));assert.ok(text.includes('    // café 😀 { }'));
  assert.ok(text.includes('    return text + re.source;'));
});
test('preserves escaped string continuations and inline action bodies',()=>{
  const literal='"one\\\n  two"';
  const source='component Demo() {\naction read() {\nconst value = '+literal+';\nreturn value;\n}\naction inline() { return "{ }"; }\nui {\nspan read() + inline()\n}\n}\n';
  const {text}=formatted(source);assert.ok(text.includes(literal));assert.ok(text.includes('  action inline() { return "{ }"; }'));
});
test('uses TypeScript indentation for nested functions, objects and shadowing without changing their tokens',()=>{
  const source='component Demo(value: number) {\naction read() {\nconst fn = (value: number) => {\nif (value) {\nreturn {value: value + 1};\n}\nreturn {value: 0};\n};\nreturn fn(value).value;\n}\nui {\nspan read()\n}\n}\n';
  const {text}=formatted(source);assert.ok(text.includes('      if (value) {\n        return {value: value + 1};'));
});
test('expands compact action statements and object fields while preserving CRLF and comments',()=>{
  const source = [
    'component Demo() {',
    '  action read() { if (true) { /* keep this */ const draft = { title: "a b", priority: "high" }; return draft.title; } }',
    '  ui { span read() }',
    '}',
  ].join('\r\n');
  const result = formatSurface(source);
  assert.deepEqual(result.diagnostics, []);
  const text = applyFormatEdits(source, result.edits);
  assert.match(text, /action read\(\) \{\r\n    if \(true\) \{\r\n      \/\* keep this \*\/\r\n      const draft = \{\r\n        title: "a b",\r\n        priority: "high"\r\n      \};\r\n      return draft.title;\r\n    \}\r\n  \}/);
  assert.doesNotMatch(text, /(?<!\r)\n/);
  assert.deepEqual(formatSurface(text), {edits:[], diagnostics:[]});
});

test('wraps a long parenthesized initializer with whitespace-only original edits',()=>{
  const source=[
    '\uFEFFcomponent Demo(active: boolean) {',
    '  calc caption = (active ? "The selected task is ready to send to the assigned reviewer" : "Open the task before requesting a review");',
    '  state compact = (true ? "Open" : "Closed");',
    '  ui { p caption }',
    '}'
  ].join('\r\n');
  const result=formatSurface(source);
  assert.deepEqual(result.diagnostics,[]);
  assert.ok(result.edits.length);
  for(const edit of result.edits){
    assert.match(source.slice(edit.start,edit.start+edit.length),/^\s*$/);
    assert.match(edit.newText,/^\s*$/);
  }
  const text=applyFormatEdits(source,result.edits);
  assert.match(text,/calc caption = \(\r\n +active\r\n +\? "The selected task is ready to send to the assigned reviewer"\r\n +: "Open the task before requesting a review"\r\n  \);/);
  assert.ok(text.includes('  state compact = (true ? "Open" : "Closed");'));
  assert.ok(text.startsWith('\uFEFF'));
  assert.doesNotMatch(text,/(?<!\r)\n/);
  assert.deepEqual(formatSurface(text),{edits:[],diagnostics:[]});
});

test('wraps a typed state and keeps the original layout at comment and expression boundaries',()=>{
  const long='"A long value used to check that wrapping preserves the contents of the original string"';
  const source=[
    'component Demo() {',
    '  state flagged: string = (true ? '+long+' : "fallback");',
    '  calc unparenthesized = true ? '+long+' : "fallback";',
    '  calc commented = (/* keep beside the value */ '+long+');',
    '  calc compared = (true /* keep beside the comparison */ ? '+long+' : "fallback");',
    '  ui { p flagged }',
    '}'
  ].join('\n');
  const result=formatSurface(source,{indentSize:4});
  assert.deepEqual(result.diagnostics,[]);
  const text=applyFormatEdits(source,result.edits);
  assert.match(text,/    state flagged: string = \(\n +true\n +\?/);
  assert.ok(text.includes('calc unparenthesized = true ? '+long+' : "fallback";'));
  assert.ok(text.includes('calc commented = (/* keep beside the value */ '+long+');'));
  assert.ok(text.includes('true /* keep beside the comparison */ ? '+long+' : "fallback"'));
  assert.deepEqual(formatSurface(text,{indentSize:4}),{edits:[],diagnostics:[]});
});

test('formats the compact revision check to the Persistent Task desk layout',()=>{
  const app=fs.readFileSync('examples/persistent-task-desk/App.eln','utf8');
  const compact=app.replace(/calc newerRevision = \(\r?\n +([^\r\n]+)\r?\n +\);/,'calc newerRevision = ($1);');
  assert.notEqual(compact,app);
  const result=formatSurface(compact);
  assert.deepEqual(result.diagnostics,[]);
  assert.equal(applyFormatEdits(compact,result.edits),app);
});

test('wraps long if and guard conditions without changing logical groups or statement boundaries',()=>{
  const left='kind === "discard-attempt"';
  const right='(!confirmDiscardKey || before.attempt?.key !== confirmDiscardKey || before.receiptReview !== "ready")';
  const condition=left+' && '+right;
  const source=[
    'component Demo() {',
    '  action commit() {',
    '    if ('+condition+') return;',
    '    guard ('+condition+') then { notify("discard"); }',
    '    guard ('+condition+')',
    '    notify("continue");',
    '  }',
    '  ui { p "Ready" }',
    '}'
  ].join('\r\n');
  const result=formatSurface(source);
  assert.deepEqual(result.diagnostics,[]);
  for(const edit of result.edits){
    assert.match(source.slice(edit.start,edit.start+edit.length),/^\s*$/);
    assert.match(edit.newText,/^\s*$/);
  }
  const text=applyFormatEdits(source,result.edits);
  assert.match(text,/if \(\r\n +kind === "discard-attempt"\r\n +&& /);
  assert.equal((text.match(/guard \(\r\n/g)??[]).length,2);
  assert.ok(text.includes(right));
  assert.match(text,/\) then \{ notify\("discard"\); \}/);
  assert.match(text,/\)\r\n    notify\("continue"\);/);
  assert.doesNotMatch(text,/(?<!\r)\n/);
  assert.deepEqual(formatSurface(text),{edits:[],diagnostics:[]});
});

test('preserves comments, explicit breaks, and ordinary void expressions when wrapping conditions',()=>{
  const condition='waitingForProvider /* retry */ || anotherRequestOwnsTheTask || selectedRevisionDoesNotMatchCurrentTaskRevision';
  const protectedCondition='/* keep beside the opening parenthesis */ '+condition;
  const source=[
    'component Demo() {',
    '  action commit() {',
    '    if ('+condition+') return;',
    '    if ('+protectedCondition+') return;',
    '    if (',
    '      waitingForProvider || anotherRequestOwnsTheTask || selectedRevisionDoesNotMatchCurrentTaskRevision',
    '    ) return;',
    '    void ('+condition+');',
    '  }',
    '  ui { p "Ready" }',
    '}'
  ].join('\n');
  const result=formatSurface(source);
  assert.deepEqual(result.diagnostics,[]);
  const text=applyFormatEdits(source,result.edits);
  assert.match(text,/if \(\n +waitingForProvider \/\* retry \*\/ \|\| anotherRequestOwnsTheTask\n +\|\| selectedRevision/);
  assert.ok(text.includes('if ('+protectedCondition+') return;'));
  assert.ok(text.includes('waitingForProvider || anotherRequestOwnsTheTask || selectedRevisionDoesNotMatchCurrentTaskRevision'));
  assert.ok(text.includes('void ('+condition+');'));
  assert.deepEqual(formatSurface(text),{edits:[],diagnostics:[]});
});

test('indents nested Surface props, slots, events, lists and conditions without resolving imports',()=>{
  const source='import Child from "./does-not-exist.eln";\ncomponent Demo() {\nstate draft = "";\nui {\nsection .box {\ninput "Name" <-> draft\nif draft {\neach item in [draft] by item {\nChild label=(item + " { }") {\nfill actions {\nbutton "Go" => draft = ""\n}\non changed(value) => draft = value\n}\n}\n}\nslot\n}\n}\n}\n';
  const {text}=formatted(source);assert.ok(text.includes('        each item in [draft] by item {'));
  assert.ok(text.includes('              button "Go" => draft = ""'));
});
for(const [name,source] of [
  ['missing brace',counter.slice(0,counter.lastIndexOf('}'))],
  ['partial prop','component Demo() {\nui {\nChild la\n}\n}\n'],
  ['broken string','component Demo() {\nui {\np "unterminated\n}\n}\n'],
  ['broken action','component Demo() {\naction go() { const = ; }\nui {\nspan "Ready"\n}\n}\n'],
  ['unclosed comment','component Demo() {\naction go() { /* unfinished\n}\nui {\nspan "Ready"\n}\n}\n'],
])test(`refuses ${name} with no edits and an explicit diagnostic`,()=>{
  const result=formatSurface(source,{filename:'Broken.eln'});assert.deepEqual(result.edits,[]);
  assert.ok(result.diagnostics.some(d=>d.code==='ELN-FORMAT-PARSE'&&d.file==='Broken.eln'));
});
test('mixed line endings and invalid options are explicit refusals',()=>{
  for(const result of [formatSurface(counter.replace('\n','\r\n')),formatSurface(counter,{indentSize:3})]){
    assert.deepEqual(result.edits,[]);assert.ok(result.diagnostics.length>0);
  }
});
test('edit application rejects overlapping and out-of-range edits',()=>{
  assert.throws(()=>applyFormatEdits('abc',[{start:1,length:2,newText:''},{start:2,length:0,newText:''}]),/overlapping/);
  assert.throws(()=>applyFormatEdits('abc',[{start:4,length:0,newText:''}]),/Invalid/);
  assert.throws(()=>applyFormatEdits('abc',[{start:0,length:0,newText:'a'},{start:0,length:0,newText:'b'}]),/overlapping/);
});
test('formatting preserves typechecking, emitted state, component events and disposal',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-format-'));
  t.after(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('elnor-format-'));fs.rmSync(root,{recursive:true,force:true});});
  const before=new Map(),after=new Map();
  for(const name of ['Counter','App']){
    const file=path.join(root,name+'.eln'),source=unindent(fs.readFileSync('examples/authoring/'+name+'.eln','utf8'));fs.writeFileSync(file,source);
    before.set(file,parseSurface(source,file));after.set(file,parseSurface(formatted(source).text,file));
  }
  assert.deepEqual(typecheckGraph(before,path.join(root,'check-before')),[]);assert.deepEqual(typecheckGraph(after,path.join(root,'check-after')),[]);
  const observations=[];
  for(const [name,graph] of [['before',before],['after',after]]){
    const output=path.join(root,name),emitted=emitGraph(graph,output),entry=emitted.components.find(item=>item.source.endsWith('App.eln'));
    const {mount}=await import(pathToFileURL(path.join(output,entry.file)).href);setupDOM();const target=new FakeNode('root'),stop=mount(target,{});
    target.descendants('button')[0].click();await tick();observations.push(target.textContent);stop();assert.equal(target.childNodes.length,0);
  }
  assert.equal(observations[0],observations[1]);assert.match(observations[1],/Clicks: 1/);assert.match(observations[1],/Last event: 1/);
});

function cliFixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-format-cli-'));
  t.after(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('elnor-format-cli-'));fs.rmSync(root,{recursive:true,force:true});});
  const write=(name,source)=>{const file=path.join(root,name);fs.writeFileSync(file,source);return file;};
  const run=(...args)=>spawnSync(process.execPath,['scripts/format-surface.mjs',...args],{encoding:'utf8'});
  return {write,run};
}
test('read-only CLI prints formatted text from a path with spaces without changing disk bytes',t=>{
  const f=cliFixture(t),source='\uFEFF'+unindent(counter).replaceAll('\n','\r\n'),file=f.write('Counter with spaces.eln',source);
  const result=f.run(file);assert.equal(result.status,0);assert.equal(result.stderr,'');
  assert.equal(result.stdout,'\uFEFF'+counter.replaceAll('\n','\r\n'));
  assert.equal(fs.readFileSync(file,'utf8'),source);
});
test('CLI check distinguishes clean, changed and refused source without downgrading failures',t=>{
  const f=cliFixture(t),clean=f.write('Clean.eln',counter),changed=f.write('Changed.eln',unindent(counter)),broken=f.write('Broken.eln',counter.slice(0,-3));
  assert.equal(f.run('--check',clean).status,0);
  const needs=f.run('--check',changed);assert.equal(needs.status,1);assert.match(needs.stdout,/Needs formatting/);
  const refused=f.run('--check',broken,changed);assert.equal(refused.status,2);assert.match(refused.stderr,/ELN-FORMAT-PARSE/);
  assert.equal(fs.readFileSync(changed,'utf8'),unindent(counter));
});
test('CLI rejects write/ambiguous usage and reports missing files without source mutation',t=>{
  const f=cliFixture(t),file=f.write('Counter.eln',counter);
  for(const args of [[],['--write',file],[file,file]]){const result=f.run(...args);assert.equal(result.status,2);assert.match(result.stderr,/read-only/);}
  const missing=f.run(file+'.missing');assert.equal(missing.status,2);assert.match(missing.stderr,/ENOENT/);
  assert.equal(fs.readFileSync(file,'utf8'),counter);
});
