// Instrumented diagnostic, not a normal startup timing collector.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {csp} from '../../src/server.mjs';
import {installStartupDiagnostics} from './startup-observer.mjs';
const [fixture,planFile,output]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(planFile)),manifestBytes=fs.readFileSync(path.join(fixture,'manifest.json')),manifest=JSON.parse(manifestBytes);
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const progress=value=>fs.appendFileSync(path.join(output,'progress.jsonl'),JSON.stringify({at:new Date().toISOString(),...value})+'\n');
const result={kind:'elnor-startup-phase-diagnostic-case-v1',protocol:'instrumented-startup-phases-v1',instrumented:true,passed:false,diagnosticOnly:true,
  config,manifestSha256:sha(manifestBytes),samples:[],sourceHashes:{}};
let server,browser;
const metrics=async cdp=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
async function captureTrace(cdp,file){
  const finished=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const complete=await finished;
  assert.ok(complete.stream&&!complete.dataLossOccurred);let source='',bytes=0;
  try{while(true){const chunk=await cdp.send('IO.read',{handle:complete.stream,size:65536});assert.ok(!chunk.base64Encoded);bytes+=Buffer.byteLength(chunk.data);assert.ok(bytes<=8*1024*1024,'Trace exceeds 8 MiB');source+=chunk.data;progress({stage:'trace-read',bytes});if(chunk.eof)break;}}
  finally{await cdp.send('IO.close',{handle:complete.stream});}
  const trace=JSON.parse(source),events=trace.traceEvents;assert.ok(Array.isArray(events));
  const mains=new Set(events.filter(event=>event.name==='thread_name'&&event.args?.name==='CrRendererMain').map(event=>event.pid+':'+event.tid));
  const ready=events.filter(event=>event.name==='elnor:startup-diag:ready-observed'&&mains.has(event.pid+':'+event.tid));
  assert.equal(ready.length,1,'Missing/ambiguous diagnostic ready mark');
  const renderer=ready[0].pid+':'+ready[0].tid;
  const initial=events.filter(event=>event.name==='elnor:startup-diag:init'&&event.pid+':'+event.tid===renderer);
  assert.equal(initial.length,1,'Missing/ambiguous document init mark');assert.ok(ready[0].ts>=initial[0].ts);
  fs.writeFileSync(path.join(output,file),source,{flag:'wx'});
  return {file,sha256:sha(Buffer.from(source)),bytes,renderer,initTs:initial[0].ts,readyTs:ready[0].ts};
}
async function measure(label,framework,repetition,position){
  const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  try{
    await context.addInitScript(installStartupDiagnostics);
    const tab=await context.newPage(),errors=[];tab.on('pageerror',error=>errors.push(error.message));tab.setDefaultTimeout(5000);tab.setDefaultNavigationTimeout(10000);
    await tab.bringToFront();assert.equal(await tab.evaluate(()=>document.visibilityState),'visible');
    const cdp=await context.newCDPSession(tab);await cdp.send('Performance.enable',{timeDomain:'threadTicks'});
    await cdp.send('Tracing.start',{categories:'toplevel,blink.user_timing,devtools.timeline,v8,blink,loading,accessibility',transferMode:'ReturnAsStream'});
    const before=await metrics(cdp),start=performance.now();
    await tab.goto('http://127.0.0.1:'+server.address().port+'/'+config.workload+'-'+framework+'.html',{waitUntil:'load'});
    const observed=await tab.evaluate(async()=>{if(!window.__matrix)throw Error('Ready contract missing');await window.__matrix.ready;return window.__collectStartupDiagnostics();});
    const wallMs=performance.now()-start,after=await metrics(cdp),cpu={};
    for(const name of ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','ThreadTime']){
      assert.ok(Number.isFinite(before[name])&&Number.isFinite(after[name])&&after[name]>=before[name]);cpu[name+'Ms']=(after[name]-before[name])*1000;
    }
    const trace=await captureTrace(cdp,'trace-'+repetition+'-'+label+'.json');
    assert.equal(observed.initialVisibility,'visible');assert.equal(observed.readyVisibility,'visible');assert.ok(observed.visibilityEvents.every(event=>event.state==='visible'));
    assert.ok(observed.rootObservedAt!==null&&observed.readyResolvedAt!==null&&observed.installedAt!==null);
    assert.deepEqual(await tab.evaluate(()=>window.__matrix.verify()),{mounted:true,identity:true});
    const schemaSha256=sha(Buffer.from(await tab.evaluate(()=>window.__matrix.schema())));
    await tab.evaluate(()=>window.__matrix.unmount());assert.deepEqual(await tab.evaluate(()=>window.__matrix.verify()),{mounted:false});assert.deepEqual(errors,[]);
    return {label,framework,repetition,position,wallMs,...cpu,observed,trace,schemaSha256,unmounted:true};
  }finally{await context.close();}
}
try{
  assert.equal(manifest.kind,'elnor-expanded-matrix-v1');assert.ok(manifest.workloads.includes(config.workload));assert.ok(['aa','react','svelte'].includes(config.group));
  assert.ok(['AB','BA'].includes(config.order.join('')));assert.equal(config.rounds,3);
  for(const name of ['startup-diagnostic-worker.mjs','startup-observer.mjs','startup-diagnostic-windows.py']){
    const bytes=fs.readFileSync(path.join(here,name));result.sourceHashes[name]=sha(bytes);fs.writeFileSync(path.join(output,name),bytes,{flag:'wx'});
  }
  for(const name of ['runtime','compiler'])assert.equal(sha(fs.readFileSync(path.join(fixture,name+'-source.mjs'))),manifest[name].sha256);
  const routes=new Map();
  for(const file of manifest.files){assert.equal(path.basename(file.name),file.name);const bytes=fs.readFileSync(path.join(fixture,'site',file.name));assert.equal(sha(bytes),file.sha256);routes.set('/'+file.name,{bytes,type:file.name.endsWith('.mjs')?'text/javascript':file.name.endsWith('.css')?'text/css':'text/html'});}
  server=http.createServer((req,res)=>{
    if(req.headers.host!=='127.0.0.1:'+req.socket.localPort){res.writeHead(403).end();return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    const route=routes.get(req.url);if(!route){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':route.type,'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:route.bytes);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const require=createRequire(import.meta.url),{chromium}=require(path.join(process.env.APPDATA,'npm/node_modules/@playwright/cli/node_modules/playwright'));
  progress({stage:'launch'});browser=await chromium.launch({channel:'msedge',headless:true,chromiumSandbox:true,timeout:10000,args:['--disable-gpu']});
  result.browserVersion=browser.version();result.frameworkVersions=manifest.versions;
  for(let repetition=0;repetition<3;repetition++){
    const order=repetition&1?[...config.order].reverse():config.order;
    for(let position=0;position<order.length;position++){
      const label=order[position],framework=label==='A'||config.group==='aa'?'elnor':config.group;
      progress({stage:'diagnostic',repetition,label,framework,position});result.samples.push(await measure(label,framework,repetition,position));
    }
  }
  assert.equal(result.samples.length,6);assert.equal(new Set(result.samples.map(sample=>sample.schemaSha256)).size,1);result.passed=true;
}catch(error){result.error=error.stack;process.exitCode=1;}
finally{
  progress({stage:'cleanup'});
  try{if(browser)await browser.close();}catch(error){result.passed=false;result.cleanupError=error.message;process.exitCode=1;}
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
}
