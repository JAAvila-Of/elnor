import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {stats} from './summarize.mjs';

const directory=path.resolve(process.argv[2]),read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const study=read(path.join(directory,'study.json'));
assert.equal(study.kind,'elnor-contained-reconciliation-study-v1');assert.equal(study.passed,true);
const repeats=study.repeats??2;assert.ok([2,4].includes(repeats));
assert.equal(study.cases.length,4+8*repeats);assert.equal(study.plan.length,4+8*repeats);
const baseline=read(path.join(study.baseline,'manifest.json')),candidate=read(path.join(study.candidate,'manifest.json'));
for(const name of ['react.mjs','svelte.mjs','driver.mjs','style.css']){
  assert.equal(baseline.files.find(file=>file.name===name).sha256,candidate.files.find(file=>file.name===name).sha256,'Control/shared asset changed: '+name);
}
const output={kind:'elnor-contained-reconciliation-summary-v1',diagnosticOnly:true,passed:false,
  study:directory,protocol:study.protocol,metricTimeDomain:study.metricTimeDomain??'timeTicks',baselineRuntime:baseline.runtime,candidateRuntime:candidate.runtime,
  frameworkVersions:candidate.versions,baselineCompiler:baseline.compiler??null,candidateCompiler:candidate.compiler??null,browser:null,runtime:[],mutations:[],cases:study.cases,
  limitations:['CPU capped and GPU disabled; no product parity claim',repeats+' independent browser runs per variant and size; seven samples per operation in each','Instrumentation occurs only in separate mutation cases','Effect counts cover Elnor only; selection still invalidates the list effect']};
let producerHashes;
const loaded=study.cases.map((item,index)=>{
  assert.equal(item.passed,true);assert.equal(item.label,study.plan[index].label);assert.equal(item.size,study.plan[index].size);
  const report=read(path.join(item.directory,'result.json')),supervisor=read(path.join(item.directory,'supervisor.json'));
  assert.equal(report.passed,true);assert.equal(report.diagnosticOnly,true);assert.equal(supervisor.passed,true);
  assert.equal(supervisor.limitsVerified,true);assert.equal(supervisor.activeProcessesAfterCleanup,0);
  assert.equal(supervisor.limits.cpuPercent,10);assert.equal(supervisor.limits.jobCommitBytes,768*1024**2);
  assert.equal(supervisor.limits.timeoutSeconds,45);assert.equal(supervisor.limits.maxProcesses,24);
  assert.equal(report.manifestSha256,loadedManifestHash(item));
  if(output.browser)assert.equal(output.browser,report.browserVersion);else output.browser=report.browserVersion;
  assert.equal(report.mode,item.mode);assert.equal(report.size,item.size);assert.equal(report.observation.passed,true);
  assert.equal(report.observation.metricTimeDomain??'timeTicks',output.metricTimeDomain);
  if(producerHashes)assert.deepEqual(report.sourceHashes,producerHashes,'Collection harness changed within the study');else producerHashes=report.sourceHashes;
  return {...item,report};
});
function loadedManifestHash(item){
  // Hash identity is also recorded by the worker; compare equal fixtures across runs.
  const expected=item.label==='baseline'?study.baseline:study.candidate;
  return createHash('sha256').update(fs.readFileSync(path.join(expected,'manifest.json'))).digest('hex');
}
for(const size of [100,1000])for(const action of ['create','update','select','append','swap','remove','clear']){
  const row={size,action,variants:{}};
  for(const label of ['baseline','candidate','react','svelte']){
    const cases=loaded.filter(item=>item.size===size&&item.label===label&&item.mode==='runtime');assert.equal(cases.length,repeats);
    assert.deepEqual(cases.map(item=>item.repeat).sort(),Array.from({length:repeats},(_,i)=>i));
    const groups=cases.map(item=>{
      assert.equal(item.report.observation.samples.length,49);assert.equal(item.report.warmupRounds,2);
      const samples=item.report.observation.samples.filter(s=>s.action===action);assert.equal(samples.length,7);
      assert.deepEqual(samples.map(s=>s.round).sort(),[0,1,2,3,4,5,6]);assert.ok(samples.every(s=>s.keyedIdentity));return samples;
    });
    const metrics={};
    const metricNames=['TaskDurationMs','ScriptDurationMs','LayoutDurationMs','RecalcStyleDurationMs','frameWindowMs'];
    if(groups.flat().every(sample=>Number.isFinite(sample.ThreadTimeMs)))metricNames.push('ThreadTimeMs');
    for(const metric of metricNames){
      metrics[metric]={...stats(groups.flat().map(s=>s[metric])),runMedians:groups.map(group=>stats(group.map(s=>s[metric])).median)};
    }
    row.variants[label]=metrics;
  }
  output.runtime.push(row);
}
for(const item of loaded.filter(item=>item.mode==='mutations')){
  assert.equal(item.report.observation.samples.length,7);output.mutations.push({label:item.label,size:item.size,samples:item.report.observation.samples});
}
output.passed=true;
if(!process.argv.includes('--stdout-only'))fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(output,null,2),{flag:'wx'});
for(const row of output.runtime)console.log(JSON.stringify({size:row.size,action:row.action,
  taskMedianMs:Object.fromEntries(Object.entries(row.variants).map(([key,value])=>[key,Number(value.TaskDurationMs.median.toFixed(3))])),
  taskRunMediansMs:Object.fromEntries(Object.entries(row.variants).map(([key,value])=>[key,value.TaskDurationMs.runMedians.map(n=>Number(n.toFixed(3)))]))}));
