import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildSurfaceProject} from './project-build.mjs';
import {createProjectPreview,createPreviewInputs} from './project-preview.mjs';
import {sourcePath,logicalKey} from './source-identity.mjs';

const within=(parent,file)=>{const relative=path.relative(parent,file);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
const fail=message=>{throw Error('ELN-PROJECT-DEV: '+message);};

function renderProofStatus(build){
  const modules=build.renderModuleProofs;
  if(!modules)return '';
  const passed=new Set(),outside=new Set();
  let unsupportedModules=0;
  for(const module of modules){
    if(module.issue)unsupportedModules+=1;
    for(const item of module.functions)(item.readOnly?passed:outside).add(item.name);
  }
  const messages=[];
  if(passed.size)messages.push('Read-only render analysis passed for '+[...passed].join(', ')+' with plain data inputs.');
  if(outside.size)messages.push('Outside the read-only render subset: '+[...outside].join(', ')+'.');
  if(unsupportedModules)messages.push('Modules outside the render analysis subset: '+unsupportedModules+'.');
  return messages.length?' '+messages.join(' '):'';
}

// Poll content rather than platform-specific watcher events, including failed imports.
export function createProjectDev({entry,outputDir,checkOutputDir,watchDir,props={},propsFile,cssFile,hot=false,intervalMs=500,onStatus=()=>{}}={}){
  if(typeof entry!=='string'||!entry.endsWith('.eln')||typeof outputDir!=='string'||!outputDir||typeof checkOutputDir!=='string'||!checkOutputDir)
    fail('Explicit .eln entry, output and generated check directories are required');
  if(!Number.isInteger(intervalMs)||intervalMs<25)fail('Polling interval must be an integer of at least 25 ms');
  entry=sourcePath(entry);outputDir=path.resolve(outputDir);checkOutputDir=path.resolve(checkOutputDir);
  watchDir=path.resolve(watchDir??path.dirname(entry));
  if(!fs.statSync(watchDir).isDirectory()||!within(watchDir,entry))fail('The watch directory must contain the entry');
  if(within(outputDir,watchDir)||within(checkOutputDir,watchDir))fail('Generated directories must not contain the watch directory');
  for(let current=watchDir;;current=path.dirname(current)){
    if(fs.lstatSync(current).isSymbolicLink())fail('Watch directory must not traverse symlinks or junctions');
    if(path.dirname(current)===current)break;
  }
  let validateProps;
  const previewInputs=createPreviewInputs({props,propsFile,cssFile,validateProps(serialized,file){
    if(!validateProps)throw Error('No checked entry contract in this session. Wait for a successful source build, then reload.');
    return validateProps(serialized,file);
  }});let inputStatusKey;
  const dependencies=new Map();let baseline=new Map();
  function inputState({file,kind}){
    for(let current=file;;current=path.dirname(current)){
      let stat;
      try{stat=fs.lstatSync(current,{throwIfNoEntry:false});}catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
      if(stat?.isSymbolicLink())fail('Linked dependency paths are outside the watch contract: '+current);
      if(path.dirname(current)===current)break;
    }
    let stat;
    try{stat=fs.lstatSync(file,{throwIfNoEntry:false});}catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
    if(!stat)return 'missing';
    if(kind==='directory')return stat.isDirectory()?'directory':'not-directory';
    if(!stat.isFile())return 'not-file';
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  function onDependency(input){
    const file=path.resolve(input.file),kind=input.kind;
    if(within(outputDir,file)||within(checkOutputDir,file)||file.split(path.sep).some(part=>['node_modules','.git'].includes(part.toLowerCase())))return;
    if(kind==='file'&&!(/\.(?:eln|[cm]?ts|[cm]?js)$/i.test(file)||path.basename(file)==='package.json'))return;
    const key=kind+':'+logicalKey(file);
    if(!dependencies.has(key)){
      const record={file,kind};dependencies.set(key,record);
      // Extend the baseline at first observation, without swallowing changes to
      // already observed sources made while the synchronous build is running.
      baseline.set(key,inputState(record));
    }
  }
  function snapshot(){
    const hash=createHash('sha256');
    function visit(directory){
      for(const item of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
        const file=path.join(directory,item.name);
        if(within(outputDir,file)||within(checkOutputDir,file)||item.name==='node_modules'||item.name==='.git')continue;
        if(item.isSymbolicLink())fail('Linked paths are outside the watch contract: '+file);
        if(item.isDirectory())visit(file);
        else if(item.isFile()&&(/\.(?:eln|ts|mts|js|mjs)$/.test(item.name)||item.name==='package.json')){
          hash.update(JSON.stringify(path.relative(watchDir,file)));
          hash.update(createHash('sha256').update(fs.readFileSync(file)).digest());
        }
      }
    }
    visit(watchDir);
    return {tree:hash.digest('hex'),inputs:new Map([...dependencies].map(([key,input])=>[key,inputState(input)]))};
  }
  const signature=(tree,inputs)=>JSON.stringify([tree,[...inputs].sort(([a],[b])=>a<b?-1:a>b?1:0)]);
  let acceptedTree=snapshot().tree,pending=null,lastBuild=null,current,settled,timer;
  function update(state,error){
    const availability=lastBuild?'Showing the last successful build from this session.':'No successful build in this session. A verified earlier build, if available, is shown below.';
    const message=state==='ready'?'Last successful build: '+lastBuild.buildId+'. Save watched sources to rebuild and reload automatically.'+renderProofStatus(lastBuild):
      state==='pending'?'Saved changes detected; waiting for stable content. '+availability:
        state==='scan-error'?'Watch scan failed; automatic rebuild is paused. '+availability+' Fix the watch scope; scanning will retry.':
          'Build failed. '+availability+' Fix the errors shown in the terminal and save.';
    current={state,message,watchDir,lastBuild,error};onStatus(status());
  }
  function attempt(){
    try{
      lastBuild=buildSurfaceProject(entry,{outputDir,checkOutputDir,onDependency,captureProps:true,hot});validateProps=lastBuild.validateProps;
      previewInputs.invalidate();inputStatusKey=undefined;update('ready');
    }
    catch(error){if(error.code==='ELN-PROJECT-OUTPUT')throw error;update('error',error);}
    settled=current;
  }
  attempt();
  function poll(){
    let value;
    try{value=snapshot();}
    catch(error){pending=null;if(current.state!=='scan-error')update('scan-error',error);return false;}
    const key=signature(value.tree,value.inputs);
    if(key===signature(acceptedTree,baseline)){
      pending=null;if(current.state==='pending'||current.state==='scan-error'){current=settled;onStatus(status());}
      return false;
    }
    if(key!==pending){pending=key;update('pending');return false;}
    acceptedTree=value.tree;baseline=value.inputs;pending=null;
    try{attempt();}catch(error){update('error',error);settled=current;}
    return true;
  }
  const server=createProjectPreview({outputDir,expectedEntry:entry,expectedBuildId:()=>lastBuild?.buildId,allowUnbuilt:true,
    hotContract:hot?()=>lastBuild?.hotContract:undefined,
    autoReload:()=>current.state==='ready',liveStyles:cssFile!==undefined,
    readInputs({validOnly=false}={}){
      try{
        const inputs=previewInputs.read();
        return validOnly&&previewInputs.status().state!=='ready'?undefined:inputs;
      }
      finally{
        const next=JSON.stringify(previewInputs.status());
        if(next!==inputStatusKey){inputStatusKey=next;onStatus(status());}
      }
    },
    statusText:()=>current.message+'\nWatch scope: '+watchDir+'\nSaved source files in this scope and observed local dependency paths are watched.\nObserved dependency files: '+[...dependencies.values()].filter(input=>input.kind==='file').length+'. Resolution directory probes: '+[...dependencies.values()].filter(input=>input.kind==='directory').length+'.\n'+previewInputs.status().message+'\nUnobserved paths and node_modules are not watched.'});
  function start(){if(!timer)timer=setInterval(poll,intervalMs);}
  function stop(){if(timer){clearInterval(timer);timer=undefined;}}
  server.once('close',stop);server.once('error',stop);
  function status(){return {...current,previewInputs:previewInputs.status(),dependencies:[...dependencies.values()].map(input=>({...input}))};}
  return {server,start,stop,poll,status};
}
