import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkSurfaceProject,readSurfaceGraph} from '../src/project-check.mjs';

const script=fileURLToPath(new URL('../scripts/check-project.mjs',import.meta.url));
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-project-check-')),workspace=path.join(root,'my project');fs.mkdirSync(workspace);
  const links=[];
  t.after(()=>{
    for(const link of links)fs.unlinkSync(link);
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('elnor-project-check-'));
    fs.rmSync(root,{recursive:true,force:true});
  });
  const write=(name,source)=>{const file=path.join(workspace,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source);return file;};
  write('Badge.eln','component Badge(label: string) { ui { span label } }');
  const entry=write('App.eln','import Badge from "./Badge.eln";\ncomponent App() {\n  ui {\n    Badge label="Ready"\n  }\n}\n');
  return {root,workspace,entry,write,outputDir:path.join(root,'cache'),
    link(name,target){const file=path.join(workspace,name);fs.symlinkSync(path.join(workspace,target),file,'file');links.push(file);}};
}
test('project CLI checks a local entry outside the example layout without changing its sources',t=>{
  const f=fixture(t),before=fs.readFileSync(f.entry,'utf8');f.write('Unused.eln','not a component; it is outside this entry graph');
  const result=spawnSync(process.execPath,[script,f.entry],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/OK: 2 Surface component/);
  assert.match(result.stdout,/elnor-mvp-fixed/);assert.match(result.stdout,/tsconfig.json is not loaded/);
  assert.equal(fs.readFileSync(f.entry,'utf8'),before);assert.deepEqual(fs.readdirSync(f.workspace).sort(),['App.eln','Badge.eln','Unused.eln']);
});

test('project CLI reports the original file and source line for a component type error',t=>{
  const f=fixture(t);f.write('App.eln',fs.readFileSync(f.entry,'utf8').replace('label="Ready"','label=42'));
  const failed=spawnSync(process.execPath,[script,f.entry],{encoding:'utf8'});
  assert.equal(failed.status,1);assert.match(failed.stderr,/TS2322/);assert.ok(failed.stderr.includes('App.eln:4:'));
  assert.match(failed.stderr,/4 \|\s+Badge label=42/);assert.doesNotMatch(failed.stdout,/OK:/);
  assert.match(failed.stderr,/No executable build was produced/);
});

test('project loader retains parse snapshots and reports missing dependencies without a generated-code stack',t=>{
  const f=fixture(t);f.write('Badge.eln','component Badge(label: string) { ui { span label }');
  const parsed=checkSurfaceProject(f.entry,{outputDir:f.outputDir});assert.ok(parsed.diagnostics.some(d=>d.code==='ELN-PARSE-003'&&d.file.endsWith('Badge.eln')));
  assert.ok(parsed.sources.get(path.join(f.workspace,'Badge.eln')).includes('span label'));
  fs.unlinkSync(path.join(f.workspace,'Badge.eln'));const missing=checkSurfaceProject(f.entry,{outputDir:f.outputDir});
  assert.ok(missing.diagnostics.some(d=>d.code==='ENOENT'&&d.file.endsWith('Badge.eln')));
  assert.equal(fs.existsSync(f.outputDir),false,'parse/load failures need no generated projection');
});

test('project discovery terminates cyclic imports without scanning unrelated files',t=>{
  const f=fixture(t),a=f.write('A.eln','import B from "./B.eln"; component A() { ui { span "A" } }');
  f.write('B.eln','import A from "./A.eln"; component B() { ui { span "B" } }');
  const result=readSurfaceGraph(a);assert.deepEqual(result.diagnostics,[]);assert.equal(result.graph.size,2);assert.equal(result.sources.size,2);
  assert.ok(!result.graph.has(f.entry));
});

test('project discovery deduplicates physical file aliases while preserving import type checks',t=>{
  const f=fixture(t);f.link('BadgeAlias.eln','Badge.eln');
  f.write('App.eln','import Badge from "./Badge.eln"; import Other from "./BadgeAlias.eln"; component App() { ui { Badge label="One"\n Other label="Two" } }');
  const result=checkSurfaceProject(f.entry,{outputDir:f.outputDir});assert.deepEqual(result.diagnostics,[]);assert.equal(result.graph.size,2);
});

test('project checks resolve and refresh ordinary TS contracts from their original directory',t=>{
  const f=fixture(t),module=f.write('types data/Model.mts','export interface Model { label: string; }');
  f.write('App.eln','import type {Model} from "./types data/Model.mjs"; import Badge from "./Badge.eln";\ncomponent App(model: Model) { ui { Badge label=model.label } }');
  assert.deepEqual(checkSurfaceProject(f.entry,{outputDir:f.outputDir}).diagnostics,[]);
  fs.writeFileSync(module,'export interface Model { label: number; }');
  const result=checkSurfaceProject(f.entry,{outputDir:f.outputDir});assert.ok(result.diagnostics.some(d=>d.code==='TS2322'&&d.file.endsWith('App.eln')));
});

test('project checking uses the fixed profile without executing imports or initializers',t=>{
  const f=fixture(t);f.write('side.mts','(globalThis as any).__elnorProjectExecuted = true; export function read() { return 0; }');
  f.write('App.eln','import {read} from "./side.mjs"; component App() { state count = read(); ui { span count } }');
  assert.equal(globalThis.__elnorProjectExecuted,undefined);
  assert.deepEqual(checkSurfaceProject(f.entry,{outputDir:f.outputDir}).diagnostics,[]);
  assert.equal(globalThis.__elnorProjectExecuted,undefined);
  f.write('tsconfig.json','{"compilerOptions":{"strict":false}}');
  f.write('App.eln','component App() { state label: string = null; ui { span label } }');
  const result=checkSurfaceProject(f.entry,{outputDir:f.outputDir});assert.equal(result.configuration.profile,'elnor-mvp-fixed');
  assert.ok(result.diagnostics.some(d=>d.code==='TS2322'));
});

test('project CLI refuses invalid arguments and reports an absent entry as failure',t=>{
  const f=fixture(t);
  for(const args of [[],[f.entry,'--build'],[path.join(f.workspace,'App.ts')]]){
    const result=spawnSync(process.execPath,[script,...args],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/Usage:/);
  }
  const missing=spawnSync(process.execPath,[script,path.join(f.workspace,'Missing.eln')],{encoding:'utf8'});
  assert.equal(missing.status,1);assert.match(missing.stderr,/ENOENT/);assert.doesNotMatch(missing.stderr,/at main|at readSurfaceGraph/);
  assert.throws(()=>checkSurfaceProject(f.entry),/explicit generated check directory/);
});
