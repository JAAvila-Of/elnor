import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseSurface} from '../src/parser.mjs';
import {typecheckGraph} from '../src/checker.mjs';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {createAsyncLanguageService} from '../src/async-language-service.mjs';

const cli=fileURLToPath(new URL('../scripts/typescript-config.mjs',import.meta.url));
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-tsconfig-'));
  t.after(()=>{
    const resolved=path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('elnor-tsconfig-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  });return root;
}

test('configuration CLI reports the fixed profile and an ignored root config without reading it',t=>{
  const root=fixture(t),file=path.join(root,'tsconfig.json'),source='not even JSON: this file is not loaded';fs.writeFileSync(file,source);
  const result=spawnSync(process.execPath,[cli,'--root',root],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);assert.equal(report.profile,'elnor-mvp-fixed');
  assert.deepEqual(report.rootConfig,{file,present:true,applied:false});
  assert.equal(report.compilerOptions.strict,true);assert.equal(report.compilerOptions.module,'NodeNext');
  assert.equal(fs.readFileSync(file,'utf8'),source);assert.deepEqual(fs.readdirSync(root),['tsconfig.json']);
});

function analyze(t,root,source){
  const file=path.join(root,'Screen.eln');fs.writeFileSync(file,source);
  const service=createSurfaceLanguageService({root});t.after(()=>service.dispose());service.open(file,source);
  return {service,file,cli:typecheckGraph(new Map([[file,parseSurface(source,file)]]),path.join(root,'check')),
    editor:service.diagnostics(file)};
}
function hasCode(result,code){
  for(const key of ['cli','editor'])assert.ok(result[key].some(d=>d.code===code),`${key}: ${JSON.stringify(result[key])}`);
}

test('a root config cannot silently disable strict checking in CLI or editor',t=>{
  const root=fixture(t);fs.writeFileSync(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:false,strictNullChecks:false}}));
  hasCode(analyze(t,root,'component Screen() { state label: string = null; ui { span label } }'),'TS2322');
});

test('tsconfig path aliases remain unresolved in both analysis paths',t=>{
  const root=fixture(t);fs.writeFileSync(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{baseUrl:'.',paths:{'@model':['./Model.mts']}}}));
  fs.writeFileSync(path.join(root,'Model.mts'),'export interface Model { label: string; }');
  hasCode(analyze(t,root,'import type {Model} from "@model"; component Screen(model: Model) { ui { span model.label } }'),'TS2307');
});

test('default ES2022 and DOM libraries are retained instead of loading tsconfig lib',t=>{
  const root=fixture(t);fs.writeFileSync(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{lib:['ESNext']}}));
  const result=analyze(t,root,'component Screen() { calc title = document.title; calc sorted = [2, 1].toSorted(); ui { span title } }');
  hasCode(result,'TS2550');
  for(const errors of [result.cli,result.editor])assert.ok(!errors.some(d=>d.message.includes("Cannot find name 'document'")));
});

test('automatic ambient packages and config include files do not enter the Surface project',t=>{
  const root=fixture(t),ambient=path.join(root,'node_modules','@types','ambient');fs.mkdirSync(ambient,{recursive:true});
  fs.writeFileSync(path.join(ambient,'index.d.ts'),'declare const ambientOnly: string;');
  fs.writeFileSync(path.join(root,'Unrelated.ts'),'const broken: string = 1;');
  fs.writeFileSync(path.join(root,'tsconfig.json'),JSON.stringify({include:['**/*'],compilerOptions:{types:['ambient']}}));
  const result=analyze(t,root,'component Screen() { ui { span ambientOnly } }');hasCode(result,'TS2304');
  for(const errors of [result.cli,result.editor])assert.ok(!errors.some(d=>d.code==='TS2322'));
});

test('config excludes do not hide supplied Surface roots or imported TS contracts',t=>{
  const root=fixture(t);fs.writeFileSync(path.join(root,'tsconfig.json'),JSON.stringify({files:[],exclude:['**/*']}));
  fs.writeFileSync(path.join(root,'Model.mts'),'export interface Model { label: number; }');
  hasCode(analyze(t,root,'import type {Model} from "./Model.mjs"; component Screen(model: Model) { ui { span model.label.toUpperCase() } }'),'TS2339');
});

test('the worker uses the reported fixed profile while root config edits remain outside its contract',async t=>{
  const root=fixture(t),config=path.join(root,'tsconfig.json'),file=path.join(root,'Screen.eln');
  fs.writeFileSync(config,JSON.stringify({compilerOptions:{strict:false}}));
  const client=createAsyncLanguageService({root});t.after(()=>client.dispose());
  client.open(file,'component Screen() { state label: string = null; ui { span label } }');
  const first=await client.query('diagnostics',[file]);assert.ok(first.value.some(d=>d.code==='TS2322'));
  const report=client.configuration();assert.equal(report.profile,'elnor-mvp-fixed');report.compilerOptions.types.push('ambient');report.compilerOptions.strict=false;
  assert.equal(client.configuration().compilerOptions.strict,true);assert.deepEqual(client.configuration().compilerOptions.types,[]);
  fs.writeFileSync(config,'invalid JSON remains ignored');await client.restart();
  assert.ok((await client.query('diagnostics',[file])).value.some(d=>d.code==='TS2322'));
});

test('configuration inspection supports spaces and rejects invalid roots or arguments without writes',t=>{
  const root=fixture(t),spaced=path.join(root,'project with spaces');fs.mkdirSync(spaced);
  const result=spawnSync(process.execPath,[cli,'--root',spaced],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).rootConfig.present,false);assert.deepEqual(fs.readdirSync(spaced),[]);
  for(const args of [['--root'],['--project','tsconfig.json'],['--root',path.join(root,'missing')],['--root',cli]]){
    const failed=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});assert.equal(failed.status,1);assert.equal(failed.stdout,'');assert.ok(failed.stderr.length);
  }
});
