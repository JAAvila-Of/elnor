import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import contract from '../editors/vscode/tests/report-contract.cjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const defaultRuns=path.resolve(root,'.elnor/spikes/004/editor-runs');
const steps=[['check',['run','check']],['node',['test']],['editor',['run','test:editor']]];
const runNames=directory=>fs.existsSync(directory)?fs.readdirSync(directory,{withFileTypes:true})
  .filter(entry=>entry.isDirectory()&&entry.name.startsWith('run-')).map(entry=>entry.name):[];

async function runNpm({args,log}){
  const npm=process.env.npm_execpath;
  if(!npm||!fs.existsSync(npm))throw Error('Use npm run verify:mvp so the npm executable is known');
  const descriptor=fs.openSync(log,'w');
  let child;
  try{child=spawn(process.execPath,[npm,...args],{cwd:root,env:process.env,stdio:['ignore',descriptor,descriptor],windowsHide:true});}
  finally{fs.closeSync(descriptor);}
  return new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code));});
}

export function readNewEditorEvidence(directory,before){
  const created=runNames(directory).filter(name=>!before.has(name));
  if(created.length!==1)throw Error('Expected exactly one new native editor run; old or ambiguous evidence is refused');
  const run=path.join(directory,created[0]),reportFile=path.join(run,'result.json'),hostFile=path.join(run,'host.json');
  const result=JSON.parse(fs.readFileSync(reportFile,'utf8')),host=JSON.parse(fs.readFileSync(hostFile,'utf8'));
  contract.validateEditorReport(result,{runId:host.runId,exitCode:0,launchMode:'persistent'});
  if(host.completed!==true||host.trusted!==true||host.trustEnabled!==true||host.error)
    throw Error('Native host did not complete with Workspace Trust enabled');
  return {reportFile,hostFile,runId:result.runId,checks:result.checks.length,editor:result.editor,node:result.node};
}

export async function verifyMvp({directory,editorRuns=defaultRuns,runStep=runNpm,onProgress=()=>{}}){
  fs.mkdirSync(directory,{recursive:true});
  const report={kind:'elnor-mvp-verification-v1',runId:randomUUID(),startedAt:new Date().toISOString(),passed:false,
    type:'technical verification; human DX and broad production claims are outside this gate',steps:[]};
  const reportFile=path.join(directory,'result.json');
  const save=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
  try{
    for(const [name,args] of steps){
      const phase={name,command:['npm',...args],log:path.join(directory,name+'.log'),startedAt:new Date().toISOString(),passed:false};
      report.steps.push(phase);save();onProgress(`${name}: running`);
      const before=name==='editor'?new Set(runNames(editorRuns)):null;
      try{
        phase.exitCode=await runStep({name,args:[...args],log:phase.log});
        if(phase.exitCode!==0)throw Error(`${name} failed (exit ${phase.exitCode}); inspect ${phase.log}`);
        if(name==='editor')phase.evidence=readNewEditorEvidence(editorRuns,before);
        phase.passed=true;
      }catch(error){phase.error=error.message;throw error;}
      finally{phase.finishedAt=new Date().toISOString();save();}
      onProgress(`${name}: passed`);
    }
    report.passed=true;
  }catch(error){report.error=error.message;}
  finally{report.finishedAt=new Date().toISOString();save();}
  return {report,reportFile};
}

export async function main(args=process.argv.slice(2)){
  if(args.length)throw Error('Usage: npm run verify:windows');
  const runs=path.resolve(root,'.elnor/mvp/verification-runs');fs.mkdirSync(runs,{recursive:true});
  const directory=fs.mkdtempSync(path.join(runs,'run-'));console.log(`MVP verification: ${directory}`);
  const {report,reportFile}=await verifyMvp({directory,onProgress:message=>console.log(message)});
  console.log(`Report: ${reportFile}`);
  if(!report.passed){console.error(report.error);process.exitCode=1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await main();}catch(error){console.error(error.message);process.exitCode=1;}
}
