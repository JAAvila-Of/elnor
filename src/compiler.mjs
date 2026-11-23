import {analyzeRegion,analyzeSequentialRegion,attachRegion} from './region-compiler.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTs } from './typescript.mjs';
import { parseSurface } from './parser.mjs';
import { typecheckGraph } from './checker.mjs';
import { validateComponent } from './component-validation.mjs';
import { bindSource } from './binding-analysis.mjs';
import { projectSurface } from './language-projection.mjs';
import { runtimeModulePaths } from './import-validation.mjs';
import { createModulePlanner } from './module-plan.mjs';
import {moduleGraphRevision,sharedModuleUrl} from './module-revision.mjs';
import {proveRenderModule} from './render-module-proof.mjs';
import {proveDerivedListReplacement} from './surface-hot-proof.mjs';
import {componentHotContract,hotContract} from './hot-contract.mjs';
import {managedGeneratorBody} from './managed-action-lowering.mjs';
import {sourceKey,surfaceRecords,surfaceOutputs,moduleSpecifier,sourcePath,sourceImport} from './source-identity.mjs';
const ts=getTs();
const ROOT=fileURLToPath(new URL('..',import.meta.url));
export const EXAMPLES=path.join(ROOT,'examples/components');
export const DIST=path.join(ROOT,'dist');
const allFiles=['UserList','ConfirmDialog','Panel','UserEditor'].map(x=>path.join(EXAMPLES,x+'.eln'));

function toContext(node,context,checker,replacements){
  const replacement=n=>replacements.get(checker.getSymbolAtLocation(n));
  const visitor=(n)=>{
    if(ts.isPropertyAccessExpression(n))return ts.factory.updatePropertyAccessExpression(n,ts.visitNode(n.expression,visitor),n.name);
    if(ts.isPropertyAssignment(n))return ts.factory.updatePropertyAssignment(n,ts.isComputedPropertyName(n.name)?ts.visitNode(n.name,visitor):n.name,ts.visitNode(n.initializer,visitor));
    if(ts.isShorthandPropertyAssignment(n)){
      const value=replacements.get(checker.getShorthandAssignmentValueSymbol(n));
      if(value){
        const target=value();
        // Rewriting shorthand must retain an own data property, including
        // __proto__, whose non-computed colon form changes object prototypes.
        const name=n.name.text==='__proto__'?ts.factory.createComputedPropertyName(ts.factory.createStringLiteral('__proto__')):n.name;
        return ts.factory.createPropertyAssignment(name,n.objectAssignmentInitializer
          ? ts.factory.createBinaryExpression(target,ts.SyntaxKind.EqualsToken,ts.visitNode(n.objectAssignmentInitializer,visitor)) : target);
      }
    }
    if(ts.isIdentifier(n)){
      const value=replacement(n); if(value)return value();
    }
    if(ts.isPropertySignature(n)||ts.isTypeNode(n)||ts.isImportDeclaration(n))return n;
    return ts.visitEachChild(n,visitor,context);
  };
  return ts.visitNode(node,visitor);
}
function rewrite(ir,code,locals,kind,helpers){
  const names=new Map([
    ['emit',helpers.emit],
    ...ir.params.map(p=>[p.name,`${helpers.props}.${p.name}`]),
    ...ir.states.map(s=>[s.name,helpers.indexedReads?.get(s.name)??`${helpers.state}.${s.name}.value`]),
    ...ir.calcs.map(s=>[s.name,helpers.indexedReads?.get(s.name)??`${helpers.calc}.${s.name}.value`]), ...locals,
  ]);
  const declarations=[...names.keys()].map(name=>`let ${name}: any;`).join('\n');
  const fragment=kind==='expression'?`(${code});`:code;
  const source=`${declarations}\n{\n${fragment}\n}`;
  // Absence is a proof only without escapes: an identifier can spell a context
  // name with Unicode escapes. Substring matches deliberately keep the full
  // binder for comments, strings, property names and shadowed local names too.
  const independent=!code.includes('\\')&&![...names.keys()].some(name=>code.includes(name));
  const {sf,checker}=independent
    ? {sf:ts.createSourceFile('fragment.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)}
    : bindSource(source);
  const replacements=checker?new Map(sf.statements.slice(0,names.size).map(statement=>{
    const name=statement.declarationList.declarations[0].name;
    return [checker.getSymbolAtLocation(name),()=>{
      const value=names.get(name.text);if(typeof value==='function')return value();
      const [head,...tail]=value.split('.');
      return tail.reduce((node,key)=>ts.factory.createPropertyAccessExpression(node,key),ts.factory.createIdentifier(head));
    }];
  })):null;
  const block=sf.statements.at(-1);
  const input=kind==='expression'?block.statements[0].expression:block;
  const result=checker?ts.transform(input,[ctx=>root=>toContext(root,ctx,checker,replacements)]):null;
  const transformed=result?.transformed[0]??input;
  const printer=ts.createPrinter();
  const output=kind==='expression'?printer.printNode(ts.EmitHint.Expression,transformed,sf):transformed.statements.map(s=>printer.printNode(ts.EmitHint.Unspecified,s,sf)).join('\n');
  result?.dispose();return output;
}
function nameAllocator(source){
  // Substring exclusion is deliberately conservative: comments, strings and
  // type names may reserve a candidate too. Decode escapes so identifiers such
  // as \\u005f_elnor_props cannot capture an inserted __elnor_props reference.
  const decoded=source.replace(/\\u(?:\{([\da-fA-F]{1,6})\}|([\da-fA-F]{4}))/g,(raw,braced,fixed)=>{
    const point=parseInt(braced??fixed,16);
    return point<=0x10ffff?String.fromCodePoint(point):raw;
  });
  const used=new Set();
  return hint=>{
    const base=`__elnor_${hint}`;
    let name=base,index=0;
    while(decoded.includes(name)||used.has(name))name=`${base}_${++index}`;
    used.add(name);return name;
  };
}
function hasDetachedRoot(nodes){
  const plain=node=>node.kind==='container'?node.children.every(plain):['text','button','input'].includes(node.kind);
  return nodes.length===1&&nodes[0].kind==='container'&&plain(nodes[0]);
}
function isPrimitiveCaption(code){
  if(!"\"'`(0123456789tfn".includes(code.trimStart()[0]??'\0'))return false;
  const source=ts.createSourceFile('caption.ts',`(${code});`,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  if(source.parseDiagnostics.length||source.statements.length!==1||!ts.isExpressionStatement(source.statements[0]))return false;
  let node=source.statements[0].expression;
  while(ts.isParenthesizedExpression(node))node=node.expression;
  return ts.isStringLiteral(node)||ts.isNumericLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)
    ||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(node.kind);
}
function hasForm(nodes){return nodes.some(n=>n.tag==='form'||(n.children&&hasForm(n.children)));}
function hasSelect(nodes){return nodes.some(n=>n.tag==='select'||(n.children&&hasSelect(n.children)));}
function hasCheckbox(nodes){return nodes.some(n=>n.tag==='checkbox'||(n.children&&hasCheckbox(n.children)));}
function hasTextarea(nodes){return nodes.some(n=>n.tag==='textarea'||(n.children&&hasTextarea(n.children)));}
function hasAria(nodes){return nodes.some(n=>n.ariaPressedExpr!==undefined||n.ariaCurrentExpr!==undefined||(n.children&&hasAria(n.children)));}
function hasDisabled(nodes){return nodes.some(n=>n.disabledExpr!==undefined||(n.children&&hasDisabled(n.children)));}
function hasFieldError(nodes){return nodes.some(n=>n.errorExpr!==undefined||(n.children&&hasFieldError(n.children)));}
function disabledLiteral(code){if(code===undefined)return undefined;const sf=ts.createSourceFile('disabled.ts',`(${code});`,ts.ScriptTarget.Latest,true);let n=sf.statements[0]?.expression;while(n&&ts.isParenthesizedExpression(n))n=n.expression;return n?.kind===ts.SyntaxKind.TrueKeyword?true:n?.kind===ts.SyntaxKind.FalseKeyword?false:undefined;}
function hasClasses(nodes){return nodes.some(n=>n.classExpr!==undefined||(n.children&&hasClasses(n.children)));}
function classLiteral(code){if(code===undefined)return undefined;const sf=ts.createSourceFile('class.ts',`(${code});`,ts.ScriptTarget.Latest,true);let n=sf.statements[0]?.expression;while(n&&ts.isParenthesizedExpression(n))n=n.expression;return n&&(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))?n.text:undefined;}
// Action group options are emitted only when the group declares them.
function groupOptions(group){
  const options=['capacity','timeout','debounce'].filter(name=>group[name]!==null).map(name=>`${name}: ${group[name]}`);
  return options.length?`, {${options.join(', ')}}`:'';
}
function generateLegacy(ir,{moduleImports=new Map(),componentImports,detachedImports=new Set(),runtimeImport='./runtime.mjs',hot=false,hotLists,hotChild=false}={}){
  const diagnostics=validateComponent(ir);
  if(diagnostics.length)throw Object.assign(new Error(diagnostics.map(d=>`${d.code}: ${d.message}`).join('\n')),{diagnostics});
  const ordinaryPaths=runtimeModulePaths(projectSurface(ir.source,ir.filename));
  for(const imp of ir.imports.filter(imp=>!imp.path.endsWith('.eln')&&ordinaryPaths.has(imp.path))){
    if(!moduleImports.has(imp.path))throw Error('ELN-IMPORT-RUNTIME: Use emitGraph to package local ESM dependencies before generating runtime imports');
  }
  const fresh=nameAllocator(ir.source);
  const helpers=Object.fromEntries(['props','state','calc','emit','target','handlers','slots','root','scope'].map(name=>[name,fresh(name)]));
  const groups=ir.actionGroups;
  // A direct state owner compares revisions. Any other owner, or a list of
  // owners, reads a key that keeps its identity while every element is equal.
  const stateOwners=new Set(groups.flatMap(group=>group.owners.map(owner=>owner.name)).filter(name=>ir.states.some(state=>state.name===name)));
  const ownerKeys=new Map(groups.filter(group=>group.owners.length!==1||group.owners[0].name===null).map(group=>[group.name,fresh('ownerKey')]));
  const runtime=Object.fromEntries([...(hasForm(ir.ui)?['formBinding']:[]),...(hasFieldError(ir.ui)?['fieldErrorBinding']:[]),...(hasAria(ir.ui)?['setAriaBoolean','ariaBooleanBinding']:[]),...(hasDisabled(ir.ui)?['setDisabled','disabledBinding']:[]),...(hasSelect(ir.ui)?['select']:[]),...(hasCheckbox(ir.ui)?['checkbox']:[]),...(hasTextarea(ir.ui)?['textarea']:[]),...(hasClasses(ir.ui)?['setClass','classBinding']:[]),...(hotLists?['runRegionUntracked']:[]),'cell','computed','uninitializedBinding','element','rootElement','text','button','literalText','literalButton','input','when','repeat','mountBoundary','renderComponent','createComponentRoot','renderSlot'].map(name=>[name,fresh(`runtime_${name}`)]));
  if(groups.length)runtime.createActionGroup=fresh('runtime_createActionGroup');
  if(stateOwners.size)runtime.actionOwnerCell=fresh('runtime_actionOwnerCell');
  if(ownerKeys.size)runtime.actionOwnerKey=fresh('runtime_actionOwnerKey');
  const runtimeChildren=ir.imports.filter(i=>i.path.endsWith('.eln')&&!i.typeOnly);
  const children=new Map(runtimeChildren.map(i=>[i.local,fresh(`child_${i.local}`)]));
  const detachedChildren=new Set(runtimeChildren.filter(i=>detachedImports.has(i.path)).map(i=>i.local));
  const fragment=(code,locals=new Map(),kind='expression')=>rewrite(ir,code,locals,kind,helpers);
  const ownerRead=owner=>stateOwners.has(owner.name)?`${helpers.state}.${owner.name}.revision`:fragment(owner.expr);
  const managedFactories=new Map(groups.length?ir.actions.map(action=>[action.name,fresh('actionBody')]):[]);
  const managedBodies=groups.length?ir.actions.map(action=>{
    const lease=fresh('actionLease');
    const call=(method,target)=>ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier(lease),method),undefined,[target]);
    const locals=new Map(ir.states.map(state=>[state.name,()=>ts.factory.createPropertyAccessExpression(
      call('bindCell',ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier(helpers.state),state.name)),'value')]));
    for(const member of ir.actions)locals.set(member.name,()=>member.group
      ?call('bindAction',ts.factory.createIdentifier(member.name))
      :call('bindHelper',ts.factory.createIdentifier(managedFactories.get(member.name))));
    // A member sees its own group through the invocation, which owns the signal.
    if(action.group)locals.set(action.group,()=>call('bindGroup',ts.factory.createIdentifier(action.group)));
    const implementation=action.group
      ?`function* (${action.params}) ${managedGeneratorBody(action,{lease,fresh})}`
      :action.functionSource.replace(/^(async )?function [^(]+/,(_,asyncKeyword='')=>`${asyncKeyword}function `);
    // The property key names the function for stack traces without adding a
    // binding that would shadow the action inside its own body.
    return fragment(`function ${managedFactories.get(action.name)}(${lease}) { return {${action.name}: ${implementation}}.${action.name}; }`,locals,'statement');
  }):[];
  const args=fresh('args'),value=fresh('value'),mount=fresh('mount'),render=fresh('render');
  const seed=hot?fresh('hotSeed'):null,capture=hot?fresh('hotCapture'):null;
  const rows=hotLists?fresh('hotRows'):null;
  const header=ts.createSourceFile('header.ts',ir.header,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const ordinaryImports=header.statements.filter(node=>ts.isImportDeclaration(node)&&!node.moduleSpecifier.text.endsWith('.eln')).map(node=>{
    const text=node.getText(header),specifier=node.moduleSpecifier,target=moduleImports.get(specifier.text);
    return target?text.slice(0,specifier.getStart(header)-node.getStart(header))+JSON.stringify(target)+text.slice(specifier.end-node.getStart(header)):text;
  });
  const guardDeclarations=[];
  const sentinels=(bindings,kind)=>bindings.map(binding=>{
    const guard=fresh(`guard_${kind}_${binding.name}`);
    guardDeclarations.push(`const ${guard} = /* @__PURE__ */ ${runtime.uninitializedBinding}(${JSON.stringify({
      binding:binding.name,kind,file:ir.filename,...binding.nameSpan,
    })});`);
    return `[${JSON.stringify(binding.name)}]: ${guard}`;
  }).join(',');
  const stateSentinels=sentinels(ir.states,'state'),calcSentinels=sentinels(ir.calcs,'calc');
  let id=0;
  const lines=[
    '// Elnor Spike 003 generated output. Bounded experimental grammar.',
    ...ordinaryImports,
    `import {${Object.entries(runtime).map(([name,alias])=>`${name} as ${alias}`).join(',')}} from ${JSON.stringify(runtimeImport)};`,
    ...runtimeChildren.map(x=>{
      const target=componentImports?componentImports.get(x.path):'./'+path.basename(x.path,'.eln')+'.mjs';
      if(!target)throw Error(`ELN-SURFACE-GRAPH: Missing component '${x.path}' in the emission graph`);
      return `import {renderOwned as ${children.get(x.local)}} from ${JSON.stringify(target)};`;
    }),
    ...guardDeclarations,
    `function ${mount}(${helpers.target}, ${helpers.props}, ${helpers.handlers}={}, ${helpers.slots}={}) {`,
    `  return ${runtime.mountBoundary}(${helpers.target}, (${helpers.root}, ${helpers.scope}) => ${render}(${helpers.root},${helpers.props},${helpers.handlers},${helpers.slots},${helpers.scope}));`,
    `}`,
    `function ${render}(${helpers.root},${helpers.props},${helpers.handlers},${helpers.slots},${helpers.scope}${hot?`,${seed},${capture}${rows?','+rows:''}`:''}) {`,
    `    const ${helpers.state} = {${stateSentinels}};`,
    `    const ${helpers.calc} = {${calcSentinels}};`,
    ...groups.filter(group=>ownerKeys.has(group.name)).map(group=>
      `    const ${ownerKeys.get(group.name)} = ${runtime.actionOwnerKey}(() => [${group.owners.map(ownerRead).join(', ')}], ${helpers.scope});`),
    ...groups.map(group=>{
      const owner=ownerKeys.has(group.name)?`${ownerKeys.get(group.name)}.value`:ownerRead(group.owners[0]);
      return `    const ${group.name} = ${runtime.createActionGroup}(${JSON.stringify(group.policy)}, () => (${owner}), ${helpers.scope}${groupOptions(group)});`;
    }),
    ...ir.actions.filter(action=>action.group).map(action=>`    const ${action.name} = ${action.group}.action(${managedFactories.get(action.name)}, ${JSON.stringify(action.name)});`),
    ...ir.states.map((s,index)=>{
      const init=fragment(s.expr);
      const makeCell=stateOwners.has(s.name)?runtime.actionOwnerCell:runtime.cell;
      return `    ${helpers.state}.${s.name} = ${makeCell}(${hot?`${seed} ? ${seed}[${index}] : (${init})`:init});`;
    }),
    ...(hot?[`    ${capture}?.(() => [${ir.states.map(s=>`${helpers.state}.${s.name}.value`).join(',')}]);`]:[]),
    ...ir.calcs.map(d=>`    ${helpers.calc}.${d.name} = ${runtime.computed}(() => (${fragment(d.expr)}),${helpers.scope});`),
    `    const ${helpers.emit} = {${ir.events.map(e=>`${e.name}: (...${args}) => ${helpers.handlers}.${e.name}?.(...${args})`).join(',')}};`,
    ...ir.actions.filter(action=>!action.group).map(a=>fragment(a.functionSource,new Map(),'statement')),
    ...managedBodies,
    ...(ir.disposal?[`    ${helpers.scope}.own(() => { ${fragment(ir.disposal.expr)}; });`]:[]),
  ];
  function emit(nodes,parent,owner,locals=new Map(),indent='    ',exclusive=false,returnRoot=false,hotRow){
    for(const n of nodes){
      const index=++id, unique=fresh(`node${index}`);
      if(n.kind==='container'){
        lines.push(`${indent}const ${unique} = ${returnRoot?runtime.rootElement:runtime.element}(${parent},${JSON.stringify(n.tag)},${JSON.stringify(classLiteral(n.classExpr)??n.className)});`);
        if(n.classExpr!==undefined&&classLiteral(n.classExpr)===undefined)lines.push(`${indent}${runtime.classBinding}(${unique},()=>(${fragment(n.classExpr,locals)}),${owner});`);
        if(n.disabledExpr!==undefined){
          const literal=disabledLiteral(n.disabledExpr);
          lines.push(literal!==undefined?`${indent}${runtime.setDisabled}(${unique},${literal});`
            :`${indent}${runtime.disabledBinding}(${unique},()=>(${fragment(n.disabledExpr,locals)}),${owner});`);
        }
        if(n.submitExpr!==undefined){
          const reset=n.resetExpr===undefined?'undefined':'()=>{'+fragment(n.resetExpr,locals)+';}';
          const focus=n.focusInvalidExpr===undefined?'':',()=>('+fragment(n.focusInvalidExpr,locals)+')';
          const options=n.resetExpr!==undefined||focus?','+reset+focus:'';
          lines.push(`${indent}${runtime.formBinding}(${unique},()=>{${fragment(n.submitExpr,locals)};},${owner}${options});`);
        }
        emit(n.children,unique,owner,locals,indent,true);
        if(returnRoot)lines.push(`${indent}return ${unique};`);
        continue;
      }
      if(n.kind==='text'){
        const literal=isPrimitiveCaption(n.expr);
        lines.push(`${indent}${n.classExpr!==undefined||n.disabledExpr!==undefined?'const '+unique+' = ':''}${literal?runtime.literalText:runtime.text}(${parent},${JSON.stringify(n.tag)},${literal?'':'()=>'}(${literal?n.expr:fragment(n.expr,locals)}),${owner});`);if(n.classExpr!==undefined){const literalClass=classLiteral(n.classExpr);lines.push(literalClass!==undefined?`${indent}${runtime.setClass}(${unique},${JSON.stringify(literalClass)});`:`${indent}${runtime.classBinding}(${unique},()=>(${fragment(n.classExpr,locals)}),${owner});`);}continue;
      }
      if(n.kind==='input'){
        const hotTextField=hot&&!hotChild&&(!n.tag||n.tag==='textarea');
        const needsNode=hotTextField||n.classExpr!==undefined||n.disabledExpr!==undefined||n.errorExpr!==undefined;
        const notify=n.onInputExpr===undefined?'':`(${fragment(n.onInputExpr,locals)})(${value});`;
        const write=`${value}=>{${helpers.state}.${n.binding}.value=${value};${notify}}`;
        lines.push(`${indent}${needsNode?'const '+unique+' = ':''}${runtime[n.tag==='select'?'select':n.tag==='checkbox'?'checkbox':n.tag==='textarea'?'textarea':'input']}(${parent},${JSON.stringify(n.label)},${n.tag==='select'?JSON.stringify(n.options.map(({label,value})=>({label,value})))+',':''}()=>${helpers.state}.${n.binding}.value,${write},${owner});`);
        if(n.classExpr!==undefined){const literalClass=classLiteral(n.classExpr);lines.push(literalClass!==undefined?`${indent}${runtime.setClass}(${unique},${JSON.stringify(literalClass)});`:`${indent}${runtime.classBinding}(${unique},()=>(${fragment(n.classExpr,locals)}),${owner});`);}
        if(n.disabledExpr!==undefined){const literal=disabledLiteral(n.disabledExpr);lines.push(literal!==undefined?`${indent}${runtime.setDisabled}(${unique},${literal});`:`${indent}${runtime.disabledBinding}(${unique},()=>(${fragment(n.disabledExpr,locals)}),${owner});`);}
        if(hotTextField)lines.push(`${indent}${unique}.setAttribute('data-elnor-hot-field',${JSON.stringify(n.binding)});`);
        if(n.errorExpr!==undefined)lines.push(`${indent}${runtime.fieldErrorBinding}(${parent},${unique},()=>(${fragment(n.errorExpr,locals)}),${owner});`);
        continue;
      }
      if(n.kind==='button'&&(n.submit||n.reset)){
        const literal=isPrimitiveCaption(n.label);lines.push(`${indent}const ${unique} = ${literal?runtime.literalText:runtime.text}(${parent},'button',${literal?'':'()=>'}(${literal?n.label:fragment(n.label,locals)})${literal?'':','+owner});`);lines.push(`${indent}${unique}.type = '${n.reset?'reset':'submit'}';`);
        if(n.classExpr!==undefined){const value=classLiteral(n.classExpr);lines.push(value!==undefined?`${indent}${runtime.setClass}(${unique},${JSON.stringify(value)});`:`${indent}${runtime.classBinding}(${unique},()=>(${fragment(n.classExpr,locals)}),${owner});`);}
        if(n.disabledExpr!==undefined){const value=disabledLiteral(n.disabledExpr);lines.push(value!==undefined?`${indent}${runtime.setDisabled}(${unique},${value});`:`${indent}${runtime.disabledBinding}(${unique},()=>(${fragment(n.disabledExpr,locals)}),${owner});`);}continue;
      }
      if(n.kind==='button'){
        const literal=isPrimitiveCaption(n.label);
        lines.push(`${indent}${n.classExpr!==undefined||n.disabledExpr!==undefined||n.ariaPressedExpr!==undefined||n.ariaCurrentExpr!==undefined?'const '+unique+' = ':''}${literal?runtime.literalButton:runtime.button}(${parent},${literal?'':'()=>'}(${literal?n.label:fragment(n.label,locals)}),()=>{${fragment(n.expr,locals)};},${owner});`);if(n.classExpr!==undefined){const literalClass=classLiteral(n.classExpr);lines.push(literalClass!==undefined?`${indent}${runtime.setClass}(${unique},${JSON.stringify(literalClass)});`:`${indent}${runtime.classBinding}(${unique},()=>(${fragment(n.classExpr,locals)}),${owner});`);}if(n.disabledExpr!==undefined){const literal=disabledLiteral(n.disabledExpr);lines.push(literal!==undefined?`${indent}${runtime.setDisabled}(${unique},${literal});`:`${indent}${runtime.disabledBinding}(${unique},()=>(${fragment(n.disabledExpr,locals)}),${owner});`);}for(const [key,name] of [['ariaPressed','aria-pressed'],['ariaCurrent','aria-current']])if(n[key+'Expr']!==undefined){const literal=disabledLiteral(n[key+'Expr']);lines.push(literal!==undefined?`${indent}${runtime.setAriaBoolean}(${unique},${JSON.stringify(name)},${literal});`:`${indent}${runtime.ariaBooleanBinding}(${unique},${JSON.stringify(name)},()=>(${fragment(n[key+'Expr'],locals)}),${owner});`);}continue;
      }
      if(n.kind==='if'){
        const p=fresh(`parent${index}`),s=fresh(`owner${index}`);
        lines.push(`${indent}${runtime.when}(${parent},()=>(${fragment(n.expr,locals)}),(${p},${s})=>{`);
        emit(n.children,p,s,locals,indent+'  ');
        lines.push(`${indent}},${owner});`);continue;
      }
      if(n.kind==='each'){
        const p=fresh(`parent${index}`),s=fresh(`owner${index}`),item=fresh(`item${index}`),keyItem=fresh(`keyItem${index}`);
        const itemLocal=new Map(locals);itemLocal.set(n.variable,`${item}.value`);
        const keyLocal=new Map(locals);keyLocal.set(n.variable,keyItem);
        const detached=hasDetachedRoot(n.children)||(n.children.length===1&&n.children[0].kind==='component'&&detachedChildren.has(n.children[0].name));
        const identity=hotLists?.get(n);
        const listState=identity===undefined?undefined:fresh('hotListState');
        if(listState)lines.push(`${indent}const ${listState} = ${rows}?.get(${JSON.stringify(identity)});`);
        lines.push(`${indent}${runtime.repeat}(${parent},()=>(${fragment(n.collection,locals)}),(${keyItem})=>(${fragment(n.key,keyLocal)}),(${item},${p},${s})=>{`);
        let rowKey;
        if(listState){
          rowKey=fresh('hotKey');
          lines.push(`${indent}  const ${rowKey} = ${listState} && ${runtime.runRegionUntracked}(() => (${fragment(n.key,itemLocal)}));`);
        }
        emit(n.children,p,s,itemLocal,indent+'  ',false,detached,listState?{key:rowKey,list:listState}:undefined);
        lines.push(`${indent}},${owner},${exclusive&&nodes.length===1},${detached});`);continue;
      }
      if(n.kind==='slot'){
        lines.push(`${indent}${runtime.renderSlot}(${parent},${helpers.slots}[${JSON.stringify(n.name)}],${owner});`);continue;
      }
      if(n.kind==='component'){
        const handlers=n.children.filter(x=>x.kind==='on');
        const fills=n.children.filter(x=>x.kind==='fill');
        const content=n.children.filter(x=>x.kind!=='on'&&x.kind!=='fill');
        const propEntries=n.props.map(p=>`${JSON.stringify(p.name)}: ()=>(${fragment(p.expr,locals)})`).join(',');
        const handlerEntries=handlers.map(h=>{
          const sub=new Map(locals);if(h.param)sub.set(h.param,h.param);
          return `${JSON.stringify(h.name)}: (${h.param??''})=>{${fragment(h.expr,sub)};}`;
        }).join(',');
        let child=children.get(n.name);
        if(hotRow){
          const {key,list}=hotRow;
          const original=child;
          child=fresh('hotRowRenderer');
          lines.push(`${indent}const ${child} = !${list} ? ${original} : (...${args}) => {`,
            `${indent}  const previous = ${list}.seeds.get(${key});`,
            `${indent}  ${list}.seeds.delete(${key});`,
            `${indent}  return ${original}(...${args},previous,read => {`,
            `${indent}    ${list}.active.set(${key},read);`,
            `${indent}    ${owner}.own(() => { ${list}.active.delete(${key}); });`,
            `${indent}  });`,
            `${indent}};`);
        }
        lines.push(returnRoot?`${indent}return ${runtime.createComponentRoot}(${child},{${propEntries}},{${handlerEntries}},{`:
          `${indent}${runtime.renderComponent}(${parent},${child},{${propEntries}},{${handlerEntries}},{`);
        if(content.length){
          const slotParent=fresh('slotParent'),slotOwner=fresh('slotOwner');
          lines.push(`${indent}  default: (${slotParent},${slotOwner})=>{`);
          emit(content,slotParent,slotOwner,locals,indent+'    ');
          lines.push(`${indent}  },`);
        }
        for(const f of fills){
          const slotParent=fresh('slotParent'),slotOwner=fresh('slotOwner');
          lines.push(`${indent}  ${JSON.stringify(f.name)}: (${slotParent},${slotOwner})=>{`);
          emit(f.children,slotParent,slotOwner,locals,indent+'    ');
          lines.push(`${indent}  },`);
        }
        lines.push(`${indent}},${owner});`);continue;
      }
      throw Error('ELN-CODEGEN: unsupported node: '+n.kind);
    }
  }
  emit(ir.ui,helpers.root,helpers.scope,new Map(),'    ',false,hasDetachedRoot(ir.ui));
  lines.push('}',`export {${mount} as mount,${render} as renderOwned};`,'');
  if(hot&&!hotChild){
    // This extra entry exists only in opt-in development builds.
    const hotMount=fresh('hotMount'),snapshot=fresh('hotSnapshot'),dispose=fresh('hotDispose');
    const previousRows=rows?fresh('hotPreviousRows'):null;
    lines.push(`function ${hotMount}(${helpers.target},${helpers.props},${seed}) {`,
      `  let ${snapshot};`,
      ...(rows?[`  const ${previousRows} = new Map(${seed}?.rows);`,
        `  const ${rows} = new Map(${JSON.stringify([...hotLists.values()])}.map(name => [name,{seeds: new Map(${previousRows}.get(name)),active: new Map()}]));`]:[]),
      `  const ${dispose} = ${runtime.mountBoundary}(${helpers.target}, (${helpers.root},${helpers.scope}) => ${render}(${helpers.root},${helpers.props},{},{},${helpers.scope},${seed}?.state,read => { ${snapshot} = read; }${rows?','+rows:''}));`,
      ...(rows?[`  ${previousRows}.clear();`,`  for (const list of ${rows}.values()) list.seeds.clear();`]:[]),
      `  ${seed} = undefined;`,
      `  return {snapshot: () => ({state: ${snapshot}(), rows: ${rows?`Array.from(${rows}, ([name,list]) => [name,Array.from(list.active, ([key,read]) => [key,read()])])`:'[]'}}), dispose: ${dispose}};`,
      '}',`export {${hotMount} as mountHot};`);
  }
  return ts.transpileModule(lines.join('\n'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,strict:true}}).outputText;
}
export function generate(ir,options={}){
 const legacy=generateLegacy(ir,options);let context;
 if(options.hot||ir.actionGroups.length)return legacy;
 const lowerOpaque=(code,locals=[],indexed=[],action=null)=>{
  const ctx=action?.context??(context??=nameAllocator(ir.source+legacy)('regionContext'));
  const read=slot=>()=>ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier(ctx),'read'),undefined,[ts.factory.createNumericLiteral(slot)]);
  const indexedReads=new Map(indexed.map(([name,slot])=>[name,read(slot)]));
  const rewritten=rewrite(ir,code,new Map([...locals.map(([name,slot])=>[name,read(slot)]),...(action?.parameters??[]).map(([name,index])=>[name,()=>ts.factory.createElementAccessExpression(ts.factory.createIdentifier(action.args),ts.factory.createNumericLiteral(index))])]),'expression',{props:ctx+'.props',state:ctx+'.state',calc:ctx+'.calc',emit:ctx+'.emit',indexedReads}),js=ts.transpileModule('('+rewritten+');',{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,sf=ts.createSourceFile('opaque.js',js,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  if(sf.statements.length!==1||!ts.isExpressionStatement(sf.statements[0]))throw Error('ELN-REGION: opaque expression lowering failed');return {param:ctx,read:sf.statements[0].expression.getText(sf)};
 };
 // A general action keeps its body and runs against the instance handle of
 // the region runtime. States and calcs become accessors of that handle, other
 // actions become its stable references and root props come from it, so reads,
 // writes, calls and closures behave as in the general renderer, also after the
 // instance closes or unmounts.
 const lowerOpaqueAction=(action,{instance,table})=>{
  const fresh=nameAllocator(ir.source+action.params+action.body),ctx=fresh('regionAction'),handle=fresh('actionInstance'),props=fresh('regionProps');
  const named=([name])=>(action.params+action.body).includes(name);
  const slots=[...action.states,...action.calcs].filter(named).map(([name,slot])=>[name,slot,fresh(`state_${name}`)]);
  const calls=action.calls.filter(named).map(([name,index])=>[name,index,fresh(`action_${name}`)]);
  const usesProps=action.props.some(name=>named([name]));
  const locals=new Map([
   ...action.props.map(name=>[name,`${props}.${name}`]),
   ...slots.map(([name,,cell])=>[name,`${cell}.value`]),
   ...calls.map(([name,,reference])=>[name,reference]),
  ]);
  const cells=[`const ${handle} = ${instance}(${ctx}, ${action.instance.slot}, ${action.instance.group});`,
   ...(usesProps?[`const ${props} = ${handle}.props;`]:[]),
   ...slots.map(([,slot,cell])=>`const ${cell} = ${handle}.cell(${slot});`),
   ...calls.map(([,index,reference])=>`const ${reference} = ${handle}.action(${table}, ${index});`)];
  const code=`${action.async?'async ':''}(${[ctx,...(action.params?[action.params]:[])].join(', ')}) => {\n${cells.join('\n')}\n${action.body.slice(1,-1)}\n}`;
  const rewritten=rewrite({params:[],states:[],calcs:[]},code,locals,'expression',{emit:`${handle}.emit`});
  const js=ts.transpileModule('('+rewritten+');',{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,sf=ts.createSourceFile('action.js',js,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  if(sf.statements.length!==1||!ts.isExpressionStatement(sf.statements[0]))throw Error('ELN-REGION: general action lowering failed');
  return sf.statements[0].expression.getText(sf);
 };
 const mounted=attachRegion(ir,legacy,{...options,lowerOpaque,lowerOpaqueAction});return options.ownedRegionPlan?attachRegion(ir,mounted,{...options,lowerOpaque,lowerOpaqueAction,regionPlan:options.ownedRegionPlan,ownedExport:true}):mounted;
}
function scalarHotContract(ir,collections){
  if(ir.actions.some(action=>action.async))return undefined;
  for(const state of ir.states){
    const source=ts.createSourceFile('state.ts',`(${state.expr});`,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
    const value=source.statements[0].expression.expression;
    if(collections?.has(state.name)&&ts.isArrayLiteralExpression(value))continue;
    if(!ts.isStringLiteral(value)&&!ts.isNumericLiteral(value)&&value.kind!==ts.SyntaxKind.TrueKeyword&&value.kind!==ts.SyntaxKind.FalseKeyword)return undefined;
  }
  return componentHotContract(ir);
}

function hotExperiment(ir,plan,sources){
  if(plan.mode!=='blueprint'||!ir.states.length)return undefined;
  if(!plan.lists.length&&ir.imports.length===0){
    const root=scalarHotContract(ir);
    return root?{contract:hotContract([root])}:undefined;
  }
  if(!plan.lists.length||plan.branches.length||plan.instances.length!==plan.lists.length+1)return undefined;
  const lists=[];
  function collectLists(nodes){
    for(const node of nodes){
      if(node.kind==='each')lists.push(node);
      else if(node.children)collectLists(node.children);
    }
  }
  collectLists(ir.ui);
  if(lists.length!==plan.lists.length)return undefined;
  const collections=new Set(),hotLists=new Map(),childKeys=new Set(),usedImports=new Set(),owners=[];
  for(const list of lists){
    const [row]=list.children;
    if(list.children.length!==1||row.kind!=='component')return undefined;
    const dependency=ir.imports.find(imp=>imp.local===row.name&&!imp.typeOnly&&imp.path.endsWith('.eln'));
    if(!dependency)return undefined;
    const keyParts=list.key.split('.');
    if(keyParts[0]!==list.variable||keyParts.length>2||!keyParts.every(part=>/^[A-Za-z_]\w*$/.test(part)))return undefined;
    if(collections.has(list.collection)||!ir.states.some(state=>state.name===list.collection))return undefined;
    const childKey=sourceKey(sourceImport(ir.filename,dependency.path)),child=sources.get(childKey);
    if(!child||child.imports.length)return undefined;
    const leaf=scalarHotContract(child);
    if(!leaf)return undefined;
    const name=list.collection;
    collections.add(name);
    hotLists.set(list,name);
    childKeys.add(childKey);
    usedImports.add(dependency);
    owners.push({name,placement:[name,list.variable,list.key,row.name,row.props.map(p=>[p.name,p.expr])],leaf});
  }
  if(usedImports.size!==ir.imports.length)return undefined;
  const root=scalarHotContract(ir,collections);
  if(!root)return undefined;
  // Layout order may change without changing which collection owns each row.
  owners.sort((left,right)=>left.name<right.name?-1:left.name>right.name?1:0);
  return {contract:hotContract([root,...owners.map(owner=>owner.leaf)],owners.map(owner=>owner.placement)),hotLists,childKeys};
}
// regionBackend: false compiles every component with the general renderer,
// the reference that region behavior is compared against.
function prepareGraph(graph,{hotEntry,regionBackend=true}={}){
  const planner=createModulePlanner(),files=new Map(),records=surfaceRecords(graph),components=surfaceOutputs(records);
  const outputs=new Map(components.map(component=>[sourceKey(component.source),component]));
  const sources=new Map(records.map(ir=>[sourceKey(ir.filename),ir]));
  const regionPlans=new Map(records.map(ir=>[sourceKey(ir.filename),regionBackend?analyzeRegion(ir,{components:sources}):{eligible:false,failures:['region-backend-disabled']}])),ownedPlans=new Map(),required=new Set();
  const requireChildren=plan=>{for(const c of plan.components??[]){const key=sourceKey(c.source);if(required.has(key))continue;required.add(key);const child=analyzeSequentialRegion(sources.get(key),{components:sources});if(!child.eligible)throw Error('ELN-REGION: owned child proof missing');ownedPlans.set(key,child);requireChildren(child);}};for(const plan of regionPlans.values())if(plan.eligible&&plan.mode==='sequential')requireChildren(plan);
  function planImports(ir){
    const moduleImports=new Map(),paths=runtimeModulePaths(projectSurface(ir.source,ir.filename));
    for(const imp of ir.imports.filter(imp=>!imp.path.endsWith('.eln')&&paths.has(imp.path))){
      const result=planner.include(imp.path,ir.filename);
      if(result.errors.length)throw Object.assign(new Error(result.errors.map(error=>`${error.code}: ${error.message}`).join('\n')),{diagnostics:result.errors});
      moduleImports.set(imp.path,result.path);
    }
    return moduleImports;
  }
  const planned=hotEntry?new Map(records.map(ir=>[ir,planImports(ir)])):undefined;
  const sharedModules=planned?planner.files():undefined;
  const moduleRevision=sharedModules?.size?moduleGraphRevision(
    [...sharedModules].map(([file,code])=>[file,createHash('sha256').update(code).digest('hex')])):undefined;
  const renderModuleProofs=moduleRevision?[...sharedModules].map(([file,code])=>({file,...proveRenderModule(code)})):undefined;
  const hotRoot=hotEntry? sources.get(hotEntry):undefined;
  const derived=hotRoot&&moduleRevision?proveDerivedListReplacement(hotRoot,sources,planned.get(hotRoot),renderModuleProofs):undefined;
  const experiment=derived?{contract:derived}
    :hotRoot?hotExperiment(hotRoot,regionPlans.get(hotEntry),sources):undefined;
  let regionUsed=false;
  for(const ir of records){
    const key=sourceKey(ir.filename),filename=outputs.get(key).file;
    const moduleImports=planned?.get(ir)??planImports(ir);
    for(const [specifier,target] of moduleImports){
      moduleImports.set(specifier,moduleRevision?sharedModuleUrl(moduleRevision,target.slice(2)):moduleSpecifier(filename,target));
    }
    const componentImports=new Map(),detachedImports=new Set();
    for(const imp of ir.imports.filter(imp=>imp.path.endsWith('.eln')&&!imp.typeOnly)){
      const target=outputs.get(sourceKey(sourceImport(ir.filename,imp.path)));
      if(!target)throw Error(`ELN-SURFACE-GRAPH: Missing component '${imp.path}' in the emission graph`);
      componentImports.set(imp.path,moduleSpecifier(filename,target.file));
      if(hasDetachedRoot(sources.get(sourceKey(target.source)).ui))detachedImports.add(imp.path);
    }
    const regionPlan=regionPlans.get(key);
    const isEntry=hotEntry===key,hotChild=experiment?.childKeys?.has(key);
    const hot=Boolean(experiment&&(isEntry||hotChild));
    regionUsed ||= regionPlan.eligible&&!hot;
    files.set(filename,generate(ir,{moduleImports,componentImports,detachedImports,regionPlan,hot,hotChild,hotLists:isEntry?experiment?.hotLists:undefined,ownedRegionPlan:ownedPlans.get(key),regionRuntimeImport:moduleSpecifier(filename,'region-runtime.mjs'),runtimeImport:moduleSpecifier(filename,'runtime.mjs')}));
  }
  for(const [filename,code] of sharedModules??planner.files())files.set(filename,code);
  files.set('runtime.mjs',fs.readFileSync(path.join(ROOT,'src/runtime.mjs'),'utf8'));
  let regionRuntime=null;
  if(regionUsed){
    const plans=[...regionPlans.values(),...ownedPlans.values()].filter(p=>p.eligible),features={forms:plans.some(p=>p.events.some(e=>e.type==='submit')),select:plans.some(p=>p.bindings.some(b=>b.kind==='select')),checked:plans.some(p=>p.bindings.some(b=>b.kind==='checked')),aria:plans.some(p=>p.bindings.some(b=>b.kind==='ariaBoolean')||p.nodes.some(n=>n.ariaBooleans)),disabled:plans.some(p=>p.bindings.some(b=>b.kind==='disabled')||p.nodes.some(n=>n.disabled!==undefined)),classes:plans.some(p=>p.bindings.some(b=>b.kind==='class')||p.nodes.some(n=>n.tag==='input'&&n.className)),lists:plans.some(p=>p.lists.length>0),components:plans.some(p=>p.components.length>0),blueprint:plans.some(p=>p.mode!=='sequential'),emits:plans.some(p=>p.emitNames?.length||(p.components??[]).some(c=>c.handlers?.length))};
    const source=fs.readFileSync(path.join(ROOT,'src/region-runtime.mjs'),'utf8'),marker='const runtimeLists=true,runtimeComponents=true,runtimeBlueprint=true,runtimeEmits=true,runtimeClasses=true,runtimeDisabled=true,runtimeAria=true,runtimeChecked=true,runtimeSelect=true,runtimeForms=true;';
    if(source.split(marker).length!==2)throw Error('ELN-REGION: runtime capability marker missing');
    const selected=source.replace(marker,`const runtimeLists=${features.lists},runtimeComponents=${features.components},runtimeBlueprint=${features.blueprint},runtimeEmits=${features.emits},runtimeClasses=${features.classes},runtimeDisabled=${features.disabled},runtimeAria=${features.aria},runtimeChecked=${features.checked},runtimeSelect=${features.select},runtimeForms=${features.forms};`),hash=text=>createHash('sha256').update(text).digest('hex');
    const {sf,checker}=bindSource(selected),values=new Map([['runtimeLists',features.lists],['runtimeComponents',features.components],['runtimeBlueprint',features.blueprint],['runtimeEmits',features.emits],['runtimeClasses',features.classes],['runtimeDisabled',features.disabled],['runtimeAria',features.aria],['runtimeChecked',features.checked],['runtimeSelect',features.select],['runtimeForms',features.forms]]),replacements=new Map();let declaration;
    for(const statement of sf.statements)if(ts.isVariableStatement(statement))for(const item of statement.declarationList.declarations)if(ts.isIdentifier(item.name)&&values.has(item.name.text)){
      if(declaration&&declaration!==statement)throw Error('ELN-REGION: capability declarations must share one statement');declaration=statement;const enabled=values.get(item.name.text);replacements.set(checker.getSymbolAtLocation(item.name),()=>enabled?ts.factory.createTrue():ts.factory.createFalse());
    }
    if(replacements.size!==values.size||replacements.has(undefined))throw Error('ELN-REGION: capability symbols missing');
    const transformed=ts.transform(sf,[context=>root=>ts.factory.updateSourceFile(root,root.statements.map(statement=>statement===declaration?statement:toContext(statement,context,checker,replacements)))]);
    const prunedHelpers=[];
    const pruned=ts.transform(transformed.transformed[0],[context=>root=>{
      const visit=node=>{
        const tag=ts.getJSDocTags(ts.getOriginalNode(node)).find(t=>t.tagName.text==='elnorCapability');
        if(tag){const capability=tag.comment;if(!ts.isFunctionDeclaration(node)||!node.name||typeof capability!=='string'||!Object.hasOwn(features,capability))throw Error('ELN-REGION: invalid helper capability annotation');
          if(!features[capability]){prunedHelpers.push(node.name.text);return undefined;}
        }
        return ts.visitEachChild(node,visit,context);
      };return ts.visitNode(root,visit);
    }]);
    const specialized=ts.createPrinter().printFile(pruned.transformed[0]);pruned.dispose();transformed.dispose();
    files.set('region-runtime.mjs',specialized);regionRuntime={features,prunedHelpers,sha256:hash(specialized),baseSha256:hash(source)};
  }
  for(const component of components)if(component.alias)files.set(component.alias,`export {mount} from ${JSON.stringify('./'+component.file)};\n`);
  return {files,components,regionRuntime,moduleRevision,renderModuleProofs,hotContract:experiment?.contract};
}
function writeGraph(prepared,outputDir){
  for(const [filename,code] of prepared.files){
    const target=path.join(outputDir,filename);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,code);
  }
  return {files:[...prepared.files.keys()],components:prepared.components,...(prepared.regionRuntime?{regionRuntime:prepared.regionRuntime}:{}),...(prepared.hotContract?{hotContract:prepared.hotContract}:{}),...(prepared.moduleRevision?{moduleRevision:prepared.moduleRevision,renderModuleProofs:prepared.renderModuleProofs}:{})};
}
// Emission is separate from type checking, like generate. Callers check the
// graph first; all module planning finishes before any output file is written.
export function emitGraph(graph,outputDir,options){return writeGraph(prepareGraph(graph,options),path.resolve(outputDir));}
export function graphFor(entry){
  const graph=new Map(),seen=new Set();
  function visit(file){
    file=sourcePath(file);
    if(seen.has(sourceKey(file)))return;seen.add(sourceKey(file));
    if(!fs.existsSync(file))throw Error(`ELN-IMPORT: file does not exist ${file}`);
    const ir=parseSurface(fs.readFileSync(file,'utf8'),file);
    graph.set(file,ir);
    for(const imp of ir.imports.filter(i=>i.path.endsWith('.eln'))){visit(sourceImport(file,imp.path));}
  }
  visit(path.join(EXAMPLES,entry+'.eln'));
  return graph;
}
export function check(entry='UserEditor'){
  const graph=graphFor(entry);
  return {graph,diagnostics:typecheckGraph(graph,path.join(ROOT,'.elnor','check'))};
}
export function build(entry='UserEditor'){
  const {graph,diagnostics}=check(entry);
  if(diagnostics.length)throw Object.assign(new Error(diagnostics.map(d=>`${d.code} ${path.basename(d.file)}:${d.line}: ${d.message}`).join('\n')),{diagnostics});
  const prepared=prepareGraph(graph);
  const entrySource=path.resolve(EXAMPLES,entry+'.eln');
  const entryComponent=prepared.components.find(component=>sourceKey(component.source)===sourceKey(entrySource));
  if(!entryComponent)throw Error('ELN-PREVIEW-ENTRY: Entry source is not in the emission graph');
  fs.rmSync(DIST,{recursive:true,force:true});fs.mkdirSync(DIST,{recursive:true});
  const output=writeGraph(prepared,DIST);
  fs.copyFileSync(path.join(ROOT,'examples/style.css'),path.join(DIST,'style.css'));
  fs.copyFileSync(path.join(ROOT,'examples/preview-fixtures.mjs'),path.join(DIST,'preview-fixtures.mjs'));
  fs.writeFileSync(path.join(DIST,'entry.mjs'),makePreviewScript(entry,entryComponent.file));
  fs.writeFileSync(path.join(DIST,'index.html'),`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Elnor Studio: ${entry}</title><link rel="stylesheet" href="/style.css"></head><body><header><strong>Elnor Studio Ãƒâ€šÃ‚Â· ${entry}</strong><small>Preview aislada Ãƒâ€šÃ‚Â· mocks locales Ãƒâ€šÃ‚Â· ninguna API real</small></header><main id="app"></main><p id="result" role="status"></p><script type="module" src="/entry.mjs"></script></body></html>`);
  const irs=new Map(surfaceRecords(graph).map(ir=>[sourceKey(ir.filename),ir]));
  fs.writeFileSync(path.join(DIST,'manifest.json'),JSON.stringify({entry,entrySource:path.relative(EXAMPLES,entrySource).replaceAll('\\','/'),entryOutput:entryComponent.file,
    components:prepared.components.map(component=>{
      const ir=irs.get(sourceKey(component.source));
      return {...component,source:path.relative(EXAMPLES,component.source).replaceAll('\\','/'),props:ir.params.map(p=>p.name),events:ir.events.map(e=>e.name),slots:ir.slots};
    }),mode:'isolated',network:'none',css:'external',script:'external'},null,2));
  return {entry,graph,dist:DIST,...output,entryOutput:entryComponent.file};
}
export function makePreviewScript(entry,componentFile){
  if(typeof componentFile!=='string')throw Error('ELN-PREVIEW-ENTRY: A mapped output module is required');
  // Fixtures are deliberately STATIC JS maintained by the developer, never evaluated from untrusted input.
  return `import {mount} from ${JSON.stringify('./'+componentFile)};\nimport {preview} from './preview-fixtures.mjs';\nconst target=document.getElementById('app');\nconst status=document.getElementById('result');\nconst fixture=preview[${JSON.stringify(entry)}];\nif(!fixture)throw Error('No fixture available for '+${JSON.stringify(entry)});\nmount(target,fixture.props,fixture.events(status));\n`;
}
