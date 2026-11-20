import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {getTs} from './typescript.mjs';
import {logicalKey,sourceKey} from './source-identity.mjs';

const ts=getTs();

// Compile a probe against captured checker inputs only. No user module executes
// and no source/metadata file is reread after the successful project check.
export function createPreviewPropsValidator({program,reads,resolutions,entryFiles},entry){
  const entryFile=entryFiles.get(sourceKey(entry));
  if(!entryFile)throw Error('ELN-PREVIEW-PROPS: No checked entry contract');
  const snapshots=new Map(reads),resolved=new Map(resolutions),options={...program.getCompilerOptions()};
  const roots=[...program.getRootFileNames()],cwd=program.getCurrentDirectory();
  for(const source of program.getSourceFiles())snapshots.set(logicalKey(source.fileName),source.text);
  const directories=new Set();
  for(const [file,text] of snapshots)if(typeof text==='string'){
    for(let current=path.dirname(file);;current=path.dirname(current)){
      directories.add(logicalKey(current));if(path.dirname(current)===current)break;
    }
  }
  const cache=new Map();
  return function validate(serializedProps,file='<preview props>'){
    if(cache.has(serializedProps))return cache.get(serializedProps).map(d=>({...d,file}));
    const probe=path.join(path.dirname(entryFile),'.preview-props-'+randomUUID()+'.mts'),probeKey=logicalKey(probe),spans=[];
    let code='import Entry from "elnor:preview-entry";\nEntry(';
    function literal(value,field){
      const start=code.length;
      if(Array.isArray(value)){
        code+='[';value.forEach((item,index)=>{if(index)code+=',';literal(item,field+'['+index+']');});code+=']';
      }else if(value!==null&&typeof value==='object'){
        code+='{';Object.entries(value).forEach(([key,item],index)=>{
          if(index)code+=',';const propertyStart=code.length,property=field+'['+JSON.stringify(key)+']';
          code+='['+JSON.stringify(key)+']:';literal(item,property);spans.push({start:propertyStart,end:code.length,path:property});
        });code+='}';
      }else code+=JSON.stringify(value);
      spans.push({start,end:code.length,path:field});
    }
    literal(JSON.parse(serializedProps),'$');code+=');\n';
    const host=ts.createCompilerHost(options);
    host.readFile=name=>logicalKey(name)===probeKey?code:snapshots.get(logicalKey(name));
    host.fileExists=name=>typeof host.readFile(name)==='string';
    host.directoryExists=name=>directories.has(logicalKey(name));
    host.getDirectories=()=>[];host.readDirectory=()=>[];
    host.realpath=name=>path.resolve(name);host.getCurrentDirectory=()=>cwd;
    host.getEnvironmentVariable=()=>'';host.writeFile=()=>{throw Error('Preview props validation must not emit files');};
    host.resolveModuleNames=(names,containing)=>names.map(name=>logicalKey(containing)===probeKey&&name==='elnor:preview-entry'
      ?{resolvedFileName:entryFile,extension:ts.Extension.Mts}
      :resolved.get(JSON.stringify([logicalKey(containing),name])));
    const checked=ts.createProgram([...roots,probe],options,host),diagnostics=ts.getPreEmitDiagnostics(checked).map(d=>{
      const inProbe=d.file&&logicalKey(d.file.fileName)===probeKey;
      const span=inProbe?spans.filter(span=>span.start<=(d.start??0)&&span.end>=(d.start??0)).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0]:undefined;
      return {code:'TS'+d.code,path:span?.path??'$',message:(inProbe?'':'Captured contract: ')+ts.flattenDiagnosticMessageText(d.messageText,' ')};
    });
    if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(serializedProps,diagnostics);
    return diagnostics.map(d=>({...d,file}));
  };
}
