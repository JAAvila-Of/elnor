import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {checkSurfaceProject} from './project-check.mjs';
import {emitGraph} from './compiler.mjs';
import {sourceKey,sourcePath} from './source-identity.mjs';
import {createPreviewPropsValidator} from './preview-props.mjs';

const marker='.elnor-project-output.json';
const uuid=/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const fail=message=>{throw Object.assign(Error('ELN-PROJECT-OUTPUT: '+message),{code:'ELN-PROJECT-OUTPUT'});};
const within=(parent,file)=>{const relative=path.relative(parent,file);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
function plainPath(file){
  for(let current=path.resolve(file);;current=path.dirname(current)){
    if(fs.lstatSync(current,{throwIfNoEntry:false})?.isSymbolicLink())fail('Output/cache paths must not traverse symlinks or junctions: '+current);
    if(path.dirname(current)===current)break;
  }
}
function regular(file){
  const stat=fs.lstatSync(file,{throwIfNoEntry:false});
  if(stat&&(!stat.isFile()||stat.isSymbolicLink()))fail('Expected a regular owned metadata file: '+file);
  return stat;
}
function inspectOutput(output,entryKey){
  plainPath(output);
  const stat=fs.lstatSync(output,{throwIfNoEntry:false});
  if(!stat)return {owner:null,snapshot:null};
  if(!stat.isDirectory())fail('The output must be a directory');
  const names=fs.readdirSync(output);
  if(!names.length)return {owner:null,snapshot:null};
  const ownerFile=path.join(output,marker);
  if(!regular(ownerFile))fail('Refusing a nonempty output directory without project ownership');
  let owner;
  try{owner=JSON.parse(fs.readFileSync(ownerFile,'utf8'));}catch{fail('Invalid project output ownership');}
  if(owner.kind!=='elnor-project-output-v1'||!uuid.test(owner.id)||owner.entryKey!==entryKey)
    fail('Output ownership does not match this entry');
  const manifestFile=path.join(output,'manifest.json');
  if(!regular(manifestFile))return {owner,snapshot:null};
  const snapshot=fs.readFileSync(manifestFile,'utf8');let manifest;
  try{manifest=JSON.parse(snapshot);}catch{fail('Invalid existing build manifest');}
  if(manifest.kind!=='elnor-project-build-v1'||manifest.ownerId!==owner.id||!uuid.test(manifest.buildId)
    ||typeof manifest.entrySource!=='string'||sourceKey(manifest.entrySource)!==entryKey
    ||typeof manifest.entryOutput!=='string'||!manifest.entryOutput.startsWith('builds/'+manifest.buildId+'/'))
    fail('Existing manifest is not owned by this entry');
  return {owner,snapshot};
}

export function buildSurfaceProject(entry,{outputDir,checkOutputDir,onDependency,captureProps=false,hot=false,regionBackend=true}={}){
  if(typeof outputDir!=='string'||!outputDir||typeof checkOutputDir!=='string'||!checkOutputDir)
    throw Error('Explicit project output and generated check directories are required');
  const output=path.resolve(outputDir),cache=path.resolve(checkOutputDir);
  plainPath(output);plainPath(cache);
  const outputRoot=sourcePath(output),cacheRoot=sourcePath(cache);
  if(within(outputRoot,cacheRoot)||within(cacheRoot,outputRoot))fail('Output and generated check directories must be disjoint');
  const entryKey=sourceKey(entry);
  if(within(outputRoot,sourcePath(entry)))fail('Output must not contain the entry source');
  const initial=inspectOutput(output,entryKey);
  let checkedProgram;
  const checked=checkSurfaceProject(entry,{outputDir:cache,onDependency,onProgram:captureProps?value=>{checkedProgram=value;}:undefined});
  if(checked.diagnostics.length)throw Object.assign(Error('Project source has diagnostics'),{diagnostics:checked.diagnostics,sources:checked.sources});
  for(const file of checked.sources.keys())if(within(outputRoot,file))fail('Output must not contain imported Surface sources');
  const validateProps=captureProps?createPreviewPropsValidator(checkedProgram,entry):undefined;

  // Plan and emit entirely in the caller-owned scratch area before output adoption.
  const buildId=randomUUID(),stage=path.join(cache,'emit-'+buildId),emitted=emitGraph(checked.graph,stage,{hotEntry:hot?entryKey:undefined,regionBackend});
  const main=emitted.components.find(component=>sourceKey(component.source)===entryKey);
  if(!main)throw Error('ELN-PROJECT-ENTRY: Entry is missing from emitted components');
  const current=inspectOutput(output,entryKey);
  if(current.owner?.id!==initial.owner?.id||current.snapshot!==initial.snapshot)fail('Output changed during compilation');
  const owner=current.owner??{kind:'elnor-project-output-v1',id:randomUUID(),entryKey};
  if(!current.owner){
    fs.mkdirSync(output,{recursive:true});
    if(fs.readdirSync(output).length)fail('Output changed before ownership could be established');
    fs.writeFileSync(path.join(output,marker),JSON.stringify(owner,null,2),{flag:'wx'});
  }
  const generations=path.join(output,'builds');plainPath(generations);fs.mkdirSync(generations,{recursive:true});
  const generation=path.join(generations,buildId);fs.mkdirSync(generation);
  const prefix='builds/'+buildId+'/';const files=[];
  for(const file of emitted.files){
    const target=path.resolve(generation,file);
    if(!within(generation,target)||target===generation)fail('Invalid emitted output path');
    plainPath(target);fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(path.join(stage,file),target,fs.constants.COPYFILE_EXCL);
    files.push({file:prefix+file,sha256:createHash('sha256').update(fs.readFileSync(target)).digest('hex')});
  }
  const manifest={kind:'elnor-project-build-v1',ownerId:owner.id,buildId,builtAt:new Date().toISOString(),
    profile:checked.configuration.profile,entrySource:checked.entry,entryOutput:prefix+main.file,
    ...(emitted.moduleRevision?{moduleRevision:emitted.moduleRevision}:{}),
    components:emitted.components.map(component=>({...component,file:prefix+component.file,...(component.alias?{alias:prefix+component.alias}:{})})),files};
  const json=JSON.stringify(manifest,null,2);
  fs.writeFileSync(path.join(generation,'manifest.json'),json,{flag:'wx'});
  // The previous manifest stays authoritative until all new files are present.
  const latest=inspectOutput(output,entryKey);
  if(latest.owner?.id!==owner.id||latest.snapshot!==initial.snapshot)fail('Output changed before manifest publication');
  const temporary=path.join(output,'.manifest-'+buildId+'.json');regular(temporary);
  fs.writeFileSync(temporary,json,{flag:'wx'});
  plainPath(output);regular(path.join(output,'manifest.json'));
  fs.renameSync(temporary,path.join(output,'manifest.json'));
  const result={output,manifest:path.join(output,'manifest.json'),buildId,entryOutput:manifest.entryOutput,
    components:manifest.components.length,profile:manifest.profile};
  if(validateProps)Object.defineProperty(result,'validateProps',{value:validateProps});
  if(emitted.hotContract)Object.defineProperty(result,'hotContract',{value:emitted.hotContract});
  if(emitted.renderModuleProofs)Object.defineProperty(result,'renderModuleProofs',{value:emitted.renderModuleProofs});
  return result;
}
