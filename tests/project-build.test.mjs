import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {setupDOM,FakeNode,tick} from './fake-dom.mjs';

const script=fileURLToPath(new URL('../scripts/build-project.mjs',import.meta.url));
function fixture(t){
  const root=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'elnor-project-build-')),project=path.join(root,'project with spaces');fs.mkdirSync(project);
  const links=[];
  t.after(()=>{
    for(const link of links)if(fs.lstatSync(link,{throwIfNoEntry:false}))fs.unlinkSync(link);
    assert.ok(path.resolve(root).startsWith(path.resolve(fs.realpathSync.native(os.tmpdir()))+path.sep)&&path.basename(root).startsWith('elnor-project-build-'));
    fs.rmSync(root,{recursive:true,force:true});
  });
  for(const name of ['App.eln','Counter.eln'])fs.writeFileSync(path.join(project,name),fs.readFileSync(new URL('../examples/authoring/'+name,import.meta.url)));
  return {root,project,entry:path.join(project,'App.eln'),outputDir:path.join(root,'output with spaces'),checkOutputDir:path.join(root,'check'),
    read:name=>fs.readFileSync(path.join(project,name),'utf8'),write:(name,source)=>fs.writeFileSync(path.join(project,name),source),
    link(link,target,type='file'){fs.symlinkSync(target,link,type);links.push(link);}};
}

test('project build CLI publishes a manifest for an explicit entry without changing source files',t=>{
  const f=fixture(t),before=f.read('Counter.eln');f.write('App.eln',f.read('App.eln').replace('component App()','component RenamedRoot()'));
  const result=spawnSync(process.execPath,[script,f.entry,'--out',f.outputDir],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const built=JSON.parse(result.stdout);
  const manifest=JSON.parse(fs.readFileSync(path.join(f.outputDir,'manifest.json'),'utf8'));
  assert.equal(manifest.entrySource,f.entry);assert.equal(manifest.entryOutput,built.entryOutput);
  assert.equal(manifest.components.length,2);assert.ok(fs.existsSync(path.join(f.outputDir,manifest.entryOutput)));
  assert.ok(manifest.components.some(component=>component.source===f.entry&&component.name==='RenamedRoot'));
  for(const file of manifest.files)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(f.outputDir,file.file))).digest('hex'),file.sha256);
  assert.equal(f.read('Counter.eln'),before);assert.deepEqual(fs.readdirSync(f.project).sort(),['App.eln','Counter.eln']);
});

const build=f=>buildSurfaceProject(f.entry,{outputDir:f.outputDir,checkOutputDir:f.checkOutputDir});
const readManifest=f=>JSON.parse(fs.readFileSync(path.join(f.outputDir,'manifest.json'),'utf8'));
async function exercise(f,built,increment){
  const {mount}=await import(pathToFileURL(path.join(f.outputDir,built.entryOutput)).href);
  setupDOM();const target=new FakeNode('root'),dispose=mount(target,{});
  target.descendants('button')[0].click();await tick();
  assert.match(target.textContent,new RegExp('Clicks: '+increment));assert.match(target.textContent,new RegExp('Last event: '+increment));
  dispose();assert.equal(target.childNodes.length,0);
}

test('new builds execute updated events and keep previous generations and unrelated files intact',async t=>{
  const f=fixture(t);fs.mkdirSync(f.outputDir);const first=build(f),old=readManifest(f);
  await exercise(f,first,1);const bytes=fs.readFileSync(path.join(f.outputDir,first.entryOutput),'utf8');
  fs.writeFileSync(path.join(f.outputDir,'notes.txt'),'keep');f.write('Counter.eln',f.read('Counter.eln').replace('count++;','count += 2;'));
  const second=build(f);await exercise(f,second,2);assert.notEqual(second.buildId,first.buildId);
  assert.equal(readManifest(f).ownerId,old.ownerId);assert.equal(fs.readFileSync(path.join(f.outputDir,'notes.txt'),'utf8'),'keep');
  assert.equal(fs.readFileSync(path.join(f.outputDir,first.entryOutput),'utf8'),bytes);
});

test('a failed typecheck retains the active manifest and every previous build file',t=>{
  const f=fixture(t);build(f);const before=fs.readFileSync(path.join(f.outputDir,'manifest.json'),'utf8');
  const generations=fs.readdirSync(path.join(f.outputDir,'builds'));
  f.write('App.eln',f.read('App.eln').replace('Counter label=','Counter missing='));
  assert.throws(()=>build(f),error=>error.diagnostics?.some(d=>d.code==='TS2353'));
  assert.equal(fs.readFileSync(path.join(f.outputDir,'manifest.json'),'utf8'),before);
  assert.deepEqual(fs.readdirSync(path.join(f.outputDir,'builds')),generations);
});

test('build refuses foreign nonempty destinations and file destinations without adopting them',t=>{
  const f=fixture(t);fs.mkdirSync(f.outputDir);fs.writeFileSync(path.join(f.outputDir,'keep.txt'),'foreign');
  assert.throws(()=>build(f),/without project ownership/);assert.deepEqual(fs.readdirSync(f.outputDir),['keep.txt']);
  const file=path.join(f.root,'destination.txt');fs.writeFileSync(file,'do not overwrite');
  assert.throws(()=>buildSurfaceProject(f.entry,{outputDir:file,checkOutputDir:f.checkOutputDir}),/must be a directory/);
  assert.equal(fs.readFileSync(file,'utf8'),'do not overwrite');
});

test('build refuses output overlap with entry or imported Surface sources',t=>{
  const f=fixture(t),original=f.read('App.eln');
  assert.throws(()=>buildSurfaceProject(f.entry,{outputDir:f.project,checkOutputDir:f.checkOutputDir}),/contain the entry source/);
  if(process.platform==='win32'){
    const suppliedProject=path.join(os.tmpdir(),path.relative(fs.realpathSync.native(os.tmpdir()),f.project));
    assert.throws(()=>buildSurfaceProject(f.entry,{outputDir:suppliedProject,checkOutputDir:f.checkOutputDir}),/contain the entry source/);
  }
  assert.equal(f.read('App.eln'),original);build(f);const before=fs.readFileSync(path.join(f.outputDir,'manifest.json'),'utf8');
  const added=path.join(f.outputDir,'Added.eln');fs.writeFileSync(added,'component Added() { ui { span "kept" } }');
  f.write('App.eln','import Added from "../output with spaces/Added.eln";\n'+original);
  assert.throws(()=>build(f),/contain imported Surface sources/);assert.equal(fs.readFileSync(added,'utf8'),'component Added() { ui { span "kept" } }');
  assert.equal(fs.readFileSync(path.join(f.outputDir,'manifest.json'),'utf8'),before);
});

test('build refuses linked output ancestors rather than writing through them',t=>{
  const f=fixture(t),target=path.join(f.root,'external');fs.mkdirSync(target);fs.writeFileSync(path.join(target,'keep.txt'),'keep');
  const link=path.join(f.root,'linked');f.link(link,target,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>buildSurfaceProject(f.entry,{outputDir:path.join(link,'child'),checkOutputDir:f.checkOutputDir}),/symlinks or junctions/);
  assert.deepEqual(fs.readdirSync(target),['keep.txt']);
  build(f);const before=fs.readFileSync(path.join(f.outputDir,'manifest.json'),'utf8');
  const generations=path.join(f.outputDir,'builds'),backup=path.join(f.outputDir,'saved-builds'),scope=fs.realpathSync(f.root)+path.sep;
  assert.ok(fs.realpathSync(generations).startsWith(scope)&&path.resolve(backup).startsWith(scope));
  fs.renameSync(generations,backup);f.link(generations,target,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>build(f),/symlinks or junctions/);assert.deepEqual(fs.readdirSync(target),['keep.txt']);
  assert.equal(fs.readFileSync(path.join(f.outputDir,'manifest.json'),'utf8'),before);
});

test('build refuses metadata symlinks without replacing external files',t=>{
  for(const name of ['manifest.json','.elnor-project-output.json']){
    const f=fixture(t);build(f);const metadata=path.join(f.outputDir,name),original=fs.readFileSync(metadata,'utf8');
    fs.renameSync(metadata,path.join(f.outputDir,'saved-'+name));
    const external=path.join(f.root,'external.json');fs.writeFileSync(external,original);f.link(metadata,external);
    assert.throws(()=>build(f),/regular owned metadata/);assert.equal(fs.readFileSync(external,'utf8'),original);
  }
});

test('build refuses corrupt manifests and output ownership for another entry',t=>{
  const f=fixture(t);build(f);const manifest=path.join(f.outputDir,'manifest.json'),original=fs.readFileSync(manifest,'utf8');
  fs.writeFileSync(manifest,'not a build manifest');assert.throws(()=>build(f),/Invalid existing build manifest/);
  assert.equal(fs.readFileSync(manifest,'utf8'),'not a build manifest');fs.writeFileSync(manifest,original);
  const owner=path.join(f.outputDir,'.elnor-project-output.json'),data=JSON.parse(fs.readFileSync(owner,'utf8'));data.entryKey='another entry';
  fs.writeFileSync(owner,JSON.stringify(data));assert.throws(()=>build(f),/ownership does not match/);
});

test('build packages ordinary ESM without executing application imports during compilation',async t=>{
  const f=fixture(t);t.after(()=>{delete globalThis.__elnorBuildExecuted;});
  f.write('initial.mts','(globalThis as any).__elnorBuildExecuted=true; export function initial() { return 7; }');
  f.write('App.eln','import {initial} from "./initial.mjs";\n'+f.read('App.eln').replace('state latest = 0;','state latest = initial();'));
  assert.equal(globalThis.__elnorBuildExecuted,undefined);const result=build(f);assert.equal(globalThis.__elnorBuildExecuted,undefined);
  assert.ok(readManifest(f).files.some(file=>file.file.includes('/.elnor-modules/')));
  const {mount}=await import(pathToFileURL(path.join(f.outputDir,result.entryOutput)).href);assert.equal(globalThis.__elnorBuildExecuted,true);
  setupDOM();const target=new FakeNode('root'),dispose=mount(target,{});assert.match(target.textContent,/Last event: 7/);dispose();
});

test('build requires explicit disjoint output/cache paths and rejects invalid CLI arguments',t=>{
  const f=fixture(t);assert.throws(()=>buildSurfaceProject(f.entry),/Explicit project output/);
  assert.throws(()=>buildSurfaceProject(f.entry,{outputDir:f.outputDir,checkOutputDir:path.join(f.outputDir,'cache')}),/disjoint/);
  for(const args of [[],[f.entry],[f.entry,'--out'],[f.entry,'--out',f.outputDir,'--force']]){
    const failed=spawnSync(process.execPath,[script,...args],{encoding:'utf8'});assert.equal(failed.status,1);assert.match(failed.stderr,/Usage:/);
  }
  const missing=spawnSync(process.execPath,[script,path.join(f.project,'Missing.eln'),'--out',f.outputDir],{encoding:'utf8'});
  assert.equal(missing.status,1);assert.match(missing.stderr,/ENOENT/);assert.equal(fs.existsSync(f.outputDir),false);
});
