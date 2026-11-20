// Adapter integration with an API double and the real worker, not native editor evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const original='component Badge(label: string) { ui { span label } }';
const consumer='import Badge from "./Badge.eln"; component Screen() { ui { Badge label="Ready" } }';
const extension=fileURLToPath(new URL('../editors/vscode/extension.cjs',import.meta.url));
class Range { constructor(start,end){this.start=start;this.end=end;} }
class Diagnostic { constructor(range,message){this.range=range;this.message=message;} }
class Location { constructor(uri,range){this.uri=uri;this.range=range;} }
class TextEdit {static replace(range,newText){return {range,newText};}}
class WorkspaceEdit {
  changes=new Map();
  replace(uri,range,newText){const edits=this.changes.get(uri.fsPath)??[];edits.push({range,newText});this.changes.set(uri.fsPath,edits);}
}
const uri=file=>({scheme:'file',fsPath:file,toString:()=>file});
async function fixture(t,{files={},initialDocuments=[]}={}){
  const root=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'elnor-adapter-'));
  fs.writeFileSync(path.join(root,'Badge.eln'),original);
  fs.writeFileSync(path.join(root,'Screen.eln'),consumer);
  for(const [name,source] of Object.entries(files)){
    fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),source);
  }
  fs.symlinkSync(path.join(root,'Badge.eln'),path.join(root,'Alias.eln'),'file');
  const docs=[],markers=new Map(),events={},providers={},subscriptions=[],errors=[];
  const listen=name=>callback=>{(events[name]??=[]).push(callback);return {dispose(){}};};
  const fire=(name,event)=>{for(const callback of events[name]??[])callback(event);};
  const open=name=>{
    const file=path.join(root,name);
    const existing=docs.find(doc=>doc.uri.fsPath===file&&!doc.isClosed);
    if(existing)return existing;
    const doc={uri:uri(file),isClosed:false,version:1,languageId:file.endsWith('.eln')?'surface':'typescript',source:fs.readFileSync(file,'utf8'),
      get isDirty(){return this.source!==fs.readFileSync(file,'utf8');},
      getText(){return this.source;},positionAt:offset=>offset,offsetAt:position=>position};
    docs.push(doc);fire('open',doc);return doc;
  };
  const change=(doc,text)=>{doc.source=text;doc.version++;fire('change',{document:doc});};
  const close=doc=>{doc.isClosed=true;fire('close',doc);};
  const vscode={Range,Diagnostic,Location,TextEdit,WorkspaceEdit,DiagnosticSeverity:{Error:0},ExtensionMode:{Test:3},Uri:{file:uri},
    RelativePattern:class{},window:{createOutputChannel:()=>({error:e=>errors.push(e),dispose(){}}),tabGroups:{all:[],onDidChangeTabs:listen('tabs')}},
    languages:{createDiagnosticCollection:()=>({set:(u,d)=>markers.set(u.fsPath,d),clear:()=>markers.clear(),delete:u=>markers.delete(u.fsPath),dispose(){}}),
      registerCompletionItemProvider:(_s,p)=>{providers.completion=p;return {dispose(){}};},
      registerDefinitionProvider:(_s,p)=>{providers.definition=p;return {dispose(){}};},
      registerDocumentFormattingEditProvider:(_s,p)=>{providers.format=p;return {dispose(){}};},
      registerRenameProvider:(_s,p)=>{providers.rename=p;return {dispose(){}};}},
    workspace:{workspaceFolders:[{uri:uri(root)}],isTrusted:true,textDocuments:docs,
      findFiles:async()=>fs.readdirSync(root).filter(name=>name.endsWith('.eln')).map(name=>uri(path.join(root,name))),
      fs:{readFile:async u=>fs.readFileSync(u.fsPath)},openTextDocument:async u=>open(path.basename(u.fsPath)),
      createFileSystemWatcher:()=>({onDidCreate:listen('create'),onDidChange:listen('disk'),onDidDelete:listen('delete'),dispose(){}}),
      onDidOpenTextDocument:listen('open'),onDidChangeTextDocument:listen('change'),onDidCloseTextDocument:listen('close')},
  };
  const module={exports:{}};
  new Function('require','module','exports','__dirname',fs.readFileSync(extension,'utf8'))(
    name=>name==='vscode'?vscode:createRequire(extension)(name),module,module.exports,path.dirname(extension));
  for(const initial of initialDocuments)change(open(initial.file),initial.source);
  const api=await module.exports.activate({subscriptions,extensionMode:3});
  t.after(async()=>{
    for(const subscription of subscriptions)subscription.dispose();
    fs.unlinkSync(path.join(root,'Alias.eln'));
    const resolved=path.resolve(root),temporary=path.resolve(fs.realpathSync.native(os.tmpdir()))+path.sep;
    assert.ok(resolved.startsWith(temporary)&&path.basename(resolved).startsWith('elnor-adapter-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  const token={isCancellationRequested:false,onCancellationRequested:()=>({dispose(){}})};
  return {root,open,change,close,api,markers,errors,
    closeTab(doc){fire('tabs',{closed:[{input:{uri:doc.uri}}],opened:[]});},
    show(doc){fire('tabs',{closed:[],opened:[{input:{uri:doc.uri}}]});},
    async disk(name){for(const callback of events.disk??[])await callback(uri(path.join(root,name)));},
    async created(name){for(const callback of events.create??[])await callback(uri(path.join(root,name)));},
    async deleted(name){for(const callback of events.delete??[])await callback(uri(path.join(root,name)));},
    rename:(doc,offset=doc.source.indexOf('label:'))=>providers.rename.provideRenameEdits(doc,offset,'caption',token),
    definitions:(doc,offset)=>providers.definition.provideDefinition(doc,offset,token),
    async format(doc,options={tabSize:2,insertSpaces:true},cancellation=token){
      assert.ok(providers.format,'The adapter must register a formatting provider');
      return providers.format.provideDocumentFormattingEdits(doc,options,cancellation);
    },
    applyFormatting(doc,edits){
      let source=doc.source;
      for(const edit of [...edits].sort((a,b)=>b.range.start-a.range.start))source=source.slice(0,edit.range.start)+edit.newText+source.slice(edit.range.end);
      change(doc,source);
    },
    apply(edit){
      for(const [file,edits] of edit.changes){
        const doc=open(path.basename(file));let source=doc.source;
        for(const edit of [...edits].sort((a,b)=>b.range.start-a.range.start))source=source.slice(0,edit.range.start)+edit.newText+source.slice(edit.range.end);
        change(doc,source);
      }
    },
  };
}

test('adapter reports alias divergence without discarding either document and recovers after acknowledgment',async t=>{
  const f=await fixture(t),origin=f.open('Badge.eln'),alias=f.open('Alias.eln');
  const dirty=original.replace('span label','span label + "!"');
  f.change(origin,dirty);
  await f.api.testing.refreshDiagnostics();
  assert.equal(origin.source,dirty);assert.equal(alias.source,original);
  assert.ok(f.markers.get(alias.uri.fsPath)?.some(d=>d.code==='ELN-SOURCE-CONFLICT'));
  await assert.rejects(f.rename(origin),/ELN-SOURCE-CONFLICT/);
  f.change(alias,dirty);await f.api.testing.refreshDiagnostics();
  assert.deepEqual(f.markers.get(alias.uri.fsPath),[]);
  assert.deepEqual(f.markers.get(origin.uri.fsPath),[]);
});

test('adapter expands one physical rename to every open alias URI',async t=>{
  const f=await fixture(t),origin=f.open('Badge.eln'),alias=f.open('Alias.eln'),screen=f.open('Screen.eln');
  const edit=await f.rename(origin);
  assert.deepEqual(new Set(edit.changes.keys()),new Set([origin.uri.fsPath,alias.uri.fsPath,screen.uri.fsPath]));
  f.apply(edit);await f.api.testing.refreshDiagnostics();
  assert.equal(alias.source,origin.source);assert.match(alias.source,/caption: string/);
  assert.match(screen.source,/caption=/);
  assert.equal(fs.readFileSync(origin.uri.fsPath,'utf8'),original);
});

test('closing an alias cannot reload saved source over the remaining dirty view',async t=>{
  const f=await fixture(t),origin=f.open('Badge.eln'),alias=f.open('Alias.eln'),screen=f.open('Screen.eln');
  const dirty=original.replace('span label','span label + "!"');
  f.change(origin,dirty);f.change(alias,dirty);
  f.change(alias,original); // Model a saved-text change immediately before close.
  f.closeTab(alias);
  // Drain the adapter's asynchronous file read before checking the real worker.
  await new Promise(resolve=>setImmediate(resolve));
  await f.api.testing.refreshDiagnostics();await f.api.testing.restart();
  assert.equal(origin.source,dirty);
  const edit=await f.rename(origin);f.apply(edit);await f.api.testing.refreshDiagnostics();
  assert.deepEqual(f.markers.get(origin.uri.fsPath),[]);
  assert.deepEqual(f.markers.get(screen.uri.fsPath),[]);
  assert.equal(fs.readFileSync(origin.uri.fsPath,'utf8'),original);
  const reopened=f.open('Alias.eln');f.show(reopened);await f.api.testing.refreshDiagnostics();
  assert.equal(reopened.source,original);
  assert.ok(f.markers.get(reopened.uri.fsPath)?.some(d=>d.code==='ELN-SOURCE-CONFLICT'));
  f.change(reopened,origin.source);await f.api.testing.refreshDiagnostics();
  assert.deepEqual(f.markers.get(reopened.uri.fsPath),[]);
});

test('a closed disk alias does not block rename after a physical view becomes dirty',async t=>{
  const f=await fixture(t),origin=f.open('Alias.eln');
  f.change(origin,original.replace('span label','span label + "!"'));
  const edit=await f.rename(origin);
  assert.equal(edit.changes.size,2);
  assert.ok(!edit.changes.has(path.join(f.root,'Badge.eln')));
});

test('saved notifications through another alias cannot replace an owned dirty buffer',async t=>{
  const f=await fixture(t),origin=f.open('Badge.eln');
  const dirty=original.replace('span label','span label + "!"');
  f.change(origin,dirty);
  await f.disk('Alias.eln');await f.api.testing.refreshDiagnostics();
  assert.deepEqual(f.markers.get(origin.uri.fsPath),[]);
  assert.deepEqual(f.errors,[]);
  f.apply(await f.rename(origin));await f.api.testing.refreshDiagnostics();
  assert.match(origin.source,/span caption \+ "!"/);
  assert.equal(fs.readFileSync(origin.uri.fsPath,'utf8'),original);
});

const model='export interface Model { label: string; }\n';
const typed='import type {Model} from "./Model.mjs"; component Typed(model: Model) { ui { span model.label.toUpperCase() } }';
const typeFiles={'Model.mts':model,'Typed.eln':typed};
for(const [extension,importExtension] of [['mts','mjs'],['ts','js'],['cts','cjs']]){
test(`unsaved .${extension} dependency edits update exact Surface diagnostics`,async t=>{
  const f=await fixture(t,{files:{[`Model.${extension}`]:model,'Typed.eln':typed.replace('./Model.mjs',`./Model.${importExtension}`)}}),surface=f.open('Typed.eln'),dependency=f.open(`Model.${extension}`);
  await f.api.testing.refreshDiagnostics();assert.deepEqual(f.markers.get(surface.uri.fsPath),[]);
  const epoch=f.api.testing.status().epoch;
  f.change(dependency,model.replace('string','number'));await f.api.testing.refreshDiagnostics();
  assert.ok(f.api.testing.status().epoch>epoch);
  const error=f.markers.get(surface.uri.fsPath)?.find(d=>d.code==='TS2339');assert.ok(error);
  assert.equal(surface.source.slice(error.range.start,error.range.end),'toUpperCase');
  assert.equal(fs.readFileSync(dependency.uri.fsPath,'utf8'),model);
  assert.equal(f.markers.has(dependency.uri.fsPath),false,'Elnor leaves ordinary TS diagnostics to the TS extension');
});
}

test('TypeScript buffers open before activation are included in the first Surface snapshot',async t=>{
  const f=await fixture(t,{files:typeFiles,initialDocuments:[{file:'Model.mts',source:model.replace('string','number')}]}),surface=f.open('Typed.eln');
  await f.api.testing.refreshDiagnostics();
  assert.ok(f.markers.get(surface.uri.fsPath)?.some(d=>d.code==='TS2339'));
});

test('TypeScript replay preserves dirty source and actual document close restores saved types',async t=>{
  const f=await fixture(t,{files:typeFiles}),surface=f.open('Typed.eln'),dependency=f.open('Model.mts');
  f.change(dependency,model.replace('string','number'));await f.api.testing.restart();await f.api.testing.refreshDiagnostics();
  assert.ok(f.markers.get(surface.uri.fsPath)?.some(d=>d.code==='TS2339'));
  f.close(dependency);await new Promise(resolve=>setImmediate(resolve));await f.api.testing.refreshDiagnostics();
  assert.deepEqual(f.markers.get(surface.uri.fsPath),[]);
  assert.equal(fs.readFileSync(dependency.uri.fsPath,'utf8'),model);
});

test('Surface navigation uses current unsaved TypeScript declaration ranges',async t=>{
  const f=await fixture(t,{files:typeFiles}),surface=f.open('Typed.eln'),dependency=f.open('Model.mts');
  const dirty='// café 😀\n\n'+model;f.change(dependency,dirty);
  const found=await f.definitions(surface,typed.indexOf('model.label')+'model.'.length+1);
  const location=found.find(item=>item.uri.fsPath===dependency.uri.fsPath);assert.ok(location);
  assert.equal(location.range.start,dirty.indexOf('label:'));
  assert.equal(dependency.source.slice(location.range.start,location.range.end),'label');
});

test('Surface rename into an owned TypeScript dependency remains explicitly rejected',async t=>{
  const f=await fixture(t,{files:typeFiles}),surface=f.open('Typed.eln'),dependency=f.open('Model.mts');
  f.change(dependency,'// unsaved\n'+model);
  await assert.rejects(f.rename(surface,typed.indexOf('model.label')+'model.'.length+1),/Cross-language rename into TypeScript/);
  assert.equal(surface.source,typed);assert.equal(dependency.source,'// unsaved\n'+model);
});

test('saved changes of a previously registered TypeScript dependency invalidate Surface analysis',async t=>{
  const f=await fixture(t,{files:typeFiles}),surface=f.open('Typed.eln'),dependency=f.open('Model.mts');
  await f.api.testing.refreshDiagnostics();f.close(dependency);await new Promise(resolve=>setImmediate(resolve));
  fs.writeFileSync(dependency.uri.fsPath,model.replace('string','number'));
  await f.disk('Model.mts');await f.api.testing.refreshDiagnostics();
  assert.ok(f.markers.get(surface.uri.fsPath)?.some(d=>d.code==='TS2339'));
  fs.writeFileSync(dependency.uri.fsPath,model);await f.disk('Model.mts');await f.api.testing.refreshDiagnostics();
  assert.deepEqual(f.markers.get(surface.uri.fsPath),[]);
  assert.deepEqual(f.errors,[]);
});

test('saved changes of a TypeScript dependency never opened in the editor update Surface diagnostics',async t=>{
  const f=await fixture(t,{files:typeFiles}),surface=f.open('Typed.eln');
  await f.api.testing.refreshDiagnostics();assert.deepEqual(f.markers.get(surface.uri.fsPath),[]);
  const epoch=f.api.testing.status().epoch;
  fs.writeFileSync(path.join(f.root,'Model.mts'),model.replace('string','number'));
  await f.disk('Model.mts');await f.api.testing.refreshDiagnostics();
  assert.ok(f.markers.get(surface.uri.fsPath)?.some(d=>d.code==='TS2339'));
  assert.ok(f.api.testing.status().epoch>epoch);
  fs.writeFileSync(path.join(f.root,'Model.mts'),model);await f.disk('Model.mts');await f.api.testing.refreshDiagnostics();
  assert.deepEqual(f.markers.get(surface.uri.fsPath),[]);
});

const formatDirty='component FormatDemo() {\nstate count = 0;\naction go() {\ncount++;\n}\nui {\nspan count\n}\n}\n';
const formatExpected='component FormatDemo() {\n  state count = 0;\n  action go() {\n    count++;\n  }\n  ui {\n    span count\n  }\n}\n';
test('disk invalidation follows a never-opened transitive TypeScript dependency',async t=>{
  const f=await fixture(t,{files:{...typeFiles,'Model.mts':'export type {Model} from "./Leaf.mjs";','Leaf.mts':model}}),surface=f.open('Typed.eln');
  await f.api.testing.refreshDiagnostics();assert.deepEqual(f.markers.get(surface.uri.fsPath),[]);
  fs.writeFileSync(path.join(f.root,'Leaf.mts'),model.replace('string','number'));
  await f.disk('Leaf.mts');await f.api.testing.refreshDiagnostics();
  assert.ok(f.markers.get(surface.uri.fsPath)?.some(d=>d.code==='TS2339'));
});

test('create delete and recreate notifications refresh cached TypeScript module resolution',async t=>{
  const f=await fixture(t,{files:{'Typed.eln':typed}}),surface=f.open('Typed.eln'),file=path.join(f.root,'Model.mts');
  await f.api.testing.refreshDiagnostics();assert.ok(f.markers.get(surface.uri.fsPath)?.some(d=>d.code==='TS2307'));
  fs.writeFileSync(file,model);await f.created('Model.mts');await f.api.testing.refreshDiagnostics();
  assert.deepEqual(f.markers.get(surface.uri.fsPath),[]);
  fs.unlinkSync(file);await f.deleted('Model.mts');await f.api.testing.refreshDiagnostics();
  assert.ok(f.markers.get(surface.uri.fsPath)?.some(d=>d.code==='TS2307'));
  fs.writeFileSync(file,model.replace('string','number'));await f.created('Model.mts');await f.api.testing.refreshDiagnostics();
  assert.ok(f.markers.get(surface.uri.fsPath)?.some(d=>d.code==='TS2339'));
});

test('disk notifications preserve an unsaved TypeScript buffer until its view closes',async t=>{
  const f=await fixture(t,{files:typeFiles}),surface=f.open('Typed.eln'),dependency=f.open('Model.mts');
  const dirty=model.replace('string','number');f.change(dependency,dirty);
  await f.disk('Model.mts');await f.api.testing.refreshDiagnostics();
  assert.equal(dependency.source,dirty);assert.ok(f.markers.get(surface.uri.fsPath)?.some(d=>d.code==='TS2339'));
  f.close(dependency);await f.api.testing.refreshDiagnostics();assert.deepEqual(f.markers.get(surface.uri.fsPath),[]);
  fs.writeFileSync(dependency.uri.fsPath,dirty);await f.disk('Model.mts');await f.api.testing.refreshDiagnostics();
  assert.ok(f.markers.get(surface.uri.fsPath)?.some(d=>d.code==='TS2339'));
});

test('generated and dependency directory notifications do not invalidate the workspace',async t=>{
  const f=await fixture(t,{files:typeFiles}),surface=f.open('Typed.eln');
  await f.api.testing.refreshDiagnostics();const epoch=f.api.testing.status().epoch;
  for(const directory of ['node_modules','dist','.git','.elnor','.elnor-authoring-output']){
    await f.disk(directory+'/Model.mts');await f.created(directory+'/Model.mts');await f.deleted(directory+'/Model.mts');
  }
  assert.equal(f.api.testing.status().epoch,epoch);assert.deepEqual(f.errors,[]);
});

test('format provider returns unsaved edits without applying or saving them',async t=>{
  const f=await fixture(t,{files:{'Format.eln':formatExpected}}),doc=f.open('Format.eln');f.change(doc,formatDirty);
  const epoch=f.api.testing.status().epoch,edits=await f.format(doc);assert.ok(edits.length);
  assert.equal(doc.source,formatDirty);assert.equal(f.api.testing.status().epoch,epoch);
  assert.equal(fs.readFileSync(doc.uri.fsPath,'utf8'),formatExpected);
  f.applyFormatting(doc,edits);assert.equal(doc.source,formatExpected);assert.ok(f.api.testing.status().epoch>epoch);
  assert.deepEqual(await f.format(doc),[]);
  f.applyFormatting(doc,await f.format(doc,{tabSize:4,insertSpaces:true}));assert.match(doc.source,/\n    state count/);
  assert.deepEqual(await f.format(doc,{tabSize:4,insertSpaces:true}),[]);
  assert.equal(fs.readFileSync(doc.uri.fsPath,'utf8'),formatExpected);
});
test('format provider discards edits when the document version changes without a source event',async t=>{
  const f=await fixture(t,{files:{'Format.eln':formatExpected}}),doc=f.open('Format.eln');f.change(doc,formatDirty);
  const stop=f.api.testing.onEvent(event=>{if(event.type==='dispatched'&&event.method==='format')doc.version++;});
  try{assert.deepEqual(await f.format(doc),[]);assert.equal(doc.source,formatDirty);}finally{stop();}
});
test('format provider discards in-flight edits and preserves a newer unsaved source',async t=>{
  const f=await fixture(t,{files:{'Format.eln':formatExpected}}),doc=f.open('Format.eln');f.change(doc,formatDirty);
  const next=formatDirty.replace('count++;','count += 2;');
  const stop=f.api.testing.onEvent(event=>{if(event.type==='dispatched'&&event.method==='format')f.change(doc,next);});
  try{assert.deepEqual(await f.format(doc),[]);}finally{stop();}
  assert.equal(doc.source,next);f.applyFormatting(doc,await f.format(doc));assert.match(doc.source,/count \+= 2/);
});
test('format provider returns no edits when its target closes during dispatch',async t=>{
  const f=await fixture(t,{files:{'Format.eln':formatExpected}}),doc=f.open('Format.eln');f.change(doc,formatDirty);
  const stop=f.api.testing.onEvent(event=>{if(event.type==='dispatched'&&event.method==='format')f.close(doc);});
  try{assert.deepEqual(await f.format(doc),[]);assert.equal(doc.isClosed,true);}finally{stop();}
});
test('format provider respects cancellation during dispatch',async t=>{
  const f=await fixture(t,{files:{'Format.eln':formatExpected}}),doc=f.open('Format.eln');f.change(doc,formatDirty);
  const listeners=new Set(),token={isCancellationRequested:false,onCancellationRequested(callback){listeners.add(callback);return {dispose(){listeners.delete(callback);}};}};
  const stop=f.api.testing.onEvent(event=>{if(event.type==='dispatched'&&event.method==='format'){token.isCancellationRequested=true;for(const listener of [...listeners])listener();}});
  try{assert.deepEqual(await f.format(doc,undefined,token),[]);assert.equal(doc.source,formatDirty);}finally{stop();}
});
test('format provider refuses distinct open aliases and recovers after one closes',async t=>{
  const f=await fixture(t),doc=f.open('Badge.eln'),alias=f.open('Alias.eln');
  const dirty='component Badge(label: string) {\nui {\nspan label\n}\n}\n';f.change(doc,dirty);f.change(alias,dirty);
  await assert.rejects(f.format(doc),/ELN-FORMAT-ALIASES/);
  assert.equal(doc.source,alias.source);f.close(alias);await new Promise(resolve=>setImmediate(resolve));
  assert.ok((await f.format(doc)).length);
});
test('opening a new alias while formatting is dispatched invalidates the result',async t=>{
  const dirty='component Badge(label: string) {\nui {\nspan label\n}\n}\n';
  const f=await fixture(t,{files:{'Badge.eln':dirty}}),doc=f.open('Badge.eln');const audit=[];
  const stop=f.api.testing.onEvent(event=>{audit.push(event);if(event.type==='dispatched'&&event.method==='format')f.open('Alias.eln');});
  try{assert.deepEqual(await f.format(doc),[]);assert.ok(audit.some(event=>event.type==='stale'&&event.method==='format'));}finally{stop();}
});
test('format provider exposes refusals/options errors and leaves TypeScript to its own provider',async t=>{
  const f=await fixture(t,{files:{'Format.eln':formatExpected,'model.ts':'export type Model = string;'}}),doc=f.open('Format.eln');
  await assert.rejects(f.format(doc,{tabSize:2,insertSpaces:false}),/ELN-FORMAT-OPTIONS/);
  await assert.rejects(f.format(doc,{tabSize:3,insertSpaces:true}),/ELN-FORMAT-OPTIONS/);
  f.change(doc,formatDirty.slice(0,formatDirty.lastIndexOf('}')));
  await assert.rejects(f.format(doc),/ELN-FORMAT-PARSE/);
  assert.deepEqual(await f.format(f.open('model.ts')),[]);
  assert.equal(fs.readFileSync(doc.uri.fsPath,'utf8'),formatExpected);
});
