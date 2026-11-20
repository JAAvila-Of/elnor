// Editor-only recovery; the strict parser and emitted runtime are unchanged.
import {getTs} from './typescript.mjs';
import {parseSurface,supportsFieldError,supportsInputCallback} from './parser.mjs';
const ts=getTs(),containers=['form','section','main','article','header','div','ul','li','footer','nav'];
const tags=[...containers,'h1','h2','h3','p','strong','small','span','output','button','input','textarea','checkbox','select','submit','reset'];
const hostPattern=new RegExp('^[ \\t]*('+tags.join('|')+')[ \\t]+');
function namesFor(tag){return ['class',...(['button','submit','reset','input','textarea','checkbox','select'].includes(tag)?['disabled']:[]),...(tag==='button'?['aria-pressed','aria-current']:[]),...(supportsFieldError(tag)?['error']:[]),...(tag==='form'?['focus-invalid']:[]),...(supportsInputCallback(tag)?['on-input']:[])];}
const recoveryProperties = new Map([
 ['error',{name:'aria-pressed',key:'ariaPressed',originalKey:'error'}],
 ['focus-invalid',{name:'aria-pressed',key:'ariaPressed',originalKey:'focusInvalid'}],
 ['on-input',{name:'aria-current',key:'ariaCurrent',originalKey:'onInput'}],
]);
function opaqueRanges(source){
 const scanner=ts.createScanner(ts.ScriptTarget.Latest,false,ts.LanguageVariant.Standard,source),ranges=[];let template=null,stack=[];
 for(let kind=scanner.scan();kind!==ts.SyntaxKind.EndOfFileToken;kind=scanner.scan()){
  const start=scanner.getTokenPos(),end=scanner.getTextPos();
  if(kind===ts.SyntaxKind.TemplateHead){if(template===null)template=start;stack.push(0);continue;}
  if(template!==null){
   if(kind===ts.SyntaxKind.OpenBraceToken)stack[stack.length-1]++;
   else if(kind===ts.SyntaxKind.CloseBraceToken){if(stack.at(-1)>0)stack[stack.length-1]--;else{kind=scanner.reScanTemplateToken(false);if(kind===ts.SyntaxKind.TemplateTail){stack.pop();if(!stack.length){ranges.push({start:template,end:scanner.getTextPos(),unterminated:scanner.isUnterminated()});template=null;}}}}
   continue;
  }
  if([ts.SyntaxKind.StringLiteral,ts.SyntaxKind.NoSubstitutionTemplateLiteral,ts.SyntaxKind.SingleLineCommentTrivia,ts.SyntaxKind.MultiLineCommentTrivia].includes(kind))ranges.push({start,end,unterminated:scanner.isUnterminated()});
 }
 if(template!==null)ranges.push({start:template,end:source.length,unterminated:true});return ranges;
}
function mask(source,ranges){const chars=source.split('');for(const r of ranges)for(let i=r.start;i<r.end;i++)if(chars[i]!=='\n'&&chars[i]!=='\r')chars[i]=' ';return chars.join('');}
function lines(source){let start=0,line=0;return source.split('\n').map(raw=>{const value={start,text:raw.replace(/\r$/,''),line:++line};start+=raw.length+1;return value;});}
function balanced(text,visible,start){
 const stack=['('];for(let i=start+1;i<text.length;i++){const c=visible[i];if('({['.includes(c))stack.push(c);else if(')}]'.includes(c)){if(')}]'['({['.indexOf(stack.pop())]!==c)return null;if(!stack.length)return {end:i+1};}}
 return {end:text.length,unfinished:stack.length===1&&stack[0]==='('};
}
function realUiLine(source,line,tag){
 const block=(containers.includes(tag)||tag==='select')&&line.text.trimEnd().endsWith('{'),stub=tag==='form'&&block?'form .elnor-dom-completion-probe => undefined {':block?'div .elnor-dom-completion-probe {':'p "__elnor_dom_completion__"';
 let tail=source.slice(line.start+line.text.length);
 if(tag==='select'&&block){const close=/^[ \t]*}[ \t]*\r?$/m.exec(tail);if(!close)return false;const body=tail.slice(0,close.index);if(body.split('\n').some(row=>row.trim()&&!row.trim().startsWith('//')&&!/^option\s/.test(row.trim())))return false;tail=body.replace(/^[ \t]*option[^\n]*/gm,'p "__elnor_option_probe__"')+tail.slice(close.index);}
 const candidate=source.slice(0,line.start)+stub+tail;
 try{const ir=parseSurface(candidate,'dom-editor-probe.eln',{tolerant:true});let found=false;function walk(nodes){for(const n of nodes){if(n.line===line.line&&(block?n.kind==='container'&&n.className==='elnor-dom-completion-probe':n.kind==='text'&&n.expr==='"__elnor_dom_completion__"'))found=true;if(n.children)walk(n.children);}}walk(ir.ui);return found;}catch{return false;}
}
function inValidPayload(ir,source,offset){
 let found=false;function walk(nodes){for(const n of nodes){const span=n.kind==='button'?n.labelSpan:n.kind==='text'?n.exprSpan:null;if(span&&offset>=span.start&&offset<=span.start+span.length){const expr=source.slice(span.start,span.start+span.length),sf=ts.createSourceFile('caption.ts',`const x=(${expr});`,ts.ScriptTarget.Latest,true);if(!sf.parseDiagnostics.length)found=true;}if(n.children)walk(n.children);}}if(ir)walk(ir.ui);return found;
}
export function domPropertyCompletions(source,offset,file,ir){
 if(!Number.isInteger(offset)||offset<0||offset>source.length)return null;
 const ranges=opaqueRanges(source);if(ranges.some(r=>offset>r.start&&(offset<r.end||r.unterminated&&offset===r.end)))return null;
 const line=lines(source).find(l=>offset>=l.start&&offset<=l.start+l.text.length);if(!line)return null;const match=hostPattern.exec(line.text);if(!match)return null;
 const tag=match[1],allowed=namesFor(tag),local=offset-line.start,visible=mask(source,ranges).slice(line.start,line.start+line.text.length),entries=[];let cursor=match[0].length,target=null;
 if(inValidPayload(ir,source,offset))return null;
 for(;;){
  const gap=cursor;while(/[ \t]/.test(line.text[cursor]??'\0'))cursor++;
  if(!target&&local>=gap&&local<=cursor)target={start:local,length:0,prefix:'',equals:false};
  const token=/^[A-Za-z][\w-]*/.exec(line.text.slice(cursor));if(!token)break;
  const name=token[0],start=cursor,end=cursor+name.length,isTarget=local>=start&&local<=end;
  if(isTarget)target={start,length:name.length,prefix:name.slice(0,local-start),equals:false};
  if(!allowed.includes(name)&&!isTarget)return null;
  cursor=end;while(/[ \t]/.test(line.text[cursor]??'\0'))cursor++;
  if(line.text[cursor]!=='='||(tag==='form'&&line.text[cursor+1]==='>')){if(isTarget)continue;break;}
  if(isTarget)target.equals=true;
  cursor++;while(/[ \t]/.test(line.text[cursor]??'\0'))cursor++;
  if(line.text[cursor]!=='(')break;
  const value=balanced(line.text,visible,cursor);if(!value||local>cursor&&local<=value.end)return null;
  if(!allowed.includes(name))return null;entries.push({name,target:isTarget});cursor=value.end;if(value.unfinished)break;
 }
 if(!target||!allowed.some(n=>n.startsWith(target.prefix))||!realUiLine(source,line,tag))return null;
 const used=new Set(entries.filter(e=>!e.target).map(e=>e.name));return allowed.filter(n=>n.startsWith(target.prefix)&&!used.has(n)).map(name=>({name,kind:'property',replacementSpan:{file,start:line.start+target.start,length:target.length},insertText:target.equals?name:name+'=(${1})',isSnippet:!target.equals}));
}
export function recoverDomPrefix(source,filename){
 const ranges=opaqueRanges(source),visible=mask(source,ranges),candidates=[];
 for(const line of lines(source)){
  const match=hostPattern.exec(line.text);if(!match||ranges.some(r=>line.start+match[0].length>r.start&&line.start+match[0].length<r.end))continue;
  const allowed=namesFor(match[1]),seen=new Set(),mappedProperties=[];let cursor=match[0].length;
  for(;;){
   const property=/^([A-Za-z][\w-]*)\s*=\s*/.exec(line.text.slice(cursor));if(!property||!allowed.includes(property[1])||seen.has(property[1]))break;
   const surrogate=recoveryProperties.get(property[1]);
   if(surrogate)mappedProperties.push({start:line.start+cursor,length:property[1].length,surrogate});
   seen.add(property[1]);cursor+=property[0].length;if(line.text[cursor]!=='(')break;
   const value=balanced(line.text,visible.slice(line.start,line.start+line.text.length),cursor);if(!value)break;
   if(value.unfinished){if(!ranges.some(r=>r.unterminated&&r.start>=line.start&&r.start<=line.start+line.text.length)&&realUiLine(source,line,match[1]))candidates.push({line,mappedProperties});break;}
   if(value.end===line.text.length)break;cursor=value.end;while(/[ \t]/.test(line.text[cursor]??'\0'))cursor++;
  }
 }
 if(candidates.length!==1)return null;
 const {line,mappedProperties}=candidates[0],tag=hostPattern.exec(line.text)[1];
 const tagStart=line.start+line.text.indexOf(tag),at=line.start+line.text.length;
 // Use an unmapped button placeholder for the expression only. It introduces
 // neither a fabricated state binding nor mappings for its synthetic payload.
 const edits=[[tagStart,tagStart+tag.length,'button']];
 // Reuse the placeholder's ARIA slots for properties on other hosts.
 for(const {start,length,surrogate} of mappedProperties)edits.push([start,start+length,surrogate.name]);
 edits.push([at,at,') "__elnor_dom_placeholder__" => undefined']);
 const segments=[];
 let repaired='',original=0;
 for(const [start,end,replacement] of edits){
  segments.push({start:repaired.length,end:repaired.length+start-original,original});
  repaired+=source.slice(original,start)+replacement;
  original=end;
 }
 segments.push({start:repaired.length,end:repaired.length+source.length-original,original});
 repaired+=source.slice(original);
 let ir;
 try{ir=parseSurface(repaired,filename,{tolerant:true});}catch{return null;}
 const remap=value=>{if(!value||typeof value!=='object')return value;if(Number.isInteger(value.start)&&Number.isInteger(value.length)){const segment=segments.find(s=>value.start>=s.start&&value.start+value.length<=s.end);if(!segment)return null;value.start=segment.original+value.start-segment.start;return value;}if(Array.isArray(value))return value.map(remap);for(const key of Object.keys(value))value[key]=remap(value[key]);return value;};remap(ir);
 function mark(nodes){
  for(const node of nodes){
   if(node.line===line.line){
    node.domPrefixRecovery=true;
    for(const {surrogate:{key,originalKey}} of mappedProperties){
     node[originalKey+'Expr']=node[key+'Expr'];
     node[originalKey+'Span']=node[key+'Span'];
     delete node[key+'Expr'];
     delete node[key+'Span'];
    }
   }
   if(node.children)mark(node.children);
  }
 }
 mark(ir.ui);ir.source=source;ir.domPrefixRecovered=true;return ir;
}
