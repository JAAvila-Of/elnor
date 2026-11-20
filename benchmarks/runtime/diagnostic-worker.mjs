// Run only through diagnose-windows.py. All child processes belong to its job.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {collectComparison} from './browser-run.js';
import {csp} from '../../src/server.mjs';

const [fixture,output,framework,sizeText,roundsText,playwrightPath,mode='runtime',timeDomain='timeTicks']=process.argv.slice(2);
if(!['timeTicks','threadTicks'].includes(timeDomain))throw Error('Invalid metric time domain');
if(!fixture||!output||!['elnor','react','svelte'].includes(framework)||![100,1000].includes(Number(sizeText))||![1,7].includes(Number(roundsText))||!playwrightPath||!['runtime','calibration','trace','mutations','preflight','profile','memory','allocations','domallocations'].includes(mode))
  throw Error('Invalid diagnostic configuration');
if(mode==='trace'&&roundsText!=='1')throw Error('Trace captures create/clear once each; use --rounds 1');
const checkpoint=event=>fs.appendFileSync(path.join(output,'progress.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let browser,server;
const result={kind:'elnor-contained-browser-diagnostic-v1',diagnosticOnly:true,passed:false,
  framework,mode,metricTimeDomain:timeDomain,size:Number(sizeText),measuredRounds:Number(roundsText),fixture:path.resolve(fixture),
  warmupRounds:Number(roundsText)===7?2:0,
  limitations:['CPU capped; not comparable to uncapped timings','GPU disabled for fault isolation','Fresh owned browser per case; not the original shared CLI session'],
  startedAt:new Date().toISOString()};
if(mode==='trace')result.warmupRounds=2;
try{
  checkpoint({stage:'verify-fixture'});
  const manifestPath=path.join(fixture,'manifest.json'),manifestBytes=fs.readFileSync(manifestPath),manifest=JSON.parse(manifestBytes);
  if(manifest.kind!=='elnor-runtime-comparison-v1'||!Array.isArray(manifest.files))throw Error('Unsupported fixture manifest');
  if(manifest.runtime?.instrumentation&&mode!=='allocations')throw Error('Instrumented allocation fixture cannot supply timing evidence');
  if(mode==='allocations'&&manifest.runtime?.instrumentation!=='reactive-allocations-v1')throw Error('Allocation probe fixture required');
  result.manifestSha256=sha(manifestBytes);result.frameworkVersions=manifest.versions;result.runtime=manifest.runtime??null;
  const routes=new Map();
  for(const item of manifest.files){
    if(!/^[a-z0-9.-]+$/.test(item.name))throw Error('Unsafe fixture asset name');
    const bytes=fs.readFileSync(path.join(fixture,'site',item.name));
    if(sha(bytes)!==item.sha256)throw Error('Fixture asset hash mismatch: '+item.name);
    routes.set('/'+item.name,{bytes,type:item.name.endsWith('.mjs')?'text/javascript':item.name.endsWith('.css')?'text/css':'text/html'});
  }
  const here=path.dirname(fileURLToPath(import.meta.url));
  result.sourceHashes={};
  for(const name of ['diagnostic-worker.mjs','browser-run.js','windows_job.py','diagnose-windows.py']){
    const bytes=fs.readFileSync(path.join(here,name));result.sourceHashes[name]=sha(bytes);
    fs.writeFileSync(path.join(output,name),bytes,{flag:'wx'});
  }
  server=http.createServer((req,res)=>{
    if(req.headers.host!=='127.0.0.1:'+req.socket.localPort){res.writeHead(403).end();return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    const route=routes.get(new URL(req.url,'http://127.0.0.1').pathname);
    if(!route){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':route.type,'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?undefined:route.bytes);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const require=createRequire(import.meta.url),{chromium}=require(playwrightPath);
  result.playwrightVersion=require(path.join(playwrightPath,'package.json')).version;
  checkpoint({stage:'launch-browser'});
  browser=await chromium.launch({channel:'msedge',headless:true,chromiumSandbox:true,timeout:10000,args:['--disable-gpu']});
  result.browserVersion=browser.version();
  result.browserType=browser.browserType().name();
  const page=await browser.newPage();
  result.observation=await collectComparison(page,{mode,timeDomain,framework,size:Number(sizeText),warmupRounds:result.warmupRounds,measuredRounds:Number(roundsText),
    baseURL:'http://127.0.0.1:'+server.address().port},checkpoint);
  result.passed=result.observation.passed;
}catch(error){result.error=error.stack;process.exitCode=1;}
finally{
  checkpoint({stage:'cleanup',passed:result.passed});
  // The external job supervisor covers even a close() that never settles.
  try{if(browser)await browser.close();}catch(error){result.passed=false;result.cleanupError=error.message;process.exitCode=1;}
  if(server)await new Promise(resolve=>server.close(resolve));
  result.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
  checkpoint({stage:'finished',passed:result.passed});
}
