import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {createAuthoringSession,defaultPort} from '../scripts/authoring-session.mjs';
import {setupDOM,FakeNode,tick} from './fake-dom.mjs';
import {formatAuthoringDiagnostics} from '../scripts/authoring-diagnostics.mjs';

function fixture(t){
  const temporary=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'elnor-authoring-'));
  const workspace=path.join(temporary,'workspace with spaces');
  const session=createAuthoringSession(workspace);
  t.after(()=>{
    const resolved=path.resolve(temporary);
    assert.ok(resolved.startsWith(path.resolve(fs.realpathSync.native(os.tmpdir()))+path.sep)&&path.basename(resolved).startsWith('elnor-authoring-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  const read=name=>fs.readFileSync(path.join(workspace,name),'utf8');
  const write=(name,source)=>fs.writeFileSync(path.join(workspace,name),source);
  return {temporary,workspace,session,read,write};
}
test('authoring setup is repeatable and preserves existing source edits',t=>{
  const f=fixture(t);assert.equal(f.session.setup().created.length,4);
  const edited=f.read('Counter.eln').replace('count++;','count += 2;');f.write('Counter.eln',edited);
  const again=f.session.setup();assert.deepEqual(again.created,[]);assert.equal(again.preserved.length,4);
  assert.equal(f.read('Counter.eln'),edited);
});
test('setup refuses an incompatible session marker before creating source files',t=>{
  const f=fixture(t);fs.mkdirSync(f.workspace,{recursive:true});f.write('.authoring-session.json','{"kind":"someone-else"}');
  assert.throws(()=>f.session.setup(),/setup/);
  assert.equal(fs.existsSync(path.join(f.workspace,'App.eln')),false);
});
test('authoring build executes component events and edited increments without saving sources',async t=>{
  const f=fixture(t);f.session.setup();
  const edited=f.read('Counter.eln').replace('count++;','count += 2;');f.write('Counter.eln',edited);
  assert.deepEqual(f.session.check().diagnostics,[]);
  const built=f.session.build();assert.equal(built.components,2);
  const {mount}=await import(pathToFileURL(path.join(built.output,built.entry)).href);
  setupDOM();const target=new FakeNode('root');const stop=mount(target,{});
  assert.match(target.textContent,/Clicks: 0/);target.descendants('button')[0].click();await tick();
  assert.match(target.textContent,/Clicks: 2/);assert.match(target.textContent,/Last event: 2/);
  stop();assert.equal(target.childNodes.length,0);assert.equal(f.read('Counter.eln'),edited);
});
test('a type error identifies its original file and leaves the previous preview intact',t=>{
  const f=fixture(t);f.session.setup();f.session.build();const before=f.read('.elnor-authoring-output/index.html');
  f.write('App.eln',f.read('App.eln').replace('Counter label=','Counter missing='));
  const diagnostic=f.session.check().diagnostics.find(d=>d.code==='TS2353');assert.ok(diagnostic);
  assert.equal(diagnostic.file,path.join(f.workspace,'App.eln'));
  assert.throws(()=>f.session.build(),error=>error.diagnostics.some(d=>d.code==='TS2353'));
  assert.equal(f.read('.elnor-authoring-output/index.html'),before);
});
test('parse errors and missing imports are reported against source paths',t=>{
  const f=fixture(t);f.session.setup();const original=f.read('Counter.eln');
  f.write('Counter.eln',original.slice(0,original.lastIndexOf('}')));
  assert.ok(f.session.check().diagnostics.some(d=>d.code==='ELN-PARSE-003'&&d.file.endsWith('Counter.eln')));
  f.write('Counter.eln',original);fs.unlinkSync(path.join(f.workspace,'Counter.eln'));
  assert.ok(f.session.check().diagnostics.some(d=>d.code==='ENOENT'&&d.file.endsWith('Counter.eln')));
});
test('checking does not execute an application initializer',t=>{
  const f=fixture(t);f.session.setup();
  f.write('App.eln',f.read('App.eln').replace('state latest = 0;','state latest = read();\n  action read() { (globalThis as any).__elnorAuthoringExecuted = true; return 0; }'));
  assert.equal(globalThis.__elnorAuthoringExecuted,undefined);
  assert.deepEqual(f.session.check().diagnostics,[]);
  assert.equal(globalThis.__elnorAuthoringExecuted,undefined);
});
test('build refuses a foreign generated directory without altering its contents',t=>{
  const f=fixture(t);f.session.setup();fs.mkdirSync(f.session.output);f.write('.elnor-authoring-output/keep.txt','keep');
  assert.throws(()=>f.session.build(),/not owned/);assert.equal(f.read('.elnor-authoring-output/keep.txt'),'keep');
});
test('status distinguishes saved source changes from the last successful build without rebuilding',t=>{
  const f=fixture(t);f.session.setup();assert.equal(f.session.status().state,'no-build-record');
  f.session.build();assert.equal(f.session.status().state,'matches-last-successful-build');
  const original=f.read('Counter.eln');f.write('Counter.eln',original.replace('count++;','count += 2;'));
  const status=f.session.status();assert.equal(status.state,'saved-files-changed');
  assert.deepEqual(status.changedFiles,[path.join(f.workspace,'Counter.eln')]);
  assert.equal(status.editableFiles[0],path.join(f.workspace,'Counter.eln'));
  f.session.build();assert.equal(f.session.status().state,'matches-last-successful-build');
  f.write('Counter.eln',original.slice(0,original.lastIndexOf('}')));
  assert.throws(()=>f.session.build(),error=>error.diagnostics.length>0);
  assert.equal(f.session.status().state,'saved-files-changed');
});
test('authoring preview serves generated modules with the existing restrictive CSP',async t=>{
  const f=fixture(t);f.session.setup();const {server,built}=f.session.preview();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const response=await fetch(base);assert.equal(response.status,200);
    assert.match(response.headers.get('content-security-policy'),/connect-src 'none'/);
    assert.match(await response.text(),/script type="module" src="\/entry.mjs"/);
    const entry=await (await fetch(base+'/entry.mjs')).text();assert.ok(entry.includes(built.entry));
    assert.match((await fetch(base+'/'+built.entry)).headers.get('content-type'),/javascript/);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('the default authoring port is not rejected by fetch before network dispatch',async()=>{
  assert.equal(defaultPort,4184);
  const seen=[];
  const dispatcher={dispatch(options,handler){seen.push(options);handler.onError(new Error('authoring-port-probe'));return true;}};
  await assert.rejects(fetch('http://127.0.0.1:'+defaultPort+'/',{dispatcher}),error=>error.cause?.message==='authoring-port-probe');
  assert.equal(seen.length,1);
});

test('reloading an authoring preview explains saved changes without rebuilding or replacing output',async t=>{
  const f=fixture(t);f.session.setup();const {server}=f.session.preview();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const initial=await (await fetch(base)).text();assert.match(initial,/id="authoring-build-status"/);
    assert.match(initial,/matches the saved Surface\/CSS/);
    const output=f.read('.elnor-authoring-output/index.html'),state=f.read('.elnor-authoring-output/build-state.json');
    f.write('Counter.eln',f.read('Counter.eln').replace('count++;','count += 2;'));
    const response=await fetch(base),stale=await response.text();
    assert.match(stale,/Saved changes are not in this preview/);assert.match(stale,/Counter\.eln/);
    assert.match(stale,/npm run authoring -- build/);assert.match(stale,/then reload/);
    assert.match(response.headers.get('content-security-policy'),/connect-src 'none'/);
    assert.equal(f.read('.elnor-authoring-output/index.html'),output);assert.equal(f.read('.elnor-authoring-output/build-state.json'),state);
    f.session.build();assert.match(await (await fetch(base)).text(),/matches the saved Surface\/CSS/);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

async function previewFixture(t){
  const f=fixture(t);f.session.setup();const {server}=f.session.preview();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  // Callers close the server in finally, before fixture directory cleanup.
  const close=()=>new Promise(resolve=>server.close(resolve));
  return {...f,base:'http://127.0.0.1:'+server.address().port,close};
}

test('a failed authoring rebuild leaves the old module available with a visible stale notice',async t=>{
  const f=await previewFixture(t);
  try{
    const state=JSON.parse(f.read('.elnor-authoring-output/build-state.json'));
    const appFile=fs.readdirSync(path.join(f.session.output,'.elnor-components'))[0];
    const moduleUrl=f.base+'/.elnor-components/'+appFile,before=await (await fetch(moduleUrl)).text();
    f.write('App.eln',f.read('App.eln').replace('Counter label=','Counter missing='));
    assert.throws(()=>f.session.build(),error=>error.diagnostics.some(d=>d.code==='TS2353'));
    assert.match(await (await fetch(f.base+'/index.html')).text(),/Saved changes are not in this preview/);
    assert.equal(await (await fetch(moduleUrl)).text(),before);
    assert.equal(JSON.parse(f.read('.elnor-authoring-output/build-state.json')).builtAt,state.builtAt);
    f.write('App.eln',f.read('App.eln').replace('Counter missing=','Counter label='));f.session.build();
    assert.match(await (await fetch(f.base)).text(),/matches the saved Surface\/CSS/);
  }finally{await f.close();}
});

test('authoring reload reports missing and unreadable build records without claiming freshness',async t=>{
  const f=await previewFixture(t);
  try{
    fs.unlinkSync(path.join(f.session.output,'build-state.json'));
    const missing=await (await fetch(f.base)).text();assert.match(missing,/could not be verified/);assert.doesNotMatch(missing,/matches the saved Surface\/CSS/);
    f.write('.elnor-authoring-output/build-state.json','broken JSON');
    const response=await fetch(f.base),invalid=await response.text();assert.equal(response.status,200);
    assert.match(invalid,/could not be verified/);assert.match(invalid,/npm run authoring -- build/);
    assert.doesNotMatch(invalid,/SyntaxError|Unexpected token/);
  }finally{await f.close();}
});

test('authoring reload includes changed or missing stylesheets in its saved-input notice',async t=>{
  const f=await previewFixture(t);
  try{
    f.write('style.css',f.read('style.css')+'\n/* saved edit */');
    assert.match(await (await fetch(f.base)).text(),/<li>style\.css<\/li>/);
    fs.unlinkSync(path.join(f.workspace,'style.css'));
    assert.match(await (await fetch(f.base)).text(),/Saved changes are not in this preview/);
    assert.equal((await fetch(f.base+'/style.css')).status,200,'last built stylesheet is still served');
  }finally{await f.close();}
});

test('authoring status HTML escapes recorded filenames while retaining the restrictive CSP',async t=>{
  const f=await previewFixture(t);
  try{
    const state=JSON.parse(f.read('.elnor-authoring-output/build-state.json'));
    state.inputs.push({file:path.join(f.workspace,'<img src=x onerror=alert(1)> & notes'),hash:'missing'});
    f.write('.elnor-authoring-output/build-state.json',JSON.stringify(state));
    const response=await fetch(f.base),html=await response.text();
    assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt; &amp; notes/);
    assert.doesNotMatch(html,/<img src=x/);
    assert.match(response.headers.get('content-security-policy'),/connect-src 'none'/);
    assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.match(html,/does not inspect unsaved editor text or all TypeScript dependencies/);
  }finally{await f.close();}
});
test('the authoring CLI supports a workspace with spaces and fails invalid source without opening apps',t=>{
  const f=fixture(t),script=fileURLToPath(new URL('../scripts/authoring-session.mjs',import.meta.url));
  const run=command=>execFileSync(process.execPath,[script,command,'--workspace',f.workspace],{encoding:'utf8'});
  assert.equal(JSON.parse(run('setup')).workspace,f.workspace);assert.match(run('check'),/OK: 2 components/);
  f.write('App.eln',f.read('App.eln').replace('Counter label=','Counter missing='));
  const failed=spawnSync(process.execPath,[script,'check','--workspace',f.workspace],{encoding:'utf8'});
  assert.equal(failed.status,1);assert.match(failed.stderr,/TS2353/);
  const usage=spawnSync(process.execPath,[script,'reset','--workspace',f.workspace],{encoding:'utf8'});
  assert.equal(usage.status,1);assert.match(usage.stderr,/Usage:/);
});

test('authoring failures show original source context and distinguish check from a retained preview',t=>{
  const f=fixture(t);f.session.setup();f.session.build();
  const before=f.read('.elnor-authoring-output/build-state.json');
  f.write('App.eln',f.read('App.eln').replace('Counter label=','Counter missing='));
  const script=fileURLToPath(new URL('../scripts/authoring-session.mjs',import.meta.url));
  const run=command=>spawnSync(process.execPath,[script,command,'--workspace',f.workspace],{encoding:'utf8'});
  const checked=run('check');assert.equal(checked.status,1);assert.match(checked.stderr,/TS2353/);
  assert.match(checked.stderr,/\d+ \|\s+Counter missing="Clicks"/);assert.match(checked.stderr,/Check failed; no preview was rebuilt/);
  const built=run('build');assert.equal(built.status,1);assert.match(built.stderr,/The previous preview files were kept/);
  assert.match(built.stderr,/Fix the errors, save, build again, then reload/);
  assert.equal(f.read('.elnor-authoring-output/build-state.json'),before);
  f.write('App.eln',f.read('App.eln').replace('Counter missing=','Counter label='));
  const repaired=run('check');assert.equal(repaired.status,0,repaired.stderr);assert.equal(repaired.stderr,'');
  const rebuilt=run('build');assert.equal(rebuilt.status,0,rebuilt.stderr);assert.equal(JSON.parse(rebuilt.stdout).components,2);
});

test('a failed first build does not claim that a previous preview was kept',t=>{
  const f=fixture(t);f.session.setup();f.write('App.eln',f.read('App.eln').replace('Counter label=','Counter missing='));
  const script=fileURLToPath(new URL('../scripts/authoring-session.mjs',import.meta.url));
  const failed=spawnSync(process.execPath,[script,'build','--workspace',f.workspace],{encoding:'utf8'});
  assert.equal(failed.status,1);assert.match(failed.stderr,/No successful preview is available yet/);
  assert.doesNotMatch(failed.stderr,/previous preview files were kept/);
  assert.equal(fs.existsSync(path.join(f.session.output,'index.html')),false);
});

test('authoring error context uses the checked source snapshot after disk changes',t=>{
  const f=fixture(t);f.session.setup();const original=f.read('App.eln');
  f.write('App.eln',original.replace('Counter label=','Counter missing='));const checked=f.session.check();
  f.write('App.eln',original);
  const text=formatAuthoringDiagnostics(checked.diagnostics,checked.sources);
  assert.match(text,/\d+ \|\s+Counter missing="Clicks"/);assert.doesNotMatch(text,/\|\s+Counter label=/);
  assert.equal(f.read('App.eln'),original);
});

test('authoring missing-file diagnostics retain failure status without fabricated source context',t=>{
  const f=fixture(t);f.session.setup();fs.unlinkSync(path.join(f.workspace,'Counter.eln'));
  const script=fileURLToPath(new URL('../scripts/authoring-session.mjs',import.meta.url));
  const failed=spawnSync(process.execPath,[script,'check','--workspace',f.workspace],{encoding:'utf8'});
  assert.equal(failed.status,1);assert.match(failed.stderr,/ENOENT/);assert.match(failed.stderr,/Counter\.eln:1:/);
  assert.doesNotMatch(failed.stderr,/\d+ \|/);assert.match(failed.stderr,/Check failed/);
});

test('authoring context retains Unicode and CRLF lines, escapes terminal controls and omits unknown ranges',()=>{
  const file='Counter.eln',sources=new Map([[file,'// café 😀\r\n\tspan "\u001b[31m"\r\n']]);
  const text=formatAuthoringDiagnostics([{code:'ELN-TEST',file,line:2,message:'problem \u001b[2J'}],sources);
  assert.match(text,/2 \| \tspan/);assert.ok(text.includes('\\u001b[31m'));assert.ok(text.includes('\\u001b[2J'));
  assert.ok(!text.includes('\u001b'));assert.ok(!text.includes('\r'));
  const first=formatAuthoringDiagnostics([{code:'ELN-TEST',file,line:1,message:'first line'}],sources);assert.match(first,/café 😀/);
  for(const line of [0,999,undefined])assert.doesNotMatch(formatAuthoringDiagnostics([{code:'ELN-TEST',file,line,message:'unmapped'}],sources),/\d+ \|/);
  assert.doesNotMatch(formatAuthoringDiagnostics([{code:'TS2322',file:'Dependency.mts',line:1,message:'ordinary dependency'}],sources),/\d+ \|/);
});
