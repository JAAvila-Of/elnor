// Small local observations for the closure pilot, not a production benchmark.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {build,check,DIST} from '../src/compiler.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const runs=path.resolve(root,'.elnor/spikes/004/pilot-runs');
fs.mkdirSync(runs,{recursive:true});
const run=fs.mkdtempSync(path.join(runs,'run-'));
const samples=[];
for(let iteration=0;iteration<3;iteration++){
  let start=performance.now();const checked=check('UserEditor');
  if(checked.diagnostics.length)throw Error(JSON.stringify(checked.diagnostics));
  const checkMs=performance.now()-start;
  start=performance.now();const built=build('UserEditor');
  samples.push({iteration:iteration+1,checkMs:Math.round(checkMs),buildMs:Math.round(performance.now()-start),components:built.graph.size});
}
// External same-origin test code lets the browser enforce unsafe-eval on a
// normal script. DevTools page.evaluate itself is not evidence of that policy.
fs.writeFileSync(path.join(DIST,'viability-csp-probe.mjs'),`const result={evalBlocked:false,functionBlocked:false};
try{(0,eval)('globalThis.__elnorEvalExecuted=true');}catch(error){result.evalBlocked=error instanceof EvalError;}
try{new Function('globalThis.__elnorFunctionExecuted=true')();}catch(error){result.functionBlocked=error instanceof EvalError;}
globalThis.__elnorCspProbe=result;
`);
const report={date:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,
  entry:'UserEditor',samples,note:'Sequential samples in one Node process on a tiny fixture; build includes another check. No percentile, scale or competitive claim.'};
fs.writeFileSync(path.join(run,'pipeline.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({run,report},null,2));
