import test from 'node:test';
import assert from 'node:assert/strict';
import {dockerRunArgs,evidenceDirectory,validateHeadlessEvidence} from '../scripts/verify-headless.mjs';
import contract from '../editors/vscode/tests/report-contract.cjs';

function evidence(){
  const runId='synthetic-native';
  return {exitCode:0,gate:{kind:'elnor-mvp-verification-v1',passed:true,finishedAt:'synthetic',steps:
    ['check','node','editor'].map(name=>({name,passed:true,exitCode:0,...(name==='editor'?{evidence:{runId}}:{})}))},
    native:{suite:contract.suite,runId,launchMode:'persistent',passed:true,trusted:true,sourceFilesUnchanged:true,
      editor:'synthetic',node:'synthetic',checks:contract.expectedChecks.map(name=>({name,elapsedMs:1}))},
    host:{runId,completed:true,trusted:true,trustEnabled:true}};
}
test('headless container is isolated without host bind mounts, published ports or privileged flags',()=>{
  const args=dockerRunArgs('elnor-headless-abc123');
  assert.ok(args.includes('--init'));assert.equal(args[args.indexOf('--network')+1],'none');
  assert.ok(args.includes('type=volume,source=elnor-headless-home-v1,target=/home/node'));
  assert.ok(args.some(arg=>arg.startsWith('seccomp=')));
  assert.ok(!args.some(arg=>/--privileged|--cap-add|--no-sandbox|type=bind|--publish|--disable-workspace-trust/.test(arg)));
  assert.throws(()=>dockerRunArgs('some-other-container'),/Invalid owned/);
});
test('headless exporter accepts only one isolated evidence directory',()=>{
  assert.equal(evidenceDirectory('MVP verification: /work/elnor/.elnor/mvp/verification-runs/run-abc\n','gate'),'/work/elnor/.elnor/mvp/verification-runs/run-abc');
  for(const text of ['MVP verification: /etc','MVP verification: /work/elnor/.elnor/mvp/verification-runs/run-abc/../../etc',
    'MVP verification: /work/elnor/.elnor/mvp/verification-runs/run-a\nMVP verification: /work/elnor/.elnor/mvp/verification-runs/run-b'])
    assert.throws(()=>evidenceDirectory(text,'gate'),/Missing or ambiguous/);
});
test('headless evidence requires all real phases and the full native contract',()=>{
  assert.doesNotThrow(()=>validateHeadlessEvidence(evidence()));
  const partial=evidence();partial.native.checks.pop();assert.throws(()=>validateHeadlessEvidence(partial),/incomplete/);
  const skipped=evidence();skipped.gate.steps[2].passed=false;assert.throws(()=>validateHeadlessEvidence(skipped),/incomplete phase/);
});
test('headless evidence refuses failed containers, mismatched runs and disabled trust',()=>{
  for(const modify of [x=>{x.exitCode=1;},x=>{x.host.runId='old';},x=>{x.host.trustEnabled=false;},x=>{x.gate.passed=false;}]){
    const result=evidence();modify(result);assert.throws(()=>validateHeadlessEvidence(result));
  }
});
