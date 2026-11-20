import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createProjectDev} from '../src/project-dev.mjs';
import {buildSurfaceProject} from '../src/project-build.mjs';

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-project-dev-')),project=path.join(root,'source & spaces');fs.mkdirSync(project);
  const links=[];
  t.after(()=>{
    for(const link of links)if(fs.lstatSync(link,{throwIfNoEntry:false}))fs.unlinkSync(link);
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('elnor-project-dev-'));
    fs.rmSync(root,{recursive:true,force:true});
  });
  const entry=path.join(project,'App.eln');fs.writeFileSync(entry,'component App() { ui { h1 "first" } }');
  return {root,project,entry,outputDir:path.join(project,'generated'),checkOutputDir:path.join(project,'scratch'),
    write:(name,text)=>fs.writeFileSync(path.join(project,name),text),
    link(file,target,type='file'){fs.symlinkSync(target,file,type);links.push(file);}};
}
function session(t,f,options={}){
  const dev=createProjectDev({...f,...options});
  t.after(()=>new Promise(resolve=>{dev.stop();dev.server.close(resolve);dev.server.closeAllConnections();}));
  return dev;
}
const manifest=f=>fs.readFileSync(path.join(f.outputDir,'manifest.json'),'utf8');
const settle=dev=>{dev.poll();return dev.poll();};
async function listen(dev){await new Promise(resolve=>dev.server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+dev.server.address().port;}

test('dev builds once, detects saved content after settling and ignores generated output',t=>{
  const f=fixture(t),dev=session(t,f);assert.equal(dev.status().state,'ready');const first=manifest(f);
  assert.equal(dev.poll(),false);assert.equal(manifest(f),first);
  f.write('App.eln','component App() { ui { h1 "second" } }');
  assert.equal(dev.poll(),false);assert.equal(dev.status().state,'pending');assert.equal(manifest(f),first);
  assert.equal(dev.poll(),true);assert.equal(dev.status().state,'ready');assert.notEqual(manifest(f),first);
  assert.equal(dev.poll(),false);assert.equal(dev.poll(),false);
  assert.equal(fs.readFileSync(f.entry,'utf8'),'component App() { ui { h1 "second" } }');
});

test('dev keeps a successful build on errors and recovers when a missing import is created',async t=>{
  const f=fixture(t),dev=session(t,f),url=await listen(dev),first=manifest(f);
  f.write('App.eln','import Child from "./Child.eln";\ncomponent App() { ui { Child } }');settle(dev);
  assert.equal(dev.status().state,'error');assert.equal(manifest(f),first);
  const failed=await fetch(url),html=await failed.text();assert.equal(failed.status,200);
  assert.match(html,/Build failed/);assert.match(html,/last successful build/i);assert.match(html,/project-dev-status/);
  f.write('Child.eln','component Child() { ui { h2 "created" } }');assert.equal(settle(dev),true);
  assert.equal(dev.status().state,'ready');assert.notEqual(manifest(f),first);assert.doesNotMatch(await (await fetch(url)).text(),/Build failed/);
});

test('dev stays available after an initial error and publishes after saving the fix',async t=>{
  const f=fixture(t);f.write('App.eln','component App( {');const events=[],dev=session(t,f,{onStatus:status=>events.push(status)}),url=await listen(dev);
  assert.equal(dev.status().state,'error');assert.equal((await fetch(url)).status,503);
  assert.match(await (await fetch(url)).text(),/No successful build/);assert.ok(events[0].error.diagnostics.length);
  f.write('App.eln','component Fixed() { ui { h1 "fixed" } }');settle(dev);
  assert.equal((await fetch(url)).status,200);assert.equal(dev.status().state,'ready');
});

test('dev detects transitive ESM edits, atomic saves, deletions and recreation by content',t=>{
  const f=fixture(t);f.write('App.eln','import {label} from "./value.mjs";\ncomponent App() { ui { h1 label } }');
  f.write('value.mts','export {label} from "./leaf.mjs";');f.write('leaf.mts','export const label="one";');
  const dev=session(t,f),first=manifest(f),leaf=path.join(f.project,'leaf.mts'),time=fs.statSync(leaf).mtime;
  f.write('leaf.mts','export const label="two";');fs.utimesSync(leaf,time,time);settle(dev);assert.notEqual(manifest(f),first);
  const second=manifest(f);f.write('temporary-save','export const label="new";');
  fs.renameSync(path.join(f.project,'temporary-save'),leaf);settle(dev);assert.notEqual(manifest(f),second);
  const third=manifest(f);fs.unlinkSync(leaf);settle(dev);assert.equal(dev.status().state,'error');assert.equal(manifest(f),third);
  f.write('leaf.mts','export const label="back";');settle(dev);assert.equal(dev.status().state,'ready');
});

test('dev reports watch failures without following links and resumes after their removal',t=>{
  const f=fixture(t),dev=session(t,f),first=manifest(f),external=path.join(f.root,'outside.mts');fs.writeFileSync(external,'keep');
  const link=path.join(f.project,'linked.mts');f.link(link,external);dev.poll();assert.equal(dev.status().state,'scan-error');assert.equal(manifest(f),first);
  fs.unlinkSync(link);dev.poll();assert.equal(dev.status().state,'ready');assert.equal(fs.readFileSync(external,'utf8'),'keep');
});

test('dev limits its watch scope, excludes dependency metadata and requires safe configuration',t=>{
  const f=fixture(t),dev=session(t,f),first=manifest(f);
  fs.mkdirSync(path.join(f.project,'node_modules'));f.write('node_modules/ignored.mts','changed');f.write('notes.txt','not input');
  f.write('props.json','{"label":"restart required"}');f.write('style.css','h1 {color:red}');
  assert.equal(settle(dev),false);assert.equal(manifest(f),first);
  f.write('package.json','{"type":"module"}');assert.equal(settle(dev),true);
  assert.throws(()=>createProjectDev({...f,watchDir:path.join(f.root,'other')}));
  assert.throws(()=>createProjectDev({...f,intervalMs:0}),/interval/);
  assert.throws(()=>createProjectDev({entry:f.entry,outputDir:f.outputDir}),/explicit/i);
});

test('dev page escapes watch scope/status text and retains preview CSP',async t=>{
  const f=fixture(t),dev=session(t,f),url=await listen(dev),response=await fetch(url),html=await response.text();
  assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);assert.match(html,/Watch scope:/);
  assert.match(html,/source &amp; spaces/);assert.doesNotMatch(html,/source & spaces/);
  f.write('App.eln','component App() { ui { h1 missing } }');settle(dev);
  assert.match(await (await fetch(url)).text(),/Build failed/);assert.equal(dev.status().error.diagnostics[0].file,f.entry);
});

test('live preview requests reload only after a verified new build',async t=>{
  const f=fixture(t),dev=session(t,f),url=await listen(dev);
  const current=dev.status().lastBuild.buildId;
  const live=build=>fetch(url+'/.elnor/dev/status?build='+build).then(response=>response.json());
  const html=await (await fetch(url)).text();
  assert.match(html,/id="project-dev-reload".*data-build=/);
  assert.equal((await fetch(url+'/.elnor/dev/status?build=invalid')).status,400);
  assert.equal((await live(current)).reload,false);
  f.write('App.eln','component App() { ui { h1 missing } }');
  settle(dev);
  const failed=await live(current);
  assert.equal(failed.reload,false);
  assert.match(failed.message,/Build failed/);
  f.write('App.eln','component App() { ui { h1 "fixed" } }');
  settle(dev);
  assert.equal((await live(current)).reload,true);
  assert.equal((await live(dev.status().lastBuild.buildId)).reload,false);
});

test('experimental preview keeps CSS changes compatible and reports why state changes reload',async t=>{
  const f=fixture(t),cssFile=path.join(f.root,'chosen.css');
  fs.writeFileSync(cssFile,'h1 { color: red; }');
  const counter='component Counter() {\n state count = 0;\n ui {\n section {\n h1 "Counter"\n p count\n }\n }\n}';
  fs.writeFileSync(f.entry,'component Counter(');
  const dev=session(t,f,{hot:true,cssFile}),url=await listen(dev);
  async function mounted(){
    const html=await (await fetch(url)).text();
    const inputs=html.match(/data-hot-revision="([a-f0-9]{64})"/)?.[1];
    assert.ok(inputs);
    return {build:dev.status().lastBuild.buildId,hot:inputs};
  }
  const poll=query=>fetch(url+'/.elnor/dev/status?'+new URLSearchParams(query)).then(response=>response.json());
  assert.equal((await fetch(url)).status,503);
  fs.writeFileSync(f.entry,counter);settle(dev);
  const recovered=await poll({build:''});
  assert.equal(recovered.reload,true);
  assert.equal(recovered.reloadNotice.reason,'first-build');
  assert.equal(recovered.reloadNotice.message,'The preview opened with the first valid build.');
  const first=await mounted();
  const renamed=counter.replace('"Counter"','"Updated"');
  fs.writeFileSync(f.entry,renamed);settle(dev);
  const compatible=await poll(first);
  assert.equal(compatible.reload,false);
  assert.equal(compatible.replacement.build,dev.status().lastBuild.buildId);
  assert.equal(compatible.reloadNotice,undefined);

  const second=await mounted();
  fs.writeFileSync(cssFile,'h1 { color: blue; }');
  fs.writeFileSync(f.entry,counter);settle(dev);
  const mixed=await poll(second);
  assert.equal(mixed.reload,false);
  assert.equal(mixed.replacement.build,dev.status().lastBuild.buildId);
  assert.equal(mixed.reloadNotice,undefined);
  assert.equal(await (await fetch(url+mixed.css)).text(),'h1 { color: blue; }');

  const third=await mounted();
  fs.writeFileSync(f.entry,counter.replace('count = 0','count = 10'));settle(dev);
  const reset=await poll(third);
  assert.equal(reset.reload,true);
  assert.equal(reset.reloadNotice.build,dev.status().lastBuild.buildId);
  assert.equal(reset.reloadNotice.reason,'state');
});

test('only experimental root text controls emit a focus binding marker',t=>{
  const f=fixture(t);
  fs.writeFileSync(f.entry,'component Form() {\n state draft = "";\n state notes = "";\n ui {\n section {\n input "Draft" <-> draft\n textarea "Notes" <-> notes\n }\n }\n}');
  const read=hot=>{
    const build=buildSurfaceProject(f.entry,{...f,hot});
    return fs.readFileSync(path.join(f.outputDir,build.entryOutput),'utf8');
  };
  assert.doesNotMatch(read(false),/data-elnor-hot-field/);
  const experimental=read(true);
  assert.match(experimental,/setAttribute\('data-elnor-hot-field', "draft"\)/);
  assert.match(experimental,/setAttribute\('data-elnor-hot-field', "notes"\)/);
});

test('dev timer starts once and stops with the server',async t=>{
  const f=fixture(t),dev=session(t,f,{intervalMs:25});await listen(dev);dev.start();dev.start();
  const first=manifest(f);f.write('App.eln','component App() { ui { h1 "timer" } }');
  const deadline=Date.now()+10000;while(manifest(f)===first&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,30));
  assert.notEqual(manifest(f),first);await new Promise(resolve=>dev.server.close(resolve));const stopped=manifest(f);
  f.write('App.eln','component App() { ui { h1 "after stop" } }');await new Promise(resolve=>setTimeout(resolve,100));assert.equal(manifest(f),stopped);
});

test('an explicit broader watch directory detects imports beside the entry directory',t=>{
  const f=fixture(t),nested=path.join(f.project,'nested');fs.mkdirSync(nested);
  const relocated=path.join(nested,'App.eln');fs.renameSync(f.entry,relocated);f.entry=relocated;
  fs.writeFileSync(f.entry,'import {label} from "../shared.mjs";\ncomponent App() { ui { h1 label } }');
  f.write('shared.mts','export const label="one";');
  const dev=session(t,f,{watchDir:f.project}),first=manifest(f);
  f.write('shared.mts','export const label="two";');assert.equal(settle(dev),true);assert.notEqual(manifest(f),first);
});

test('dev refuses a foreign output before serving or altering its files',t=>{
  const f=fixture(t);fs.mkdirSync(f.outputDir);fs.writeFileSync(path.join(f.outputDir,'keep.txt'),'foreign');
  assert.throws(()=>createProjectDev(f),/without project ownership/);
  assert.deepEqual(fs.readdirSync(f.outputDir),['keep.txt']);assert.equal(fs.readFileSync(path.join(f.outputDir,'keep.txt'),'utf8'),'foreign');
});

const script=fileURLToPath(new URL('../scripts/dev-project.mjs',import.meta.url));

const inputBoot=html=>html.match(/src="([^"]+entry\.mjs)"/)[1];
const inputStyle=html=>html.match(/href="([^"]+style\.css)"/)[1];
function inputFixture(t){
  const f=fixture(t);f.write('App.eln','component App(label: string) { ui { h1 label } }');
  f.propsFile=path.join(f.root,'props.json');f.cssFile=path.join(f.root,'chosen.css');
  fs.writeFileSync(f.propsFile,'{"label":"first"}');fs.writeFileSync(f.cssFile,'h1 {color:red}');return f;
}

test('live CSS uses the current props revision and keeps the last valid stylesheet',async t=>{
  const f=inputFixture(t),dev=session(t,f),url=await listen(dev),first=manifest(f);
  const html=await (await fetch(url)).text();
  const revision=html.match(/data-props="([a-f0-9]{64})"/)?.[1];
  assert.ok(revision);
  const live=()=>fetch(`${url}/.elnor/dev/status?build=${JSON.parse(first).buildId}&props=${revision}`).then(response=>response.json());
  fs.writeFileSync(f.cssFile,'h1 {color:blue}');
  const updated=await live();assert.equal(updated.reload,false);
  assert.equal(await (await fetch(url+updated.css)).text(),'h1 {color:blue}');
  assert.equal(await (await fetch(url+inputStyle(html))).text(),'h1 {color:red}');
  assert.equal(manifest(f),first);

  fs.writeFileSync(f.propsFile,'{"label":"second"}');fs.writeFileSync(f.cssFile,'h1 {color:green}');
  assert.equal((await live()).css,undefined);
  fs.writeFileSync(f.propsFile,'{');
  const invalid=await live();assert.equal(invalid.css,undefined);assert.match(invalid.message,/Preview inputs failed/);
  fs.writeFileSync(f.propsFile,'{"label":"first"}');
  const recovered=await live();assert.equal(await (await fetch(url+recovered.css)).text(),'h1 {color:green}');
});

test('preview inputs refresh props and CSS together on navigation without rebuilding Surface',async t=>{
  const f=inputFixture(t),dev=session(t,f),url=await listen(dev),before=manifest(f),first=await (await fetch(url)).text();
  const boot=inputBoot(first),css=inputStyle(first),oldBoot=await (await fetch(url+boot)).text();
  assert.match(oldBoot,/first/);fs.writeFileSync(f.propsFile,'{"label":"second"}');fs.writeFileSync(f.cssFile,'h1 {color:blue}');
  const second=await (await fetch(url)).text();assert.notEqual(inputBoot(second),boot);assert.notEqual(inputStyle(second),css);
  assert.match(await (await fetch(url+inputBoot(second))).text(),/second/);assert.equal(await (await fetch(url+inputStyle(second))).text(),'h1 {color:blue}');
  assert.equal(await (await fetch(url+boot)).text(),oldBoot);assert.equal(await (await fetch(url+css)).text(),'h1 {color:red}');assert.equal(manifest(f),before);
});

test('preview inputs reject malformed JSON as a pair, retain old bytes and recover on reload',async t=>{
  const f=inputFixture(t),dev=session(t,f),url=await listen(dev),first=await (await fetch(url)).text();
  fs.writeFileSync(f.propsFile,'{');fs.writeFileSync(f.cssFile,'h1 {color:green}');
  const failure=await fetch(url),html=await failure.text();assert.equal(failure.status,200);assert.equal(inputBoot(html),inputBoot(first));assert.equal(inputStyle(html),inputStyle(first));
  assert.match(html,/Preview inputs failed/);assert.equal(dev.status().previewInputs.state,'error');
  fs.writeFileSync(f.propsFile,'{"label":"recovered"}');const recovered=await (await fetch(url)).text();
  assert.doesNotMatch(recovered,/Preview inputs failed/);assert.match(await (await fetch(url+inputBoot(recovered))).text(),/recovered/);
  assert.equal(await (await fetch(url+inputStyle(recovered))).text(),'h1 {color:green}');
});

test('preview inputs recover after initial invalid props without restarting the server',async t=>{
  const f=inputFixture(t);fs.writeFileSync(f.propsFile,'[]');const dev=session(t,f),url=await listen(dev);
  const failure=await fetch(url);assert.equal(failure.status,503);assert.match(await failure.text(),/No valid props\/CSS revision/);
  fs.writeFileSync(f.propsFile,'{"label":"valid"}');assert.equal((await fetch(url)).status,200);assert.equal(dev.status().previewInputs.state,'ready');
});

test('preview inputs retain the last pair on missing or linked files and refuse raw input routes',async t=>{
  const f=inputFixture(t),dev=session(t,f),url=await listen(dev),first=await (await fetch(url)).text(),oldStyle=inputStyle(first);
  fs.unlinkSync(f.cssFile);assert.match(await (await fetch(url)).text(),/Preview inputs failed/);assert.equal(await (await fetch(url+oldStyle)).text(),'h1 {color:red}');
  const target=path.join(f.root,'external.css');fs.writeFileSync(target,'keep');f.link(f.cssFile,target);
  assert.match(await (await fetch(url)).text(),/Preview inputs failed/);assert.equal(fs.readFileSync(target,'utf8'),'keep');
  fs.unlinkSync(f.cssFile);fs.writeFileSync(f.cssFile,'h1 {color:purple}');assert.doesNotMatch(await (await fetch(url)).text(),/Preview inputs failed/);
  for(const route of ['/props.json','/chosen.css','/preview/style.css'])assert.equal((await fetch(url+route)).status,404);
});

test('preview inputs preserve JSON keys, escaped error text and stable revisions for identical content',async t=>{
  const f=inputFixture(t);f.write('App.eln','component App(label: string, __proto__?: {x: number}) { ui { h1 label } }');fs.writeFileSync(f.propsFile,'{"label":"</script>","__proto__":{"x":1}}');
  const dev=session(t,f),url=await listen(dev),first=await (await fetch(url)).text(),boot=await (await fetch(url+inputBoot(first))).text();
  assert.match(boot,/JSON\.parse/);assert.match(boot,/__proto__/);assert.doesNotMatch(first,/<\/script>.*__proto__/);
  fs.writeFileSync(f.propsFile,'{ "label": "</script>", "__proto__": {"x":1} }');assert.equal(inputBoot(await (await fetch(url)).text()),inputBoot(first));
  fs.writeFileSync(f.propsFile,'{"<img onerror=bad>":');const error=await (await fetch(url)).text();assert.doesNotMatch(error,/<img onerror/);
  assert.match(error,/Preview inputs failed/);
});

test('typed preview props reject wrong, missing and extra fields while retaining the valid pair',async t=>{
  const f=inputFixture(t),dev=session(t,f),url=await listen(dev),first=await (await fetch(url)).text(),before=manifest(f);
  for(const props of [{label:123},{},{label:'valid',unexpected:true}]){
    fs.writeFileSync(f.propsFile,JSON.stringify(props));const html=await (await fetch(url)).text();
    assert.match(html,/Preview inputs failed/);assert.equal(inputBoot(html),inputBoot(first));
    assert.ok(dev.status().previewInputs.diagnostics.some(d=>d.code.startsWith('TS')&&d.file===f.propsFile));
  }
  assert.equal(manifest(f),before);fs.writeFileSync(f.propsFile,'{"label":"fixed"}');assert.doesNotMatch(await (await fetch(url)).text(),/Preview inputs failed/);
});

test('typed preview props check imported nested objects, arrays, literal unions and optional fields',async t=>{
  const f=inputFixture(t);f.write('types.mts','export interface Config { mode: "small" | "large"; tags: string[]; details: {active: boolean} }');
  f.write('App.eln','import type {Config} from "./types.mjs";\ncomponent App(config: Config, note?: string) { ui { h1 config.mode } }');
  const valid={config:{mode:'small',tags:['one'],details:{active:true}}};fs.writeFileSync(f.propsFile,JSON.stringify(valid));
  const dev=session(t,f),url=await listen(dev);assert.equal((await fetch(url)).status,200);
  for(const props of [
    {config:{...valid.config,mode:'other'}},
    {config:{...valid.config,tags:[1]}},
    {config:{...valid.config,details:{active:'yes'}}},
  ]){
    fs.writeFileSync(f.propsFile,JSON.stringify(props));assert.match(await (await fetch(url)).text(),/Preview inputs failed/);
    assert.ok(dev.status().previewInputs.diagnostics.some(d=>d.path.includes('config')));
  }
  fs.writeFileSync(f.propsFile,JSON.stringify({...valid,note:'optional'}));assert.doesNotMatch(await (await fetch(url)).text(),/Preview inputs failed/);
});

test('typed preview props return a recovery page when no candidate matches the initial contract',async t=>{
  const f=inputFixture(t);fs.writeFileSync(f.propsFile,'{}');const dev=session(t,f),url=await listen(dev),response=await fetch(url);
  assert.equal(response.status,503);assert.match(await response.text(),/label/);
  fs.writeFileSync(f.propsFile,'{"label":"now valid"}');assert.equal((await fetch(url)).status,200);
});

test('typed preview props use frozen imported types and reject incompatible fallback after a new build',async t=>{
  const f=inputFixture(t);f.write('types.mts','export interface Data { label: string }');
  const source='import type {Data} from "./types.mjs";\ncomponent App(data: Data) { ui { h1 data.label } }';f.write('App.eln',source);
  fs.writeFileSync(f.propsFile,'{"data":{"label":"old contract"}}');const dev=session(t,f),url=await listen(dev),first=await (await fetch(url)).text();
  const oldBuild=dev.status().lastBuild.buildId;
  const live=()=>fetch(url+'/.elnor/dev/status?build='+oldBuild).then(response=>response.json());
  const oldBoot=inputBoot(first),oldBytes=await (await fetch(url+oldBoot)).text();
  f.write('types.mts','export interface Data { label: number }');
  // No source poll/publication yet: validation must still use the served contract.
  assert.doesNotMatch(await (await fetch(url)).text(),/Preview inputs failed/);
  f.write('App.eln','component Broken( {');settle(dev);fs.writeFileSync(f.propsFile,'{"data":{"label":9}}');
  assert.equal(inputBoot(await (await fetch(url)).text()),oldBoot);
  f.write('App.eln',source);settle(dev);assert.equal(dev.status().previewInputs.state,'unread');fs.writeFileSync(f.propsFile,'{"data":{"label":"incompatible"}}');
  const blocked=await live();assert.equal(blocked.reload,false);assert.match(blocked.message,/Automatic reload is waiting/);
  assert.equal((await fetch(url)).status,503);assert.equal(await (await fetch(url+oldBoot)).text(),oldBytes);
  fs.writeFileSync(f.propsFile,'{"data":{"label":9}}');assert.equal((await live()).reload,true);
  const recovered=await fetch(url);assert.equal(recovered.status,200);assert.notEqual(inputBoot(await recovered.text()),oldBoot);
});

test('typed preview props never execute imports or JSON-looking code during validation',async t=>{
  const f=inputFixture(t);f.write('runtime.mts','(globalThis as any).__elnorPropsExecuted=true; export const suffix="suffix";');
  f.write('App.eln','import {suffix} from "./runtime.mjs";\ncomponent App(label: string) { ui { h1 label + suffix } }');
  fs.writeFileSync(f.propsFile,JSON.stringify({label:'";globalThis.__elnorPropsExecuted=true;//'}));
  const dev=session(t,f),url=await listen(dev);assert.equal((await fetch(url)).status,200);assert.equal(globalThis.__elnorPropsExecuted,undefined);
});

test('typed preview props validate programmatic inputs and reject JSON values for required callbacks',async t=>{
  const f=fixture(t);f.write('App.eln','component App(label: string) { ui { h1 label } }');
  const dev=session(t,f,{props:{label:42}}),url=await listen(dev);assert.equal((await fetch(url)).status,503);
  assert.ok(dev.status().previewInputs.diagnostics.some(d=>d.path.includes('label')));
  const g=inputFixture(t);g.write('App.eln','component App(callback: () => void) { ui { h1 "callback" } }');fs.writeFileSync(g.propsFile,'{"callback":null}');
  const other=session(t,g),otherURL=await listen(other);assert.equal((await fetch(otherURL)).status,503);
});

test('typed preview props reject undeclared special keys without mutating prototypes',async t=>{
  const f=inputFixture(t);fs.writeFileSync(f.propsFile,'{"label":"value","__proto__":{"polluted":true}}');
  const dev=session(t,f),url=await listen(dev);assert.equal((await fetch(url)).status,503);assert.equal({}.polluted,undefined);
});

test('typed preview props require a current-session contract before serving an earlier output',async t=>{
  const f=inputFixture(t),first=session(t,f);await listen(first);const before=manifest(f);
  f.write('App.eln','component Broken( {');const second=session(t,f),url=await listen(second);
  assert.equal((await fetch(url)).status,503);assert.equal(manifest(f),before);
  f.write('App.eln','component App(label: string) { ui { h1 label } }');settle(second);assert.equal((await fetch(url)).status,200);
});

test('typed preview props refuse another build writer rather than applying the wrong captured contract',async t=>{
  const f=inputFixture(t),dev=session(t,f),url=await listen(dev);assert.equal((await fetch(url)).status,200);
  f.write('App.eln','component App(label: number) { ui { h1 label } }');
  buildSurfaceProject(f.entry,{outputDir:f.outputDir,checkOutputDir:path.join(f.root,'other-check')});
  assert.equal((await fetch(url)).status,503);
  settle(dev);fs.writeFileSync(f.propsFile,'{"label":7}');assert.equal((await fetch(url)).status,200);
});

test('preview inputs keep the last pair across source errors and allow input fixes independently',async t=>{
  const f=inputFixture(t),dev=session(t,f),url=await listen(dev),before=manifest(f);await fetch(url);
  f.write('App.eln','component App( {');settle(dev);fs.writeFileSync(f.propsFile,'{"label":"new props on last valid app"}');
  const html=await (await fetch(url)).text();assert.match(html,/Build failed/);assert.match(await (await fetch(url+inputBoot(html))).text(),/new props on last valid app/);assert.equal(manifest(f),before);
});

test('preview inputs reject changed entry metadata even when a new input revision is selected',async t=>{
  const f=inputFixture(t),dev=session(t,f),url=await listen(dev);await fetch(url);
  const data=JSON.parse(manifest(f));data.entryOutput=data.files.find(record=>record.file.endsWith('/runtime.mjs')).file;
  fs.writeFileSync(path.join(f.outputDir,'manifest.json'),JSON.stringify(data));fs.writeFileSync(f.propsFile,'{"label":"changed"}');
  assert.equal((await fetch(url)).status,503);
});

test('observed external Surface files rebuild on edits, deletion and recreation',t=>{
  const f=fixture(t),child=path.join(f.root,'Child.eln');
  fs.writeFileSync(child,'component Child() { ui { h2 "outside" } }');
  f.write('App.eln','import Child from "../Child.eln";\ncomponent App() { ui { Child } }');
  const dev=session(t,f),first=manifest(f);
  fs.writeFileSync(child,'component Child() { ui { h2 "changed" } }');assert.equal(settle(dev),true);assert.notEqual(manifest(f),first);
  const second=manifest(f);fs.unlinkSync(child);settle(dev);assert.equal(dev.status().state,'error');assert.equal(manifest(f),second);
  fs.writeFileSync(child,'component Child() { ui { h2 "back" } }');settle(dev);assert.equal(dev.status().state,'ready');
});

test('observed external transitive ESM edits rebuild without recursively scanning its neighbors',t=>{
  const f=fixture(t),shared=path.join(f.root,'shared');fs.mkdirSync(shared);
  f.write('App.eln','import {label} from "../shared/value.mjs";\ncomponent App() { ui { h1 label } }');
  fs.writeFileSync(path.join(shared,'value.mts'),'export {label} from "./leaf.mjs";');
  const leaf=path.join(shared,'leaf.mts');fs.writeFileSync(leaf,'export const label="one";');
  const dev=session(t,f),first=manifest(f),time=fs.statSync(leaf).mtime;
  fs.writeFileSync(leaf,'export const label="two";');fs.utimesSync(leaf,time,time);assert.equal(settle(dev),true);assert.notEqual(manifest(f),first);
  const second=manifest(f);fs.writeFileSync(path.join(shared,'unrelated.mts'),'not in graph');assert.equal(settle(dev),false);assert.equal(manifest(f),second);
  assert.ok(dev.status().dependencies.some(input=>input.file===leaf&&input.kind==='file'));
  assert.ok(dev.status().dependencies.every(input=>!input.file.includes('node_modules')));
});

test('observed missing external module directories recover when the imported file is created',t=>{
  const f=fixture(t);f.write('App.eln','import {label} from "../not-created/value.mjs";\ncomponent App() { ui { h1 label } }');
  const dev=session(t,f);assert.equal(dev.status().state,'error');
  const shared=path.join(f.root,'not-created');fs.mkdirSync(shared);fs.writeFileSync(path.join(shared,'value.mts'),'export const label="created";');
  assert.equal(settle(dev),true);assert.equal(dev.status().state,'ready');
});

test('observed external declarations and package context participate in rebuilds',t=>{
  const f=fixture(t),shared=path.join(f.root,'typed');fs.mkdirSync(shared);
  const declaration=path.join(shared,'types.d.mts');fs.writeFileSync(declaration,'export interface Data { label: string }');
  f.write('App.eln','import type {Data} from "../typed/types.mjs";\ncomponent App() { state data: Data = {label:"ok"}; ui { h1 data.label } }');
  const dev=session(t,f),first=manifest(f);fs.writeFileSync(declaration,'export interface Data { label: number }');
  settle(dev);assert.equal(dev.status().state,'error');assert.equal(manifest(f),first);
  fs.writeFileSync(declaration,'export interface Data { label: string }');settle(dev);assert.equal(dev.status().state,'ready');
});

test('observed package.json outside scope invalidates local JS module context',t=>{
  const f=fixture(t),shared=path.join(f.root,'context');fs.mkdirSync(shared);
  const packageFile=path.join(shared,'package.json');fs.writeFileSync(packageFile,'{"type":"module"}');
  fs.writeFileSync(path.join(shared,'value.ts'),'export const label="context";');
  f.write('App.eln','import {label} from "../context/value.js";\ncomponent App() { ui { h1 label } }');
  const dev=session(t,f),first=manifest(f);fs.writeFileSync(packageFile,'{"type":"commonjs"}');settle(dev);
  assert.equal(dev.status().state,'error');assert.equal(manifest(f),first);
  fs.writeFileSync(packageFile,'{"type":"module"}');settle(dev);assert.equal(dev.status().state,'ready');
});

test('observed failed resolution candidates detect higher priority source creation',t=>{
  const f=fixture(t),shared=path.join(f.root,'priority');fs.mkdirSync(shared);
  fs.writeFileSync(path.join(shared,'value.mjs'),'export const label="js";');
  f.write('App.eln','import {label} from "../priority/value.mjs";\ncomponent App() { ui { h1 label } }');
  const dev=session(t,f),first=manifest(f);fs.writeFileSync(path.join(shared,'value.mts'),'export const label="ts";');
  assert.equal(settle(dev),true);assert.notEqual(manifest(f),first);
});

test('observed dependencies stay watched while the entry graph is broken',t=>{
  const f=fixture(t),leaf=path.join(f.root,'retained.mts');fs.writeFileSync(leaf,'export const label="old";');
  const original='import {label} from "../retained.mjs";\ncomponent App() { ui { h1 label } }';f.write('App.eln',original);
  const dev=session(t,f),first=manifest(f);f.write('App.eln','component Broken( {');settle(dev);
  fs.writeFileSync(leaf,'export const label="new";');assert.equal(settle(dev),true);assert.equal(manifest(f),first);
  assert.ok(dev.status().dependencies.some(input=>input.file===leaf));
  f.write('App.eln',original);settle(dev);assert.equal(dev.status().state,'ready');assert.notEqual(manifest(f),first);
});

test('observed external dependency links pause builds without following the linked file',t=>{
  const f=fixture(t),leaf=path.join(f.root,'plain.mts'),target=path.join(f.root,'target.mts');
  fs.writeFileSync(leaf,'export const label="plain";');fs.writeFileSync(target,'export const label="external";');
  f.write('App.eln','import {label} from "../plain.mjs";\ncomponent App() { ui { h1 label } }');
  const dev=session(t,f),first=manifest(f);fs.unlinkSync(leaf);f.link(leaf,target);dev.poll();
  assert.equal(dev.status().state,'scan-error');assert.equal(manifest(f),first);
  fs.unlinkSync(leaf);fs.writeFileSync(leaf,'export const label="regular again";');settle(dev);assert.equal(dev.status().state,'ready');
});

test('observed JS runtime remains watched when TypeScript uses a separate declaration contract',t=>{
  const f=fixture(t),runtime=path.join(f.root,'contract.mjs');
  fs.writeFileSync(runtime,'export const label="runtime one";');fs.writeFileSync(path.join(f.root,'contract.d.mts'),'export const label: string;');
  f.write('App.eln','import {label} from "../contract.mjs";\ncomponent App() { ui { h1 label } }');
  const dev=session(t,f),first=manifest(f);fs.writeFileSync(runtime,'export const label="runtime two";');
  assert.equal(settle(dev),true);assert.notEqual(manifest(f),first);assert.equal(dev.status().state,'ready');
});

test('observed input baselines do not swallow edits made immediately after publication',t=>{
  const f=fixture(t),leaf=path.join(f.root,'during-build.mts');fs.writeFileSync(leaf,'export const label="before";');
  f.write('App.eln','import {label} from "../during-build.mjs";\ncomponent App() { ui { h1 label } }');
  let changed=false;
  const dev=session(t,f,{onStatus(status){if(status.state==='ready'&&!changed){changed=true;fs.writeFileSync(leaf,'export const label="after";');}}});
  const first=manifest(f);assert.equal(settle(dev),true);assert.notEqual(manifest(f),first);
  assert.equal(dev.poll(),false);
});

test('dev CLI rejects incomplete or duplicate arguments without launching apps',t=>{
  const f=fixture(t);
  for(const args of [[],[f.entry],[f.entry,'--out'],[f.entry,'--out',f.outputDir,'--port','bad'],[f.entry,'--out',f.outputDir,'--watch-dir'],
    [f.entry,'--out',f.outputDir,'--out',f.outputDir]]){
    const result=spawnSync(process.execPath,[script,...args],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/Usage:/);
  }
});

async function cli(t,f,args=[]){
  const child=spawn(process.execPath,[script,f.entry,'--out',f.outputDir,'--port','0',...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){const end=new Promise(resolve=>child.once('exit',resolve));child.kill();await end;}});
  return await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Dev CLI did not start')),15000);t.after(()=>clearTimeout(timeout));
    let output='';child.stdout.on('data',bytes=>{output+=bytes;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve(match[0]);}});
    child.once('error',reject);child.once('exit',code=>reject(Error('Dev CLI exited: '+code)));
  });
}

test('preview inputs CLI stays available with invalid props and refreshes explicit files on navigation',async t=>{
  const f=inputFixture(t);fs.writeFileSync(f.propsFile,'invalid');const url=await cli(t,f,['--props',f.propsFile,'--css',f.cssFile]),before=manifest(f);
  assert.equal((await fetch(url)).status,503);fs.writeFileSync(f.propsFile,'{"label":"CLI input"}');
  const first=await (await fetch(url)).text();assert.match(await (await fetch(url+inputBoot(first))).text(),/CLI input/);
  fs.writeFileSync(f.cssFile,'h1 {color:orange}');const next=await (await fetch(url)).text();assert.notEqual(inputStyle(next),inputStyle(first));
  assert.equal(await (await fetch(url+inputStyle(next))).text(),'h1 {color:orange}');assert.equal(manifest(f),before);
});

test('dev CLI builds and serves, then rebuilds on save without another command',async t=>{
  const f=fixture(t),url=await cli(t,f);
  const first=manifest(f);assert.equal((await fetch(url)).status,200);f.write('App.eln','component App() { ui { h1 "CLI changed" } }');
  const deadline=Date.now()+15000;while(manifest(f)===first&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
  assert.notEqual(manifest(f),first);assert.equal((await fetch(url)).status,200);
});
