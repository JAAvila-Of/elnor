import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as compiler from '../src/compiler.mjs';
import {parseSurface} from '../src/parser.mjs';
import {typecheckGraph} from '../src/checker.mjs';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {setupDOM,FakeNode,tick} from './fake-dom.mjs';
import {createServer} from '../src/server.mjs';

function fixture(t,files,entry='Screen.eln'){
  const root=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'elnor-identity-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
  const graph=new Map();
  for(const [name,source] of Object.entries(files)){
    const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source);
    if(name.endsWith('.eln'))graph.set(file,parseSurface(source,file));
  }
  const service=createSurfaceLanguageService({root});t.after(()=>service.dispose());
  for(const [file,ir] of graph)service.open(file,ir.source);
  return {root,graph,service,entry:path.join(root,entry),out:path.join(root,'output'),
    cli:typecheckGraph(graph,path.join(root,'check'))};
}
function emit(f){
  assert.deepEqual(f.cli,[]);
  for(const file of f.graph.keys())assert.deepEqual(f.service.diagnostics(file),[]);
  return compiler.emitGraph(f.graph,f.out);
}
function record(output,file){return output.components.find(component=>component.source===path.resolve(file));}
async function mount(f,output,expected){
  const entry=record(output,f.entry);assert.ok(entry);
  const module=await import(pathToFileURL(path.join(f.out,entry.file)).href);
  setupDOM();const root=new FakeNode('root'),dispose=module.mount(root,{});
  assert.equal(root.textContent,expected);dispose();assert.equal(root.childNodes.length,0);
}
const left='component Badge(label: string) {\n  ui {\n    span label\n  }\n}';
const right='component Badge(count: number) {\n  ui {\n    span count\n  }\n}';
const consumer='import Left from "./left/Badge.eln";\nimport Right from "./right/Badge.eln";\ncomponent Screen() {\n  ui {\n    Left label="Ready"\n    Right count=7\n  }\n}';

test('same-named components retain independent contracts and executable modules',async t=>{
  const f=fixture(t,{'Screen.eln':consumer,'left/Badge.eln':left,'right/Badge.eln':right});
  const output=emit(f);await mount(f,output,'Ready7');
  const a=record(output,path.join(f.root,'left/Badge.eln')),b=record(output,path.join(f.root,'right/Badge.eln'));
  assert.notEqual(a.file,b.file);assert.equal(a.name,b.name);
  assert.ok(!fs.existsSync(path.join(f.out,'Badge.mjs')));
});

test('CLI and editor reject the correct same-named component contract',t=>{
  const invalid=consumer.replace('Right count=7','Right count="Wrong"');
  const f=fixture(t,{'Screen.eln':invalid,'left/Badge.eln':left,'right/Badge.eln':right});
  assert.ok(f.cli.some(d=>d.code==='TS2322'&&d.file===f.entry));
  const errors=f.service.diagnostics(f.entry);assert.ok(errors.some(d=>d.code==='TS2322'));
  assert.ok(!f.cli.some(d=>/label.*does not exist/.test(d.message)));
  assert.ok(f.cli.every(d=>d.code==='TS2322'));
  f.service.open(f.entry,consumer);assert.deepEqual(f.service.diagnostics(f.entry),[]);
});

test('filename and declaration name can differ for entry and child components',async t=>{
  const f=fixture(t,{
    'pages/Home.eln':'import Child from "../parts/File.eln";\ncomponent Entry() {\n  ui {\n    Child\n  }\n}',
    'parts/File.eln':'component Different() {\n  ui {\n    span "Ready"\n  }\n}',
  },'pages/Home.eln');
  const output=emit(f);await mount(f,output,'Ready');
  assert.equal(record(output,f.entry).name,'Entry');
  assert.ok(fs.existsSync(path.join(f.out,'Home.mjs')));assert.ok(fs.existsSync(path.join(f.out,'File.mjs')));
});

test('reserved runtime names no longer restrict component declarations',async t=>{
  const f=fixture(t,{'runtime.eln':'component runtime() {\n  ui {\n    span "Ready"\n  }\n}'},'runtime.eln');
  const output=emit(f);await mount(f,output,'Ready');
  assert.notEqual(record(output,f.entry).file,'runtime.mjs');
  const runtime=await import(pathToFileURL(path.join(f.out,'runtime.mjs')).href);assert.equal(typeof runtime.cell,'function');
  assert.equal(record(output,f.entry).alias,undefined);
});

test('equal filenames with different declarations do not collide',async t=>{
  const f=fixture(t,{
    'Screen.eln':'import A from "./a/File.eln";\nimport B from "./b/File.eln";\ncomponent Screen() {\n  ui {\n    A\n    B\n  }\n}',
    'a/File.eln':'component Left() {\n  ui {\n    span "Re"\n  }\n}',
    'b/File.eln':'component Right() {\n  ui {\n    span "ady"\n  }\n}',
  });const output=emit(f);await mount(f,output,'Ready');assert.ok(!fs.existsSync(path.join(f.out,'File.mjs')));
});

test('Unicode and space-containing source filenames execute through ASCII output paths',async t=>{
  const f=fixture(t,{
    'Screen.eln':'import Child from "./café 😀/file name.eln";\ncomponent Screen() {\n  ui {\n    Child\n  }\n}',
    'café 😀/file name.eln':'component Child() {\n  ui {\n    span "Ready"\n  }\n}',
  });const output=emit(f);await mount(f,output,'Ready');
  assert.ok(output.components.every(component=>/^\.elnor-components\/[a-f0-9]{64}\.mjs$/.test(component.file)));
});

test('canonical outputs remain stable when graph order or declaration names change',t=>{
  const f=fixture(t,{'Screen.eln':consumer,'left/Badge.eln':left,'right/Badge.eln':right});
  const first=emit(f);
  const reversed=compiler.emitGraph(new Map([...f.graph].reverse()),path.join(f.root,'reversed'));
  assert.deepEqual(reversed.components,first.components);assert.deepEqual(reversed.files,first.files);
  const renamed=new Map([...f.graph].map(([file,ir])=>[file,parseSurface(ir.source.replace('component Badge','component Renamed'),file)]));
  const third=compiler.emitGraph(renamed,path.join(f.root,'renamed'));
  assert.deepEqual(third.components.map(component=>component.file),first.components.map(component=>component.file));
});

test('normalized aliases for the same source file emit a single identity',t=>{
  const source='component Screen() {\n  ui {\n    span "Ready"\n  }\n}';
  const f=fixture(t,{'Screen.eln':source});
  const alias=path.join(f.root,'unused','..','Screen.eln');
  f.graph.set('alias',parseSurface(source,alias));
  const output=compiler.emitGraph(f.graph,f.out);assert.equal(output.components.length,1);
  assert.deepEqual(typecheckGraph(f.graph,path.join(f.root,'alias-check')),[]);
});

test('conflicting source versions fail before modifying existing output',t=>{
  const source='component Screen() {\n  ui {\n    span "Ready"\n  }\n}';
  const f=fixture(t,{'Screen.eln':source});
  f.graph.set('conflict',parseSurface(source.replace('Ready','Other'),f.entry));
  fs.mkdirSync(f.out);fs.writeFileSync(path.join(f.out,'keep.txt'),'Keep');
  assert.throws(()=>compiler.emitGraph(f.graph,f.out),/ELN-SOURCE-CONFLICT/);
  assert.deepEqual(fs.readdirSync(f.out),['keep.txt']);
  assert.ok(typecheckGraph(f.graph,path.join(f.root,'conflict-check')).some(d=>d.code==='ELN-SOURCE-CONFLICT'));
});

test('preview entry uses the mapped source file while fixture selection remains explicit',async t=>{
  const f=fixture(t,{'Home.eln':'component Other() {\n  ui {\n    span "Ready"\n  }\n}'},'Home.eln');
  const output=emit(f),entry=record(output,f.entry);
  fs.writeFileSync(path.join(f.out,'entry.mjs'),compiler.makePreviewScript('Home',entry.file));
  fs.writeFileSync(path.join(f.out,'preview-fixtures.mjs'),'export const preview = {Home:{props:{},events:()=>({})}};');
  setupDOM();const root=new FakeNode('root'),status=new FakeNode('p');
  document.getElementById=id=>id==='app'?root:status;
  await import(pathToFileURL(path.join(f.out,'entry.mjs')).href);assert.equal(root.textContent,'Ready');
  assert.ok(fs.readFileSync(path.join(f.out,'entry.mjs'),'utf8').includes(entry.file));
});

test('case-only alias names do not overwrite one another on Windows',async t=>{
  const f=fixture(t,{
    'Screen.eln':'import A from "./a/Badge.eln";\nimport B from "./b/badge.eln";\ncomponent Screen() {\n  ui {\n    A\n    B\n  }\n}',
    'a/Badge.eln':'component Badge() {\n  ui {\n    span "Re"\n  }\n}',
    'b/badge.eln':'component badge() {\n  ui {\n    span "ady"\n  }\n}',
  });const output=emit(f);await mount(f,output,'Ready');
  assert.ok(output.components.filter(component=>component.source!==f.entry).every(component=>!component.alias));
});

test('nested Surface modules share the emitted runtime and ordinary ESM dependencies',async t=>{
  const f=fixture(t,{
    'Screen.eln':'import Child from "./File.eln";\nimport suffix from "./helpers/suffix.mjs";\ncomponent Screen() {\n  state label = "Re";\n  ui {\n    Child label=(label + suffix)\n    button "Add" => label = "Ste"\n  }\n}',
    'File.eln':'component Different(label: string) {\n  ui {\n    span label\n  }\n}',
    'helpers/suffix.mts':'export default "ady";',
  });const output=emit(f),entry=record(output,f.entry);
  const {mount}=await import(pathToFileURL(path.join(f.out,entry.file)).href);
  setupDOM();const root=new FakeNode('root'),dispose=mount(root,{});assert.equal(root.textContent,'ReadyAdd');
  root.descendants('button')[0].click();await tick();assert.equal(root.textContent,'SteadyAdd');dispose();assert.equal(root.childNodes.length,0);
  const server=createServer({dist:f.out});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  for(const component of output.components){const response=await fetch(`http://127.0.0.1:${server.address().port}/${component.file}`);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^text\/javascript/);await response.text();}
});
