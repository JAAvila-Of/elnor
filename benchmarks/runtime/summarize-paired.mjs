import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {stats} from './summarize.mjs';

const directory=path.resolve(process.argv[2]),read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const study=read(path.join(directory,'study.json'));
assert.equal(study.kind,'elnor-paired-study-v1');assert.equal(study.passed,true);
assert.equal(study.cases.length,study.plan.length);assert.ok([8,16].includes(study.cases.length));
const output={kind:'elnor-paired-summary-v1',passed:false,diagnosticOnly:true,protocol:study.protocol,
  study:directory,pairs:[],runtime:[],browser:null,sourceHashes:null,
  limitations:['Two pairs per group/size; not an acceptance margin or significance test',
    'AX observation is post-timing in the same context, not proof of constant conditions during every sample',
    'Trace thread durations are inclusive; AX cost is not subtracted from total CPU',
    'Compare within each declared pair; historical process-separated cohorts use a different protocol']};
const actions=['create','update','select','append','swap','remove','clear'];
const fixtures=new Map();
for(let index=0;index<study.cases.length;index++){
  const item=study.cases[index],config=study.plan[index];assert.equal(item.passed,true);
  const report=read(path.join(item.directory,'result.json')),supervisor=read(path.join(item.directory,'supervisor.json'));
  assert.equal(report.kind,'elnor-paired-browser-v1');assert.equal(report.passed,true);assert.deepEqual(report.config,config);
  assert.equal(supervisor.passed,true);assert.equal(supervisor.limitsVerified,true);assert.equal(supervisor.activeProcessesAfterCleanup,0);
  assert.equal(supervisor.limits.cpuPercent,10);assert.equal(supervisor.limits.jobCommitBytes,768*1024**2);
  assert.equal(supervisor.limits.maxProcesses,24);assert.equal(supervisor.limits.timeoutSeconds,45);assert.equal(supervisor.limits.idleTimeoutSeconds,12);
  if(output.browser)assert.equal(report.browserVersion,output.browser);else output.browser=report.browserVersion;
  if(output.sourceHashes)assert.deepEqual(report.sourceHashes,output.sourceHashes);else output.sourceHashes=report.sourceHashes;
  for(const [name,hash] of Object.entries(report.sourceHashes))assert.equal(sha(fs.readFileSync(path.join(item.directory,name))),hash);
  for(const label of ['A','B']){
    const recorded=report.fixtures[label],fixture=path.resolve(config[label].fixture);
    assert.equal(recorded.fixture,fixture);
    if(!fixtures.has(fixture)){
      const bytes=fs.readFileSync(path.join(fixture,'manifest.json')),manifest=JSON.parse(bytes);
      for(const file of manifest.files)assert.equal(sha(fs.readFileSync(path.join(fixture,'site',file.name))),file.sha256);
      fixtures.set(fixture,{hash:sha(bytes),manifest});
    }
    const current=fixtures.get(fixture);assert.equal(recorded.manifestSha256,current.hash);
    assert.deepEqual(recorded.files,current.manifest.files);assert.deepEqual(recorded.runtime,current.manifest.runtime);
    assert.deepEqual(recorded.compiler,current.manifest.compiler);assert.deepEqual(recorded.versions,current.manifest.versions);
  }
  for(const file of ['react.mjs','svelte.mjs','driver.mjs','style.css']){
    assert.equal(report.fixtures.A.files.find(item=>item.name===file).sha256,report.fixtures.B.files.find(item=>item.name===file).sha256);
  }
  assert.deepEqual(report.fixtures.A.versions,report.fixtures.B.versions);
  assert.equal(report.fixtures.A.compiler.sha256,report.fixtures.B.compiler.sha256);
  if(config.group==='aa'){
    assert.equal(report.fixtures.A.manifestSha256,report.fixtures.B.manifestSha256);
    assert.equal(config.A.framework,'elnor');assert.equal(config.B.framework,'elnor');
  }
  assert.deepEqual(report.variants.map(v=>v.label),config.order);
  for(const variant of report.variants){
    const value=variant.observation;assert.equal(value.passed,true);assert.equal(value.mode,'runtime');
    assert.equal(value.size,config.size);assert.equal(value.framework,config[variant.label].framework);
    assert.equal(value.metricTimeDomain,'threadTicks');assert.equal(value.samples.length,49);
    for(const action of actions){
      const samples=value.samples.filter(s=>s.action===action);assert.deepEqual(samples.map(s=>s.round),[0,1,2,3,4,5,6]);
      for(const sample of samples){
        assert.equal(sample.keyedIdentity,true);assert.equal('control' in sample,false);
        if(config.interleaved){
          assert.equal(value.protocol,'action-interleaved-v1');assert.equal(sample.visibility,'visible');
          const order=(sample.round+actions.indexOf(action))&1?[...config.order].reverse():config.order;
          assert.equal(sample.position,order.indexOf(variant.label));
          assert.ok(Number.isFinite(Date.parse(sample.began))&&Date.parse(sample.finished)>=Date.parse(sample.began));
        }
        for(const key of ['TaskDurationMs','ThreadTimeMs','ScriptDurationMs','LayoutDurationMs','RecalcStyleDurationMs','frameWindowMs'])assert.ok(Number.isFinite(sample[key])&&sample[key]>=0);
      }
    }
    const ax=value.afterTiming;assert.equal(ax.keyedIdentity,true);assert.equal(ax.rows,config.size);
    assert.ok(Number.isInteger(ax.accessibilityEvents)&&ax.accessibilityEvents>=0);
    assert.ok(Number.isFinite(ax.accessibilityThreadMs)&&ax.accessibilityThreadMs>=0);
    assert.ok(ax.traceBytes>0&&ax.traceBytes<=8*1024*1024);assert.ok(ax.schemaSha256);
  }
  assert.equal(report.variants[0].observation.afterTiming.schemaSha256,report.variants[1].observation.afterTiming.schemaSha256);
  const pair={group:config.group,size:config.size,repetition:config.repetition,order:config.order,
    directory:item.directory,fixtures:report.fixtures,interleaved:!!config.interleaved,variants:{}};
  for(const variant of report.variants){
    const value=variant.observation,ax=value.afterTiming;
    pair.variants[variant.label]={framework:value.framework,began:variant.began,finished:variant.finished,
      accessibility:{events:ax.accessibilityEvents,threadMs:ax.accessibilityThreadMs,taskMs:ax.taskDurationMs,schemaSha256:ax.schemaSha256},runtime:{}};
    for(const action of actions)pair.variants[variant.label].runtime[action]=Object.fromEntries(
      ['TaskDurationMs','ScriptDurationMs','LayoutDurationMs','RecalcStyleDurationMs','ThreadTimeMs','frameWindowMs'].map(key=>[key,stats(value.samples.filter(s=>s.action===action).map(s=>s[key]))]));
  }
  if(config.interleaved){
    pair.actionGaps=[];
    for(const action of actions)for(let round=0;round<7;round++){
      const samples=report.variants.map(v=>({label:v.label,...v.observation.samples.find(s=>s.action===action&&s.round===round)})).sort((a,b)=>a.position-b.position);
      const gapMs=Date.parse(samples[1].began)-Date.parse(samples[0].finished);assert.ok(gapMs>=0);
      pair.actionGaps.push({action,round,first:samples[0].label,gapMs});
    }
  }
  output.pairs.push(pair);
}
const median=values=>{assert.ok(values.every(Number.isFinite));const sorted=[...values].sort((a,b)=>a-b);return sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;};
for(const group of new Set(output.pairs.map(pair=>pair.group)))for(const size of [100,1000])for(const action of actions){
  const pairs=output.pairs.filter(p=>p.group===group&&p.size===size);
  assert.deepEqual(pairs.map(p=>p.repetition),[0,1]);assert.deepEqual(pairs.map(p=>p.order.join('')),['AB','BA']);
  const values=pairs.map(p=>{
    const A=p.variants.A.runtime[action].TaskDurationMs.median,B=p.variants.B.runtime[action].TaskDurationMs.median;
    assert.ok(A>0);return {order:p.order.join(''),A,B,deltaMs:B-A,deltaPercent:100*(B/A-1)};
  });
  output.runtime.push({group,size,action,pairs:values,medianDeltaPercent:median(values.map(v=>v.deltaPercent))});
}
output.passed=true;
if(!process.argv.includes('--stdout-only'))fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(output,null,2),{flag:'wx'});
for(const row of output.runtime)console.log(JSON.stringify({group:row.group,size:row.size,action:row.action,
  pairMedians:row.pairs.map(v=>({order:v.order,A:+v.A.toFixed(3),B:+v.B.toFixed(3),deltaPercent:+v.deltaPercent.toFixed(2)}))}));
