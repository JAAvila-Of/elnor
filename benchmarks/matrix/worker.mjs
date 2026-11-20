// Run only through run-windows.py. All browser descendants belong to its Job.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {csp} from '../../src/server.mjs';
const [fixture,planFile,output]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(planFile)),manifestBytes=fs.readFileSync(path.join(fixture,'manifest.json')),manifest=JSON.parse(manifestBytes);
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const progress=value=>fs.appendFileSync(path.join(output,'progress.jsonl'),JSON.stringify({at:new Date().toISOString(),...value})+'\n');
const report={kind:'elnor-expanded-matrix-case-v1',passed:false,diagnosticOnly:true,config,manifestSha256:sha(manifestBytes),samples:[],sourceHashes:{}};
let server,browser;
const handles=[];
const metrics=async cdp=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(value=>[value.name,value.value]));
function delta(before,after){return Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','ThreadTime'].map(name=>{
  assert.ok(Number.isFinite(before[name])&&Number.isFinite(after[name])&&after[name]>=before[name],name+' invalid');
  return [name+'Ms',(after[name]-before[name])*1000];
}));}
async function schema(tab){return sha(Buffer.from(await tab.evaluate(()=>window.__matrix.schema())));}
async function open(framework){
  const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'}),tab=await context.newPage(),errors=[];
  const handle={context,tab,errors};handles.push(handle);
  tab.on('pageerror',error=>errors.push(error.message));tab.setDefaultTimeout(5000);tab.setDefaultNavigationTimeout(10000);
  const cdp=await context.newCDPSession(tab);handle.cdp=cdp;await cdp.send('Performance.enable',{timeDomain:'threadTicks'});
  const before=await metrics(cdp),began=performance.now();
  await tab.goto('http://127.0.0.1:'+server.address().port+'/'+config.workload+'-'+framework+'.html');
  await tab.waitForFunction(()=>!!window.__matrix,{timeout:10000});await tab.evaluate(()=>window.__matrix.ready);
  const after=await metrics(cdp);handle.startup={wallMs:performance.now()-began,...delta(before,after)};
  await tab.bringToFront();await tab.evaluate(()=>window.__matrix.verify());return handle;
}
async function close(handle){assert.deepEqual(handle.errors,[]);await handle.context.close();handles.splice(handles.indexOf(handle),1);}
async function memory(handle){
  await handle.cdp.send('HeapProfiler.collectGarbage');
  const values=await metrics(handle.cdp),dom=await handle.cdp.send('Memory.getDOMCounters');
  assert.ok(Number.isFinite(values.JSHeapUsedSize));
  return {heapUsedBytes:values.JSHeapUsedSize,domNodes:dom.nodes,documents:dom.documents,listeners:dom.jsEventListeners};
}
async function observe(handle,framework){
  const {tab,cdp}=handle,action=manifest.actions[config.workload][1];
  await tab.bringToFront();await tab.evaluate(action=>window.__matrix.prepare(action),action);
  progress({stage:'post-timing-trace',framework,action});
  await cdp.send('Tracing.start',{categories:'toplevel,accessibility,blink,devtools.timeline,v8',transferMode:'ReturnAsStream'});
  await tab.evaluate(()=>window.__matrix.run());
  const finished=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const end=await finished;
  assert.ok(end.stream&&!end.dataLossOccurred);let source='',bytes=0;
  try{while(true){const chunk=await cdp.send('IO.read',{handle:end.stream,size:65536});assert.ok(!chunk.base64Encoded);bytes+=Buffer.byteLength(chunk.data);assert.ok(bytes<=8*1024*1024);source+=chunk.data;progress({stage:'trace-read',bytes});if(chunk.eof)break;}}
  finally{await cdp.send('IO.close',{handle:end.stream});}
  const trace=JSON.parse(source),events=trace.traceEvents;
  const mains=new Set(events.filter(e=>e.name==='thread_name'&&e.args?.name==='CrRendererMain').map(e=>e.pid+':'+e.tid));
  const active=new Set(events.filter(e=>e.name==='FunctionCall'&&e.args?.data?.url?.endsWith('/'+config.workload+'-'+framework+'.mjs')).map(e=>e.pid+':'+e.tid).filter(key=>mains.has(key)));
  assert.equal(active.size,1,'Ambiguous post-timing renderer');
  const ax=events.filter(e=>e.ph==='X'&&e.name==='LocalFrameView::RunAccessibilitySteps'&&active.has(e.pid+':'+e.tid));
  await tab.evaluate(()=>window.__matrix.verify());
  return {action,traceBytes:bytes,accessibilityEvents:ax.length,accessibilityThreadMs:ax.reduce((sum,e)=>sum+(e.tdur??0),0)/1000,schemaSha256:await schema(tab),trace,
    limitation:'Separate post-timing interaction, not attribution or proof of constant AX in every timed sample'};
}
try{
  assert.equal(manifest.kind,'elnor-expanded-matrix-v1');assert.ok(manifest.workloads.includes(config.workload));
  assert.ok(['preflight','runtime','lifecycle'].includes(config.mode));
  assert.equal(sha(fs.readFileSync(fileURLToPath(import.meta.url))),manifest.sourceHashes['worker.mjs']);
  for(const name of ['worker.mjs','driver.mjs']){const bytes=fs.readFileSync(path.join(here,name));report.sourceHashes[name]=sha(bytes);fs.writeFileSync(path.join(output,name),bytes,{flag:'wx'});}
  assert.equal(sha(fs.readFileSync(path.join(fixture,'runtime-source.mjs'))),manifest.runtime.sha256);
  assert.equal(sha(fs.readFileSync(path.join(fixture,'compiler-source.mjs'))),manifest.compiler.sha256);
  const routes=new Map();
  for(const file of manifest.files){const bytes=fs.readFileSync(path.join(fixture,'site',file.name));assert.equal(sha(bytes),file.sha256);routes.set('/'+file.name,{bytes,type:file.name.endsWith('.mjs')?'text/javascript':file.name.endsWith('.css')?'text/css':'text/html'});}
  server=http.createServer((req,res)=>{
    if(req.headers.host!=='127.0.0.1:'+req.socket.localPort){res.writeHead(403).end();return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    const route=routes.get(req.url);if(!route){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':route.type,'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:route.bytes);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const require=createRequire(import.meta.url),{chromium}=require(path.join(process.env.APPDATA,'npm/node_modules/@playwright/cli/node_modules/playwright'));
  progress({stage:'launch'});browser=await chromium.launch({channel:'msedge',headless:true,chromiumSandbox:true,timeout:10000,args:['--disable-gpu']});
  report.browserVersion=browser.version();report.frameworkVersions=manifest.versions;
  if(config.mode==='preflight'){
    report.schemas={};
    for(const framework of ['elnor','react','svelte']){
      const handle=await open(framework);
      for(const action of manifest.actions[config.workload]){
        progress({stage:'preflight',framework,action});await handle.tab.evaluate(action=>window.__matrix.prepare(action),action);await handle.tab.evaluate(()=>window.__matrix.run());
        const checked=await handle.tab.evaluate(()=>window.__matrix.verify()),hash=await schema(handle.tab);
        if(report.schemas[action])assert.equal(report.schemas[action],hash,'Unequal DOM/value schema for '+action);else report.schemas[action]=hash;
        report.samples.push({framework,action,...checked,schemaSha256:hash});
      }
      await close(handle);
    }
  }else if(config.mode==='runtime'){
    assert.ok(['aa','react','svelte'].includes(config.group));assert.ok(['AB','BA'].includes(config.order.join('')));
    const frameworks={A:'elnor',B:config.group==='aa'?'elnor':config.group},pages={};report.variants={A:[],B:[]};
    for(const label of config.order)pages[label]=await open(frameworks[label]);
    const actions=manifest.actions[config.workload];
    for(let round=-2;round<7;round++)for(let index=0;index<actions.length;index++){
      const action=actions[index],order=(round+index)&1?[...config.order].reverse():config.order;
      for(let position=0;position<order.length;position++){
        const label=order[position],handle=pages[label],{tab,cdp}=handle;
        progress({stage:'runtime',round,action,label,position});await tab.bringToFront();
        assert.equal(await tab.evaluate(()=>document.visibilityState),'visible');await tab.evaluate(action=>window.__matrix.prepare(action),action);
        const began=new Date().toISOString(),before=await metrics(cdp),timing=await tab.evaluate(()=>window.__matrix.run()),after=await metrics(cdp),ended=new Date().toISOString();
        const checked=await tab.evaluate(()=>window.__matrix.verify());
        if(round>=0)report.variants[label].push({round,action,framework:frameworks[label],position,began,ended,visibility:'visible',...timing,...delta(before,after),...checked});
      }
    }
    report.afterTiming={};
    for(const label of config.order){report.afterTiming[label]=await observe(pages[label],frameworks[label]);await close(pages[label]);}
    assert.equal(report.afterTiming.A.schemaSha256,report.afterTiming.B.schemaSha256);
  }else{
    assert.ok(['elnor','react','svelte'].includes(config.framework));report.startup=[];
    for(let repetition=0;repetition<3;repetition++){
      progress({stage:'startup',repetition});const handle=await open(config.framework);report.startup.push({repetition,...handle.startup});await close(handle);
    }
    const handle=await open(config.framework),{tab}=handle;await tab.evaluate(()=>window.__matrix.unmount());
    report.memory={baselineUnmounted:await memory(handle),cycles:[]};
    for(let cycle=0;cycle<8;cycle++){
      progress({stage:'memory-cycle',cycle});await tab.evaluate(action=>window.__matrix.prepare(action),manifest.actions[config.workload][1]);
      if(cycle===0)report.memory.mounted=await memory(handle);
      await tab.evaluate(()=>window.__matrix.run());await tab.evaluate(()=>window.__matrix.verify());await tab.evaluate(()=>window.__matrix.unmount());
      assert.deepEqual(await tab.evaluate(()=>window.__matrix.verify()),{mounted:false});
      report.memory.cycles.push({cycle,...await memory(handle)});
    }
    await close(handle);
  }
  report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;}
finally{
  progress({stage:'cleanup'});
  try{if(browser)await browser.close();}catch(error){report.passed=false;report.cleanupError=error.message;process.exitCode=1;}
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2),{flag:'wx'});
}
