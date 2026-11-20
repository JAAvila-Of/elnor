import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

function readObservation(file){
  const lines=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/),marker=lines.indexOf('### Result');
  assert.ok(marker>=0,'No successful CLI result: '+file);
  const result=JSON.parse(lines[marker+1]);assert.equal(result.kind,'elnor-runtime-browser-observations-v1');assert.equal(result.passed,true);return result;
}
export function stats(values){
  assert.ok(values.length>0&&values.every(value=>Number.isFinite(value)&&value>=0),'Invalid metric values');
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return {n:values.length,min:sorted[0],median:sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2,max:sorted.at(-1)};
}
export function summarize(directory){
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8')),preflight=readObservation(path.join(directory,'preflight.txt'));
  assert.equal(preflight.mode,'preflight');assert.equal(preflight.samples.length,42);assert.ok(preflight.schemas[100]&&preflight.schemas[1000]);
  const output={kind:'elnor-runtime-comparison-summary-v1',createdAt:new Date().toISOString(),passed:false,
    versions:manifest.versions,browser:preflight.browser,methodology:manifest.methodology,runtime:[],startup:[],memory:[],delivery:[]};
  const actions=['create','update','select','append','swap','remove','clear'];
  for(const size of [100,1000])for(const framework of ['elnor','react','svelte']){
    const result=readObservation(path.join(directory,`runtime-${framework}-${size}.txt`));
    assert.equal(result.browser,preflight.browser);assert.equal(result.framework,framework);assert.equal(result.size,size);assert.equal(result.samples.length,49);
    for(const action of actions){
      const rows=result.samples.filter(item=>item.action===action);assert.deepEqual(rows.map(item=>item.round).sort(),[0,1,2,3,4,5,6]);
      const metrics={};for(const key of ['frameWindowMs','ScriptDurationMs','LayoutDurationMs','RecalcStyleDurationMs','TaskDurationMs'])metrics[key]=stats(rows.map(item=>item[key]));
      assert.ok(rows.every(row=>row.keyedIdentity));output.runtime.push({framework,size,action,metrics});
    }
  }
  const startup=readObservation(path.join(directory,'startup.txt')),memory=readObservation(path.join(directory,'memory.txt'));
  assert.equal(startup.samples.length,15);assert.equal(memory.samples.length,15);
  for(const framework of ['elnor','react','svelte']){
    const rows=startup.samples.filter(item=>item.framework===framework);assert.equal(rows.length,5);
    output.startup.push({framework,readyMs:stats(rows.map(item=>item.ready.readyMs)),domContentLoadedMs:stats(rows.map(item=>item.navigation.domContentLoadedEventEnd))});
    output.memory.push(...memory.samples.filter(item=>item.framework===framework));
    const files=[framework+'.html',framework+'.mjs','driver.mjs','style.css'].map(name=>{const file=manifest.files.find(file=>file.name===name);assert.ok(file);return file;});
    output.delivery.push({framework,files:files.map(file=>file.name),rawBytes:files.reduce((sum,file)=>sum+file.rawBytes,0),gzipBytes:files.reduce((sum,file)=>sum+file.gzipBytes,0),brotliBytes:files.reduce((sum,file)=>sum+file.brotliBytes,0)});
  }
  output.passed=true;fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(output,null,2),{flag:'wx'});return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const report=summarize(path.resolve(process.argv[2]));console.log(JSON.stringify(report,null,2));}catch(error){console.error(error.stack);process.exitCode=1;}
}
