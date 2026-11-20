// Paired comparisons of two frozen Elnor builds; invoked by compare-core-windows.py.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {csp} from '../../src/server.mjs';
const [baseline,candidate,planFile,output]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(planFile));
const sha=b=>createHash('sha256').update(b).digest('hex'),servers=[],handles=[];
const report={kind:'elnor-paired-core-v1',passed:false,config,fixtures:[],samples:[],memory:[]};
const progress=stage=>fs.appendFileSync(path.join(output,'progress.jsonl'),JSON.stringify({at:new Date().toISOString(),stage})+'\n');
let browser;
async function serve(directory){
  const bytes=fs.readFileSync(path.join(directory,'manifest.json')),manifest=JSON.parse(bytes),routes=new Map();
  assert.equal(manifest.kind,'elnor-expanded-matrix-v1');assert.ok(manifest.workloads.includes(config.workload));
  for(const [name,key] of [['runtime-source.mjs','runtime'],['compiler-source.mjs','compiler']])assert.equal(sha(fs.readFileSync(path.join(directory,name))),manifest[key].sha256);
  for(const file of manifest.files){const data=fs.readFileSync(path.join(directory,'site',file.name));assert.equal(sha(data),file.sha256);routes.set('/'+file.name,data);}
  report.fixtures.push({directory,manifestSha256:sha(bytes),runtime:manifest.runtime,compiler:manifest.compiler});
  const server=http.createServer((req,res)=>{
    if(req.headers.host!=='127.0.0.1:'+req.socket.localPort){res.writeHead(403).end();return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    const data=routes.get(req.url);if(!data){res.writeHead(404).end();return;}
    const type=req.url.endsWith('.mjs')?'text/javascript':req.url.endsWith('.css')?'text/css':'text/html';
    res.writeHead(200,{'Content-Type':type,'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);
  });servers.push(server);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {manifest,port:server.address().port};
}
const metrics=async cdp=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
async function memory(handle){
  await handle.cdp.send('HeapProfiler.collectGarbage');const m=await metrics(handle.cdp),dom=await handle.cdp.send('Memory.getDOMCounters');
  return {heapUsedBytes:m.JSHeapUsedSize,...dom};
}
try{
  assert.ok(['aa','candidate'].includes(config.group));assert.ok(['AB','BA'].includes(config.order.join('')));
  const sites={A:await serve(baseline),B:await serve(config.group==='aa'?baseline:candidate)};
  assert.deepEqual(sites.A.manifest.actions,sites.B.manifest.actions);
  assert.equal(sites.A.manifest.sourceHashes['driver.mjs'],sites.B.manifest.sourceHashes['driver.mjs']);
  report.workerSha256=sha(fs.readFileSync(fileURLToPath(import.meta.url)));
  fs.copyFileSync(fileURLToPath(import.meta.url),path.join(output,'worker.mjs'));
  const require=createRequire(import.meta.url),{chromium}=require(path.join(process.env.APPDATA,'npm/node_modules/@playwright/cli/node_modules/playwright'));
  progress('launch');browser=await chromium.launch({channel:'msedge',headless:true,chromiumSandbox:true,timeout:10000,args:['--disable-gpu']});report.browserVersion=browser.version();
  const pages={};
  for(const label of config.order){
    const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'}),tab=await context.newPage(),errors=[];
    const handle={context,tab,errors};handles.push(handle);pages[label]=handle;
    tab.on('pageerror',e=>errors.push(e.message));tab.setDefaultTimeout(5000);tab.setDefaultNavigationTimeout(10000);
    await tab.goto(`http://127.0.0.1:${sites[label].port}/${config.workload}-elnor.html`);
    await tab.waitForFunction(()=>!!window.__matrix);await tab.evaluate(()=>window.__matrix.ready);await tab.bringToFront();
    handle.cdp=await context.newCDPSession(tab);await handle.cdp.send('Performance.enable',{timeDomain:'threadTicks'});
  }
  const actions=sites.A.manifest.actions[config.workload],schemas=new Map();
  for(let round=-2;round<7;round++)for(let index=0;index<actions.length;index++){
    const action=actions[index],order=(round+index)&1?[...config.order].reverse():config.order;
    for(const label of order){
      progress(`${round}:${action}:${label}`);const {tab,cdp}=pages[label];await tab.bringToFront();
      assert.equal(await tab.evaluate(()=>document.visibilityState),'visible');
      await tab.evaluate(action=>window.__matrix.prepare(action),action);
      const before=await metrics(cdp),timing=await tab.evaluate(()=>window.__matrix.run()),after=await metrics(cdp);
      const checked=await tab.evaluate(()=>window.__matrix.verify());
      const schema=await tab.evaluate(()=>window.__matrix.schema());
      if(schemas.has(action))assert.equal(schema,schemas.get(action));else schemas.set(action,schema);
      const cpu={};for(const name of ['ThreadTime','TaskDuration','ScriptDuration']){
        assert.ok(Number.isFinite(before[name])&&Number.isFinite(after[name])&&after[name]>=before[name]);cpu[name+'Ms']=(after[name]-before[name])*1000;
      }
      if(round>=0)report.samples.push({round,action,label,visibility:'visible',...timing,...cpu,...checked});
    }
  }
  if(config.group==='candidate'&&config.order.join('')==='AB')for(const label of config.order){
    const handle=pages[label],{tab}=handle;await tab.bringToFront();await tab.evaluate(()=>window.__matrix.unmount());
    const row={label,baseline:await memory(handle),cycles:[]};report.memory.push(row);
    for(let cycle=0;cycle<8;cycle++){
      progress(`memory:${label}:${cycle}`);await tab.evaluate(action=>window.__matrix.prepare(action),actions[1]);
      if(cycle===0)row.mounted=await memory(handle);
      await tab.evaluate(()=>window.__matrix.run());await tab.evaluate(()=>window.__matrix.verify());await tab.evaluate(()=>window.__matrix.unmount());
      assert.deepEqual(await tab.evaluate(()=>window.__matrix.verify()),{mounted:false});row.cycles.push(await memory(handle));
    }
    for(const sample of row.cycles){assert.equal(sample.nodes,row.baseline.nodes);assert.equal(sample.jsEventListeners,row.baseline.jsEventListeners);}
  }
  for(const handle of handles)assert.deepEqual(handle.errors,[]);
  report.passed=true;
}catch(error){report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{
  for(const handle of handles)await handle.context.close();if(browser)await browser.close();
  for(const server of servers)await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));
}
