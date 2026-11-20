// Descriptive measurements of owned synthetic fixtures, never a performance gate.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(import.meta.url),repo=fileURLToPath(new URL('../',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const environment=()=>({node:process.version,platform:process.platform,arch:process.arch,
  osRelease:os.release(),cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length,totalMemoryBytes:os.totalmem()});
function plain(file){
  for(let current=path.resolve(file);;current=path.dirname(current)){
    if(fs.lstatSync(current,{throwIfNoEntry:false})?.isSymbolicLink())throw Error('Measurement paths must not traverse links');
    if(path.dirname(current)===current)break;
  }
}
export function summarizeSamples(samples){
  const groups=new Map();
  for(const {stage,ms} of samples){
    assert.ok(typeof stage==='string'&&stage&&Number.isFinite(ms)&&ms>=0,'Invalid timing sample');
    if(!groups.has(stage))groups.set(stage,[]);groups.get(stage).push(ms);
  }
  return Object.fromEntries([...groups].map(([stage,values])=>{
    values.sort((a,b)=>a-b);const middle=Math.floor(values.length/2);
    return [stage,{n:values.length,minMs:values[0],medianMs:values.length%2?values[middle]:(values[middle-1]+values[middle])/2,maxMs:values.at(-1)}];
  }));
}
function fixture(root,components,samples,mode){
  fs.mkdirSync(root);fs.mkdirSync(path.join(root,'src'));fs.mkdirSync(path.join(root,'shared'));
  const texts=new Map(),write=(file,text)=>{texts.set(file,text);fs.writeFileSync(path.join(root,file),text,{flag:'wx'});};
  write('src/Counter.eln',fs.readFileSync(new URL('../examples/authoring/Counter.eln',import.meta.url),'utf8'));
  const imports=['import Counter from "./Counter.eln";','import type {Settings} from "../shared/model.mjs";'],children=[];
  for(let index=0;index<components-2;index++){
    const name='Tile'+index;imports.push(`import ${name} from "./${name}.eln";`);children.push(`      ${name} label=title`);
    write('src/'+name+'.eln',`component ${name}(label: string) { ui { p label } }\n`);
  }
  write('shared/model.mts','export interface Settings { theme: "light" | "dark"; items: Array<{id:number;name:string}>; flags: {active:boolean} }\n');
  write('src/App.eln',imports.join('\n')+'\ncomponent App(title: string, settings: Settings) {\n  state latest = 0;\n  action record(value: number) { latest = value; }\n  ui {\n    main {\n      h1 title\n      Counter label="Clicks" {\n        on changed(value) => record(value)\n      }\n      p `Last event: ${latest}`\n      p settings.theme\n'+children.join('\n')+'\n    }\n  }\n}\n');
  const props={title:'Measurement',settings:{theme:'light',items:Array.from({length:components*2},(_,id)=>({id,name:'Row '+id})),flags:{active:true}}};
  write('props.json',JSON.stringify(props));write('style.css','h1 { color: rgb(12,34,56); }\n');
  const plan={kind:'elnor-development-measurement-fixture-v1',runId:randomUUID(),root,components,samples,mode,
    originals:[...texts],sourceBytes:[...texts].filter(([file])=>/\.(eln|mts)$/.test(file)).reduce((sum,[,text])=>sum+Buffer.byteLength(text),0),
    initialHashes:Object.fromEntries([...texts].map(([file,text])=>[file,digest(text)]))};
  fs.writeFileSync(path.join(root,'plan.json'),JSON.stringify(plan,null,2),{flag:'wx'});return plan;
}
async function worker(planFile){
  plain(planFile);const plan=JSON.parse(fs.readFileSync(planFile,'utf8')),root=path.dirname(path.resolve(planFile));
  assert.equal(plan.kind,'elnor-development-measurement-fixture-v1');assert.equal(plan.root,root);
  for(const [file] of plan.originals)assert.ok(path.resolve(root,file).startsWith(root+path.sep));
  const importStart=performance.now();
  const {checkSurfaceProject}=await import('../src/project-check.mjs');
  const {buildSurfaceProject}=await import('../src/project-build.mjs');
  const {createProjectDev}=await import('../src/project-dev.mjs');
  const report={kind:'elnor-development-measurement-worker-v1',runId:plan.runId,components:plan.components,mode:plan.mode,
    environment:environment(),moduleLoadMs:performance.now()-importStart,samples:[],passed:false,sourceFilesRestored:false};
  process.send?.({phase:'modules-ready',runId:plan.runId});
  const entry=path.join(root,'src/App.eln'),outputDir=path.join(root,'output'),checkOutputDir=path.join(root,'check'),propsFile=path.join(root,'props.json'),cssFile=path.join(root,'style.css');
  let dev,timer;const events=[],waiters=[],polls=[];
  const record=(stage,start,extra={})=>{const sample={stage,ms:performance.now()-start,...extra};report.samples.push(sample);return sample;};
  const run=operation=>{
    if(operation==='check'){const result=checkSurfaceProject(entry,{outputDir:checkOutputDir});assert.deepEqual(result.diagnostics,[]);assert.equal(result.graph.size,plan.components);}
    else{const result=buildSurfaceProject(entry,{outputDir,checkOutputDir,captureProps:true});assert.equal(result.components,plan.components);assert.equal(typeof result.validateProps,'function');}
  };
  function status(value){
    const event={at:performance.now(),state:value.state,buildId:value.lastBuild?.buildId,codes:value.error?.diagnostics?.map(d=>d.code)??[]};events.push(event);
    for(const waiter of [...waiters])if(waiter.predicate(event)){waiters.splice(waiters.indexOf(waiter),1);clearTimeout(waiter.timeout);waiter.resolve(event);}
  }
  const until=predicate=>new Promise((resolve,reject)=>{
    const waiter={predicate,resolve,timeout:setTimeout(()=>{waiters.splice(waiters.indexOf(waiter),1);reject(Error('No expected development outcome within 30 seconds'));},30000)};waiters.push(waiter);
  });
  async function navigation(stage,expectedInputState){
    const start=performance.now(),response=await fetch('http://127.0.0.1:'+dev.server.address().port),html=await response.text();
    const sample=record(stage,start,{httpStatus:response.status});
    assert.equal(response.status,200,html);assert.equal(dev.status().previewInputs.state,expectedInputState);
    assert.ok(html.includes('script type="module"'));
    assert.match(html,/<script type="module" id="project-dev-reload"[^>]+src="\/\.elnor\/dev\/reload\.mjs"/);
    assert.match(response.headers.get('content-security-policy'),/(?:^|;\s*)connect-src 'self'(?:;|$)/);
    return sample;
  }
  async function save(stage,file,text,expectError=false){
    const before=fs.readFileSync(path.join(outputDir,'manifest.json'),'utf8'),id=dev.status().lastBuild.buildId,eventIndex=events.length;
    const outcome=until(event=>expectError?event.state==='error'&&event.codes.includes('TS2353'):event.state==='ready'&&event.buildId!==id);
    const writeStart=performance.now();fs.writeFileSync(file,text);const savedAt=performance.now();
    const event=await outcome,pending=events.slice(eventIndex).find(item=>item.state==='pending'),poll=polls.find(item=>item.start<=event.at&&item.end>=event.at);
    assert.ok(pending&&poll,'Missing detection or attempt-poll timing');
    if(expectError)assert.equal(fs.readFileSync(path.join(outputDir,'manifest.json'),'utf8'),before);
    else assert.notEqual(dev.status().lastBuild.buildId,id);
    report.samples.push({stage,ms:event.at-savedAt,writeMs:savedAt-writeStart,firstDetectionMs:pending.at-savedAt,
      detectionToAttemptPollMs:poll.start-pending.at,attemptPollMs:poll.end-poll.start,outcome:expectError?'expected-type-error':'published'});
  }
  try{
    if(plan.mode!=='dev'){
      const start=performance.now();run(plan.mode);record('process-first-'+plan.mode,start);
      for(let index=0;index<plan.samples;index++){const began=performance.now();run(plan.mode);record('warm-'+plan.mode,began);}
    }else{
      const start=performance.now();dev=createProjectDev({entry,outputDir,checkOutputDir,propsFile,cssFile,onStatus:status});record('dev-create',start);
      assert.equal(dev.status().state,'ready');await new Promise((resolve,reject)=>{dev.server.once('error',reject);dev.server.listen(0,'127.0.0.1',resolve);});
      await navigation('http-first-navigation','ready');
      for(let index=0;index<plan.samples;index++){const began=performance.now();assert.equal(dev.poll(),false);record('idle-poll',began);}
      timer=setInterval(()=>{const start=performance.now(),attempt=dev.poll();polls.push({start,end:performance.now(),attempt});},500);
      const original=new Map(plan.originals),counter=path.join(root,'src/Counter.eln'),app=original.get('src/App.eln');
      for(let index=0;index<plan.samples;index++){
        await new Promise(resolve=>setTimeout(resolve,[0,137,293][index%3]));
        await save('save-publication',counter,original.get('src/Counter.eln').replace('count++;',`count += ${index+2};`));
        await save('source-error',entry,app.replace('Counter label=','Counter missing='),true);
        await navigation('http-source-error-retained','ready');
        await save('source-recovery',entry,app);
      }
      const props=JSON.parse(original.get('props.json'));
      for(let index=0;index<plan.samples;index++){
        fs.writeFileSync(propsFile,JSON.stringify({...props,title:'Uncached '+index}));
        await navigation('http-uncached-props','ready');await navigation('http-cached-props','ready');
        const manifest=fs.readFileSync(path.join(outputDir,'manifest.json'),'utf8');
        fs.writeFileSync(propsFile,JSON.stringify({...props,title:index}));await navigation('http-invalid-props','error');
        assert.ok(dev.status().previewInputs.diagnostics.some(d=>d.code==='TS2322'));
        fs.writeFileSync(propsFile,JSON.stringify({...props,title:'Recovered '+index}));await navigation('http-props-recovery','ready');
        assert.equal(fs.readFileSync(path.join(outputDir,'manifest.json'),'utf8'),manifest);
      }
    }
    report.passed=true;
  }catch(error){report.error=error.stack;}
  finally{
    if(timer)clearInterval(timer);
    for(const waiter of waiters)clearTimeout(waiter.timeout);
    if(dev){dev.stop();await new Promise(resolve=>{dev.server.close(resolve);dev.server.closeAllConnections();});}
    for(const [file,text] of plan.originals){plain(path.join(root,file));fs.writeFileSync(path.join(root,file),text);}
    report.sourceFilesRestored=Object.entries(plan.initialHashes).every(([file,hash])=>digest(fs.readFileSync(path.join(root,file)))===hash);
    report.passed=report.passed&&report.sourceFilesRestored;report.rssAtEndBytes=process.memoryUsage().rss;
    fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(report,null,2),{flag:'wx'});
  }
  if(!report.passed)process.exitCode=1;
}
async function launch(plan,onProgress){
  const start=performance.now(),descriptor=fs.openSync(path.join(plan.root,'worker.log'),'wx');let child;
  try{child=fork(script,['--worker',path.join(plan.root,'plan.json')],{windowsHide:true,stdio:['ignore',descriptor,descriptor,'ipc']});}
  finally{fs.closeSync(descriptor);}
  let startupMs,timedOut=false;
  const code=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{timedOut=true;child.kill();},180000);
    child.on('message',message=>{if(message?.phase==='modules-ready'&&message.runId===plan.runId)startupMs=performance.now()-start;});
    child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('exit',code=>{clearTimeout(timeout);resolve(code);});
  });
  const result=JSON.parse(fs.readFileSync(path.join(plan.root,'result.json'),'utf8'));
  assert.ok(!timedOut&&code===0&&result.passed&&result.sourceFilesRestored,'Measurement worker failed: '+plan.root+' '+(result.error??''));
  assert.equal(result.runId,plan.runId);assert.ok(Number.isFinite(startupMs));
  result.samples.push({stage:'process-to-modules-ready',ms:startupMs},{stage:'api-module-imports',ms:result.moduleLoadMs});
  onProgress(`${plan.components} components / ${plan.mode}: passed`);
  return {...result,exitCode:code,root:plan.root};
}
export async function measureDevelopment({directory,samples=3,componentCounts=[2,8],onProgress=()=>{}}={}){
  assert.ok(typeof directory==='string'&&directory,'Explicit measurement directory required');
  assert.ok(Number.isInteger(samples)&&samples>=1&&samples<=10,'Samples must be 1..10');
  assert.ok(Array.isArray(componentCounts)&&componentCounts.length>0&&new Set(componentCounts).size===componentCounts.length
    &&componentCounts.every(count=>Number.isInteger(count)&&count>=2&&count<=20),'Component counts must be distinct integers 2..20');
  directory=path.resolve(directory);plain(directory);
  if(fs.existsSync(directory))assert.deepEqual(fs.readdirSync(directory),[],'Refusing nonempty measurement output');else fs.mkdirSync(directory,{recursive:true});
  const report={kind:'elnor-development-measurements-v1',startedAt:new Date().toISOString(),passed:false,environment:environment(),
    samplesPerProcess:samples,pollIntervalMs:500,workers:[],workloads:[],applicationsLaunched:[],
    methodology:'Serial new Node workers. Process-first is not OS/filesystem cold. Dev API poll wrapped at 500ms; HTTP is loopback body completion, not browser rendering. No thresholds/percentiles or controlled-host-idle claim.'};
  fs.writeFileSync(path.join(directory,'.measurement-owner.json'),JSON.stringify({kind:report.kind}),{flag:'wx'});
  const save=()=>fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(report,null,2));save();
  try{
    for(const components of componentCounts){
      const workload={components,ordinaryModules:1,propsRows:components*2,samples:[]};report.workloads.push(workload);
      for(const mode of ['check','build','dev'])for(let iteration=0;iteration<(mode==='dev'?1:samples);iteration++){
        const plan=fixture(path.join(directory,`c${components}-${mode}-${iteration+1}`),components,samples,mode);
        workload.sourceBytes=plan.sourceBytes;const result=await launch(plan,onProgress);
        report.workers.push({runId:result.runId,components,mode,root:result.root,exitCode:result.exitCode,sourceFilesRestored:result.sourceFilesRestored});
        workload.samples.push(...result.samples.map(sample=>({...sample,workerRunId:result.runId})));save();
      }
      workload.summary=summarizeSamples(workload.samples);
    }
    report.passed=true;report.finishedAt=new Date().toISOString();save();return report;
  }catch(error){report.error=error.stack;report.finishedAt=new Date().toISOString();save();throw error;}
}
export async function main(args=process.argv.slice(2)){
  if(args.length&&(args.length!==2||args[0]!=='--samples'||!/^\d+$/.test(args[1])||Number(args[1])<1||Number(args[1])>10))
    throw Error('Usage: npm run measure:dev -- [--samples <1..10>]');
  const runs=path.resolve(repo,'.elnor/mvp/development-measurements');fs.mkdirSync(runs,{recursive:true});
  const directory=fs.mkdtempSync(path.join(runs,'run-'));console.log('Development measurements: '+directory);
  const result=await measureDevelopment({directory,samples:args.length?Number(args[1]):3,onProgress:console.log});
  console.log(JSON.stringify({directory,passed:result.passed,workloads:result.workloads.map(({components,summary})=>({components,summary}))},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===script){
  try{if(process.argv[2]==='--worker')await worker(process.argv[3]);else await main();}
  catch(error){console.error(error.stack);process.exitCode=1;}
}
