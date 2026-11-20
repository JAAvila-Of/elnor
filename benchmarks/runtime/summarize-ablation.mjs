import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {stats} from './summarize.mjs';
const directory=path.resolve(process.argv[2]),read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const study=read(path.join(directory,'ablation.json'));assert.equal(study.passed,true);assert.equal(study.cases.length,12);
const base=read(path.join(study.fixtures.baseline,'manifest.json'));
for(const fixture of Object.values(study.fixtures)){
  const manifest=read(path.join(fixture,'manifest.json'));
  for(const name of ['react.mjs','svelte.mjs','driver.mjs','style.css'])assert.equal(manifest.files.find(f=>f.name===name).sha256,base.files.find(f=>f.name===name).sha256);
}
let browser;
const cases=study.cases.map(c=>{
  const r=read(path.join(c.directory,'result.json')),s=read(path.join(c.directory,'supervisor.json'));
  assert.ok(c.passed&&r.passed&&s.passed&&s.limitsVerified);assert.equal(s.activeProcessesAfterCleanup,0);
  assert.equal(s.limits.cpuPercent,10);assert.equal(s.limits.jobCommitBytes,768*1024**2);
  assert.equal(r.observation.samples.length,49);assert.ok(r.observation.samples.every(x=>x.keyedIdentity));
  if(browser)assert.equal(browser,r.browserVersion);else browser=r.browserVersion;
  return {...c,result:r};
});
const output={kind:'elnor-runtime-ablation-summary-v1',passed:true,diagnosticOnly:true,protocol:study.protocol,browser,rows:[]};
for(const label of Object.keys(study.fixtures))for(const action of ['create','update','select','append','swap','remove','clear']){
  const groups=cases.filter(c=>c.label===label).map(c=>c.result.observation.samples.filter(s=>s.action===action));
  assert.equal(groups.length,2);assert.ok(groups.every(group=>group.length===7));
  const row={label,action,task:{...stats(groups.flat().map(s=>s.TaskDurationMs)),runMedians:groups.map(g=>stats(g.map(s=>s.TaskDurationMs)).median)},script:stats(groups.flat().map(s=>s.ScriptDurationMs)),layout:stats(groups.flat().map(s=>s.LayoutDurationMs))};
  output.rows.push(row);
  if(['create','update','clear'].includes(action))console.log(JSON.stringify({label,action,task:row.task.median,runMedians:row.task.runMedians}));
}
fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(output,null,2),{flag:'wx'});
