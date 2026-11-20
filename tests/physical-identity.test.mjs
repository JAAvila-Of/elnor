import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';
import {emitGraph} from '../src/compiler.mjs';
import {typecheckGraph} from '../src/checker.mjs';
import {sourceKey} from '../src/source-identity.mjs';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {createAsyncLanguageService} from '../src/async-language-service.mjs';
import {setupDOM,FakeNode} from './fake-dom.mjs';

function workspace(t,files={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-physical-')),links=[],cleanup=[];
  const file=name=>path.join(root,name);
  fs.writeFileSync(file('package.json'),'{"type":"module"}');
  const graph=new Map();
  for(const [name,source] of Object.entries(files)){
    fs.mkdirSync(path.dirname(file(name)),{recursive:true});fs.writeFileSync(file(name),source);
    if(name.endsWith('.eln'))graph.set(file(name),parseSurface(source,file(name)));
  }
  fs.mkdirSync(file('actual/pkg'),{recursive:true});
  function link(name,target,type=process.platform==='win32'?'junction':'dir'){
    const alias=file(name);fs.symlinkSync(file(target),alias,type);links.push(alias);return alias;
  }
  link('linked','actual/pkg');
  t.after(async()=>{
    for(const dispose of cleanup.reverse())await dispose();
    for(const alias of links)if(fs.lstatSync(alias,{throwIfNoEntry:false}))fs.unlinkSync(alias);
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(root,{recursive:true,force:true});
  });
  return {root,file,graph,link,cleanup,out:file('output'),
    service(){const service=createSurfaceLanguageService({root});cleanup.push(()=>service.dispose());return service;},
    asyncService(){const service=createAsyncLanguageService({root});cleanup.push(()=>service.dispose());return service;}};
}
async function execute(f,output,expected){
  const component=output.components.find(component=>sourceKey(component.source)===sourceKey(f.file('Screen.eln')));
  const {mount}=await import(pathToFileURL(path.join(f.out,component.file)).href);
  setupDOM();const target=new FakeNode('root'),dispose=mount(target,{});
  assert.equal(target.textContent,expected);dispose();assert.equal(target.childNodes.length,0);
}
const child='component Child(label: string) {\n  ui {\n    span label\n  }\n}';
const consumer='import Left from "./actual/pkg/Child.eln";\nimport Right from "./linked/Child.eln";\ncomponent Screen() {\n  ui {\n    Left label="Ready"\n    Right label="Ready"\n  }\n}';

test('native ESM loader coalesces real and directory-linked module paths',async t=>{
  const f=workspace(t,{'actual/pkg/value.mjs':'export const token = {};'});
  const real=await import(pathToFileURL(f.file('actual/pkg/value.mjs')).href);
  const linked=await import(pathToFileURL(f.file('linked/value.mjs')).href);
  assert.equal(real,linked);assert.equal(real.token,linked.token);
});

test('emitted ordinary modules match native singleton identity through a junction',async t=>{
  const source='import {next as a} from "./actual/pkg/value.mjs";\nimport {next as b} from "./linked/value.mjs";\ncomponent Screen() {\n  action inspect() {return JSON.stringify([a(),b()]);}\n  ui {\n    span inspect()\n  }\n}';
  const f=workspace(t,{'Screen.eln':source,'actual/pkg/value.mjs':'let calls=0;\nexport function next() {return ++calls;}'});
  assert.deepEqual(typecheckGraph(f.graph,f.file('check')),[]);
  const output=emitGraph(f.graph,f.out);await execute(f,output,'[1,2]');
  assert.equal(fs.readdirSync(path.join(f.out,'.elnor-modules')).length,1);
});

test('ordinary module parent-relative imports use the physical source directory',async t=>{
  const f=workspace(t,{
    'Screen.eln':'import value from "./linked/value.mjs";\ncomponent Screen() {\n  ui {\n    span value\n  }\n}',
    'actual/pkg/value.mts':'export {default} from "../shared.mjs";',
    'actual/shared.mts':'export default "Ready";','shared.mts':'export default "Wrong";',
  });assert.deepEqual(typecheckGraph(f.graph,f.file('check')),[]);await execute(f,emitGraph(f.graph,f.out),'Ready');
});

test('Surface source aliases share one emitted identity and one contract',async t=>{
  const f=workspace(t,{'Screen.eln':consumer,'actual/pkg/Child.eln':child});
  f.graph.set(f.file('linked/Child.eln'),parseSurface(child,f.file('linked/Child.eln')));
  assert.deepEqual(typecheckGraph(f.graph,f.file('check')),[]);
  const output=emitGraph(f.graph,f.out);assert.equal(output.components.length,2);await execute(f,output,'ReadyReady');
});

test('Surface parent-relative imports are resolved from the physical origin',async t=>{
  const f=workspace(t,{
    'Screen.eln':'import Entry from "./linked/Entry.eln";\ncomponent Screen() {\n  ui {\n    Entry\n  }\n}',
    'actual/pkg/Entry.eln':'import Shared from "../Shared.eln";\ncomponent Entry() {\n  ui {\n    Shared\n  }\n}',
    'actual/Shared.eln':'component Shared() {\n  ui {\n    span "Ready"\n  }\n}',
    'Shared.eln':'component Shared() {\n  ui {\n    span "Wrong"\n  }\n}',
  });
  f.graph.delete(f.file('actual/pkg/Entry.eln'));
  f.graph.set(f.file('linked/Entry.eln'),parseSurface(fs.readFileSync(f.file('linked/Entry.eln'),'utf8'),f.file('linked/Entry.eln')));
  assert.deepEqual(typecheckGraph(f.graph,f.file('check')),[]);await execute(f,emitGraph(f.graph,f.out),'Ready');
});

test('known editor aliases share updates and closing one retains the other buffer',t=>{
  const f=workspace(t,{'Screen.eln':consumer,'actual/pkg/Child.eln':child}),service=f.service();
  service.open(f.file('actual/pkg/Child.eln'),child);service.open(f.file('linked/Child.eln'),child);service.open(f.file('Screen.eln'),consumer);
  const dirty=child.replace('label: string','label: number');service.open(f.file('linked/Child.eln'),dirty);
  assert.equal(service.text(f.file('actual/pkg/Child.eln')),dirty);
  assert.equal(service.diagnostics(f.file('Screen.eln')).filter(d=>d.code==='TS2322').length,2);
  service.close(f.file('linked/Child.eln'));assert.equal(service.text(f.file('actual/pkg/Child.eln')),dirty);
  service.close(f.file('actual/pkg/Child.eln'));assert.equal(service.text(f.file('linked/Child.eln')),child);
  service.open(f.file('Screen.eln'),consumer);assert.deepEqual(service.diagnostics(f.file('Screen.eln')),[]);
});

test('opening a new alias with conflicting text preserves the owned dirty buffer',t=>{
  const f=workspace(t,{'actual/pkg/Child.eln':child}),service=f.service();
  const dirty=child.replace('label: string','label: number');service.open(f.file('actual/pkg/Child.eln'),dirty);
  assert.throws(()=>service.open(f.file('linked/Child.eln'),child),/ELN-SOURCE-CONFLICT/);
  assert.equal(service.text(f.file('actual/pkg/Child.eln')),dirty);
});

test('rename updates both alias consumers and only one physical declaration',t=>{
  const f=workspace(t,{'Screen.eln':consumer,'actual/pkg/Child.eln':child}),service=f.service();
  service.open(f.file('Screen.eln'),consumer);
  const plan=service.rename(f.file('actual/pkg/Child.eln'),child.indexOf('label:'),'text');
  service.applyRename(plan);
  assert.equal(service.text(f.file('Screen.eln')),consumer.replaceAll('label=','text='));
  assert.equal(new Set(plan.edits.filter(edit=>!edit.file.endsWith('Screen.eln')).map(edit=>sourceKey(edit.file))).size,1);
  assert.deepEqual(service.diagnostics(f.file('Screen.eln')),[]);
});

test('worker replay preserves shared alias edits and survives closing the primary view',async t=>{
  const f=workspace(t,{'Screen.eln':consumer,'actual/pkg/Child.eln':child}),client=f.asyncService();
  client.open(f.file('actual/pkg/Child.eln'),child);client.open(f.file('linked/Child.eln'),child);client.open(f.file('Screen.eln'),consumer);
  const dirty=child.replace('label: string','label: number');client.open(f.file('linked/Child.eln'),dirty);
  assert.equal(client.text(f.file('actual/pkg/Child.eln')),dirty);
  await client.restart();
  assert.equal((await client.query('diagnostics',[f.file('Screen.eln')])).value.filter(d=>d.code==='TS2322').length,2);
  client.close(f.file('actual/pkg/Child.eln'));await client.restart();
  assert.equal(client.text(f.file('linked/Child.eln')),dirty);
  assert.equal((await client.query('diagnostics',[f.file('Screen.eln')])).value.filter(d=>d.code==='TS2322').length,2);
  client.close(f.file('linked/Child.eln'));await client.restart();
  assert.equal(client.text(f.file('actual/pkg/Child.eln')),undefined);
  assert.deepEqual((await client.query('diagnostics',[f.file('Screen.eln')])).value,[]);
});

test('unsaved new TypeScript files under linked directories use their physical parent',t=>{
  const source='import value from "./actual/pkg/New.mjs";\ncomponent Screen() {\n  ui {\n    span value()\n  }\n}';
  const f=workspace(t,{'Screen.eln':source}),service=f.service();
  service.open(f.file('linked/New.mts'),'export default function value() {return "Ready";}');service.open(f.file('Screen.eln'),source);
  assert.ok(!fs.existsSync(f.file('actual/pkg/New.mts')));assert.deepEqual(service.diagnostics(f.file('Screen.eln')),[]);
});

test('retargeting an owned junction invalidates rename instead of moving unsaved edits',t=>{
  const f=workspace(t,{'actual/pkg/Child.eln':child,'other/Child.eln':child.replace('Child','Other')}),service=f.service();
  service.open(f.file('linked/Child.eln'),child);
  const plan=service.rename(f.file('linked/Child.eln'),child.indexOf('label:'),'text');
  fs.unlinkSync(f.file('linked'));fs.symlinkSync(f.file('other'),f.file('linked'),process.platform==='win32'?'junction':'dir');
  assert.equal(service.isCurrent(plan),false);assert.throws(()=>service.applyRename(plan),/stale/i);
  assert.throws(()=>service.text(f.file('linked/Child.eln')),/ELN-ALIAS-RETARGET/);
  service.close(f.file('linked/Child.eln'));const next=fs.readFileSync(f.file('linked/Child.eln'),'utf8');
  service.open(f.file('linked/Child.eln'),next);assert.equal(service.text(f.file('linked/Child.eln')),next);
});

test('file symlinks share native and compiler identity',async t=>{
  const f=workspace(t,{'actual/pkg/value.mjs':'export const token = {};'});
  f.link('file-alias.mjs','actual/pkg/value.mjs','file');
  const real=await import(pathToFileURL(f.file('actual/pkg/value.mjs')).href);
  const alias=await import(pathToFileURL(f.file('file-alias.mjs')).href);assert.equal(real,alias);
  assert.equal(sourceKey(f.file('actual/pkg/value.mjs')),sourceKey(f.file('file-alias.mjs')));
});

test('first explicit alias view can replace disk-discovered text without losing its dirty state',t=>{
  const f=workspace(t,{'Screen.eln':consumer,'actual/pkg/Child.eln':child}),service=f.service();
  service.open(f.file('Screen.eln'),consumer);
  const dirty=child.replace('label: string','label: number');service.open(f.file('linked/Child.eln'),dirty);
  assert.equal(service.text(f.file('actual/pkg/Child.eln')),dirty);
  assert.equal(service.diagnostics(f.file('Screen.eln')).filter(d=>d.code==='TS2322').length,2);
});

test('async conflicting aliases do not mutate the buffer or its epoch',async t=>{
  const f=workspace(t,{'Screen.eln':consumer,'actual/pkg/Child.eln':child}),client=f.asyncService();
  const dirty=child.replace('label: string','label: number');client.open(f.file('actual/pkg/Child.eln'),dirty);
  const before=client.status().epoch;
  assert.throws(()=>client.open(f.file('linked/Child.eln'),child),/ELN-SOURCE-CONFLICT/);
  assert.equal(client.status().epoch,before);assert.equal(client.text(f.file('actual/pkg/Child.eln')),dirty);
  client.open(f.file('Screen.eln'),consumer);
  assert.equal((await client.query('diagnostics',[f.file('Screen.eln')])).value.filter(d=>d.code==='TS2322').length,2);
});

test('async snapshots and queries reject a retargeted owned junction',async t=>{
  const f=workspace(t,{'actual/pkg/Child.eln':child,'other/Child.eln':child.replace('Child','Other')}),client=f.asyncService();
  client.open(f.file('linked/Child.eln'),child);
  const response=await client.query('diagnostics',[f.file('linked/Child.eln')]);assert.deepEqual(response.value,[]);
  fs.unlinkSync(f.file('linked'));fs.symlinkSync(f.file('other'),f.file('linked'),process.platform==='win32'?'junction':'dir');
  assert.equal(client.isCurrent(response.snapshot),false);
  await assert.rejects(client.query('diagnostics',[f.file('linked/Child.eln')]),/ELN-ALIAS-RETARGET/);
  await assert.rejects(client.restart(),/ELN-ALIAS-RETARGET/);
  client.close(f.file('linked/Child.eln'));client.open(f.file('linked/Child.eln'),fs.readFileSync(f.file('linked/Child.eln'),'utf8'));
  await client.restart();assert.deepEqual((await client.query('diagnostics',[f.file('linked/Child.eln')])).value,[]);
});

test('linked TypeScript sources respect the physical package format',t=>{
  const f=workspace(t,{
    'Screen.eln':'import value from "./linked/value.js";\ncomponent Screen() {\n  ui {\n    span value\n  }\n}',
    'actual/package.json':'{"type":"commonjs"}','actual/pkg/value.ts':'export default "Ready";',
  });assert.ok(typecheckGraph(f.graph,f.file('check')).some(d=>d.code==='ELN-MODULE-CJS'));
  const service=f.service();service.open(f.file('Screen.eln'),fs.readFileSync(f.file('Screen.eln'),'utf8'));
  assert.ok(service.diagnostics(f.file('Screen.eln')).some(d=>d.code==='ELN-MODULE-CJS'));
  assert.throws(()=>emitGraph(f.graph,f.out),/ELN-MODULE-CJS/);
});

test('emitted file symlinks resolve parent-relative ESM edges physically',async t=>{
  const f=workspace(t,{
    'Screen.eln':'import value from "./file-alias.mjs";\ncomponent Screen() {\n  ui {\n    span value\n  }\n}',
    'actual/pkg/value.mjs':'export {default} from "../shared.mjs";','actual/shared.mjs':'export default "Ready";',
  });f.link('file-alias.mjs','actual/pkg/value.mjs','file');
  assert.deepEqual(typecheckGraph(f.graph,f.file('check')),[]);await execute(f,emitGraph(f.graph,f.out),'Ready');
});

test('closing the last alias restores the saved dependency without restarting analysis',async t=>{
  const f=workspace(t,{'Screen.eln':consumer,'actual/pkg/Child.eln':child}),service=f.service(),client=f.asyncService();
  const dirty=child.replace('label: string','label: number');
  for(const engine of [service,client]){
    engine.open(f.file('Screen.eln'),consumer);engine.open(f.file('linked/Child.eln'),dirty);
  }
  assert.equal(service.diagnostics(f.file('Screen.eln')).filter(d=>d.code==='TS2322').length,2);
  assert.equal((await client.query('diagnostics',[f.file('Screen.eln')])).value.filter(d=>d.code==='TS2322').length,2);
  service.close(f.file('linked/Child.eln'));client.close(f.file('linked/Child.eln'));
  assert.deepEqual(service.diagnostics(f.file('Screen.eln')),[]);
  assert.deepEqual((await client.query('diagnostics',[f.file('Screen.eln')])).value,[]);
});

test('stale known alias edits cannot overwrite another view before acknowledging its text',t=>{
  const f=workspace(t,{'actual/pkg/Child.eln':child}),service=f.service(),client=f.asyncService();
  const dirty=child.replace('span label','span label + "!"'),branch=child.replace('span label','span label.toUpperCase()');
  for(const engine of [service,client]){
    engine.open(f.file('actual/pkg/Child.eln'),child);engine.open(f.file('linked/Child.eln'),child);
    engine.open(f.file('linked/Child.eln'),dirty);
    assert.throws(()=>engine.open(f.file('actual/pkg/Child.eln'),branch),/ELN-SOURCE-CONFLICT/);
    assert.equal(engine.text(f.file('linked/Child.eln')),dirty);
    engine.open(f.file('actual/pkg/Child.eln'),dirty);
    engine.open(f.file('actual/pkg/Child.eln'),dirty.replace('"!"','"?"'));
    assert.equal(engine.text(f.file('linked/Child.eln')),dirty.replace('"!"','"?"'));
  }
});

test('rename requires all explicitly owned alias views to acknowledge the current buffer',async t=>{
  const f=workspace(t,{'Screen.eln':consumer,'actual/pkg/Child.eln':child}),service=f.service(),client=f.asyncService();
  const dirty=child.replace('span label','span label + "!"');
  for(const engine of [service,client]){
    engine.open(f.file('actual/pkg/Child.eln'),child);engine.open(f.file('linked/Child.eln'),child);engine.open(f.file('Screen.eln'),consumer);
    engine.open(f.file('linked/Child.eln'),dirty);
  }
  assert.throws(()=>service.rename(f.file('actual/pkg/Child.eln'),dirty.indexOf('label:'),'text'),/ELN-SOURCE-CONFLICT/);
  await assert.rejects(client.query('rename',[f.file('actual/pkg/Child.eln'),dirty.indexOf('label:'),'text']),/ELN-SOURCE-CONFLICT/);
  service.open(f.file('actual/pkg/Child.eln'),dirty);client.open(f.file('actual/pkg/Child.eln'),dirty);
  service.applyRename(service.rename(f.file('actual/pkg/Child.eln'),dirty.indexOf('label:'),'text'));
  assert.equal(service.text(f.file('Screen.eln')),consumer.replaceAll('label=','text='));
  const response=await client.query('rename',[f.file('actual/pkg/Child.eln'),dirty.indexOf('label:'),'text']);
  assert.equal(new Set(response.value.edits.filter(edit=>!edit.file.endsWith('Screen.eln')).map(edit=>sourceKey(edit.file))).size,1);
});

test('retargeting during worker startup rejects replay of text into the new target',async t=>{
  const f=workspace(t,{'actual/pkg/Child.eln':child,'other/Child.eln':child.replace('Child','Other')}),client=f.asyncService();
  client.open(f.file('linked/Child.eln'),child);
  const ready=client.ready();
  fs.unlinkSync(f.file('linked'));fs.symlinkSync(f.file('other'),f.file('linked'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(ready,/ELN-ALIAS-RETARGET/);
  assert.equal(client.status().alive,false);
});
