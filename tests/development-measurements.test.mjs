import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {summarizeSamples,measureDevelopment} from '../scripts/measure-development.mjs';

function temporary(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-measurement-test-'));
  t.after(()=>{
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('elnor-measurement-test-'));
    fs.rmSync(root,{recursive:true,force:true});
  });return root;
}
test('measurement summary retains raw sample counts and groups distinct timing boundaries',()=>{
  const report=summarizeSamples([{stage:'check-first',ms:8},{stage:'check-first',ms:2},{stage:'check-first',ms:4},{stage:'http-cached',ms:1}]);
  assert.deepEqual(report['check-first'],{n:3,minMs:2,medianMs:4,maxMs:8});assert.equal(report['http-cached'].n,1);
  assert.equal('p95Ms' in report['check-first'],false);
  for(const ms of [NaN,Infinity,-1])assert.throws(()=>summarizeSamples([{stage:'bad',ms}]));
});
test('measurement runner refuses ambiguous settings and foreign output without adopting it',async t=>{
  const root=temporary(t),directory=path.join(root,'foreign');fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'keep.txt'),'keep');
  await assert.rejects(measureDevelopment({directory,samples:1,componentCounts:[2]}));
  assert.deepEqual(fs.readdirSync(directory),['keep.txt']);
  for(const options of [{samples:0},{samples:11},{componentCounts:[1]},{componentCounts:[2,2]}])
    await assert.rejects(measureDevelopment({directory:path.join(root,'new'),...options}));
  assert.equal(fs.existsSync(path.join(root,'new')),false);
});
test('measurement smoke run verifies real outcomes, source restoration and complete correlated reports',async t=>{
  const directory=path.join(temporary(t),'run'),report=await measureDevelopment({directory,samples:1,componentCounts:[2]});
  assert.equal(report.passed,true);assert.equal(report.workers.length,3);assert.equal(report.workloads[0].components,2);
  const stages=new Set(report.workloads[0].samples.map(sample=>sample.stage));
  for(const stage of ['process-first-check','process-first-build','warm-check','warm-build','dev-create',
    'save-publication','source-error','source-recovery','http-uncached-props','http-cached-props','http-invalid-props','http-props-recovery'])assert.ok(stages.has(stage),stage);
  for(const worker of report.workers){assert.equal(worker.exitCode,0);assert.equal(worker.sourceFilesRestored,true);}
  for(const item of report.workloads[0].samples.filter(sample=>sample.stage==='save-publication')){
    assert.ok(item.firstDetectionMs>=0);assert.ok(item.attemptPollMs>=0);assert.ok(item.ms>=item.firstDetectionMs);
  }
  assert.equal(report.applicationsLaunched.length,0);assert.equal(report.pollIntervalMs,500);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'result.json'),'utf8')).passed,true);
});
