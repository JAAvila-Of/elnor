// Spike 003: an intentionally bounded Surface parser. NOT the production grammar.
// It recognizes typed component props/events, named/default slots, and composition.
import { getTs } from './typescript.mjs';
import {actionBodyText, actionFunctionPrefix, guardedBodyOffset, projectGuardedBody} from './action-guards.mjs';
import {actionGroupPolicies} from './action-groups.mjs';
const ts = getTs();
export function supportsDisabled(tag) {
  return ['button', 'submit', 'reset', 'input', 'textarea', 'checkbox', 'select', 'fieldset'].includes(tag);
}
export function supportsFieldError(tag) {
  return ['input', 'textarea', 'select'].includes(tag);
}
export function supportsInputCallback(tag) {
  return tag === 'input' || tag === 'textarea';
}

export function diagnostic(code, source, position, message) {
  const line = source.slice(0, Math.max(0, position)).split('\n').length;
  return Object.assign(new Error(`${code} line ${line}: ${message}`), {code, line, start:position, length:position < source.length ? 1 : 0});
}
// Ranges use JavaScript/TypeScript UTF-16 code units, never byte offsets.
function range(start, length) { return {start, length}; }
function capture(match, index, base, trim=false) {
  const [start,end]=match.indices[index];
  const text=match[index];
  const leading=trim ? text.length-text.trimStart().length : 0;
  return range(base+start+leading,trim ? text.trim().length : end-start);
}
function skip(s, p) {
  while (p < s.length) {
    const m = /^\s+/.exec(s.slice(p));
    if (m) {p += m[0].length; continue;}
    if (s.startsWith('//', p)) {const e=s.indexOf('\n',p);p=e<0?s.length:e+1;continue;}
    break;
  }
  return p;
}
function balanced(s, p, open, close, tolerant=false, guardRecovery=null) {
  if(s[p]!==open)throw diagnostic('ELN-PARSE-001',s,p,`expected ${open}`);
  const stack=[open],starts=[p]; let quote='',escape=false,lineComment=false,blockComment=false;
  for(let i=p+1;i<s.length;i++) {
    const c=s[i],n=s[i+1];
    if(lineComment){if(c==='\n')lineComment=false;continue;}
    if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++;}continue;}
    if(quote){if(escape){escape=false;if(c==='\r'&&n==='\n')i++;continue;}if(c==='\\'){escape=true;continue;}if(c===quote||(tolerant&&quote!=='`'&&(c==='\n'||c==='\r')))quote='';continue;}
    if(guardRecovery?.end===i&&starts.at(-1)===guardRecovery.opening){
      stack.pop();
      starts.pop();
    }
    if(c==='/'&&n==='/'){lineComment=true;i++;continue;}
    if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
    if(`"'\``.includes(c)){quote=c;continue;}
    if('({['.includes(c)){stack.push(c);starts.push(i);continue;}
    if(')}]'.includes(c)){
      const previous=stack.pop(),opening=starts.pop(),expected=previous?')}]'['({['.indexOf(previous)]:null;
      if(!previous||expected!==c)throw diagnostic('ELN-PARSE-002',s,opening??i,expected?`expected '${expected}' to close '${previous}' before '${c}'`:'unexpected closing delimiter');
      if(!stack.length)return {contents:s.slice(p+1,i),end:i+1};
    }
  }
  throw diagnostic('ELN-PARSE-003',s,starts.at(-1)??p,'unterminated block');
}
function checkExpr(source, at, expr, tolerant=false, exact=false) {
  const prefix='const x = (';
  const sf=ts.createSourceFile('expression.ts',prefix+expr+');',ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const error=sf.parseDiagnostics[0];
  if(error&&!tolerant){
    const offset=exact?Math.max(0,Math.min(expr.length,(error.start??prefix.length)-prefix.length)):0;
    throw diagnostic('ELN-TS-PARSE',source,at+offset,ts.flattenDiagnosticMessageText(error.messageText,' '));
  }
  return expr.trim();
}
function parseAttributes(source,at,input,tolerant=false,recoveryDiagnostics=[]) {
  const props=[]; let remaining=input.trimStart();
  let cursor=at+input.length-remaining.length;
  while(remaining){
    const m=/^([a-zA-Z_]\w*)\s*=\s*/d.exec(remaining);
    if(!m){
      if(tolerant&&/^[A-Za-z_]\w*$/.test(remaining.trim())){
        props.push({name:remaining.trim(),expr:'undefined',nameSpan:range(cursor,remaining.trim().length),partial:true});break;
      }
      throw diagnostic('ELN-UI-ATTR',source,cursor,`invalid attribute segment: ${remaining}`);
    }
    const nameSpan=capture(m,1,cursor);
    remaining=remaining.slice(m[0].length);
    cursor+=m[0].length;
    const valueAt=cursor;
    let value, consumed=0, incompleteQuoted=false;
    if(!remaining&&tolerant){props.push({name:m[1],expr:'undefined',nameSpan,partial:true});break;}
    if(remaining[0]==='('){
      const segment=balanced(remaining,0,'(',')');
      value=segment.contents;consumed=segment.end;
    } else if('"\'`'.includes(remaining[0]??'')) {
      const q=remaining[0];let i=1,escaped=false;
      for(;i<remaining.length;i++){
        if(escaped){escaped=false;continue;}
        if(remaining[i]==='\\'){escaped=true;continue;}
        if(remaining[i]===q){i++;break;}
      }
      incompleteQuoted=i>remaining.length||remaining[i-1]!==q;
      if(incompleteQuoted){
        const error=diagnostic('ELN-UI-ATTR',source,valueAt,'unterminated quoted attribute');
        if(!tolerant)throw error;
        recoveryDiagnostics.push(error);
      }
      value=remaining.slice(0,i);consumed=i;
    } else {
      const m=/^[^\s]+/.exec(remaining);
      if(!m)throw diagnostic('ELN-UI-ATTR',source,at,'expected attribute value');
      value=m[0];consumed=m[0].length;
    }
    if(props.some(p=>p.name===m[1]))throw diagnostic('ELN-UI-ATTR',source,at,'duplicate attribute: '+m[1]);
    const inside=remaining[0]==='(' ? 1 : 0;
    const leading=value.length-value.trimStart().length;
    props.push({name:m[1],expr:checkExpr(source,valueAt,value,tolerant),nameSpan,exprSpan:range(valueAt+inside+leading,value.trim().length),incompleteQuoted});
    cursor+=consumed;
    const rest=remaining.slice(consumed);
    remaining=rest.trim();cursor+=rest.length-rest.trimStart().length;
  }
  return props;
}
function parseUI(source, body, bodyOffset,tolerant=false,recoveryDiagnostics=[]){
  const lines=body.split('\n');
  let offset=bodyOffset;
  const located=lines.map(raw=>{const result={raw,line:source.slice(0,offset).split('\n').length,offset};offset+=raw.length+1;return result;});
  let idx=0;
  function selectOptions(){
    const options=[],seen=new Set();let closed=false;
    while(idx<located.length){const {raw,line,offset}=located[idx++],text=raw.trim(),at=offset+raw.length-raw.trimStart().length;
      if(!text||text.startsWith('//'))continue;if(text==='}'){closed=true;break;}
      const option=/^option\s+("(?:\\.|[^"\\])*")\s+=>\s+("(?:\\.|[^"\\])*")$/d.exec(text);
      if(!option)throw diagnostic('ELN-SELECT-OPTION',source,at,'Expected option "Label" => "value"');
      const value=JSON.parse(option[2]);if(seen.has(value))throw diagnostic('ELN-SELECT-OPTION',source,at+option.indices[2][0],'Duplicate option value');seen.add(value);
      options.push({label:JSON.parse(option[1]),value,line,labelSpan:capture(option,1,at),valueSpan:capture(option,2,at)});
    }
    if(!closed)throw diagnostic('ELN-SELECT-SYNTAX',source,bodyOffset,'Unclosed select options');return options;
  }
  function nodes(nested=false){
    const out=[];let closed=false;
    while(idx<located.length){
      const {raw,line,offset}=located[idx++];const s=raw.trim();
      const base=offset+raw.length-raw.trimStart().length;
      if(!s||s.startsWith('//'))continue;
      if(s==='}'){if(!nested)throw diagnostic('ELN-UI-BRACE',source,offset,'unexpected }');closed=true;break;}
      let m;
      const styled=/^(section|main|article|header|div|ul|li|footer|nav|fieldset|h1|h2|h3|p|strong|small|span|output|legend|input|textarea|checkbox|select|button|form|submit|reset)\s+(?=[A-Za-z][\w-]*\s*=)/d.exec(s);
      if(styled){
        const tag=styled[1],style={},seen=new Set();let cursor=styled[0].length;
        while(true){
          const property=/^([A-Za-z][\w-]*)\s*=\s*/.exec(s.slice(cursor));if(!property)break;
          const name=property[1],nameAt=base+cursor;
          if(!['class','disabled','aria-pressed','aria-current','error','focus-invalid','on-input'].includes(name)||name==='disabled'&&!supportsDisabled(tag)||name.startsWith('aria-')&&tag!=='button'||name==='error'&&!supportsFieldError(tag)||name==='focus-invalid'&&tag!=='form'||name==='on-input'&&!supportsInputCallback(tag))throw diagnostic('ELN-DOM-ATTRIBUTE',source,nameAt,`Unsupported DOM property ${name} on ${tag}`);
          if(seen.has(name))throw diagnostic('ELN-DOM-ATTRIBUTE',source,nameAt,`Duplicate DOM property ${name}`);seen.add(name);cursor+=property[0].length;
          if(s[cursor]!=='(')throw diagnostic('ELN-DOM-ATTRIBUTE',source,base+cursor,`Expected a parenthesized ${name} expression`);
          let parsed;try{parsed=balanced(s,cursor,'(',')');}catch(error){throw diagnostic(name==='class'?'ELN-CLASS-SYNTAX':'ELN-DOM-SYNTAX',source,base+(error.start??cursor),error.message);}
          const raw=parsed.contents,leading=raw.length-raw.trimStart().length;
          const key=name.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
          style[key+'Expr']=checkExpr(source,base+cursor+1,raw,tolerant);style[key+'Span']=range(base+cursor+1+leading,raw.trim().length);
          cursor=parsed.end;cursor+=/^\s*/.exec(s.slice(cursor))[0].length;
        }
        const rest=s.slice(cursor),at=base+cursor;
        if(['section','main','article','header','div','ul','li','footer','nav','fieldset'].includes(tag)){
          if(rest!=='{')throw diagnostic(tag==='fieldset'?'ELN-DOM-SYNTAX':'ELN-CLASS-SYNTAX',source,at,
            tag==='fieldset'?'Expected a fieldset block after DOM properties':'Expected a container block after class expression');
          out.push({kind:'container',tag,className:null,...style,children:nodes(true),line});continue;
        }
        if(tag==='form'){
          const form=/^=>\s*(.+?)\s*\{$/d.exec(rest);if(!form)throw diagnostic('ELN-FORM-SYNTAX',source,at,'Expected form => action() with a block');
          out.push({kind:'container',tag:'form',className:null,tagSpan:range(base,4),submitExpr:checkExpr(source,at,form[1],tolerant),submitSpan:capture(form,1,at),...style,children:nodes(true),line});continue;
        }
        if(tag==='submit'||tag==='reset'){
          out.push({kind:'button',...(tag==='reset'?{reset:true}:{submit:true}),tagSpan:range(base,tag.length),label:checkExpr(source,at,rest,tolerant),labelSpan:range(at,rest.length),expr:'undefined',...style,line});continue;
        }
        if(tag==='select'){
          const selection=/^("(?:\\.|[^"\\])*")\s+<->\s+([A-Za-z_]\w*)\s*\{$/d.exec(rest);
          if(!selection)throw diagnostic('ELN-SELECT-SYNTAX',source,at,'Expected a label, direct state binding and option block');
          out.push({kind:'input',tag:'select',label:JSON.parse(selection[1]),binding:selection[2],bindingSpan:capture(selection,2,at),options:selectOptions(),...style,line});continue;
        }
        if(tag==='input'||tag==='textarea'||tag==='checkbox'){
          const input=/^("(?:\\.|[^"\\])*")\s+<->\s+([A-Za-z_]\w*)$/d.exec(rest);
          if(!input)throw diagnostic('ELN-CLASS-SYNTAX',source,at,`Expected a label and state binding after ${tag} class`);
          out.push({kind:'input',...(tag!=='input'?{tag}:{}),label:JSON.parse(input[1]),binding:input[2],bindingSpan:capture(input,2,at),...style,line});continue;
        }
        if(tag==='button'){
          const button=/^(.+?)\s+=>\s+(.+)$/d.exec(rest);
          if(!button)throw diagnostic('ELN-CLASS-SYNTAX',source,at,'Expected a label and click action after button class');
          out.push({kind:'button',label:checkExpr(source,at,button[1],tolerant),labelSpan:capture(button,1,at),expr:checkExpr(source,at,button[2],tolerant),exprSpan:capture(button,2,at),...style,line});continue;
        }
        if(!rest)throw diagnostic('ELN-CLASS-SYNTAX',source,at,'Expected a text expression after class');
        out.push({kind:'text',tag,...(tag==='legend'?{tagSpan:range(base,tag.length)}:{}),expr:checkExpr(source,at,rest,tolerant),exprSpan:range(at,rest.length),...style,line});continue;
      }
      if((m=/^form(?:\s+\.([A-Za-z][\w-]*))?\s+=>\s*(.+?)\s*\{$/d.exec(s))){out.push({kind:'container',tag:'form',className:m[1]??null,tagSpan:range(base,4),submitExpr:checkExpr(source,offset,m[2],tolerant),submitSpan:capture(m,2,base),children:nodes(true),line});continue;}
      if((m=/^reset\s+(.+)$/d.exec(s))){out.push({kind:'button',reset:true,tagSpan:range(base,5),label:checkExpr(source,offset,m[1],tolerant),labelSpan:capture(m,1,base),expr:'undefined',line});continue;}
      if((m=/^submit\s+(.+)$/d.exec(s))){out.push({kind:'button',submit:true,tagSpan:range(base,6),label:checkExpr(source,offset,m[1],tolerant),labelSpan:capture(m,1,base),expr:'undefined',line});continue;}
      if((m=/^if\s+(.+?)\s*\{$/d.exec(s))){out.push({kind:'if',expr:checkExpr(source,offset,m[1],tolerant),exprSpan:capture(m,1,base),children:nodes(true),line});continue;}
      if((m=/^each\s+([A-Za-z_]\w*)\s+in\s+(.+?)\s+by\s+(.+?)\s*\{$/d.exec(s))){
        out.push({kind:'each',variable:m[1],variableSpan:capture(m,1,base),collection:checkExpr(source,offset,m[2],tolerant),collectionSpan:capture(m,2,base),key:checkExpr(source,offset,m[3],tolerant),keySpan:capture(m,3,base),children:nodes(true),line});continue;
      }
      if((m=/^(section|main|article|header|div|ul|li|footer|nav|fieldset)(?:\s+\.([A-Za-z][\w-]*))?\s*\{$/.exec(s))){
        out.push({kind:'container',tag:m[1],className:m[2]??null,children:nodes(true),line});continue;
      }
      if((m=/^fill\s+([A-Za-z_]\w*)\s*\{$/d.exec(s))){out.push({kind:'fill',name:m[1],nameSpan:capture(m,1,base),children:nodes(true),line});continue;}
      if(s==='slot'||(m=/^slot\s+([a-zA-Z_]\w*)$/.exec(s))){out.push({kind:'slot',name:m?m[1]:'default',line});continue;}
      if((m=/^on\s+([A-Za-z_]\w*)\s*\(\s*([A-Za-z_]\w*)?\s*\)\s*=>\s*(.+)$/d.exec(s))){
        out.push({kind:'on',name:m[1],nameSpan:capture(m,1,base),param:m[2]??null,paramSpan:m[2]?capture(m,2,base):null,expr:checkExpr(source,offset,m[3],tolerant),exprSpan:capture(m,3,base),line});continue;
      }
      if((m=/^select\s+("(?:\\.|[^"\\])*")\s+<->\s+([A-Za-z_]\w*)\s*\{$/d.exec(s))){out.push({kind:'input',tag:'select',label:JSON.parse(m[1]),binding:m[2],bindingSpan:capture(m,2,base),options:selectOptions(),line});continue;}
      if((m=/^(input|textarea|checkbox)\s+("(?:\\.|[^"\\])*")\s+<->\s+([A-Za-z_]\w*)$/d.exec(s))){
        out.push({kind:'input',...(m[1]!=='input'?{tag:m[1]}:{}),label:JSON.parse(m[2]),binding:m[3],bindingSpan:capture(m,3,base),line});continue;
      }
      if((m=/^button\s+(.+?)\s+=>\s+(.+)$/d.exec(s))){
        out.push({kind:'button',label:checkExpr(source,offset,m[1],tolerant),labelSpan:capture(m,1,base),expr:checkExpr(source,offset,m[2],tolerant),exprSpan:capture(m,2,base),line});continue;
      }
      if((m=/^(h1|h2|h3|p|strong|small|span|output|legend)\s+(.+)$/d.exec(s))){
        out.push({kind:'text',tag:m[1],...(m[1]==='legend'?{tagSpan:capture(m,1,base)}:{}),expr:checkExpr(source,offset,m[2],tolerant),exprSpan:capture(m,2,base),line});continue;
      }
      if((m=/^([A-Z][A-Za-z_0-9]*)(?:\s+(.+?))?\s*\{$/d.exec(s))){
        out.push({kind:'component',name:m[1],nameSpan:capture(m,1,base),props:parseAttributes(source,m[2]?base+m.indices[2][0]:base+m[1].length,m[2]||'',tolerant,recoveryDiagnostics),attributesSpan:range(base+m[1].length,s.length-m[1].length-1),children:nodes(true),line});continue;
      }
      if((m=/^([A-Z][A-Za-z_0-9]*)(?:\s+(.+))?$/d.exec(s))){
        out.push({kind:'component',name:m[1],nameSpan:capture(m,1,base),props:parseAttributes(source,m[2]?base+m.indices[2][0]:base+m[1].length,m[2]||'',tolerant,recoveryDiagnostics),attributesSpan:range(base+m[1].length,raw.replace(/\r$/,'').length-(base-offset)-m[1].length),children:[],line});continue;
      }
      const error=diagnostic('ELN-UI-UNSUPPORTED',source,base,`unsupported UI statement: ${s}`);
      // Recover only non-structural lines. Never guess a missing block's scope.
      if(!tolerant||/[{}]/.test(s))throw error;
      recoveryDiagnostics.push(error);
    }
    if(nested&&!closed)throw diagnostic('ELN-UI-BRACE',source,bodyOffset,'missing }');
    return out;
  }
  return nodes();
}
function parseParams(source,pos,params){
  const sf=ts.createSourceFile('params.ts',`function __f(${params}){}`,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  if(sf.parseDiagnostics.length)throw diagnostic('ELN-TS-PARSE',source,pos,ts.flattenDiagnosticMessageText(sf.parseDiagnostics[0].messageText,' '));
  const shift=pos+1-'function __f('.length;
  const span=node=>node ? range(node.getStart(sf)+shift,node.getWidth(sf)) : null;
  return sf.statements[0].parameters.map(p=>({name:p.name.getText(sf),raw:p.getText(sf),type:p.type?.getText(sf)??'unknown',nameSpan:span(p.name),rawSpan:span(p),typeSpan:span(p.type),initializerSpan:span(p.initializer),optional:!!(p.questionToken||p.initializer)}));
}
export function parseSurface(source,filename='Component.eln',{tolerant=false,guardRecovery=null}={}){
  const recoveryDiagnostics=[];
  if(!tolerant)guardRecovery=null;
  const guardDirective=/^\uFEFF?\/\/ @surface-guard[ \t]*\r?\n/.exec(source);
  const headerOffset=guardDirective?.[0].length??0;
  const m=/\bcomponent\s+([A-Za-z_]\w*)\s*\(/d.exec(source);
  if(!m)throw diagnostic('ELN-PARSE-COMPONENT',source,0,'expected component Name(props)');
  const headerSource=source.slice(headerOffset,m.index);
  const header=headerSource.trim();
  if(header&&!header.split('\n').filter(x=>x.trim()).every(x=>/^import\s+.+from\s+["'][^"']+["'];?\s*$/.test(x.trim())))
    throw diagnostic('ELN-PARSE-IMPORT',source,0,'only import declarations supported before component');
  const importSource=ts.createSourceFile('imports.ts',source.slice(0,m.index),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  if(importSource.parseDiagnostics.length){
    const error=importSource.parseDiagnostics[0];
    throw diagnostic('ELN-TS-PARSE',source,error.start??0,ts.flattenDiagnosticMessageText(error.messageText,' '));
  }
  const imports=importSource.statements.filter(ts.isImportDeclaration).map(node=>{
    const clause=node.importClause;
    const local=clause?.name??(clause?.namedBindings&&ts.isNamespaceImport(clause.namedBindings)?clause.namedBindings.name:null);
    return {typeOnly:!!clause?.isTypeOnly,local:local?.text,path:node.moduleSpecifier.text,
      defaultOnly:!!clause?.name&&!clause.namedBindings,
      nameSpan:local?range(local.getStart(importSource),local.getWidth(importSource)):null,
      pathSpan:range(node.moduleSpecifier.getStart(importSource)+1,node.moduleSpecifier.getWidth(importSource)-2)};
  });
  const name=m[1],argAt=m.index+m[0].length-1,args=balanced(source,argAt,'(',')');
  const params=parseParams(source,argAt,args.contents);
  let pos=skip(source,args.end);
  if(source[pos]!=='{')throw diagnostic('ELN-PARSE-BODY',source,pos,'expected component body');
  const body=balanced(source,pos,'{','}',tolerant,guardRecovery);
  if(skip(source,body.end)!==source.length)throw diagnostic('ELN-PARSE-TRAIL',source,body.end,'unexpected content after component');
  pos++;
  const states=[],calcs=[],actions=[],events=[],actionGroups=[];let ui=null,disposal=null;
  function groupError(code, span, message) {
    const error=Object.assign(diagnostic(code,source,span.start,message),{length:span.length});
    if(!tolerant)throw error;
    recoveryDiagnostics.push(error);
  }
  while(pos<body.end-1){
    pos=skip(source,pos);if(pos>=body.end-1)break;
    const remaining=source.slice(pos);let match;
    if((match=/^on\s+([A-Za-z_]\w*)\s*\(([^)\r\n]*)\)\s*=>\s*([^\r\n]+)/d.exec(remaining))){
      if(match[1]!=='dispose'||match[2].trim()||disposal)throw Object.assign(diagnostic('ELN-LIFECYCLE-EVENT',source,pos+match.indices[1][0],'A component accepts one on dispose() handler without parameters'),{length:match[1].length});
      disposal={nameSpan:capture(match,1,pos),expr:checkExpr(source,pos,match[3],tolerant),exprSpan:capture(match,3,pos,true),line:source.slice(0,pos).split('\n').length};pos+=match[0].length;continue;
    }
    if((match=/^(state|calc)[ \t]+([A-Za-z_]\w*)([ \t]*:[ \t]*[^=\r\n]+)?[ \t]*=[ \t]*(\()(?=[ \t]*\r?\n)/d.exec(remaining)) &&
       (match[1]==='state'||!match[3])){
      const start=pos+match.indices[4][0];
      const {end}=balanced(source,start,'(',')',tolerant);
      const semicolon=end+/^[ \t]*/.exec(source.slice(end))[0].length;
      if(source[semicolon]!==';')throw diagnostic('ELN-PARSE-DECL',source,semicolon,'expected a semicolon after the multiline initializer');
      const expr=checkExpr(source,start,source.slice(start,end),tolerant,true);
      const declaration={name:match[2],nameSpan:capture(match,2,pos),expr,exprSpan:range(start,end-start),line:source.slice(0,pos).split('\n').length};
      if(match[1]==='state'){
        states.push({...declaration,type:match[3]?.trim()??'',typeSpan:match[3]?capture(match,3,pos,true):null});
      }else calcs.push(declaration);
      pos=semicolon+1;
      continue;
    }
    if((match=/^state\s+([A-Za-z_]\w*)(\s*:\s*[^=\n]+)?\s*=\s*([^\n;]+);/d.exec(remaining))){
      states.push({name:match[1],nameSpan:capture(match,1,pos),type:match[2]?.trim()??'',typeSpan:match[2]?capture(match,2,pos,true):null,expr:checkExpr(source,pos,match[3],tolerant),exprSpan:capture(match,3,pos,true),line:source.slice(0,pos).split('\n').length});pos+=match[0].length;continue;
    }
    if((match=/^calc\s+([A-Za-z_]\w*)\s*=\s*([^\n;]+);/d.exec(remaining))){
      calcs.push({name:match[1],nameSpan:capture(match,1,pos),expr:checkExpr(source,pos,match[2],tolerant),exprSpan:capture(match,2,pos,true),line:source.slice(0,pos).split('\n').length});pos+=match[0].length;continue;
    }
    if((match=/^event\s+([A-Za-z_]\w*)\s*\(/d.exec(remaining))){
      const start=pos+match[0].length-1,p=balanced(source,start,'(',')');
      const declarations=parseParams(source,start,p.contents);
      if(declarations.length>1)throw diagnostic('ELN-EVENT-ARITY',source,start,'spike 003 supports at most one event argument');
      events.push({name:match[1],nameSpan:capture(match,1,pos),params:declarations,line:source.slice(0,pos).split('\n').length});pos=p.end;continue;
    }
    if((match=/^action[ \t]+group[ \t]+([A-Za-z_]\w*)[ \t]*\([ \t]*([A-Za-z_]\w*)[ \t]*\)[ \t]*([\w-]*)[ \t]*(?:;|(?=\/\/|\r?\n|$))/d.exec(remaining))){
      const group={name:match[1],nameSpan:capture(match,1,pos),owner:match[2],ownerSpan:capture(match,2,pos),
        policy:match[3],policySpan:capture(match,3,pos),line:source.slice(0,pos).split('\n').length};
      if(!actionGroupPolicies.includes(group.policy))groupError('ELN-ACTION-GROUP-POLICY',group.policySpan,
        'Choose single-flight or latest as the action group policy');
      actionGroups.push(group);pos+=match[0].length;continue;
    }
    if((match=/^action\s+(async\s+)?([A-Za-z_]\w*)\s*\(/d.exec(remaining))){
      const start=pos+match[0].length-1,p=balanced(source,start,'(',')');
      let blockAt=skip(source,p.end),membership;
      const member=/^in\b[ \t]*([A-Za-z_]\w*|)/d.exec(source.slice(blockAt));
      if(member){
        membership={group:member[1],groupSpan:capture(member,1,blockAt)};
        if(!match[1])groupError('ELN-ACTION-GROUP-ASYNC',membership.groupSpan,'Add async to an action that joins a group');
        blockAt=skip(source,blockAt+member[0].length);
      }
      const b=balanced(source,blockAt,'{','}',tolerant,guardRecovery);
      const action={name:match[2],nameSpan:capture(match,2,pos),params:p.contents,paramsSpan:range(start+1,p.contents.length),bodySpan:range(blockAt+1,b.contents.length),async:!!match[1],line:source.slice(0,pos).split('\n').length,...membership};
      const prefix=actionFunctionPrefix(action);
      Object.assign(action,projectGuardedBody(ts,source,action,prefix,
        at=>balanced(source,at,'{','}',tolerant).end,
        (code,at,message,{length,canRecover}={})=>{
          const error=diagnostic(code,source,at,message);
          if(length!==undefined)error.length=length;
          if(!tolerant||!canRecover)throw error;
          recoveryDiagnostics.push(error);
        },guardRecovery));
      const fn=prefix+(action.bodySegments?actionBodyText(source,action.bodySegments):b.contents)+'}';
      const sf=ts.createSourceFile('action.ts',fn,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
      const originalOffset=offset=>action.bodySegments?guardedBodyOffset(action.bodySegments,offset-prefix.length)??pos:pos;
      if(sf.parseDiagnostics.length&&!tolerant){
        const error=sf.parseDiagnostics[0];
        throw diagnostic('ELN-TS-PARSE',source,originalOffset(error.start),ts.flattenDiagnosticMessageText(error.messageText,' '));
      }
      if(action.bodySegments){
        function valueReturn(node){
          if(ts.isFunctionLike(node))return;
          if(ts.isReturnStatement(node)&&node.expression)return node;
          return ts.forEachChild(node,valueReturn);
        }
        const returned=sf.statements[0]?.body&&valueReturn(sf.statements[0].body);
        if(returned)throw diagnostic('ELN-GUARD-RETURN',source,originalOffset(returned.getStart(sf)),'A guarded action can only return without a value');
      }
      actions.push({...action,functionSource:fn});pos=b.end;continue;
    }
    if((match=/^ui\s*\{/.exec(remaining))){
      if(ui)throw diagnostic('ELN-UI-MULTIPLE',source,pos,'only one ui block allowed');
      const opening=pos+match[0].length-1,b=balanced(source,opening,'{','}',tolerant);
      ui=parseUI(source,b.contents,opening+1,tolerant,recoveryDiagnostics);pos=b.end;continue;
    }
    const error=diagnostic('ELN-PARSE-DECL',source,pos,'unsupported declaration');
    const end=source.indexOf('\n',pos);
    const line=source.slice(pos,end<0?body.end-1:end);
    if(!tolerant||! /^(state|calc)\b/.test(line)||/[{}]/.test(line))throw error;
    recoveryDiagnostics.push(error);pos=end<0?body.end-1:end+1;
  }
  if(guardRecovery&&!recoveryDiagnostics.some(error=>error.code==='ELN-GUARD-CLOSE'&&error.start===guardRecovery.opening)){
    throw diagnostic('ELN-PARSE-003',source,guardRecovery.opening,'unterminated block');
  }
  if(!ui)throw diagnostic('ELN-UI-MISSING',source,body.end-1,'component needs ui');
  const names=[...params,...states,...calcs,...actions].map(x=>x.name);
  if(new Set(names).size!==names.length)throw diagnostic('ELN-SEM-NAME',source,0,'duplicate binding');
  const boundNames=new Set([...names,'emit']);
  const owners=new Set([...params,...states,...calcs].map(item=>item.name));
  const groups=new Set();
  for(const group of actionGroups){
    if(boundNames.has(group.name))groupError('ELN-ACTION-GROUP-NAME',group.nameSpan,`Choose an unused name for action group '${group.name}'`);
    else groups.add(group.name);
    boundNames.add(group.name);
    if(!owners.has(group.owner))groupError('ELN-ACTION-GROUP-OWNER',group.ownerSpan,
      `Action group owner '${group.owner}' must name a prop, state or calc in this component`);
  }
  for(const action of actions)if(action.groupSpan&&!groups.has(action.group)){
    groupError('ELN-ACTION-GROUP-MEMBER',action.groupSpan,groups.size
      ? `Choose a declared action group: ${[...groups].join(', ')}` : 'Declare an action group before adding members');
  }
  if(new Set(events.map(x=>x.name)).size!==events.length)throw diagnostic('ELN-SEM-EVENT',source,0,'duplicate event declaration');
  const mutable=new Set(states.map(x=>x.name));
  const slots=new Set();
  function validate(nodes,inForm=false,parentTag){
    for(const [index,n] of nodes.entries()){
      if(n.tag==='legend'&&(parentTag!=='fieldset'||index!==0)){
        const error=Object.assign(diagnostic('ELN-LEGEND-POSITION',source,n.tagSpan.start,
          'Place legend first inside its fieldset'),{length:n.tagSpan.length});
        if(!tolerant)throw error;
        recoveryDiagnostics.push(error);
      }
      if(n.tag==='form'){
        const handlers=n.children.filter(child=>child.kind==='on');
        if(handlers.length>1)throw Object.assign(diagnostic('ELN-FORM-EVENT',source,handlers[1].nameSpan.start,'Only one reset handler is supported on a form'),{length:handlers[1].nameSpan.length});
        for(const handler of handlers){
          if(handler.name!=='reset'||handler.param)throw Object.assign(diagnostic('ELN-FORM-EVENT',source,handler.nameSpan.start,'A native form accepts only on reset() without a payload parameter'),{length:handler.nameSpan.length});
          n.resetExpr=handler.expr;n.resetSpan=handler.exprSpan;n.resetLine=handler.line;
        }
        n.children=n.children.filter(child=>child.kind!=='on');
      }
      if(n.tag==='form'&&inForm)throw diagnostic('ELN-FORM-NESTING',source,n.tagSpan.start,'Nested forms are not supported');
      if(n.kind==='input'&&!mutable.has(n.binding))throw diagnostic('ELN-SEM-BIND',source,['textarea','checkbox','select'].includes(n.tag)?n.bindingSpan.start:0,`binding ${n.binding} must be state`);
      if(n.kind==='slot'){if(slots.has(n.name))throw diagnostic('ELN-SEM-SLOT',source,0,`duplicate slot ${n.name}`);slots.add(n.name);}
      if(n.children)validate(n.children,inForm||n.tag==='form',n.tag);
    }
  }
  validate(ui);
  const headerStart=headerOffset+headerSource.length-headerSource.trimStart().length;
  return {name,nameSpan:capture(m,1,0),params,states,calcs,actions,actionGroups,events,...(disposal?{disposal}:{}),ui,slots:[...slots],header,headerSpan:range(headerStart,header.length),imports,filename,source,recoveryDiagnostics};
}
