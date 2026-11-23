// Convert Surface declarations and UI use sites into ordinary TypeScript.
// This reuses the TS checker for props, events, expressions, and cross-file imports.
import fs from 'node:fs';
import path from 'node:path';
import { getTs, surfaceDiagnosticMessage } from './typescript.mjs';
import {createTypeScriptOptions} from './typescript-configuration.mjs';
import { validateGraph } from './semantic-validation.mjs';
import {sourceKey,sourceHash,surfaceRecords,sourcePath,sourceImport,logicalKey} from './source-identity.mjs';
import {observeFileHost} from './observed-host.mjs';
import {actionFunctionPrefix, guardCallChecks, guardCallConflicts, guardedBodyOffset} from './action-guards.mjs';
import {projectReactiveState} from './language-projection.mjs';
import {actionGroupType, managedActionNames, managedActionType, memberGroupType} from './action-groups.mjs';
const ts=getTs();
const normalize=s=>s.replaceAll('\\','/');
function importsFor(ir){
  return ir.header.replace(/(from\s+["'][^"']+\.eln)(["'])/g,'$1.mjs$2');
}
function contract(ir){
  const props=ir.params.map(p=>`readonly ${p.name}${p.optional?'?':''}: ${p.type}`).join('; ');
  const ev=ir.events.map(e=>`${e.name}?: (${e.params.map(p=>`${p.name}: ${p.type}`).join(', ')}) => void`).join('; ');
  const slots=ir.slots.map(name=>`${name}?: () => void`).join('; ');
  return `export default function __contract(props: { ${props} }, events?: { ${ev} }, slots?: { ${slots} }): void { void props; void events; void slots; }`;
}
export function virtualCheckSource(ir){
  const lines=[],map=[],actionMappings=[],guardChecks=[];let generatedOffset=0;
  const add=(s,line,step=0)=>{for(const x of String(s).split('\n')){lines.push(x);map.push(line);generatedOffset+=x.length+1;line+=step;}};
  if(ir.header)add(importsFor(ir),1);
  add(`function __validateComponent(${ir.params.map(p=>p.raw).join(', ')}) {`,1);
  for(const state of ir.states)add(`let ${state.name}${state.type} = (${state.expr});`,state.line,1);
  let reactiveState='';
  projectReactiveState(ir.states,text=>{reactiveState+=text;},state=>{reactiveState+=state.name;});
  if(reactiveState)add(reactiveState.trimEnd(),1);
  for(const calc of ir.calcs)add(`const ${calc.name} = (${calc.expr});`,calc.line,1);
  for(const group of ir.actionGroups)add(`const ${group.name} = {} as ${actionGroupType}; void [${group.owners.map(owner=>owner.expr).join(", ")}];`,group.line);
  if(ir.events.length){
    add(`const emit: {${ir.events.map(e=>`${e.name}: (${e.params.map(p=>`${p.name}: ${p.type}`).join(', ')}) => void`).join(';')}} = {${ir.events.map(e=>`${e.name}: (${e.params.map(p=>p.name).join(', ')}) => {}`).join(',')}};`,ir.events[0].line);
  } else add('const emit = {};',1);
  const managed=managedActionNames(ir);
  for(const authored of ir.actions){
    const implementation=managed.get(authored.name);
    let action=authored;
    if(implementation){
      add(`const ${authored.name} = {} as ${managedActionType(implementation)};`,authored.line);
      action={...authored,name:implementation};
      action.functionSource=actionFunctionPrefix(action)+authored.functionSource.slice(actionFunctionPrefix(authored).length);
    }
    // A member sees its own group with the signal of its invocation.
    const shadowed=implementation&&ir.actionGroups.some(group=>group.name===authored.group);
    const prefix=shadowed?`const ${implementation} = (() => { const ${authored.group} = {} as ${memberGroupType}; return `:'';
    const start=generatedOffset+prefix.length;
    if(action.bodySegments)guardChecks.push(...guardCallChecks(action,start+actionFunctionPrefix(action).length));
    add(prefix+action.functionSource+(shadowed?'; })();':''),action.line);
    actionMappings.push({start,end:start+action.functionSource.length,action});
  }
  if(ir.disposal)add(`(() => { ((__elnor_result: void) => {})(${ir.disposal.expr}); });`,ir.disposal.line);
  add('function __checkUI(){',1);
  function emitNodes(nodes){
    for(const node of nodes){
      for(const key of ['ariaPressed','ariaCurrent'])if(node[key+'Expr']!==undefined)add(`((__elnor_aria: boolean) => {})((${node[key+'Expr']}));`,node.line);
      if(node.disabledExpr!==undefined)add(`((__elnor_disabled: boolean) => {})((${node.disabledExpr}));`,node.line);
      if(node.classExpr!==undefined)add(`((__elnor_class: string) => {})((${node.classExpr}));`,node.line);
      if(node.errorExpr!==undefined)add(`((__elnor_error: string) => {})((${node.errorExpr}));`,node.line);
      if(node.focusInvalidExpr!==undefined)add(`((__elnor_focus_invalid: boolean) => {})((${node.focusInvalidExpr}));`,node.line);
      if(node.onInputExpr!==undefined)add(`((__elnor_on_input: (value: string) => void) => {})((${node.onInputExpr}));`,node.line);
      if(node.kind==='container'||node.kind==='fill'){if(node.submitExpr!==undefined)add(`void (${node.submitExpr});`,node.line);if(node.resetExpr!==undefined)add(`void (${node.resetExpr});`,node.resetLine);emitNodes(node.children);continue;}
      if(node.kind==='slot'){continue;}
      if(node.kind==='if'){add(`if (${node.expr}) {`,node.line);emitNodes(node.children);add('}',node.line);continue;}
      if(node.kind==='each'){add(`for (const ${node.variable} of (${node.collection})) { void (${node.key});`,node.line);emitNodes(node.children);add('}',node.line);continue;}
      if(node.kind==='text'){add(`void (${node.expr});`,node.line);continue;}
      if(node.kind==='input'){add(node.tag==='select'?`${node.binding} = ((__elnor_select: string): (${node.options.map(o=>JSON.stringify(o.value)).join('|')||'never'}) => __elnor_select as (${node.options.map(o=>JSON.stringify(o.value)).join('|')||'never'}))(${node.binding});`:node.tag==='checkbox'?`${node.binding} = ((__elnor_checked: boolean): boolean => __elnor_checked)(${node.binding});`:node.tag==='textarea'?`${node.binding} = ((__elnor_text: string): string => __elnor_text)(${node.binding});`:`void (${node.binding});`,node.line);continue;}
      if(node.kind==='button'){add(`void (${node.label}); void (${node.expr});`,node.line);continue;}
      if(node.kind==='on'){add(`void (${node.expr});`,node.line);continue;}
      if(node.kind==='component'){
        const props=`{${node.props.map(p=>`${p.name}: (${p.expr})`).join(',')}}`;
        const listeners=node.children.filter(n=>n.kind==='on');
        const events=`{${listeners.map(n=>`${n.name}: (${n.param??''}) => (${n.expr})`).join(',')}}`;
        const fills=node.children.filter(n=>n.kind==='fill');
        const content=node.children.filter(n=>n.kind!=='fill'&&n.kind!=='on');
        add(`${node.name}(${props}, ${events}, {`,node.line);
        if(content.length){add('default: () => {',node.line);emitNodes(content);add('},',node.line);}
        for(const fill of fills){add(`${fill.name}: () => {`,fill.line);emitNodes(fill.children);add('},',fill.line);}
        add('});',node.line);
      }
    }
  }
  emitNodes(ir.ui);
  add('}',1);
  add('}',1);
  add(contract(ir),1);
  return {source:lines.join('\n')+'\n',lineMap:map,actionMappings,guardChecks};
}
function actionDiagnosticLine(entry,offset){
  if(!entry||typeof offset!=='number')return undefined;
  const mapped=entry.actionMappings.find(part=>offset>=part.start&&offset<part.end);
  if(!mapped)return undefined;
  const {action}=mapped,{paramsSpan,bodySpan,nameSpan}=action;
  if(!paramsSpan||!bodySpan||!nameSpan||typeof entry.ir.source!=='string')return undefined;
  const prefix=`${action.async?'async ':''}function ${action.name}(`;
  const relative=offset-mapped.start,paramsEnd=prefix.length+action.params.length,bodyStart=paramsEnd+') {'.length;
  let original;
  if(relative<prefix.length)original=nameSpan.start;
  else if(relative<paramsEnd)original=paramsSpan.start+relative-prefix.length;
  else if(relative<bodyStart)original=bodySpan.start-1;
  else if(action.bodySegments)original=guardedBodyOffset(action.bodySegments,relative-bodyStart)??action.nameSpan.start;
  else if(relative<bodyStart+bodySpan.length)original=bodySpan.start+relative-bodyStart;
  else original=bodySpan.start+bodySpan.length;
  return entry.ir.source.slice(0,original).split('\n').length;
}
export function typecheckGraph(graph,outputDir,extraFiles=[],{onDependency,onProgram}={}){
  let records;
  try{records=surfaceRecords(graph);}catch(error){if(error.diagnostics)return error.diagnostics;throw error;}
  const moduleHost=onDependency?observeFileHost({...ts.sys},onDependency):undefined;
  const errors=validateGraph(new Map(records.map(ir=>[path.resolve(ir.filename),ir])),{moduleHost});
  const examples=path.resolve(outputDir,'examples');
  fs.mkdirSync(path.resolve(examples,'components'),{recursive:true});
  const maps=new Map(),files=[];
  for(const ir of records){
    const v=virtualCheckSource(ir);
    const dest=path.resolve(examples,'components',`${sourceHash(ir.filename)}.eln.mts`);
    fs.writeFileSync(dest,v.source);files.push(dest);maps.set(normalize(dest),{ir,lineMap:v.lineMap,actionMappings:v.actionMappings,guardChecks:v.guardChecks});
  }
  const opts=createTypeScriptOptions();
  const host=observeFileHost(ts.createCompilerHost(opts),onDependency);
  const reads=new Map(),resolutions=new Map();
  if(onProgram){
    const read=host.readFile;
    host.readFile=file=>{const text=read.call(host,file);reads.set(logicalKey(file),text);return text;};
  }
  const virtuals=new Map([...maps].map(([file,entry])=>[sourceKey(entry.ir.filename),file]));
  function resolve(name,containingFile){
    const entry=maps.get(normalize(path.resolve(containingFile)));
    if(entry&&name.endsWith('.eln.mjs')){
      const file=virtuals.get(sourceKey(sourceImport(entry.ir.filename,name.slice(0,-4))));
      return file?{resolvedFileName:file,extension:ts.Extension.Mts}:undefined;
    }
    // Ordinary TypeScript dependencies retain their original source directory;
    // the temporary projection directory is not a module-resolution root.
    const resolved=ts.resolveModuleName(name,entry?sourcePath(entry.ir.filename):sourcePath(containingFile),opts,host).resolvedModule;
    return resolved?{...resolved,resolvedFileName:sourcePath(resolved.resolvedFileName)}:undefined;
  }
  host.resolveModuleNames=(names,containingFile)=>names.map(name=>{
    const result=resolve(name,containingFile);
    if(onProgram)resolutions.set(JSON.stringify([logicalKey(containingFile),name]),result);
    return result;
  });
  const program=ts.createProgram([...files,...extraFiles],opts,host);
  for(const file of files){
    const {ir,guardChecks}=maps.get(normalize(file));
    for(const error of guardCallConflicts(ts,program,file,guardChecks)){
      errors.push({...error,file:ir.filename,line:ir.source.slice(0,error.start).split('\n').length});
    }
  }
  for(const d of ts.getPreEmitDiagnostics(program)){
    const file=d.file&&normalize(path.resolve(d.file.fileName));
    const entry=maps.get(file);
    const position=d.file?.getLineAndCharacterOfPosition(d.start??0);
    const message = entry ? surfaceDiagnosticMessage(ts, d, () => program.getTypeChecker()) : ts.flattenDiagnosticMessageText(d.messageText, ' ');
    errors.push({code:`TS${d.code}`,file:entry?.ir.filename??file??'unknown',line:actionDiagnosticLine(entry,d.start)??entry?.lineMap[position?.line??0]??((position?.line??0)+1),message});
  }
  onProgram?.({program,reads,resolutions,entryFiles:virtuals});
  return errors;
}
