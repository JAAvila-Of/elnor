import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

export function sourcePath(file){
  const absolute=path.resolve(file),tail=[];
  let current=absolute;
  for(;;){
    try{return path.join(fs.realpathSync.native(current),...tail);}
    catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
    const parent=path.dirname(current);
    if(parent===current)return absolute;
    tail.unshift(path.basename(current));current=parent;
  }
}
export function sourceImport(importer,specifier){return path.resolve(path.dirname(sourcePath(importer)),specifier);}
export function logicalKey(file){
  const resolved=path.resolve(file).replaceAll('\\','/');
  return process.platform==='win32'?resolved.toLowerCase():resolved;
}
export function sourceKey(file){return logicalKey(sourcePath(file));}
export function sourceHash(file){return createHash('sha256').update(sourceKey(file)).digest('hex');}

export function surfaceRecords(graph){
  const unique=new Map();
  for(const ir of graph.values()){
    const key=sourceKey(ir.filename),prior=unique.get(key);
    if(prior&&prior.source!==ir.source){
      const diagnostic={code:'ELN-SOURCE-CONFLICT',message:'Conflicting source versions for one Surface file',
        file:ir.filename,...ir.nameSpan,line:ir.source.slice(0,ir.nameSpan.start).split('\n').length};
      throw Object.assign(new Error(`${diagnostic.code}: ${diagnostic.message}`),{diagnostics:[diagnostic]});
    }
    if(!prior||ir.filename<prior.filename)unique.set(key,ir);
  }
  return [...unique].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,ir])=>ir);
}

export function surfaceOutputs(graph){
  const records=surfaceRecords(graph),counts=new Map(),reserved=new Set(['runtime','entry','preview-fixtures']);
  for(const ir of records){const stem=path.basename(sourcePath(ir.filename),'.eln').toLowerCase();counts.set(stem,(counts.get(stem)??0)+1);}
  return records.map(ir=>{
    const stem=path.basename(sourcePath(ir.filename),'.eln'),lower=stem.toLowerCase();
    const alias=/^[A-Za-z_]\w*$/.test(stem)&&counts.get(lower)===1&&!reserved.has(lower)?stem+'.mjs':undefined;
    return {source:sourcePath(ir.filename),name:ir.name,file:'.elnor-components/'+sourceHash(ir.filename)+'.mjs',...(alias?{alias}:{})};
  });
}
export function moduleSpecifier(fromFile,toFile){
  const relative=path.posix.relative(path.posix.dirname(fromFile),toFile);
  return relative.startsWith('.')?relative:'./'+relative;
}
