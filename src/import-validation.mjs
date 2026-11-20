import {getTs} from './typescript.mjs';
import {createModulePlanner,retainedModuleSource,moduleEdges} from './module-plan.mjs';

const ts=getTs();

// Use TypeScript's configured default import elision to distinguish executable
// imports from imports used only in types. Transpilation never loads user code.
export function runtimeModulePaths(projection){
  const emitted=retainedModuleSource(projection.map.source);
  const sf=ts.createSourceFile('imports.mjs',emitted,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  return new Set(moduleEdges(sf).map(node=>node.moduleSpecifier.text));
}
export function validateImports(ir,projection,report,{sf:bound,checker,moduleHost}){
  const runtimePaths=runtimeModulePaths(projection),planner=createModulePlanner(moduleHost);
  for(const imp of ir.imports){
    if(imp.path.endsWith('.eln')){
      if(!imp.defaultOnly)report('ELN-IMPORT-FORM',
        'This spike implements only a single default import from a Surface component',imp.pathSpan);
    }else if(runtimePaths.has(imp.path)){
      for(const error of planner.include(imp.path,ir.filename).errors)
        report(error.code,`${error.message} (${error.file}:${error.line})`,imp.pathSpan);
    }
  }
  const typeComponents=new Set(ir.imports.filter(imp=>imp.typeOnly&&imp.path.endsWith('.eln')).map(imp=>imp.local));
  const tags=new Set();
  function walk(nodes){
    for(const node of nodes){
      if(node.kind==='component')tags.add(node.nameSpan.start);
      if(node.kind==='component'&&typeComponents.has(node.name))report('ELN-IMPORT-TYPE',
        `Cannot render type-only component import '${node.name}'`,node.nameSpan);
      if(node.children)walk(node.children);
    }
  }
  walk(ir.ui);
  const surfaceSymbols=new Map();
  for(const statement of bound.statements.filter(ts.isImportDeclaration)){
    const name=statement.importClause?.name;
    if(!name)continue;
    const imp=ir.imports.find(imp=>imp.local===name.text&&imp.path.endsWith('.eln'));
    if(imp)surfaceSymbols.set(checker.getSymbolAtLocation(name),imp);
  }
  function use(node,symbol){
    const imp=surfaceSymbols.get(symbol);
    if(!imp)return;
    const span=projection.map.toOriginal(node.getStart(bound),node.getWidth(bound));
    if(!span||tags.has(span.start))return;
    report(imp.typeOnly?'ELN-IMPORT-TYPE':'ELN-IMPORT-USAGE',imp.typeOnly
      ? `Cannot use type-only component import '${imp.local}' as a value`
      : 'Surface imports can only be used as component tags in this spike',span);
  }
  function references(node){
    if(ts.isImportDeclaration(node)||ts.isTypeNode(node))return;
    if((ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)||
       (ts.isMetaProperty(node)&&node.keywordToken===ts.SyntaxKind.ImportKeyword)){
      const span=projection.map.toOriginal(node.getStart(bound),node.getWidth(bound));
      if(span)report(ts.isCallExpression(node)?'ELN-MODULE-DYNAMIC':'ELN-MODULE-META',
        ts.isCallExpression(node)?'Dynamic import is outside the local ESM packaging experiment':'import.meta and relative assets need a separate output contract',span);
    }
    if(ts.isShorthandPropertyAssignment(node))use(node.name,checker.getShorthandAssignmentValueSymbol(node));
    else if(ts.isIdentifier(node))use(node,checker.getSymbolAtLocation(node));
    ts.forEachChild(node,references);
  }
  references(bound);
}
