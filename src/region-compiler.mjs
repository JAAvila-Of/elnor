import {sourceKey,sourceImport} from './source-identity.mjs';
import {getTs} from './typescript.mjs';
const ts=getTs(),parse=code=>{const sf=ts.createSourceFile('region.ts',`(${code});`,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);if(sf.parseDiagnostics.length||sf.statements.length!==1||!ts.isExpressionStatement(sf.statements[0]))return null;let n=sf.statements[0].expression;while(ts.isParenthesizedExpression(n))n=n.expression;return n;};
const binary=new Map([[ts.SyntaxKind.PlusToken,'+'],[ts.SyntaxKind.MinusToken,'-'],[ts.SyntaxKind.AsteriskToken,'*'],[ts.SyntaxKind.SlashToken,'/'],[ts.SyntaxKind.PercentToken,'%'],[ts.SyntaxKind.EqualsEqualsEqualsToken,'==='],[ts.SyntaxKind.ExclamationEqualsEqualsToken,'!=='],[ts.SyntaxKind.LessThanToken,'<'],[ts.SyntaxKind.GreaterThanToken,'>'],[ts.SyntaxKind.AmpersandAmpersandToken,'&&'],[ts.SyntaxKind.BarBarToken,'||'],[ts.SyntaxKind.QuestionQuestionToken,'??']]);
function primitive(n){return n&&(ts.isStringLiteral(n)||ts.isNumericLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(n.kind));}
function analyzeVariant(ir,{components=new Map(),sequential=false,allowClosedSequential=false,primitiveProps=false,ancestry=new Set(),sequentialCache=new Map()}={}){
 const reject=reason=>{throw reason;},nodes=[],bindings=[],events=[],actions=[],disposals=[],actionParameters=[],actionContexts=[],actionDefaults=[],states=[],derived=[],branches=[],lists=[],composed=[],ops=[],groups=[{parent:null}],tasks=[],observed=[],instances=[],stack=new Set(ancestry);let group=0,opaqueCount=0;
 function closedArray(n){
  if(!n||!ts.isArrayLiteralExpression(n))reject('collection-provenance-not-closed');let shape=null;
  const scalar=v=>primitive(v)||(ts.isPrefixUnaryExpression(v)&&[ts.SyntaxKind.PlusToken,ts.SyntaxKind.MinusToken,ts.SyntaxKind.ExclamationToken,ts.SyntaxKind.TildeToken].includes(v.operator)&&scalar(v.operand));
  for(const item of n.elements){let fields=null;
   if(ts.isObjectLiteralExpression(item)){fields=[];for(const p of item.properties){if(!ts.isPropertyAssignment(p)||!p.name||(!ts.isIdentifier(p.name)&&!ts.isStringLiteral(p.name))||p.name.text==='__proto__'||fields.includes(p.name.text)||!scalar(p.initializer))reject('record-provenance-not-closed');fields.push(p.name.text);}fields.sort();}
   else if(!scalar(item))reject('collection-item-not-closed');
   const key=JSON.stringify(fields);if(shape!==null&&shape!==key)reject('heterogeneous-collection-not-proven');shape=key;
  }return shape;
 }
 const task=data=>{tasks.push({...data,group});return tasks.length-1;};
 const masksFor=deps=>{const masks=new Map();for(const slot of deps){observed[slot]=true;const word=slot>>>5;masks.set(word,((masks.get(word)??0)|(1<<(slot&31)))>>>0);}return [...masks];};
 const add=node=>{nodes.push({...node,group});const id=nodes.length-1;ops.push({kind:'node',node:id});return id;},text=(parent,value)=>add({parent,kind:'text',value});
 try{
  if(ir.params.length&&!sequential)reject('external-root-props');
  function component(own,parent,props=new Map(),parentInstance=null){
   if(own.actionGroups.length)reject('action-group-runtime');
   if(own.disposal&&!sequential)reject('component-disposal-not-proven');
   const key=sourceKey(own.filename);if(stack.has(key))reject('recursive-component-graph');if(stack.size>=64||instances.length>=512)reject('composition-expansion-budget');stack.add(key);
   if((!sequential&&own.events.length)||own.slots.length||(!sequential&&own.imports.some(i=>!i.typeOnly&&!i.path.endsWith('.eln'))))reject('component-boundary-not-proven');
   if(own.params.some(p=>!props.has(p.name)))reject('unproven-child-prop');
   const header=ts.createSourceFile('header.ts',own.header,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);if(header.statements.some(n=>!ts.isImportDeclaration(n)&&!ts.isInterfaceDeclaration(n)&&!ts.isTypeAliasDeclaration(n)))reject('runtime-header-not-proven');
   const instance=instances.length,slots=new Map(),calcSlots=new Map(),stateSlots=[],arrayStates=new Map(),locals=new Map();let dynamic=false;
   for(const s of own.states)if(ts.isArrayLiteralExpression(parse(s.expr))){let shape,closed=true;const inspect=node=>{try{return closedArray(node);}catch(reason){if(!sequential||typeof reason!=="string")throw reason;closed=false;return null;}};shape=inspect(parse(s.expr));
    for(const a of own.actions){const sf=ts.createSourceFile('array-action.ts',a.functionSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);function scan(n){if(ts.isBinaryExpression(n)&&ts.isIdentifier(n.left)&&n.left.text===s.name&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken){const next=inspect(n.right);if(next!==null){if(shape!==null&&next!==shape){if(!sequential)reject('collection-shape-change-not-proven');closed=false;}shape=next;}}ts.forEachChild(n,scan);}scan(sf);}
    if(closed)arrayStates.set(s.name,shape??'null');
   }
   instances.push({id:instance,file:own.filename,parent:parentInstance,props:[...props].map(([name,p])=>({name,code:p.code,dependencies:[...p.dependencies]})),stateSlots});
   for(const s of own.states){const slot=states.length;slots.set(s.name,slot);stateSlots.push(slot);states.push({name:s.name,initial:null,span:s.exprSpan,instance,group});observed.push(false);}
   for(const s of own.calcs){const slot=states.length;calcSlots.set(s.name,slot);states.push({name:s.name,kind:'calc',initial:null,span:s.exprSpan,instance,group});observed.push(false);}
   let parameters=new Map(),actionContext="r",argumentContext="a",forceOpaque=false;
   function expression(n,deps=new Set()){
    if(!n)reject('invalid-expression');if(ts.isParenthesizedExpression(n))return expression(n.expression,deps);if(primitive(n))return n.getText();
    if(ts.isIdentifier(n)){
     if(parameters.has(n.text))return `a[${parameters.get(n.text)}]`;
     if(locals.has(n.text)){const local=locals.get(n.text);if(local.open)reject('open-item-read');if(local.fields!==null)reject('record-value-not-primitive');deps.add(local.slot);return `r.read(${local.slot})`;}
     if(arrayStates.has(n.text))reject('collection-used-as-primitive');
     if(slots.has(n.text)){const slot=slots.get(n.text);deps.add(slot);return `r.read(${slot})`;}
     if(calcSlots.has(n.text)){const slot=calcSlots.get(n.text);deps.add(slot);return `r.read(${slot})`;}
     if(props.has(n.text)){const p=props.get(n.text);if(p.opaque)reject('opaque-expression');for(const d of p.dependencies)deps.add(d);if(p.dynamic)dynamic=true;return `(${p.code})`;}
    }
    if(ts.isPropertyAccessExpression(n)&&ts.isIdentifier(n.expression)&&locals.has(n.expression.text)){const local=locals.get(n.expression.text);if(!local.fields?.includes(n.name.text))reject('record-field-not-proven');deps.add(local.slot);return `r.read(${local.slot})[${JSON.stringify(n.name.text)}]`;}
    if(ts.isConditionalExpression(n)){dynamic=true;return `(${expression(n.condition,deps)}?${expression(n.whenTrue,deps)}:${expression(n.whenFalse,deps)})`;}
    if(ts.isBinaryExpression(n)&&binary.has(n.operatorToken.kind)){if(['&&','||','??'].includes(binary.get(n.operatorToken.kind)))dynamic=true;return `(${expression(n.left,deps)} ${binary.get(n.operatorToken.kind)} ${expression(n.right,deps)})`;}
    if(ts.isPrefixUnaryExpression(n)&&[ts.SyntaxKind.PlusToken,ts.SyntaxKind.MinusToken,ts.SyntaxKind.ExclamationToken,ts.SyntaxKind.TildeToken].includes(n.operator))return `(${({[ts.SyntaxKind.PlusToken]:'+', [ts.SyntaxKind.MinusToken]:'-', [ts.SyntaxKind.ExclamationToken]:'!', [ts.SyntaxKind.TildeToken]:'~'})[n.operator]}${expression(n.operand,deps)})`;
    reject('opaque-expression');
   }
   function proof(code){const previous=dynamic;dynamic=false;const deps=new Set();try{const read=expression(parse(code),deps);return {read,deps,dynamic};}finally{dynamic=previous;}}
   for(const s of own.states){const slot=slots.get(s.name);let p;
    try{p=arrayStates.has(s.name)?{read:parse(s.expr).getText(),deps:new Set(),dynamic:false}:proof(s.expr);}catch(reason){if(!sequential||typeof reason!=='string')throw reason;p=opaqueProof(s.expr);}
    if(p.dynamic&&!p.opaque){if(!sequential)reject('initializer-dynamic-dependencies-not-proven');p=opaqueProof(s.expr);}const references=new Set(p.deps);
    if(p.opaque){function scan(n){const parent=n.parent,reference=ts.isIdentifier(n)&&!(ts.isPropertyAccessExpression(parent)&&parent.name===n)&&!(ts.isPropertyAssignment(parent)&&parent.name===n);if(reference){if(slots.has(n.text))references.add(slots.get(n.text));if(calcSlots.has(n.text))references.add(calcSlots.get(n.text));}ts.forEachChild(n,scan);}scan(parse(s.expr));states[slot].initialOpaque=p;}
    if([...references].some(d=>d>=slot))reject('initializer-forward-or-self-reference');states[slot].initial=p.read;states[slot].dependencies=[...p.deps];
   }
   for(const s of own.calcs){
    const slot=calcSlots.get(s.name);let p;
    try{p=proof(s.expr);}catch(reason){if(!sequential||typeof reason!=='string')throw reason;p=opaqueProof(s.expr);}
    if(p.dynamic&&!sequential)reject('derived-dynamic-dependencies-not-proven');
    const references=new Set(p.deps);
    if(p.dynamic){
     function scan(n){const parent=n.parent,reference=ts.isIdentifier(n)&&!(ts.isPropertyAccessExpression(parent)&&parent.name===n)&&!(ts.isPropertyAssignment(parent)&&parent.name===n);
      if(reference){if(props.has(n.text))reject('derived-prop-initialization-not-proven');if(slots.has(n.text))references.add(slots.get(n.text));if(calcSlots.has(n.text))references.add(calcSlots.get(n.text));}ts.forEachChild(n,scan);
     }scan(parse(s.expr));if(!p.opaque)opaqueCount++;
    }
    if([...references].some(d=>d>=slot))reject('derived-forward-or-self-reference');
    states[slot].initial=p.read;const id=task({kind:'calc',index:derived.length,dependencies:[...p.deps],dynamic:!!p.dynamic});
    if(p.dynamic)states[slot].initialTask=id;
    derived.push({slot,read:p.read,opaque:p.opaque,locals:p.locals,masks:masksFor(p.deps)});
   }
   function isEmit(e){return e&&ts.isCallExpression(e)&&ts.isPropertyAccessExpression(e.expression)&&ts.isIdentifier(e.expression.expression)&&e.expression.expression.text==='emit';}
   function emitCall(e){
    if(!sequential||!isEmit(e)||!own.events.some(event=>event.name===e.expression.name.text))reject('emit-target-not-proven');
    if(parameters.has('emit')||locals.has('emit')||slots.has('emit')||calcSlots.has('emit')||props.has('emit')||own.actions.some(action=>action.name==='emit'))reject('emit-target-shadowed');
    opaqueCount++;return {kind:'emit',name:e.expression.name.text,args:e.arguments.map(arg=>opaqueProof(arg.getText())),parameters:[...parameters]};
   }
   function statement(n){
    if(ts.isEmptyStatement(n))return '';if(!ts.isExpressionStatement(n))reject('action-statement-not-proven');const e=n.expression;
    if(isEmit(e))return emitCall(e);
    if((ts.isPostfixUnaryExpression(e)||ts.isPrefixUnaryExpression(e))&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(e.operator)&&ts.isIdentifier(e.operand)&&slots.has(e.operand.text)&&!arrayStates.has(e.operand.text)){const slot=slots.get(e.operand.text);return `{let v=${actionContext}.read(${slot});v${e.operator===ts.SyntaxKind.PlusPlusToken?'++':'--'};${actionContext}.write(${slot},v);}`;}
    if(ts.isBinaryExpression(e)&&ts.isIdentifier(e.left)&&arrayStates.has(e.left.text)){
     if(e.operatorToken.kind!==ts.SyntaxKind.EqualsToken)reject('collection-write-not-proven');const shape=closedArray(e.right);if(shape!==null&&shape!==arrayStates.get(e.left.text))reject('collection-shape-change-not-proven');return `${actionContext}.write(${slots.get(e.left.text)},(${e.right.getText()}));`;
    }
    if(ts.isBinaryExpression(e)&&ts.isIdentifier(e.left)&&slots.has(e.left.text)){const slot=slots.get(e.left.text),ops=new Map([[ts.SyntaxKind.EqualsToken,null],[ts.SyntaxKind.PlusEqualsToken,'+'],[ts.SyntaxKind.MinusEqualsToken,'-'],[ts.SyntaxKind.AsteriskEqualsToken,'*']]);if(ops.has(e.operatorToken.kind)){
     let rhs;try{if(!forceOpaque)rhs=expression(e.right);}catch(reason){if(!sequential||typeof reason!=='string')throw reason;}
     if(rhs===undefined){if(!sequential)reject('action-expression-not-proven');return {slot,operator:ops.get(e.operatorToken.kind),opaque:opaqueProof(e.right.getText()),parameters:[...parameters]};}
     return `r.write(${slot},${ops.get(e.operatorToken.kind)?`r.read(${slot}) ${ops.get(e.operatorToken.kind)} (${rhs})`:rhs});`;
    }}
    reject('action-expression-not-proven');
   }
   // A general action body runs as written. It reads and writes this instance's
   // state slots through the region, so it needs no statement-level proof.
   // Receivers, other actions, emits and closed collections keep fallback.
   // Actions call each other through the instance handle, so a component
   // with any call between actions lowers all of its actions this way.
   const actionBase=actions.length,actionIndex=new Map(own.actions.map((a,i)=>[a.name,actionBase+i]));
   const referencesAction=fn=>{let found=false;const scan=n=>{if(ts.isIdentifier(n)&&actionIndex.has(n.text)){const parent=n.parent;if(!(ts.isPropertyAccessExpression(parent)&&parent.name===n)&&!(ts.isPropertyAssignment(parent)&&parent.name===n))found=true;}if(!found)ts.forEachChild(n,scan);};scan(fn);return found;};
   // on dispose runs as a general action body registered with the instance.
   const disposalSource=own.disposal?ts.createSourceFile('dispose.ts',`function dispose() { void (${own.disposal.expr}); }`,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS):null;
   const callsBetween=own.actions.some(a=>referencesAction(ts.createSourceFile('action.ts',a.functionSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)))||(!!disposalSource&&referencesAction(disposalSource));
   const instanceSlot=[...slots.values(),...calcSlots.values()][0]??-1;
   function opaqueAction(fn){
    const calls=new Set();let invalid=null;
    function scan(n){
     if(n.kind===ts.SyntaxKind.ThisKeyword||n.kind===ts.SyntaxKind.SuperKeyword||ts.isMetaProperty(n))invalid??='opaque-action-receiver-not-proven';
     if(ts.isIdentifier(n)){const parent=n.parent;if(!(ts.isPropertyAccessExpression(parent)&&parent.name===n)&&!(ts.isPropertyAssignment(parent)&&parent.name===n)){
      if(n.text==='arguments')invalid??='opaque-action-receiver-not-proven';
      if(actionIndex.has(n.text))calls.add(n.text);
      if(n.text==='emit')invalid??='opaque-action-emit-not-proven';
      if(arrayStates.has(n.text))invalid??='opaque-action-collection-not-proven';
      if(parentInstance!==null&&props.has(n.text))invalid??='opaque-action-child-props-not-proven';
     }}
     ts.forEachChild(n,scan);
    }
    for(const p of fn.parameters)scan(p);scan(fn.body);if(invalid)reject(invalid);opaqueCount++;
    return {kind:'opaque-action',params:fn.parameters.map(p=>p.getText()).join(', '),body:fn.body.getText(),
     states:[...slots],calcs:[...calcSlots],props:parentInstance===null?[...props.keys()]:[],calls:[...calls].map(name=>[name,actionIndex.get(name)]),
     instance:instanceSlot<0?{slot:-1,group:-1}:{slot:instanceSlot,group:states[instanceSlot].group}};
   }
   const actionNames=new Map();for(const action of own.actions){const sf=ts.createSourceFile('action.ts',action.functionSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),fn=sf.statements[0];if(action.async||!ts.isFunctionDeclaration(fn)||!fn.body)reject('action-signature-not-proven');
    const nonempty=fn.body.statements.filter(n=>!ts.isEmptyStatement(n));if(nonempty.slice(0,-1).some(n=>ts.isExpressionStatement(n)&&isEmit(n.expression)))reject('nonterminal-emit-action-not-proven');
    parameters=new Map();for(const [index,p] of fn.parameters.entries()){if(!ts.isIdentifier(p.name)||p.dotDotDotToken||parameters.has(p.name.text)||slots.has(p.name.text)||calcSlots.has(p.name.text)||props.has(p.name.text))reject('action-signature-not-proven');parameters.set(p.name.text,index);}
    let defaults=[],body,context=null;if(callsBetween&&sequential)body=opaqueAction(fn);else try{for(const [index,p] of fn.parameters.entries())if(p.initializer){
     if(!sequential)reject('action-default-requires-sequential');const opaque=opaqueProof(p.initializer.getText());
     function scan(n){const parent=n.parent,reference=ts.isIdentifier(n)&&!(ts.isPropertyAccessExpression(parent)&&parent.name===n)&&!(ts.isPropertyAssignment(parent)&&parent.name===n);if(reference&&parameters.has(n.text)&&parameters.get(n.text)>=index)reject('action-default-forward-or-self-reference');ts.forEachChild(n,scan);}scan(p.initializer);
     defaults.push({index,opaque,parameters:[...parameters]});
    }
    body=fn.body.statements.map(statement);
    if(defaults.length||body.some(part=>typeof part!=='string')){
     const decoded=own.source.replace(/\\u(?:\{([\da-fA-F]{1,6})\}|([\da-fA-F]{4}))/g,(raw,braced,fixed)=>{const point=parseInt(braced??fixed,16);return point<=0x10ffff?String.fromCodePoint(point):raw;});
     const fresh=base=>{while(decoded.includes(base))base+='_';return base;};actionContext=fresh('__elnor_actionContext');argumentContext=fresh('__elnor_actionArguments');forceOpaque=true;
     body=fn.body.statements.map(statement);context={region:actionContext,args:argumentContext};
    }
    }catch(reason){if(!sequential||typeof reason!=='string')throw reason;defaults=[];context=null;body=opaqueAction(fn);}
    actionNames.set(action.name,actions.length);actionParameters.push(parameters.size);actionContexts.push(context);actionDefaults.push(defaults);actions.push(body.kind||context?body:body.join('\n'));parameters=new Map();actionContext='r';argumentContext='a';forceOpaque=false;
   }
   function opaqueProof(code){const n=parse(code);if(!n)reject('invalid-expression');let invalid=false;const actionNames=new Set(own.actions.map(a=>a.name));
    function scan(node){const parent=node.parent,reference=ts.isIdentifier(node)&&!(ts.isPropertyAccessExpression(parent)&&parent.name===node)&&!(ts.isPropertyAssignment(parent)&&parent.name===node);if(reference){if(arrayStates.has(node.text)&&!parameters.has(node.text))invalid=true;const local=parameters.has(node.text)?null:locals.get(node.text);if(local&&!local.open&&local.fields!==null){if(!ts.isPropertyAccessExpression(parent)||parent.expression!==node||!local.fields.includes(parent.name.text))invalid=true;}}if(ts.isIdentifier(node)&&(['arguments','eval','Function'].includes(node.text)||(node.text==='emit'&&own.events.length&&!parameters.has('emit')&&!locals.has('emit')&&!slots.has('emit')&&!calcSlots.has('emit')&&!props.has('emit'))||actionNames.has(node.text)))invalid=true;
     if(ts.isCallExpression(node)||ts.isTaggedTemplateExpression(node)){let receiver=ts.isCallExpression(node)?node.expression:node.tag;while(ts.isParenthesizedExpression(receiver)||ts.isAsExpression(receiver)||ts.isTypeAssertionExpression(receiver)||ts.isNonNullExpression(receiver))receiver=receiver.expression;if(ts.isIdentifier(receiver)&&(slots.has(receiver.text)||calcSlots.has(receiver.text)||parameters.has(receiver.text)||locals.has(receiver.text)))invalid=true;}
     if(ts.isFunctionLike(node)||ts.isClassExpression(node)||ts.isNewExpression(node)||ts.isDeleteExpression(node)||ts.isAwaitExpression(node)||ts.isYieldExpression(node)||node.kind===ts.SyntaxKind.ThisKeyword||node.kind===ts.SyntaxKind.SuperKeyword)invalid=true;
     if(ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment)invalid=true;
     if((ts.isPrefixUnaryExpression(node)||ts.isPostfixUnaryExpression(node))&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(node.operator))invalid=true;ts.forEachChild(node,scan);
    }scan(n);if(invalid)reject('opaque-state-or-lexical-escape-not-proven');opaqueCount++;return {read:null,deps:new Set(),dynamic:true,opaque:code,locals:[...locals].map(([name,value])=>[name,value.slot])};
   }
   function openReference(code){const n=parse(code);function root(n){if(!n)return false;if(ts.isParenthesizedExpression(n))return root(n.expression);if(ts.isIdentifier(n))return !!locals.get(n.text)?.open;if(ts.isPropertyAccessExpression(n))return root(n.expression);if(ts.isElementAccessExpression(n))return primitive(n.argumentExpression)&&root(n.expression);return false;}return root(n);}
   function caption(parent,code){let p;try{p=proof(code);}catch(reason){if(!sequential||typeof reason!=='string')throw reason;p=opaqueProof(code);}const node=text(parent,p.deps.size||p.opaque||p.dynamic?null:{code:p.read});
    if(p.deps.size||p.opaque||p.dynamic){const id=task({kind:'binding',index:bindings.length,dependencies:[...p.deps],dynamic:p.dynamic});bindings.push({node,kind:'text',read:p.read,opaque:p.opaque,locals:p.locals,masks:masksFor(p.deps)});ops.push({kind:'task',task:id});}
    else ops.push({kind:'literal',node});
   }
   function style(node,n){if(n.classExpr!==undefined){const literal=parse(n.classExpr);if(literal&&(ts.isStringLiteral(literal)||ts.isNoSubstitutionTemplateLiteral(literal)))nodes[node].className=literal.text;else{let p;try{p=proof(n.classExpr);}catch(reason){if(!sequential||typeof reason!=='string')throw reason;p=opaqueProof(n.classExpr);}const id=task({kind:'binding',index:bindings.length,dependencies:[...p.deps],dynamic:p.dynamic});bindings.push({node,kind:'class',read:p.read,opaque:p.opaque,locals:p.locals,masks:masksFor(p.deps)});ops.push({kind:'task',task:id});}}if(n.disabledExpr!==undefined){const literal=parse(n.disabledExpr);if(literal&&[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword].includes(literal.kind))nodes[node].disabled=literal.kind===ts.SyntaxKind.TrueKeyword;else{let p;try{p=proof(n.disabledExpr);}catch(reason){if(!sequential||typeof reason!=='string')throw reason;p=opaqueProof(n.disabledExpr);}const id=task({kind:'binding',index:bindings.length,dependencies:[...p.deps],dynamic:p.dynamic});bindings.push({node,kind:'disabled',read:p.read,opaque:p.opaque,locals:p.locals,masks:masksFor(p.deps)});ops.push({kind:'task',task:id});}}for(const [key,name] of [['ariaPressed','aria-pressed'],['ariaCurrent','aria-current']])if(n[key+'Expr']!==undefined){const literal=parse(n[key+'Expr']);if(literal&&[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword].includes(literal.kind)){(nodes[node].ariaBooleans??={})[name]=literal.kind===ts.SyntaxKind.TrueKeyword;}else{let p;try{p=proof(n[key+'Expr']);}catch(reason){if(!sequential||typeof reason!=='string')throw reason;p=opaqueProof(n[key+'Expr']);}const id=task({kind:'binding',index:bindings.length,dependencies:[...p.deps],dynamic:p.dynamic});bindings.push({node,kind:'ariaBoolean',name,read:p.read,opaque:p.opaque,locals:p.locals,masks:masksFor(p.deps)});ops.push({kind:'task',task:id});}}}
   function visit(n,parent,exclusive=false){
    if(n.focusInvalidExpr!==undefined)reject('form-focus-invalid-requires-general-renderer');
    if(n.kind==='container'){if(!['section','main','article','header','footer','nav','div','ul','li','form','fieldset'].includes(n.tag))reject('container-tag-not-proven');const node=add({parent,kind:'element',tag:n.tag,className:n.className??null});style(node,n);for(const [type,handler] of [['submit',n.submitExpr],['reset',n.resetExpr]]){if(handler===undefined)continue;const e=parse(handler);if(isEmit(e)){const call=emitCall(e);events.push({node,type,emit:call.name,args:call.args,group});ops.push({kind:'event',event:events.length-1});}else if(e&&ts.isCallExpression(e)&&ts.isIdentifier(e.expression)&&actionNames.has(e.expression.text)){const args=e.arguments.map(arg=>{try{return expression(arg);}catch(reason){if(!sequential||typeof reason!=='string'||!openReference(arg.getText()))throw reason;return opaqueProof(arg.getText());}});events.push({node,type,action:actionNames.get(e.expression.text),...(args.length?{args}:{}),group});ops.push({kind:'event',event:events.length-1});}else reject('form-action-not-proven');}for(const child of n.children)visit(child,node,n.children.length===1&&child.kind==='each');return;}
    if(n.kind==='text'){if(!['p','span','h1','h2','strong','small','output','legend'].includes(n.tag))reject('text-tag-not-proven');const node=add({parent,kind:'element',tag:n.tag});caption(node,n.expr);style(node,n);return;}
    if(n.kind==='button'){const node=add({parent,kind:'element',tag:'button',type:n.reset?'reset':n.submit?'submit':'button'});caption(node,n.label);if(n.submit||n.reset){style(node,n);return;}const e=parse(n.expr);if(isEmit(e)){const call=emitCall(e);events.push({node,type:'click',emit:call.name,args:call.args,group});ops.push({kind:'event',event:events.length-1});}else if(e&&ts.isCallExpression(e)&&ts.isIdentifier(e.expression)&&actionNames.has(e.expression.text)){const args=e.arguments.map(arg=>{try{return expression(arg);}catch(reason){if(!sequential||typeof reason!=='string'||!openReference(arg.getText()))throw reason;return opaqueProof(arg.getText());}});events.push({node,type:'click',action:actionNames.get(e.expression.text),...(args.length?{args}:{}),group});ops.push({kind:'event',event:events.length-1});}else reject('button-action-not-proven');style(node,n);return;}
    if(n.errorExpr!==undefined)reject('field-error-requires-general-renderer');
    if(n.onInputExpr!==undefined)reject('input-callback-requires-general-renderer');
    if(n.kind==='input'&&n.tag==='select'){
      if(!slots.has(n.binding))reject('input-binding-not-state');const label=add({parent,kind:'element',tag:'label'}),span=add({parent:label,kind:'element',tag:'span'}),caption=text(span,{value:n.label}),node=add({parent:label,kind:'element',tag:'select'});ops.push({kind:'literal',node:caption});
      for(const option of n.options){const child=add({parent:node,kind:'element',tag:'option',optionValue:option.value}),textNode=text(child,{value:option.label});ops.push({kind:'literal',node:textNode});}
      const slot=slots.get(n.binding);observed[slot]=true;const id=task({kind:'binding',index:bindings.length,dependencies:[slot]});bindings.push({node,kind:'select',read:`r.read(${slot})`,masks:[[slot>>>5,(1<<(slot&31))>>>0]]});events.push({node,type:'change',selectValue:true,slot,group});ops.push({kind:'event',event:events.length-1},{kind:'task',task:id});style(node,n);return;
    }
    if(n.kind==='input'){if(!slots.has(n.binding))reject('input-binding-not-state');const begin=ops.length,label=add({parent,kind:'element',tag:'label'});let node;if(n.tag==='checkbox')node=add({parent:label,kind:'element',tag:'input',type:'checkbox'});const span=add({parent:label,kind:'element',tag:'span'}),caption=text(span,{value:n.label});node??=add({parent:label,kind:'element',...(n.tag==='textarea'?{tag:'textarea'}:{tag:'input',type:'text'})});const slot=slots.get(n.binding);observed[slot]=true;const id=task({kind:'binding',index:bindings.length,dependencies:[slot]});bindings.push({node,kind:n.tag==='checkbox'?'checked':'input',read:`r.read(${slot})`,masks:[[slot>>>5,(1<<(slot&31))>>>0]]});events.push({node,type:n.tag==='checkbox'?'change':'input',slot,group});if(!n.tag)ops.splice(begin,ops.length-begin,{kind:'input',parent,label,span,caption,node,text:n.label,task:id,event:events.length-1});else ops.push({kind:'literal',node:caption},{kind:'event',event:events.length-1},{kind:'task',task:id});style(node,n);return;}
    if(n.kind==='if'){
     let p;try{p=proof(n.expr);}catch(reason){if(!sequential||typeof reason!=='string')throw reason;p=opaqueProof(n.expr);}const node=add({parent,kind:'comment',value:'elnor:if'}),child=groups.length;
     const id=task({kind:'branch',index:branches.length,dependencies:[...p.deps],dynamic:p.dynamic});branches.push({node,child,read:p.read,opaque:p.opaque,locals:p.locals});groups.push({parent:group});ops.push({kind:'branch',task:id,child,node});
     const previous=group;group=child;try{for(const c of n.children)visit(c,-1);}finally{group=previous;}return;
    }
    if(n.kind==='each'){
     const nativePlain=n=>n.kind==='container'?n.children.every(nativePlain):['text','button','input'].includes(n.kind),plain=n=>n.kind==='container'?n.children.every(plain):n.kind==='component'||['text','button','input'].includes(n.kind);const direct=n.children.length===1&&n.children[0].kind==='component';if(sequential&&(n.children.length!==1||(!direct&&(n.children[0].kind!=='container'||!plain(n.children[0])))))reject('sequential-row-root-not-proven');let detached=n.children.every(nativePlain);if(direct){const rootImport=own.imports.find(i=>i.local===n.children[0].name&&!i.typeOnly&&i.path.endsWith('.eln')),rootSource=rootImport&&components.get(sourceKey(sourceImport(own.filename,rootImport.path)));if(!rootSource)reject('child-graph-not-proven');detached=rootSource.ui.length===1&&rootSource.ui[0].kind==='container'&&nativePlain(rootSource.ui[0]);}
     // Cleanup shape is independent of the general generator's detached proof.
     // Admitted child plans still validate props, events, slots and expressions.
     let cleanupBudget=4096;
     const nativeOwned=(node,source=own,ancestors=new Set([sourceKey(own.filename)]))=>{
      if(--cleanupBudget<0)return false;
      if(node.kind==='container')return node.children.every(child=>nativeOwned(child,source,ancestors));
      if(['text','button','input'].includes(node.kind))return true;if(node.kind!=='component')return false;
      const imp=source.imports.find(i=>i.local===node.name&&!i.typeOnly&&i.path.endsWith('.eln')),child=imp&&components.get(sourceKey(sourceImport(source.filename,imp.path)));if(!child)return false;
      const childKey=sourceKey(child.filename);if(ancestors.has(childKey)||ancestors.size>=64||child.ui.length!==1||child.ui[0].kind!=='container')return false;
      return nativeOwned(child.ui[0],child,new Set([...ancestors,childKey]));
     };
     const nativeRows=n.children.length===1&&((n.children[0].kind==='container'&&nativePlain(n.children[0]))||nativeOwned(n.children[0]));if(sequential&&exclusive&&!nativeRows)reject('sequential-exclusive-cleanup-not-proven');
     const expr=parse(n.collection),deps=new Set();let read,shape,readOpaque=null,open=false;
     try{if(expr&&ts.isIdentifier(expr)&&arrayStates.has(expr.text)){const slot=slots.get(expr.text);deps.add(slot);read=`r.read(${slot})`;shape=arrayStates.get(expr.text);}
      else if(expr&&ts.isArrayLiteralExpression(expr)){shape=closedArray(expr)??'null';read=expr.getText();}else reject('collection-provenance-not-closed');
     }catch(reason){if(!sequential||typeof reason!=='string')throw reason;readOpaque=opaqueProof(n.collection);read=null;open=true;}
     const node=add({parent,kind:'comment',value:'elnor:each'}),child=groups.length,itemSlot=states.length,previousLocal=locals.get(n.variable),previousGroup=group;
     groups.push({parent:group,kind:'row'});states.push({name:n.variable,kind:'item',initial:'null',dependencies:[],group:child});observed.push(false);locals.set(n.variable,{slot:itemSlot,fields:open?null:JSON.parse(shape),open});
     let keyProof;try{keyProof=proof(n.key);if(keyProof.dynamic)reject('key-dynamic-dependencies-not-proven');}catch(reason){if(!sequential||typeof reason!=='string')throw reason;keyProof=opaqueProof(n.key);}
     const key=keyProof.read,keyOpaque=keyProof.opaque?keyProof:null;for(const slot of keyProof.deps)if(slot!==itemSlot)deps.add(slot);
     const index=lists.length,id=task({kind:'list',index,dependencies:[...deps]});lists.push({node,parent,child,itemSlot,read,readOpaque,key,keyOpaque,open,detached,exclusive,nativeRows});ops.push({kind:'list',task:id,index,node});
     group=child;try{for(const c of n.children)visit(c,-1);}finally{group=previousGroup;if(previousLocal)locals.set(n.variable,previousLocal);else locals.delete(n.variable);}return;
    }
    if(n.kind==='component'){
     if(n.children.some(node=>node.kind!=='on')||(!sequential&&n.children.length))reject('child-slots-or-events-not-proven');const imp=own.imports.find(i=>i.local===n.name&&!i.typeOnly&&i.path.endsWith('.eln'));const child=imp&&components.get(sourceKey(sourceImport(own.filename,imp.path)));if(!child)reject('child-graph-not-proven');
     if(sequential){const childKey=sourceKey(child.filename);if(stack.has(childKey))reject('recursive-component-graph');let childPlan=sequentialCache.get(childKey);if(!childPlan){childPlan=analyzeVariant(child,{components,sequential:true,allowClosedSequential:true,primitiveProps:true,ancestry:new Set(stack),sequentialCache});sequentialCache.set(childKey,childPlan);}if(!childPlan.eligible)reject('sequential-composition-child-not-proven:'+childPlan.failures.join(','));const supplied=[];for(const prop of n.props){let value;try{value=proof(prop.expr);}catch(reason){if(typeof reason!=='string')throw reason;if(!openReference(prop.expr))reject('sequential-component-prop-not-proven');value=opaqueProof(prop.expr);}supplied.push({name:prop.name,read:value.read,opaque:value.opaque,locals:value.locals});}const handlers=[];for(const h of n.children){if(!child.events.some(event=>event.name===h.name))reject('handler-event-not-declared');const previousParameters=parameters;parameters=new Map(h.param?[[h.param,0]]:[]);try{
      const e=parse(h.expr);let call;if(isEmit(e))call=emitCall(e);else if(e&&ts.isCallExpression(e)&&ts.isIdentifier(e.expression)&&actionNames.has(e.expression.text)&&!parameters.has(e.expression.text))call={kind:'action',action:actionNames.get(e.expression.text),args:e.arguments.map(arg=>opaqueProof(arg.getText())),parameters:[...parameters]};else reject('handler-call-not-proven');handlers.push({name:h.name,call});
     }finally{parameters=previousParameters;}}
     const index=composed.length;composed.push({parent,group,import:imp.path,source:child.filename,props:supplied,handlers});ops.push({kind:'component',index,group});opaqueCount++;return;}
     const supplied=new Map();for(const p of n.props){const value=proof(p.expr);supplied.set(p.name,{code:value.read,dependencies:value.deps,dynamic:value.dynamic});}component(child,parent,supplied,instance);return;
    }
    reject('structural-or-opaque-node:'+n.kind);
   }
   if(disposalSource){disposals.push(opaqueAction(disposalSource.statements[0]));ops.push({kind:'dispose',index:disposals.length-1,group});}
   for(const root of own.ui)visit(root,parent);stack.delete(key);
  }
  component(ir,-1,sequential?new Map(ir.params.map(p=>[p.name,primitiveProps?{code:`r.props[${JSON.stringify(p.name)}]`,dependencies:new Set(),dynamic:true}:{opaque:true,code:null,dependencies:new Set()}])):new Map());
  if(sequential&&!allowClosedSequential&&!opaqueCount)reject('sequential-opaque-read-required');
  groups.forEach((g,id)=>{g.nodes=nodes.flatMap((n,i)=>n.group===id?[i]:[]);g.slots=states.flatMap((s,i)=>s.group===id?[i]:[]);g.tasks=tasks.flatMap((t,i)=>t.group===id?[i]:[]);g.events=events.flatMap((e,i)=>e.group===id?[i]:[]);g.initialDependencies=[...new Set(states.filter(s=>s.group===id&&s.kind!=='calc').flatMap(s=>s.dependencies))];});
  if(sequential){for(const t of tasks)if(t.kind!=='calc')t.dynamic=true;groups.forEach((g,id)=>{g.ops=ops.flatMap((op,i)=>{const owner=op.kind==='component'||op.kind==='dispose'?op.group:op.task!==undefined?tasks[op.task].group:op.event!==undefined?events[op.event].group:nodes[op.kind==='input'?op.label:op.node].group;return owner===id?[i]:[];});});}
  return {kind:'elnor-owned-region-v17',mode:sequential?'sequential':'blueprint',eligible:true,file:ir.filename,states,disposals,derived,branches,lists,components:composed,groups,tasks,nodes,ops,bindings,events,emitNames:ir.events.map(e=>e.name),actions,actionParameters,actionContexts,actionDefaults,observed,instances,failures:[]};
 }catch(reason){if(typeof reason!=='string')throw reason;return {kind:'elnor-owned-region-v17',eligible:false,file:ir.filename,failures:[reason]};}
}

export function analyzeRegion(ir,options={}){const closed=analyzeVariant(ir,options);if(closed.eligible)return closed;const sequential=analyzeVariant(ir,{...options,sequential:true});return sequential.eligible?sequential:{...closed,sequentialFailures:sequential.failures};}

export function analyzeSequentialRegion(ir,options={}){return analyzeVariant(ir,{...options,sequential:true,allowClosedSequential:true,primitiveProps:true});}

export function attachRegion(ir,legacy,options={}){
 if(!options.regionRuntimeImport)return legacy;const plan=options.regionPlan??analyzeRegion(ir);if(!plan.eligible)return legacy;
 if(options.ownedExport)return appendOwnedRegion(ir,legacy,options);
 const sf=ts.createSourceFile('legacy.js',legacy,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),exp=sf.statements.at(-1);
 if(!ts.isExportDeclaration(exp)||!exp.exportClause||!ts.isNamedExports(exp.exportClause))throw Error('ELN-REGION: public exports missing');
 const legacyMount=exp.exportClause.elements.find(e=>e.name.text==='mount')?.propertyName?.text;
 const render=exp.exportClause.elements.find(e=>e.name.text==='renderOwned')?.propertyName?.text;if(!render)throw Error('ELN-REGION: renderOwned missing');
 const fresh=base=>{let s=base;while(legacy.includes(s)||ir.source.includes(s))s+='_';return s;},define=fresh('__elnor_defineRegion'),mount=fresh('__elnor_mountRegion'),descriptor=fresh('__elnor_regionDescriptor'),entry=fresh('__elnor_regionMount'),can=fresh('__elnor_canMountRegion');
 const {data,imports}=regionDescriptor(ir,legacy,plan,options,fresh);
 const mountExport=plan.derived.length||plan.branches.length||plan.lists.length||plan.tasks.some(t=>t.dynamic)||plan.mode==='sequential'?'mountRegion':'mountScalarRegion';
 return legacy.slice(0,exp.getStart(sf))+`export {${render} as renderOwned};\n${imports}\nimport {defineRegion as ${define},${mountExport} as ${mount},canMountRegion as ${can}} from ${JSON.stringify(options.regionRuntimeImport)};\nconst ${descriptor}=${define}(${data});\nfunction ${entry}(target,props,handlers={},slots={}){if(!${can}())return ${legacyMount}(target,props,handlers,slots);return ${mount}(target,${descriptor},props${plan.emitNames?.length?',handlers':''});}\nexport {${entry} as mount};\n`;
}

function regionDescriptor(ir,legacy,plan,options,fresh){
 let instanceAlias=null;
 const indexed=plan.states.flatMap((s,slot)=>s.instance===0&&s.kind!=='item'?[[s.name,slot]]:[]);
 const taskMode=plan.derived.length||plan.branches.length||plan.lists.length||plan.tasks.some(t=>t.dynamic)||plan.mode==='sequential';
 const invalidations=taskMode?null:Array.from({length:plan.states.length},()=>new Map());
 if(invalidations)for(let id=0;id<plan.bindings.length;id++)for(const [word,mask] of plan.bindings[id].masks){
  let bits=mask;while(bits){const slot=(word<<5)+31-Math.clz32(bits&-bits);bits&=bits-1;const map=invalidations[slot],target=id>>>5;map.set(target,((map.get(target)??0)|(1<<(id&31)))>>>0);}
 }
 const nodes=plan.nodes.map(n=>({...n,value:n.kind==='text'?(n.value?.code?undefined:n.value?.value??''):n.kind==='comment'?n.value:undefined}));
 const nodeCode=nodes.map((n,i)=>plan.nodes[i].value?.code?`{...${JSON.stringify(n)},value:(${plan.nodes[i].value.code})}`:JSON.stringify(n)).join(',');
 const branchCode=b=>{const lowered=b.opaque?options.lowerOpaque(b.opaque,b.locals,indexed):{param:'r',read:b.read};return `{node:${b.node},child:${b.child},read:${lowered.param}=>(${lowered.read})}`;};
 const bindingCode=b=>{const lowered=b.opaque?options.lowerOpaque(b.opaque,b.locals,indexed):{param:'r',read:b.read};return `{node:${b.node},kind:${JSON.stringify(b.kind)},${b.name?'name:'+JSON.stringify(b.name)+',':''}${taskMode?'masks:'+JSON.stringify(b.masks)+',':''}read:${lowered.param}=>(${lowered.read})}`;};
 const derivedCode=d=>{const lowered=d.opaque?options.lowerOpaque(d.opaque,d.locals,indexed):{param:'r',read:d.read};return `{slot:${d.slot},masks:${JSON.stringify(d.masks)},read:${lowered.param}=>(${lowered.read})}`;};
 const componentAliases=new Map(),componentImports=[];for(const c of plan.components??[]){if(!componentAliases.has(c.import)){const alias=fresh('__elnor_childRegion'+componentAliases.size);componentAliases.set(c.import,alias);const target=options.componentImports?.get(c.import);if(!target)throw Error('ELN-REGION: child module mapping missing');componentImports.push(`import {__elnor_renderRegion as ${alias}} from ${JSON.stringify(target)};`);}}
 const bridge=(plan.emitNames?.length??0)||(plan.components??[]).some(c=>c.handlers?.length),anchor=bridge?options.lowerOpaque('0',[],indexed).param:null;
 const actionTable=(plan.components??[]).some(c=>c.handlers?.some(h=>h.call.kind==='action'))||[...plan.actions,...(plan.disposals??[])].some(a=>a?.kind==='opaque-action'&&a.calls.length)?fresh(anchor+'_actions'):null;
 const handlerFactory=c=>{const param=anchor+'_handler',alive=param+'_alive',args=param+'_args',values=param+'_values';return `(${param},${alive})=>({${c.handlers.map(h=>{const call=h.call,reads=call.args.map(p=>options.lowerOpaque(p.opaque,p.locals,indexed,{context:param,args,parameters:call.parameters}).read);const run=call.kind==='action'?`const ${values}=[${reads.join(',')}];if(!${alive}())return;${actionTable}[${call.action}](${param},...${values});`:`${param}.emit[${JSON.stringify(call.name)}](${reads.join(',')});`;return `${JSON.stringify(h.name)}:(...${args})=>{if(!${alive}())return;${run}}`;}).join(',')}})`;};
 const emitFactory=plan.emitNames?.length?`${anchor}_packet=>({${plan.emitNames.map(name=>`${JSON.stringify(name)}:(...${anchor}_args)=>${anchor}_packet[${JSON.stringify(name)}]?.(...${anchor}_args)`).join(',')}})`:null;
 const componentCode=c=>`{parent:${c.parent},render:${componentAliases.get(c.import)},props:[${c.props.map(p=>{const lowered=p.opaque?options.lowerOpaque(p.opaque,p.locals,indexed):{param:'r',read:p.read};return `{name:${JSON.stringify(p.name)},read:${lowered.param}=>(${lowered.read})}`;}).join(',')}]${c.handlers?.length?`,handlerFactory:${handlerFactory(c)}`:''}}`;
 const initializerCode=s=>{const p=s.initialOpaque,lowered=p?options.lowerOpaque(p.opaque,p.locals,indexed):{param:'r',read:s.initial};return `${lowered.param}=>(${lowered.read})`;};
 const actionCode=(body,index)=>{
  if(body?.kind==='opaque-action')return options.lowerOpaqueAction(body,{instance:instanceAlias??=fresh('__elnor_regionInstance'),table:actionTable});
  const context=plan.actionContexts?.[index],param=context?.region??'r',args=context?.args??'a';
  const statements=Array.isArray(body)?body.map(part=>{
   if(typeof part==='string')return part;if(part.kind==='emit'){const argsCode=part.args.map(p=>options.lowerOpaque(p.opaque,p.locals,indexed,{context:param,args,parameters:part.parameters}).read);return `if(${param}.disposed)return;${param}.emit[${JSON.stringify(part.name)}](${argsCode.join(',')});`;}const lowered=options.lowerOpaque(part.opaque.opaque,part.opaque.locals,indexed,{context:param,args,parameters:part.parameters});
   const value=part.operator?`${param}.read(${part.slot}) ${part.operator} (${lowered.read})`:lowered.read;
   return `${param}.write(${part.slot},(${value}));`;
  }).join('\n'):body;
  const defaults=(plan.actionDefaults?.[index]??[]).map(value=>{const lowered=options.lowerOpaque(value.opaque.opaque,value.opaque.locals,indexed,{context:param,args,parameters:value.parameters});return `if(${args}[${value.index}]===void 0)${args}[${value.index}]=(${lowered.read});`;}).join('\n');
  return `${plan.actionParameters?.[index]?`(${param},...${args})`:param}=>{${defaults}${statements}}`;
 };
 const readCode=value=>{const lowered=typeof value==='string'?{param:'r',read:value}:options.lowerOpaque(value.opaque,value.locals,indexed);return `${lowered.param}=>(${lowered.read})`;};
 const forwarding=l=>{const group=plan.groups[l.child],op=group.ops?.length===1?plan.ops[group.ops[0]]:null;return plan.mode==='sequential'&&group.slots.length===1&&group.slots[0]===l.itemSlot&&!group.tasks.length&&!group.nodes.length&&!group.events.length&&op?.kind==='component'&&plan.components[op.index].parent<0?`,forward:${op.index}`:'';};
 const listCode=l=>`{${forwarding(l).slice(1)}${forwarding(l)?',':''}node:${l.node},parent:${l.parent},exclusive:${JSON.stringify(l.exclusive)},nativeRows:${JSON.stringify(l.nativeRows)},child:${l.child},detached:${JSON.stringify(l.detached??true)},itemSlot:${l.itemSlot},read:${readCode(l.readOpaque??l.read)},key:${readCode(l.keyOpaque??l.key)}}`;
 const actionArray=`[${plan.actions.map(actionCode).join(',')}]`;
 const data=`{indexedReads:true,${emitFactory?'emitFactory:'+emitFactory+',':''}${plan.states.some(s=>s.initialTask!==undefined)?'initialTasks:'+JSON.stringify(plan.states.map(s=>s.initialTask??null))+',':''}invalidations:${JSON.stringify(invalidations?.map(m=>[...m])??null)},mode:${JSON.stringify(plan.mode)},components:[${(plan.components??[]).map(componentCode).join(',')}],ops:${plan.mode==='sequential'?JSON.stringify(plan.ops):'null'},names:null,nodes:[${nodeCode}],initializers:[${plan.states.map(initializerCode).join(',')}],observed:${JSON.stringify(plan.observed)},groups:${JSON.stringify(plan.groups)},branches:[${plan.branches.map(branchCode).join(',')}],lists:[${plan.lists.map(listCode).join(',')}],tasks:${plan.derived.length||plan.branches.length||plan.lists.length||plan.tasks.some(t=>t.dynamic)||plan.mode==='sequential'?JSON.stringify(plan.tasks):'null'},derived:[${plan.derived.map(derivedCode).join(',')}],bindings:[${plan.bindings.map(bindingCode).join(',')}],events:[${plan.events.map(event=>{const {args,...data}=event;return args?`${JSON.stringify(data).slice(0,-1)},args:[${args.map(readCode).join(',')}]}`:JSON.stringify(data);}).join(',')}],actions:${actionTable??actionArray},disposals:[${(plan.disposals??[]).map(hook=>options.lowerOpaqueAction(hook,{instance:instanceAlias??=fresh('__elnor_regionInstance'),table:actionTable})).join(',')}]}`;
 return {data,imports:componentImports.join('\n')+(actionTable?`\nconst ${actionTable}=${actionArray};`:'')
  +(instanceAlias?`\nimport {regionInstance as ${instanceAlias}} from ${JSON.stringify(options.regionRuntimeImport)};`:'')};
}

function appendOwnedRegion(ir,legacy,options){
 const plan=options.regionPlan,fresh=base=>{let s=base;while(legacy.includes(s)||ir.source.includes(s))s+='_';return s;},define=fresh('__elnor_ownedDefine'),render=fresh('__elnor_ownedRender'),descriptor=fresh('__elnor_ownedDescriptor'),entry=fresh('__elnor_ownedEntry');
 const {data,imports}=regionDescriptor(ir,legacy,plan,options,fresh);
 const native=nativeOwnedBuilder(plan,fresh);
 if(native)return legacy+`\n${imports}\nimport {renderNativeRegionOwned as ${render}} from ${JSON.stringify(options.regionRuntimeImport)};\nconst ${descriptor}=${data};\n${native.code}\nfunction ${entry}(target,props,stage${plan.emitNames?.length?',handlers={}':''}){return ${render}(target,${descriptor},${native.name},props,stage${plan.emitNames?.length?',handlers':''});}\nexport {${entry} as __elnor_renderRegion};\n`;
 return legacy+`\n${imports}\nimport {defineRegion as ${define},renderRegionOwned as ${render}} from ${JSON.stringify(options.regionRuntimeImport)};\nconst ${descriptor}=${define}(${data});\nfunction ${entry}(target,props,stage${plan.emitNames?.length?',handlers={}':''}){return ${render}(target,${descriptor},props,stage${plan.emitNames?.length?',handlers':''}); }\nexport {${entry} as __elnor_renderRegion};\n`;
}

// Select from the validated IR, without imposing new Surface restrictions.
function nativeOwnedBuilder(plan,fresh){
 if(plan.mode!=='sequential'||plan.states.length||plan.derived.length||plan.actions.length||plan.disposals?.length||plan.branches.length||plan.lists.length||plan.components.length||plan.groups.length!==1)return null;
 if(plan.tasks.some(t=>t.kind!=='binding'||!t.dynamic)||plan.bindings.some(b=>!['text','class','disabled','ariaBoolean'].includes(b.kind))||plan.events.some(e=>e.emit===undefined)||plan.ops.some(op=>!['node','literal','task','event'].includes(op.kind)))return null;
 const name=fresh('__elnor_nativeBuild'),frame=fresh('__elnor_nativeFrame'),parent=fresh('__elnor_nativeParent'),task=fresh('__elnor_nativeTask'),event=fresh('__elnor_nativeEvent'),doc=fresh('__elnor_nativeDocument'),part=fresh('__elnor_nativePart');
 const body=[];
 for(const index of plan.groups[0].ops){const op=plan.ops[index];body.push(`if(${frame}.disposed)return;`);
  if(op.kind==='node'){const spec=plan.nodes[op.node],node=fresh('__elnor_nativeNode'+op.node),host=spec.parent<0?parent:`${frame}.refs[${spec.parent}]`;
   const create=spec.kind==='text'?`${doc}.createTextNode('')`:spec.kind==='comment'?`${doc}.createComment(${JSON.stringify(spec.value)})`:`${doc}.createElement(${JSON.stringify(spec.tag)})`;
   body.push(`const ${node}=${create};${frame}.refs[${op.node}]=${node};${spec.className?`${node}.className=${JSON.stringify(spec.className)};`:''}if(${host})${host}.append(${node});${spec.type?`${node}.type=${JSON.stringify(spec.type)};`:''}${spec.disabled!==undefined?`${node}.disabled=${JSON.stringify(spec.disabled)};`:''}${spec.ariaBooleans?Object.entries(spec.ariaBooleans).map(([name,value])=>`${node}.setAttribute(${JSON.stringify(name)},${JSON.stringify(String(value))});`).join(''):''}${spec.parent<0?`${part}.roots.push(${node});`:''}`);
  }else if(op.kind==='literal'){
   // Keep evaluation at the original op, including literal coercion ordering.
   const node=fresh('__elnor_nativeLiteral'+op.node);body.push(`{const ${node}=${frame}.refs[${op.node}],value=String(${frame}.plan.nodes[${op.node}].value??'');if(${node}.nodeValue!==value)${node}.nodeValue=value;}`);
  }else if(op.kind==='task')body.push(`${task}(${op.task});`);
  else body.push(`${event}(${op.event});`);
 }
 return {name,code:`function ${name}(${frame},${parent},${task},${event},${doc}){const ${part}=${frame}.parts[0];${body.join('\n')}}`};
}
