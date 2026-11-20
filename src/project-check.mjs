import fs from 'node:fs';
import path from 'node:path';
import {parseSurface} from './parser.mjs';
import {typecheckGraph} from './checker.mjs';
import {sourceKey,sourcePath,sourceImport} from './source-identity.mjs';
import {describeTypeScriptConfiguration} from './typescript-configuration.mjs';

export function readSurfaceGraph(entry,{onDependency}={}){
  if(typeof entry!=='string'||!entry.endsWith('.eln'))throw Error('Expected a .eln entry file');
  onDependency?.({file:path.resolve(entry),kind:'file'});
  entry=sourcePath(path.resolve(entry));
  const graph=new Map(),sources=new Map(),seen=new Set(),diagnostics=[];
  function visit(file){
    onDependency?.({file:path.resolve(file),kind:'file'});
    file=sourcePath(file);const key=sourceKey(file);
    if(seen.has(key))return;seen.add(key);
    let source,ir;
    try{source=fs.readFileSync(file,'utf8');sources.set(file,source);ir=parseSurface(source,file);}
    catch(error){
      diagnostics.push({code:error.code??'ELN-PROJECT-SOURCE',file,line:error.line??1,start:error.start,length:error.length,message:error.message});return;
    }
    graph.set(file,ir);
    for(const imp of ir.imports.filter(imp=>imp.path.endsWith('.eln')))visit(sourceImport(file,imp.path));
  }
  visit(entry);return {entry,graph,sources,diagnostics};
}

// Sources are read only. The caller explicitly owns the generated check directory.
export function checkSurfaceProject(entry,{outputDir,onDependency,onProgram}={}){
  if(typeof outputDir!=='string'||!outputDir)throw Error('An explicit generated check directory is required');
  const result=readSurfaceGraph(entry,{onDependency});
  if(!result.diagnostics.length)result.diagnostics.push(...typecheckGraph(result.graph,path.resolve(outputDir),[],{onDependency,onProgram}));
  return {...result,configuration:describeTypeScriptConfiguration()};
}
