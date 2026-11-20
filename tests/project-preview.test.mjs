import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {createProjectPreview} from '../src/project-preview.mjs';

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-project-preview-')),entry=path.join(root,'App.eln');
  const links=[];
  t.after(()=>{
    for(const link of links)if(fs.lstatSync(link,{throwIfNoEntry:false}))fs.unlinkSync(link);
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('elnor-project-preview-'));
    fs.rmSync(root,{recursive:true,force:true});
  });
  fs.writeFileSync(entry,'component DifferentName(label: string) { ui { h1 label } }');
  const outputDir=path.join(root,'output');
  const build=()=>buildSurfaceProject(entry,{outputDir,checkOutputDir:path.join(root,'check')});
  const built=build();
  return {root,entry,outputDir,built,build,manifest:()=>JSON.parse(fs.readFileSync(path.join(outputDir,'manifest.json'),'utf8')),
    link(file,target,type='file'){fs.symlinkSync(target,file,type);links.push(file);}};
}
async function start(t,f,options={}){
  const server=createProjectPreview({outputDir:f.outputDir,...options});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return {server,url:'http://127.0.0.1:'+server.address().port};
}
const bootPath=html=>html.match(/src="([^"]+entry\.mjs)"/)[1];

test('project preview serves manifest entry, explicit JSON props and CSS under restrictive CSP',async t=>{
  const f=fixture(t),cssFile=path.join(f.root,'chosen.css');fs.writeFileSync(cssFile,'h1 { color: green; }');
  const {url}=await start(t,f,{props:JSON.parse('{"label":"</script> quoted","__proto__":{"x":1}}'),cssFile});
  const response=await fetch(url),html=await response.text();
  assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
  assert.match(response.headers.get('content-security-policy'),/connect-src 'none'/);assert.doesNotMatch(html,/<script[^>]*>[^<]+/);
  const boot=await (await fetch(url+bootPath(html))).text();assert.ok(boot.includes(f.built.entryOutput));
  assert.match(boot,/JSON\.parse/);assert.ok(boot.includes('__proto__'));assert.doesNotMatch(boot,/preview-fixtures/);
  assert.equal(await (await fetch(url+'/preview/style.css')).text(),'h1 { color: green; }');
  const module=await fetch(url+'/'+f.built.entryOutput);assert.equal(module.status,200);assert.match(await module.text(),/export .*mount/);
});

test('navigation selects a new build while existing page modules retain verified bytes',async t=>{
  const f=fixture(t),{url}=await start(t,f),firstHtml=await (await fetch(url)).text();
  const oldBoot=await (await fetch(url+bootPath(firstHtml))).text(),oldModule=await (await fetch(url+'/'+f.built.entryOutput)).text();
  fs.writeFileSync(f.entry,'component NewRoot(label: string) { ui { p label } }');const next=f.build();
  const nextHtml=await (await fetch(url)).text();assert.notEqual(bootPath(nextHtml),bootPath(firstHtml));
  assert.ok((await (await fetch(url+bootPath(nextHtml))).text()).includes(next.entryOutput));
  fs.writeFileSync(path.join(f.outputDir,f.built.entryOutput),'tampered after snapshot');
  assert.equal(await (await fetch(url+'/'+f.built.entryOutput)).text(),oldModule);
  assert.equal(await (await fetch(url+bootPath(firstHtml))).text(),oldBoot);
  fs.writeFileSync(path.join(f.outputDir,'manifest.json'),'broken');assert.equal((await fetch(url)).status,503);
  assert.equal(await (await fetch(url+'/'+f.built.entryOutput)).text(),oldModule);
});

test('experimental development builds give the verified local module graph a stable URL',async t=>{
  const f=fixture(t),manifestFile=path.join(f.outputDir,'manifest.json');
  const source='import {value} from "./model.mjs";\ncomponent App() { ui { h1 value } }';
  const leaf=path.join(f.root,'leaf.mts');
  fs.writeFileSync(f.entry,source);
  fs.writeFileSync(path.join(f.root,'model.mts'),'export {value} from "./leaf.mjs";');
  fs.writeFileSync(leaf,'export const value = "first";');
  const build=()=>buildSurfaceProject(f.entry,{outputDir:f.outputDir,checkOutputDir:path.join(f.root,'check'),hot:true});
  const first=build();
  const {url}=await start(t,f);
  const read=async pathname=>{
    const response=await fetch(url+pathname);assert.equal(response.status,200);return response.text();
  };
  const imported=(code,pattern)=>{const match=code.match(pattern);assert.ok(match,code);return match[1];};
  const modelPath=entry=>read('/'+entry.entryOutput).then(code=>imported(code,/"(\/\.elnor\/dev\/modules\/[\w./-]+\.mjs)"/));
  const firstUrl=await modelPath(first),firstModel=await read(firstUrl);
  const leafUrl=model=>read(model).then(code=>new URL(imported(code,/"(\.\/[a-f0-9]+\.mjs)"/),url+model).pathname);
  const firstLeaf=await leafUrl(firstUrl);
  assert.match(await read(firstLeaf),/"first"/);

  fs.writeFileSync(f.entry,source.replace('h1 value','p value'));
  const edited=build();await read('/');
  assert.notEqual(edited.buildId,first.buildId);
  assert.equal(await modelPath(edited),firstUrl);
  fs.writeFileSync(leaf,'export const value = "second";');
  const changed=build();await read('/');
  const nextUrl=await modelPath(changed);
  assert.notEqual(nextUrl,firstUrl);
  assert.match(await read(await leafUrl(nextUrl)),/"second"/);
  assert.equal(await read(firstUrl),firstModel);
  assert.match(await read(firstLeaf),/"first"/);

  const manifest=f.manifest();
  manifest.moduleRevision='0'.repeat(64);
  fs.writeFileSync(manifestFile,JSON.stringify(manifest));
  assert.equal((await fetch(url)).status,503);
  assert.equal(await read(firstUrl),firstModel);
});

test('preview exposes only snapshotted modules and rejects foreign hosts and write requests',async t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.outputDir,'secret.txt'),'not public');const {url}=await start(t,f);
  for(const route of ['/manifest.json','/.elnor-project-output.json','/secret.txt','/App.eln','/builds/no/runtime.mjs','/%2e%2e/secret.txt'])
    assert.equal((await fetch(url+route)).status,404,route);
  const foreign=await new Promise((resolve,reject)=>{
    http.get(url,{headers:{Host:'attacker.example'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject);
  });
  assert.equal(foreign,403);
  assert.equal((await fetch(url,{method:'POST'})).status,405);
  const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
});

test('preview refuses a changed entry for a generation already referenced by an open page',async t=>{
  const f=fixture(t),{url}=await start(t,f),html=await (await fetch(url)).text(),boot=bootPath(html);
  const before=await (await fetch(url+boot)).text(),manifest=f.manifest();
  manifest.entryOutput=manifest.files.find(record=>record.file.endsWith('/runtime.mjs')).file;
  fs.writeFileSync(path.join(f.outputDir,'manifest.json'),JSON.stringify(manifest));
  assert.equal((await fetch(url)).status,503);assert.equal(await (await fetch(url+boot)).text(),before);
});

test('preview refuses corrupt manifests, changed module hashes and non-owned output',t=>{
  for(const change of [
    f=>fs.writeFileSync(path.join(f.outputDir,f.built.entryOutput),'changed'),
    f=>fs.writeFileSync(path.join(f.outputDir,'manifest.json'),'{}'),
    f=>{const m=f.manifest();m.files.push({...m.files[0]});fs.writeFileSync(path.join(f.outputDir,'manifest.json'),JSON.stringify(m));},
    f=>{const m=f.manifest();m.entryOutput='../../private.mjs';fs.writeFileSync(path.join(f.outputDir,'manifest.json'),JSON.stringify(m));},
    f=>fs.writeFileSync(path.join(f.outputDir,'.elnor-project-output.json'),'{}'),
  ]){const f=fixture(t);change(f);assert.throws(()=>createProjectPreview({outputDir:f.outputDir}),/ELN-PROJECT-PREVIEW/);}
});

test('preview refuses linked metadata, modules and output ancestors',t=>{
  for(const location of ['manifest.json','module','ancestor']){
    const f=fixture(t);let outputDir=f.outputDir;
    if(location==='ancestor'){
      const link=path.join(f.root,'linked');f.link(link,f.outputDir,process.platform==='win32'?'junction':'dir');outputDir=link;
    }else{
      const file=path.join(f.outputDir,location==='module'?f.built.entryOutput:location),external=path.join(f.root,'external');
      fs.writeFileSync(external,fs.readFileSync(file));fs.unlinkSync(file);f.link(file,external);
    }
    assert.throws(()=>createProjectPreview({outputDir}),/ELN-PROJECT-PREVIEW/);
  }
});

test('preview requires an explicit output and JSON object props without executing application code',t=>{
  const f=fixture(t);assert.throws(()=>createProjectPreview(),/ELN-PROJECT-PREVIEW/);
  for(const props of [null,[],1,'text',{bad:undefined},{bad:()=>{}},{bad:Infinity}])
    assert.throws(()=>createProjectPreview({outputDir:f.outputDir,props}),/ELN-PROJECT-PREVIEW/);
  fs.writeFileSync(path.join(f.root,'side-effect.mts'),'(globalThis as any).__elnorPreviewExecuted = true; export const label="not executed";');
  fs.writeFileSync(f.entry,'import {label} from "./side-effect.mjs";\ncomponent App() { ui { h1 label } }');
  f.build();const server=createProjectPreview({outputDir:f.outputDir});server.close();assert.equal(globalThis.__elnorPreviewExecuted,undefined);
});

const script=fileURLToPath(new URL('../scripts/preview-project.mjs',import.meta.url));
test('project preview CLI rejects ambiguous options and invalid props without starting apps',t=>{
  const f=fixture(t),badProps=path.join(f.root,'bad.json');fs.writeFileSync(badProps,'[]');
  for(const args of [[],[f.outputDir,'--force'],[f.outputDir,'--css'],[f.outputDir,'--port','65536'],
    [f.outputDir,'--port','1','--port','2'],[f.outputDir,'--props',badProps]]){
    const result=spawnSync(process.execPath,[script,...args],{encoding:'utf8'});assert.equal(result.status,1);assert.ok(result.stderr);
  }
});

test('project preview CLI serves a build with explicit props and CSS without rebuilding',async t=>{
  const f=fixture(t),props=path.join(f.root,'props.json'),css=path.join(f.root,'style.css');
  fs.writeFileSync(props,'{"label":"CLI preview"}');fs.writeFileSync(css,'h1 {color: blue}');
  const before=fs.readFileSync(path.join(f.outputDir,'manifest.json'),'utf8');
  const child=spawn(process.execPath,[script,f.outputDir,'--props',props,'--css',css,'--port','0'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}});
  const url=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Preview CLI did not start')),10000);t.after(()=>clearTimeout(timeout));
    let output='';child.stdout.on('data',bytes=>{output+=bytes;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve(match[0]);}});
    child.once('error',reject);child.once('exit',code=>reject(Error('Preview CLI exited: '+code)));
  });
  const html=await (await fetch(url)).text();assert.match(await (await fetch(url+bootPath(html))).text(),/CLI preview/);
  assert.equal(await (await fetch(url+'/preview/style.css')).text(),'h1 {color: blue}');
  assert.equal(fs.readFileSync(path.join(f.outputDir,'manifest.json'),'utf8'),before);
});
