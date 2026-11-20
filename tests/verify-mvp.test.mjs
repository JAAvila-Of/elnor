import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyMvp} from '../scripts/verify-mvp.mjs';
import contract from '../editors/vscode/tests/report-contract.cjs';

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-mvp-gate-'));
  t.after(()=>{
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('elnor-mvp-gate-'));
    fs.rmSync(root,{recursive:true,force:true});
  });
  return {directory:path.join(root,'verification'),editorRuns:path.join(root,'native')};
}
function nativeRun(directory,{result={},host={},missingHost=false,malformed=false}={}){
  const runId=randomUUID(),run=path.join(directory,'run-'+runId);fs.mkdirSync(run,{recursive:true});
  const report={suite:contract.suite,runId,launchMode:'persistent',passed:true,trusted:true,sourceFilesUnchanged:true,
    editor:'synthetic-editor',node:'synthetic-node',checks:contract.expectedChecks.map(name=>({name,elapsedMs:1})),...result};
  fs.writeFileSync(path.join(run,'result.json'),malformed?'not JSON':JSON.stringify(report));
  if(!missingHost)fs.writeFileSync(path.join(run,'host.json'),JSON.stringify({runId,completed:true,trusted:true,trustEnabled:true,...host}));
  return run;
}
function runner(f,action=()=>{}){
  const called=[];
  return {called,runStep:async phase=>{
    called.push(phase.name);fs.writeFileSync(phase.log,'Synthetic unit-test phase; not real compiler/editor evidence.');
    const code=await action(phase);
    return code??0;
  }};
}

test('MVP gate executes existing commands in order and links a new native report',async t=>{
  const f=fixture(t),r=runner(f,phase=>{if(phase.name==='editor')nativeRun(f.editorRuns);});
  const {report,reportFile}=await verifyMvp({...f,...r});
  assert.equal(report.passed,true);assert.deepEqual(r.called,['check','node','editor']);
  assert.deepEqual(report.steps.map(s=>s.command),[['npm','run','check'],['npm','test'],['npm','run','test:editor']]);
  assert.equal(report.steps[2].evidence.checks,15);assert.ok(report.steps.every(s=>s.passed&&s.exitCode===0));
  assert.deepEqual(JSON.parse(fs.readFileSync(reportFile,'utf8')),report);
});
test('MVP gate stops at each unsuccessful phase and retains the failure report',async t=>{
  for(const name of ['check','node','editor']){
    const f=fixture(t),r=runner(f,phase=>phase.name===name?7:0);
    const {report,reportFile}=await verifyMvp({...f,...r});assert.equal(report.passed,false);
    assert.equal(r.called.at(-1),name);assert.equal(report.steps.at(-1).exitCode,7);assert.match(report.error,/failed/);
    assert.equal(JSON.parse(fs.readFileSync(reportFile,'utf8')).passed,false);
  }
});
test('MVP gate records launch exceptions instead of producing a passing summary',async t=>{
  const f=fixture(t),r=runner(f,()=>{throw Error('spawn refused');});
  const {report}=await verifyMvp({...f,...r});assert.equal(report.passed,false);assert.equal(report.steps.length,1);
  assert.equal(report.steps[0].error,'spawn refused');assert.ok(report.finishedAt);
});
test('an old passing native report cannot satisfy a new MVP verification',async t=>{
  const f=fixture(t);nativeRun(f.editorRuns);const r=runner(f);
  const {report}=await verifyMvp({...f,...r});assert.equal(report.passed,false);assert.match(report.error,/exactly one new/);
});
test('MVP gate refuses partial native evidence and hosts without enabled trust',async t=>{
  for(const options of [{result:{checks:[]}},{result:{sourceFilesUnchanged:false}},
    {host:{runId:randomUUID()}},{host:{completed:false}},{host:{trustEnabled:false}},
    {missingHost:true},{malformed:true}]){
    const f=fixture(t),r=runner(f,phase=>{if(phase.name==='editor')nativeRun(f.editorRuns,options);});
    const {report}=await verifyMvp({...f,...r});assert.equal(report.passed,false);assert.equal(report.steps[2].passed,false);
    assert.ok(report.error);
  }
});
test('concurrent or ambiguous native runs are refused rather than guessed',async t=>{
  const f=fixture(t),r=runner(f,phase=>{if(phase.name==='editor'){nativeRun(f.editorRuns);nativeRun(f.editorRuns);}});
  const {report}=await verifyMvp({...f,...r});assert.equal(report.passed,false);assert.match(report.error,/ambiguous evidence/);
});
test('MVP CLI rejects skip flags instead of silently lowering its coverage',()=>{
  const script=fileURLToPath(new URL('../scripts/verify-mvp.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script,'--skip-editor'],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/Usage: npm run verify:windows/);
});
