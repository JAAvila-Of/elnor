// Run through paired-windows.py; every browser belongs to its Windows Job.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {collectComparison} from './browser-run.js';
import {collectInterleaved} from './interleaved-collector.mjs';
import {csp} from '../../src/server.mjs';

const [planFile,output]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(planFile));
assert.ok([100,1000].includes(config.size));
assert.ok(['A,B','B,A'].includes(config.order.join(',')));
for(const label of ['A','B'])assert.ok(['elnor','react','svelte'].includes(config[label].framework));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const progress=event=>fs.appendFileSync(path.join(output,'progress.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n');
const report={kind:'elnor-paired-browser-v1',passed:false,diagnosticOnly:true,config,variants:[],sourceHashes:{},fixtures:{}};
let browser;const servers=[],baseURLs={};
async function observe({tab,cdp},framework){
  progress({stage:'post-timing-accessibility'});
  await tab.evaluate(()=>{window.__bench.prepare('clear');return window.__bench.run();});
  await tab.evaluate(()=>window.__bench.verify());
  await tab.evaluate(()=>window.__bench.prepare('create'));
  await cdp.send('Tracing.start',{categories:'toplevel,accessibility,blink,devtools.timeline,v8',transferMode:'ReturnAsStream'});
  const before=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
  await tab.evaluate(()=>window.__bench.run());
  const after=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
  const finished=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
  await cdp.send('Tracing.end');const complete=await finished;
  assert.ok(complete.stream&&!complete.dataLossOccurred,'Incomplete accessibility observation');
  let source='',bytes=0;
  try{
    while(true){
      const chunk=await cdp.send('IO.read',{handle:complete.stream,size:65536});assert.ok(!chunk.base64Encoded);
      bytes+=Buffer.byteLength(chunk.data);assert.ok(bytes<=8*1024*1024,'Trace exceeds 8 MiB');
      source+=chunk.data;progress({stage:'trace-read',bytes});if(chunk.eof)break;
    }
  }finally{await cdp.send('IO.close',{handle:complete.stream});}
  const trace=JSON.parse(source),events=trace.traceEvents;assert.ok(Array.isArray(events));
  const mains=new Set(events.filter(e=>e.name==='thread_name'&&e.args?.name==='CrRendererMain').map(e=>e.pid+':'+e.tid));
  const active=new Set(events.filter(e=>e.name==='FunctionCall'&&e.args?.data?.url?.startsWith('http://127.0.0.1:')&&e.args.data.url.endsWith('/'+framework+'.mjs')).map(e=>e.pid+':'+e.tid).filter(key=>mains.has(key)));
  assert.equal(active.size,1,'Ambiguous page renderer');
  const ax=events.filter(e=>e.ph==='X'&&e.name==='LocalFrameView::RunAccessibilitySteps'&&active.has(e.pid+':'+e.tid));
  const checked=await tab.evaluate(()=>window.__bench.verify());
  const schemaSha256=await tab.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(window.__bench.schema())))).map(byte=>byte.toString(16).padStart(2,'0')).join(''));
  return {kind:'post-timing-create-trace',traceBytes:bytes,trace,
    accessibilityEvents:ax.length,accessibilityThreadMs:ax.reduce((sum,e)=>sum+(e.tdur??0),0)/1000,
    taskDurationMs:(after.TaskDuration-before.TaskDuration)*1000,schemaSha256,...checked,
    limitation:'Post-timing observation, not a guarantee of constant AX conditions during every measured action'};
}
try{
  const routeSets={};
  for(const label of ['A','B']){
    const fixture=path.resolve(config[label].fixture),bytes=fs.readFileSync(path.join(fixture,'manifest.json')),manifest=JSON.parse(bytes);
    assert.equal(manifest.kind,'elnor-runtime-comparison-v1');assert.ok(!manifest.runtime?.instrumentation);
    report.fixtures[label]={fixture,manifestSha256:sha(bytes),runtime:manifest.runtime,compiler:manifest.compiler,versions:manifest.versions,files:manifest.files};
    routeSets[label]=new Map();
    for(const item of manifest.files){
      assert.match(item.name,/^[a-z0-9.-]+$/);const asset=fs.readFileSync(path.join(fixture,'site',item.name));
      assert.equal(sha(asset),item.sha256,'Asset hash mismatch: '+item.name);
      routeSets[label].set('/'+item.name,{bytes:asset,type:item.name.endsWith('.mjs')?'text/javascript':item.name.endsWith('.css')?'text/css':'text/html'});
    }
  }
  const here=path.dirname(fileURLToPath(import.meta.url));
  for(const name of ['paired-worker.mjs','browser-run.js','interleaved-collector.mjs','windows_job.py']){
    const bytes=fs.readFileSync(path.join(here,name));report.sourceHashes[name]=sha(bytes);fs.writeFileSync(path.join(output,name),bytes,{flag:'wx'});
  }
  for(const label of ['A','B']){
  const routes=routeSets[label],server=http.createServer((req,res)=>{
    if(req.headers.host!=='127.0.0.1:'+req.socket.localPort){res.writeHead(403).end();return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    const route=routes.get(new URL(req.url,'http://127.0.0.1').pathname);if(!route){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':route.type,'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?undefined:route.bytes);
  });
  servers.push(server);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  baseURLs[label]='http://127.0.0.1:'+server.address().port;
  }
  progress({stage:'launch-browser'});
  const require=createRequire(import.meta.url),{chromium}=require(path.join(process.env.APPDATA,'npm/node_modules/@playwright/cli/node_modules/playwright'));
  browser=await chromium.launch({channel:'msedge',headless:true,chromiumSandbox:true,timeout:10000,args:['--disable-gpu']});
  report.browserVersion=browser.version();const page=await browser.newPage();
  if(config.interleaved){
    report.variants=await collectInterleaved(browser,baseURLs,config,observe,progress);
  }else for(const label of config.order){
    progress({stage:'variant',label});const began=new Date().toISOString();
    const observation=await collectComparison(page,{mode:'runtime',framework:config[label].framework,size:config.size,
      timeDomain:'threadTicks',warmupRounds:2,measuredRounds:7,baseURL:baseURLs[label],
      afterTiming:handles=>observe(handles,config[label].framework)},event=>progress({label,...event}));
    report.variants.push({label,began,finished:new Date().toISOString(),observation});
  }
  assert.equal(report.variants[0].observation.afterTiming.schemaSha256,report.variants[1].observation.afterTiming.schemaSha256,'Variant DOM schemas differ');
  report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;}
finally{
  progress({stage:'cleanup'});
  try{if(browser)await browser.close();}catch(error){report.passed=false;report.cleanupError=error.message;process.exitCode=1;}
  for(const server of servers)await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2),{flag:'wx'});
}
