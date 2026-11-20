// Spike-only exploration of the TypeScript Language Service on virtual .eln.mts files.
// This is NOT a complete .eln language server; original-column source mapping is pending.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTs } from './typescript.mjs';
import {graphFor,EXAMPLES} from './compiler.mjs';
import {typecheckGraph} from './checker.mjs';
import {createTypeScriptOptions} from './typescript-configuration.mjs';
import {sourceHash,sourceKey,sourceImport} from './source-identity.mjs';
const ts=getTs();
const ROOT=fileURLToPath(new URL('..',import.meta.url));

export function languageServiceProbe(entry='UserEditor',{outputDir=path.join(ROOT,'.elnor','probe-check')}={}) {
  const graph=graphFor(entry),diagnostics=typecheckGraph(graph,outputDir);
  if(diagnostics.length)throw Error('Typecheck failed before probe');
  const dir=path.resolve(outputDir,'examples','components');
  const records=[...graph.values()];
  const virtual=ir=>path.join(dir,sourceHash(ir.filename)+'.eln.mts');
  const target=file=>records.find(ir=>sourceKey(ir.filename)===sourceKey(path.join(EXAMPLES,file+'.eln')));
  const main=virtual(target(entry)),list=target('UserList');
  const src=fs.readFileSync(main,'utf8');
  const probe=path.join(dir,'_probe.mts');
  const probeSource=`import UserList from './${path.basename(virtual(list)).replace(/\.mts$/,'.mjs')}';\nUserList({  }, {}, {});\n`;
  fs.writeFileSync(probe,probeSource);
  const roots=records.map(virtual).concat(probe);
  const opts=createTypeScriptOptions();
  const originals=new Map(records.map(ir=>[sourceKey(virtual(ir)),ir]));
  const virtuals=new Map(records.map(ir=>[sourceKey(ir.filename),virtual(ir)]));
  const host={
    getCompilationSettings:()=>opts,
    getScriptFileNames:()=>roots,
    getScriptVersion:()=> '0',
    getScriptSnapshot:file=>{const s=ts.sys.readFile(file);return s===undefined?undefined:ts.ScriptSnapshot.fromString(s);},
    getCurrentDirectory:()=>ROOT,
    getDefaultLibFileName:opts=>ts.getDefaultLibFilePath(opts),
    fileExists:ts.sys.fileExists,
    readFile:ts.sys.readFile,
    readDirectory:ts.sys.readDirectory,
    directoryExists:ts.sys.directoryExists,
    realpath:ts.sys.realpath,
    resolveModuleNames:(names,containingFile)=>names.map(name=>{
      const ir=originals.get(sourceKey(containingFile));
      if(ir&&name.endsWith('.eln.mjs')){
        const file=virtuals.get(sourceKey(sourceImport(ir.filename,name.slice(0,-4))));
        return file?{resolvedFileName:file,extension:ts.Extension.Mts}:undefined;
      }
      return ts.resolveModuleName(name,ir?.filename??containingFile,opts,host).resolvedModule;
    }),
  };
  const ls=ts.createLanguageService(host,ts.createDocumentRegistry());
  const referenceAt=src.indexOf('UserList({');
  if(referenceAt<0)throw Error('UserList use was not found');
  const definitions=ls.getDefinitionAtPosition(main,referenceAt+2)??[];
  const rename=ls.getRenameInfo(main,referenceAt+2,{allowRenameOfImportPath:false});
  const locations=ls.findRenameLocations(main,referenceAt+2,false,false,true)??[];
  const completionAt=probeSource.indexOf('{  }')+2;
  const completions=ls.getCompletionsAtPosition(probe,completionAt,{includeCompletionsForModuleExports:false})?.entries.map(x=>x.name)??[];
  const componentDefinition=definitions.find(d=>sourceKey(d.fileName)===sourceKey(virtual(list)));
  const result={
    generatedModule:main,
    definitionVirtualFile:componentDefinition?.fileName??null,
    definitionOriginalFile:componentDefinition?list.filename:null,
    renamePossible:rename.canRename===true,
    renameLocationCount:locations.length,
    propSuggestions:completions.filter(x=>x==='users'),
    limitation:'TypeScript virtual-file probe only; no complete original .eln position/source-map integration.'
  };
  ls.dispose();
  return result;
}
