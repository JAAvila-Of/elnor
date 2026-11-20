import test from 'node:test';
import assert from 'node:assert/strict';
import contract from '../editors/vscode/tests/report-contract.cjs';

const {suite,expectedChecks,validateEditorReport}=contract;
const context={runId:'run-current',exitCode:0};
const report=()=>({suite,runId:context.runId,passed:true,trusted:true,sourceFilesUnchanged:true,
  editor:'fixture-editor',node:'fixture-node',checks:expectedChecks.map(name=>({name,elapsedMs:1}))});

test('native report validation accepts all required task records for the current run',()=>{
  const result=report();assert.equal(validateEditorReport(result,context),result);assert.equal(result.checks.length,15);
});
test('a passed flag cannot substitute for native task evidence',()=>{
  for(const checks of [[],report().checks.slice(0,12),report().checks.slice(0,13)])
    assert.throws(()=>validateEditorReport({...report(),checks},context),/incomplete/);
});
test('native reports must match the suite and run rather than an earlier result',()=>{
  for(const result of [null,{...report(),suite:'historical-suite'},{...report(),runId:'run-old'}])
    assert.throws(()=>validateEditorReport(result,context),/current suite and run/);
});
test('native report validation refuses failures, missing trust or unrestored fixtures',()=>{
  assert.throws(()=>validateEditorReport(report(),{...context,exitCode:1}),/unsuccessfully/);
  for(const override of [{passed:false},{trusted:false},{sourceFilesUnchanged:false},{error:'failed task'}])
    assert.throws(()=>validateEditorReport({...report(),...override},context),/did not establish/);
});
test('native report validation refuses duplicate tasks and invalid timing records',()=>{
  const duplicate=report();duplicate.checks[14]=duplicate.checks[13];
  assert.throws(()=>validateEditorReport(duplicate,context),/missing a completed task/);
  for(const elapsedMs of [-1,NaN,Infinity,undefined]){
    const result=report();result.checks[0].elapsedMs=elapsedMs;
    assert.throws(()=>validateEditorReport(result,context),/missing a completed task/);
  }
});
