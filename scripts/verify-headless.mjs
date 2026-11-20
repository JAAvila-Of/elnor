import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import contract from '../editors/vscode/tests/report-contract.cjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const image='elnor-headless:local';
const seccomp=path.join(root,'scripts/headless/seccomp_profile.json');
const profileHash='cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849';

export function dockerRunArgs(name){
  if(!/^elnor-headless-[\da-f-]+$/.test(name))throw Error('Invalid owned container name');
  return ['run','--detach','--init','--name',name,'--network','none','--shm-size=1g',
    '--security-opt','seccomp='+seccomp,
    '--mount','type=volume,source=elnor-headless-output-v2,target=/work/elnor/.elnor',
    '--mount','type=volume,source=elnor-headless-home-v1,target=/home/node',image];
}
export function evidenceDirectory(text,kind){
  const prefix=kind==='gate'?'/work/elnor/.elnor/mvp/verification-runs/':'/work/elnor/.elnor/spikes/004/editor-runs/';
  const marker=kind==='gate'?'MVP verification: ':'Editor test run: ';
  const matches=text.split(/\r?\n/).filter(line=>line.startsWith(marker)).map(line=>line.slice(marker.length).trim());
  if(matches.length!==1||!matches[0].startsWith(prefix)||!/^run-[\w-]+$/.test(matches[0].slice(prefix.length)))
    throw Error('Missing or ambiguous isolated '+kind+' evidence path');
  return matches[0];
}
export function validateHeadlessEvidence({exitCode,gate,native,host}){
  if(exitCode!==0||gate?.kind!=='elnor-mvp-verification-v1'||gate.passed!==true||gate.error
    ||gate.steps?.length!==3||!gate.finishedAt)throw Error('Headless verification did not complete');
  for(const [i,name] of ['check','node','editor'].entries()){
    if(gate.steps[i]?.name!==name||gate.steps[i].passed!==true||gate.steps[i].exitCode!==0)
      throw Error('Headless verification has an incomplete phase');
  }
  contract.validateEditorReport(native,{runId:gate.steps[2].evidence?.runId,exitCode,launchMode:'persistent'});
  if(host?.runId!==native.runId||host.completed!==true||host.trusted!==true||host.trustEnabled!==true||host.error)
    throw Error('Headless native host did not complete with trust enabled');
}
function docker(args,{log,timeout=600000}={}){
  let descriptor;
  try{
    if(log)descriptor=fs.openSync(log,'w');
    return (execFileSync('docker',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout,maxBuffer:8*1024*1024,
      stdio:descriptor===undefined?['ignore','pipe','pipe']:['ignore',descriptor,descriptor]})??'').trim();
  }finally{if(descriptor!==undefined)fs.closeSync(descriptor);}
}

export function main(args=process.argv.slice(2)){
  if(args.length)throw Error('Usage: npm run verify:headless');
  if(createHash('sha256').update(fs.readFileSync(seccomp)).digest('hex')!==profileHash)
    throw Error('The reviewed headless seccomp profile changed');
  const runs=path.resolve(root,'.elnor/headless/runs');fs.mkdirSync(runs,{recursive:true});
  const directory=fs.mkdtempSync(path.join(runs,'run-')),name='elnor-headless-'+randomUUID();
  const report={kind:'elnor-headless-verification-v1',container:name,platform:'linux',display:'Xvfb',passed:false,
    startedAt:new Date().toISOString(),seccompSha256:profileHash};
  let created=false;
  console.log(`Headless verification: ${directory}`);
  try{
    docker(['build','--tag',image,'--file','scripts/headless/Dockerfile','.'],{log:path.join(directory,'build.log')});
    report.image=JSON.parse(docker(['image','inspect',image]))[0].Id;
    docker(['volume','create','elnor-headless-output-v2']);docker(['volume','create','elnor-headless-home-v1']);
    report.containerId=docker(dockerRunArgs(name));created=true;console.log(`Container: ${name}`);
    report.exitCode=Number(docker(['wait',name]));
  }catch(error){report.error=error.message;}
  finally{
    if(created){
      try{
        const state=JSON.parse(docker(['inspect',name]))[0];
        if(state.State.Running)docker(['stop','--timeout','10',name]);
        report.runtime={user:state.Config.User,network:state.HostConfig.NetworkMode,privileged:state.HostConfig.Privileged,capAdd:state.HostConfig.CapAdd};
        const log=path.join(directory,'container.log');docker(['logs',name],{log});
        const gateDir=evidenceDirectory(fs.readFileSync(log,'utf8'),'gate');
        fs.mkdirSync(path.join(directory,'gate'));docker(['cp',name+':'+gateDir+'/.',path.join(directory,'gate')]);
        const gate=JSON.parse(fs.readFileSync(path.join(directory,'gate/result.json'),'utf8'));
        if(gate.passed!==true)throw Error(gate.error??'The container gate did not complete');
        const editorLog=fs.readFileSync(path.join(directory,'gate/editor.log'),'utf8');
        const nativeDir=evidenceDirectory(editorLog,'native');
        fs.mkdirSync(path.join(directory,'native'));docker(['cp',name+':'+nativeDir+'/.',path.join(directory,'native')]);
        const read=file=>JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'));
        validateHeadlessEvidence({exitCode:report.exitCode,gate,native:read('native/result.json'),host:read('native/host.json')});
        if(report.runtime.user!=='node'||report.runtime.network!=='none'||report.runtime.privileged||report.runtime.capAdd?.length)
          throw Error('Unexpected headless container configuration');
        report.passed=!report.error;
      }catch(error){report.error??=error.message;}
      try{docker(['rm',name]);}catch(error){report.cleanupError=error.message;report.passed=false;}
    }
    report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(report,null,2));
    console.log(`Report: ${path.join(directory,'result.json')}`);
  }
  if(!report.passed){console.error(report.error??report.cleanupError);process.exitCode=1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch(error){console.error(error.message);process.exitCode=1;}
}
