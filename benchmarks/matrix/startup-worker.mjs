// Independent foreground-ready-v2 collector. App/driver bundles stay frozen.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {csp} from '../../src/server.mjs';
const [fixture,planFile,output]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(planFile)),bytes=fs.readFileSync(path.join(fixture,'manifest.json')),manifest=JSON.parse(bytes);
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),sha=value=>createHash('sha256').update(value).digest('hex');
const progress=value=>fs.appendFileSync(path.join(output,'progress.jsonl'),JSON.stringify({at:new Date().toISOString(),...value})+'\n');
const result={kind:'elnor-foreground-startup-case-v2',protocol:'foreground-ready-v2',metricTimeDomain:'threadTicks',
  passed:false,diagnosticOnly:true,config,manifestSha256:sha(bytes),samples:[],sourceHashes:{}};
let browser,server;
const metrics=async cdp=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
function delta(before,after){return Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','ThreadTime'].map(name=>{
  assert.ok(Number.isFinite(before[name])&&Number.isFinite(after[name])&&after[name]>=before[name],name+' invalid');return [name+'Ms',(after[name]-before[name])*1000];
}));}
async function measure(label,framework,repetition,position){
  const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  try{
    await context.addInitScript(()=>{
      window.__startupVisibility={initial:document.visibilityState,events:[]};
      document.addEventListener('visibilitychange',()=>window.__startupVisibility.events.push({state:document.visibilityState,at:performance.now()}));
    });
    const tab=await context.newPage(),errors=[];tab.on('pageerror',error=>errors.push(error.message));
    tab.setDefaultTimeout(5000);tab.setDefaultNavigationTimeout(10000);
    await tab.bringToFront();
    const beforeNavigationVisibility=await tab.evaluate(()=>document.visibilityState);assert.equal(beforeNavigationVisibility,'visible');
    const cdp=await context.newCDPSession(tab);await cdp.send('Performance.enable',{timeDomain:'threadTicks'});
    const before=await metrics(cdp),began=new Date().toISOString(),start=performance.now();
    await tab.goto('http://127.0.0.1:'+server.address().port+'/'+config.workload+'-'+framework+'.html',{waitUntil:'load'});
    // Frozen module entries install __matrix synchronously before load. Await
    // their actual ready promise, without an additional rAF polling gate.
    const observation=await tab.evaluate(async()=>{
      if(!window.__matrix)throw Error('Application ready contract missing after load');
      await window.__matrix.ready;
      return {readyAt:performance.now(),initialVisibility:window.__startupVisibility.initial,
        visibilityEvents:[...window.__startupVisibility.events],readyVisibility:document.visibilityState};
    });
    const wallMs=performance.now()-start,ended=new Date().toISOString(),after=await metrics(cdp);
    assert.equal(observation.initialVisibility,'visible');assert.equal(observation.readyVisibility,'visible');
    assert.ok(observation.visibilityEvents.every(event=>event.state==='visible'));
    assert.ok(observation.visibilityEvents.every(event=>Number.isFinite(event.at)&&event.at<=observation.readyAt));
    assert.deepEqual(await tab.evaluate(()=>window.__matrix.verify()),{mounted:true,identity:true});
    const schemaSha256=sha(Buffer.from(await tab.evaluate(()=>window.__matrix.schema())));
    await tab.evaluate(()=>window.__matrix.unmount());
    assert.deepEqual(await tab.evaluate(()=>window.__matrix.verify()),{mounted:false});assert.deepEqual(errors,[]);
    return {label,framework,repetition,position,began,ended,wallMs,...delta(before,after),beforeNavigationVisibility,...observation,schemaSha256,unmounted:true};
  }finally{await context.close();}
}
try{
  assert.equal(manifest.kind,'elnor-expanded-matrix-v1');assert.ok(manifest.workloads.includes(config.workload));
  assert.ok(['aa','react','svelte'].includes(config.group));assert.ok(['AB','BA'].includes(config.order.join('')));assert.equal(config.rounds,7);
  for(const name of ['startup-worker.mjs','startup-windows.py']){const source=fs.readFileSync(path.join(here,name));result.sourceHashes[name]=sha(source);fs.writeFileSync(path.join(output,name),source,{flag:'wx'});}
  for(const name of ['runtime','compiler'])assert.equal(sha(fs.readFileSync(path.join(fixture,name+'-source.mjs'))),manifest[name].sha256);
  const routes=new Map();
  for(const file of manifest.files){
    assert.equal(path.basename(file.name),file.name);const source=fs.readFileSync(path.join(fixture,'site',file.name));assert.equal(sha(source),file.sha256);
    routes.set('/'+file.name,{bytes:source,type:file.name.endsWith('.mjs')?'text/javascript':file.name.endsWith('.css')?'text/css':'text/html'});
  }
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
  for(let repetition=0;repetition<7;repetition++){
    const order=repetition&1?[...config.order].reverse():config.order;
    for(let position=0;position<order.length;position++){
      const label=order[position],framework=label==='A'||config.group==='aa'?'elnor':config.group;
      progress({stage:'startup',repetition,label,framework,position});result.samples.push(await measure(label,framework,repetition,position));
    }
  }
  assert.equal(result.samples.length,14);assert.equal(new Set(result.samples.map(sample=>sample.schemaSha256)).size,1);result.passed=true;
}catch(error){result.error=error.stack;process.exitCode=1;}
finally{
  progress({stage:'cleanup'});
  try{if(browser)await browser.close();}catch(error){result.passed=false;result.cleanupError=error.message;process.exitCode=1;}
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
}
