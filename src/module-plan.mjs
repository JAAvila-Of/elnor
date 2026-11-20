import path from 'node:path';
import {getTs} from './typescript.mjs';
import {bindSource} from './binding-analysis.mjs';
import {createModuleResolutionOptions} from './typescript-configuration.mjs';
import {sourceKey as canonical,sourceHash,sourcePath,sourceImport} from './source-identity.mjs';
import {localModuleDirectory} from './module-revision.mjs';

const ts=getTs();
const options=createModuleResolutionOptions();
export function retainedModuleSource(source,file='projection.ts'){
  return ts.transpileModule(source,{fileName:file,compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
  }}).outputText;
}
export function moduleEdges(sf){
  return sf.statements.filter(node=>(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier));
}

// Read and transpile a bounded local ESM graph. Nothing in this planner imports
// or evaluates user modules; its host can expose editor-owned unsaved sources.
export function createModulePlanner(host=ts.sys){
  const records=new Map();
  function emitModule(filename){
    // A program, rather than isolated transpilation, is required to erase
    // implicit type reexports through imported aliases and module barrels.
    const emitOptions={...options,allowImportingTsExtensions:false,noLib:true,types:[],
      skipLibCheck:true,noEmitOnError:false,outDir:path.join(path.dirname(filename),'.elnor-virtual-output')};
    const emitHost=ts.createCompilerHost(emitOptions);
    emitHost.readFile=file=>host.readFile(file);
    emitHost.fileExists=file=>host.fileExists(file);
    if(host.directoryExists)emitHost.directoryExists=directory=>host.directoryExists(directory);
    emitHost.getSourceFile=(file,languageVersion)=>{
      const source=emitHost.readFile(file);
      return source===undefined?undefined:ts.createSourceFile(file,source,languageVersion,true);
    };
    const program=ts.createProgram([filename],emitOptions,emitHost);
    const input=program.getSourceFile(filename);
    if(!input)return undefined;
    let emitted;
    program.emit(input,(file,code)=>{if(/\.[cm]?js$/.test(file))emitted=code;});
    return emitted;
  }
  function error(code,message,file,node,source){
    const start=node?.getStart?.()??0,length=node?.getWidth?.()??0;
    return {code,message,file,start,length,line:source.slice(0,start).split('\n').length};
  }
  function resolve(specifier,importer){
    if(!/^(\.\/|\.\.\/).+\.(?:mjs|js|mts|ts)$/.test(specifier)||/\.d\.[cm]?ts$/.test(specifier))
      return {code:'ELN-MODULE-PATH',message:`Only relative local ESM module paths are packaged: '${specifier}'`};
    const resolved=ts.resolveModuleName(specifier,sourcePath(importer),options,host).resolvedModule;
    let file=resolved?.resolvedFileName;
    // TypeScript may resolve a JS contract to a declaration file. Package the
    // actual JS file when it exists, never a declaration as executable code.
    if(file&&/\.d\.[cm]?ts$/.test(file)){
      const runtime=sourceImport(importer,specifier);
      file=/\.[cm]?js$/.test(runtime)&&host.fileExists(runtime)?runtime:undefined;
    }
    if(!file||!(/\.(?:mts|ts|mjs|js)$/.test(file)))
      return {code:'ELN-MODULE-RESOLVE',message:`Cannot resolve executable local module '${specifier}'`};
    return {file:sourcePath(file)};
  }
  function visit(filename){
    filename=sourcePath(filename);
    const key=canonical(filename);
    if(records.has(key))return records.get(key);
    const name=sourceHash(filename)+'.mjs';
    const record={filename,name,code:'',errors:[],dependencies:[]};records.set(key,record);
    const source=host.readFile(filename);
    if(source===undefined){record.errors.push(error('ELN-MODULE-RESOLVE','Cannot read executable module',filename,null,''));return record;}
    if(ts.getImpliedNodeFormatForFile(filename,undefined,host,options)===ts.ModuleKind.CommonJS){
      record.errors.push(error('ELN-MODULE-CJS','The source file belongs to a CommonJS package context; use an ESM source',filename,null,source));return record;
    }
    const {sf,checker}=bindSource(source);
    const report=(code,message,node)=>record.errors.push(error(code,message,filename,node,source));
    if(sf.parseDiagnostics.length){
      for(const d of sf.parseDiagnostics)record.errors.push({code:'ELN-MODULE-PARSE',message:ts.flattenDiagnosticMessageText(d.messageText,' '),file:filename,start:d.start??0,length:d.length??0,line:source.slice(0,d.start??0).split('\n').length});
      return record;
    }
    function inspect(node){
      if(ts.isTypeNode(node))return;
      if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)report('ELN-MODULE-DYNAMIC','Dynamic import is outside the local ESM packaging experiment',node);
      if(ts.isMetaProperty(node)&&node.keywordToken===ts.SyntaxKind.ImportKeyword)report('ELN-MODULE-META','import.meta and relative assets need a separate output contract',node);
      if(ts.isImportEqualsDeclaration(node)||(ts.isExportAssignment(node)&&node.isExportEquals))report('ELN-MODULE-CJS','CommonJS module constructs are not packaged',node);
      if(ts.isIdentifier(node)&&['require','module','exports','__dirname','__filename'].includes(node.text)){
        const parent=node.parent;
        const key=(ts.isPropertyAccessExpression(parent)&&parent.name===node)||
          (ts.isPropertyAssignment(parent)&&parent.name===node)||
          (ts.isBindingElement(parent)&&parent.propertyName===node);
        const symbol=ts.isShorthandPropertyAssignment(parent)?checker.getShorthandAssignmentValueSymbol(parent):checker.getSymbolAtLocation(node);
        if(!key&&!symbol)report('ELN-MODULE-CJS','CommonJS environment references are not packaged',node);
      }
      ts.forEachChild(node,inspect);
    }
    inspect(sf);
    const emitted=emitModule(filename);
    if(emitted===undefined){report('ELN-MODULE-EMIT','TypeScript did not emit executable source',sf);return record;}
    const output=ts.createSourceFile('module.mjs',emitted,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const originals=moduleEdges(sf),edits=[];
    for(const edge of moduleEdges(output)){
      const specifier=edge.moduleSpecifier.text;
      const resolved=resolve(specifier,filename);
      const original=originals.find(node=>node.moduleSpecifier.text===specifier)?.moduleSpecifier;
      if(resolved.code){report(resolved.code,resolved.message,original);continue;}
      const dependency=visit(resolved.file);record.dependencies.push(dependency);
      edits.push({start:edge.moduleSpecifier.getStart(output),end:edge.moduleSpecifier.end,text:JSON.stringify('./'+dependency.name)});
    }
    record.code=edits.sort((a,b)=>b.start-a.start).reduce((code,edit)=>code.slice(0,edit.start)+edit.text+code.slice(edit.end),emitted);
    return record;
  }
  function collect(record,seen=new Set()){
    if(seen.has(record))return [];seen.add(record);
    return [...record.errors,...record.dependencies.flatMap(dependency=>collect(dependency,seen))];
  }
  return {
    include(specifier,importer){
      const resolved=resolve(specifier,importer);
      if(resolved.code)return {errors:[{...resolved,file:importer,line:1}]};
      const record=visit(resolved.file);
      return {path:'./'+localModuleDirectory+record.name,errors:collect(record)};
    },
    files(){return new Map([...records.values()].map(record=>[localModuleDirectory+record.name,record.code]));},
  };
}
