import {getTs} from './typescript.mjs';
import {parseSurface} from './parser.mjs';
import {actionFormattingSource} from './action-guards.mjs';

const ts=getTs();
const initializerLineWidth = 100;
const conditionLineWidth = 90;
function refusal(code,message,start=0,length=0){return Object.assign(new Error(message),{code,start,length});}
function merged(ranges){
  const result=[];
  for(const range of ranges.filter(Boolean).map(range=>({start:range.start,end:range.end??range.start+range.length})).sort((a,b)=>a.start-b.start)){
    const previous=result.at(-1);
    if(previous&&range.start<=previous.end)previous.end=Math.max(previous.end,range.end);
    else result.push({...range});
  }
  return result;
}
function masked(source,ranges){
  const chars=source.split('');
  for(const range of merged(ranges))for(let i=range.start;i<range.end;i++)if(chars[i]!=='\r'&&chars[i]!=='\n')chars[i]=' ';
  return chars.join('');
}
function scan(source){
  const scanner=ts.createScanner(ts.ScriptTarget.Latest,false,ts.LanguageVariant.Standard,source),tokens=[];
  for(let kind=scanner.scan();kind!==ts.SyntaxKind.EndOfFileToken;kind=scanner.scan())tokens.push({kind,start:scanner.getTokenPos(),end:scanner.getTextPos()});
  return tokens;
}
function literalRanges(sf){
  const result=[];
  function walk(node){
    if(ts.isStringLiteralLike(node)||ts.isRegularExpressionLiteral(node)||ts.isTemplateExpression(node)){
      result.push({start:node.getStart(sf),end:node.end});return;
    }
    ts.forEachChild(node,walk);
  }
  walk(sf);return result;
}
function comments(source,literals=[]){return scan(masked(source,literals)).filter(token=>[ts.SyntaxKind.SingleLineCommentTrivia,ts.SyntaxKind.MultiLineCommentTrivia].includes(token.kind));}
function signature(source){
  const sf=ts.createSourceFile('signature.ts',source,ts.ScriptTarget.Latest,true),tokens=[];
  function walk(node){
    const children=node.getChildren(sf);
    if(children.length)children.forEach(walk);
    else if(node.kind!==ts.SyntaxKind.EndOfFileToken&&node.getWidth(sf)>0)tokens.push([node.kind,node.getText(sf)]);
  }
  walk(sf);
  return {tokens,comments:comments(source,literalRanges(sf)).map(range=>source.slice(range.start,range.end))};
}
function semanticShape(value,key=''){
  if(Array.isArray(value))return value.map(item=>semanticShape(item,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value)
    .filter(([name])=>!['source','filename','line','resetLine','raw','recoveryDiagnostics','guardSpans','bodySegments'].includes(name)&&!name.endsWith('Span'))
    .sort(([left],[right])=>left<right?-1:left>right?1:0)
    .map(([name,item])=>[name,semanticShape(item,name==='expr'&&(key==='states'||key==='calcs')?'initializer':name)]));
  if(key==='functionSource'||key==='header')return signature(value);
  if (typeof value==='string' && ((key==='initializer'&&value.startsWith('(')) || (key==='expr'&&value.includes('\n'))))
    return signature('const value = '+value+';');
  // The complete action signature above covers its raw parameter text.
  if(key==='params'&&typeof value==='string')return null;
  return value;
}
function lines(source){
  const result=[];let start=0;
  for(const text of source.split('\n')){
    const end=start+text.length,begin=start+(start===0&&text.startsWith('\uFEFF')?1:0);
    const prefix=/^[ \t]*/.exec(source.slice(begin,end))[0];
    result.push({start,begin,end,content:begin+prefix.length,prefix});start=end+1;
  }
  return result;
}
function covered(content,ranges){return ranges.some(range=>range.start<content&&range.end>content);}
function columns(prefix,size){let count=0;for(const char of prefix)count=char==='\t'?count+size-count%size:count+1;return count;}
function tsIndentEdits(source,size,eol){
  const file='/elnor-formatter/action.ts';
  const host={getScriptFileNames:()=>[file],getScriptVersion:()=> '0',
    getScriptSnapshot:name=>name===file?ts.ScriptSnapshot.fromString(source):undefined,
    getCurrentDirectory:()=>'/elnor-formatter',getCompilationSettings:()=>({target:ts.ScriptTarget.Latest}),
    getDefaultLibFileName:()=> 'lib.d.ts',fileExists:name=>name===file,readFile:name=>name===file?source:undefined};
  const service=ts.createLanguageService(host);
  try{return service.getFormattingEditsForDocument(file,{indentSize:size,tabSize:size,convertTabsToSpaces:true,indentStyle:ts.IndentStyle.Smart,newLineCharacter:eol});}
  finally{service.dispose();}
}

function initializerLayout(source, ir, size, eol) {
  const edits = [];
  const sourceLines = lines(source);
  const prefix = 'const value = ';
  for (const binding of [...ir.states, ...ir.calcs]) {
    const {expr, exprSpan, line} = binding;
    if (!expr.startsWith('(') || !expr.endsWith(')') || /[\r\n]/.test(expr)) continue;
    const {content, end} = sourceLines[line - 1];
    const before = source.slice(content, exprSpan.start);
    const after = source.slice(exprSpan.start + exprSpan.length, end);
    if (!/^(?:state|calc)[ \t]/.test(before) || !/^[ \t]*;[ \t]*\r?$/.test(after)) continue;
    if (size + columns(source.slice(content, end).trimEnd(), size) <= initializerLineWidth) continue;

    const text = prefix + expr + ';';
    const sf = ts.createSourceFile('initializer.ts', text, ts.ScriptTarget.Latest, true);
    const outer = sf.statements[0]?.declarationList?.declarations[0]?.initializer;
    if (sf.parseDiagnostics.length || !outer || !ts.isParenthesizedExpression(outer)) continue;
    const inner = outer.expression;
    const boundaries = [[outer.getStart(sf) + 1, inner.getStart(sf)], [inner.end, outer.end - 1]];
    const whitespaceGap = ([start, end]) => /^[ \t]*$/.test(text.slice(start, end));
    if (!boundaries.every(whitespaceGap)) continue;
    if (ts.isConditionalExpression(inner)) {
      const branches = [[inner.condition.end, inner.questionToken.getStart(sf)],
        [inner.whenTrue.end, inner.colonToken.getStart(sf)]];
      if (branches.every(whitespaceGap)) boundaries.push(...branches);
    }
    const offset = exprSpan.start - prefix.length;
    for (const [start, end] of boundaries) {
      edits.push({start: offset + start, length: end - start, newText: eol});
    }
  }
  return edits;
}

function layoutSource(source, ir, size, eol) {
  const edits = initializerLayout(source, ir, size, eol);
  for (const action of ir.actions) {
    const sf = ts.createSourceFile('action.ts', actionFormattingSource(source,action), ts.ScriptTarget.Latest, true);
    const body = sf.statements[0]?.body;
    if (!body) continue;
    const offset = action.bodySpan.start - body.getStart(sf) - 1;
    const guardStarts = new Set(action.guardSpans?.map(({keywordSpan}) => keywordSpan.start));

    function replaceGap(start, end, pattern, newText) {
      const gap = sf.text.slice(start, end);
      const match = pattern.exec(gap);
      if (!match) return;
      const prefixLength = match[1]?.length ?? 0;
      const length = gap.length - prefixLength;
      if (gap.slice(prefixLength) !== newText) {
        edits.push({start: offset + start + prefixLength, length, newText});
      }
    }

    function wrapCondition(start, expression, parentheses) {
      const tokens = parentheses.getChildren(sf);
      const open = tokens.find(token => token.kind===ts.SyntaxKind.OpenParenToken);
      const close = tokens.find(token => token.kind===ts.SyntaxKind.CloseParenToken);
      if (!open || !close) return;
      const condition = sf.text.slice(start, close.end);
      if (/[\r\n]/.test(condition) || columns(condition,size)<=conditionLineWidth) return;

      const gaps = [[open.end, expression.getStart(sf)], [expression.end, close.getStart(sf)]];
      const isSpace = ([from, to]) => /^[ \t]*$/.test(sf.text.slice(from, to));
      if (!gaps.every(isSpace)) return;

      if (ts.isBinaryExpression(expression)) {
        const operator = expression.operatorToken.kind;
        if (operator===ts.SyntaxKind.AmpersandAmpersandToken || operator===ts.SyntaxKind.BarBarToken) {
          const operators = [];
          let operand = expression;
          while (ts.isBinaryExpression(operand) && operand.operatorToken.kind===operator) {
            const token = operand.operatorToken;
            const before = [operand.left.end, token.getStart(sf)];
            const after = [token.end, operand.right.getStart(sf)];
            if (isSpace(before) && isSpace(after)) operators.push(before);
            operand = operand.left;
          }
          gaps.push(...operators);
        }
      }
      for (const [from, to] of gaps) replaceGap(from, to, /^[ \t]*$/, eol);
    }

    function visit(node) {
      if (ts.isTemplateExpression(node)) return;
      const beforeChildren = edits.length;
      ts.forEachChild(node, visit);
      if (ts.isIfStatement(node)) {
        wrapCondition(node.getStart(sf), node.expression, node);
      } else if (ts.isVoidExpression(node) && ts.isParenthesizedExpression(node.expression) &&
        guardStarts.has(offset + node.getStart(sf))) {
        // The offset-preserving TypeScript view represents a bare guard with void.
        wrapCondition(node.getStart(sf), node.expression.expression, node.expression);
      }
      const block = ts.isBlock(node);
      const members = block ? node.statements : ts.isObjectLiteralExpression(node) ? node.properties : undefined;
      if (!members?.length || (members.length === 1 && edits.length === beforeChildren)) return;

      const open = node.getStart(sf) + 1;
      const first = members[0].getStart(sf);
      const inlineComment = /^([ \t]*)\/\*(?:(?!\*\/)[^\r\n])*\*\/([ \t]*)$/.exec(sf.text.slice(open, first));
      if (inlineComment) {
        replaceGap(open, open + inlineComment[1].length, /^[ \t]*$/, eol);
        replaceGap(first - inlineComment[2].length, first, /^[ \t]*$/, eol);
      } else {
        replaceGap(open, first, /^[ \t]*$/, eol);
      }
      for (let i = 1; i < members.length; i++) {
        const separator = block ? /^[ \t]*$/ : /^([ \t]*,)[ \t]*$/;
        replaceGap(members[i - 1].end, members[i].getStart(sf), separator, eol);
      }
      const trailing = block ? /^[ \t]*$/ : /^([ \t]*,)?[ \t]*$/;
      replaceGap(members.at(-1).end, node.end - 1, trailing, eol);

      if (!block && members.length > 1) {
        for (const property of members) {
          if (ts.isPropertyAssignment(property)) {
            replaceGap(property.name.end, property.initializer.getStart(sf), /^([ \t]*:)[ \t]*$/, ' ');
          }
        }
      }
    }
    visit(body);
  }
  return applyFormatEdits(source, edits.sort((a,b) => a.start - b.start));
}

// Compose the layout and indentation passes into the original document offsets.
function whitespaceEdits(source, candidate) {
  if (source.replace(/\s/g, '') !== candidate.replace(/\s/g, '')) {
    throw refusal('ELN-FORMAT-EQUIVALENCE', 'Layout changed non-whitespace characters');
  }
  function gaps(text) {
    const result = new Map();
    let whitespace = 0;
    for (const match of text.matchAll(/\s+/g)) {
      result.set(match.index - whitespace, match[0]);
      whitespace += match[0].length;
    }
    return result;
  }
  const before = gaps(source), after = gaps(candidate), edits = [];
  let whitespace = 0;
  for (const index of [...new Set([...before.keys(), ...after.keys()])].sort((a,b) => a - b)) {
    const old = before.get(index) ?? '', next = after.get(index) ?? '';
    if (old !== next) {
      let common = 0;
      while (common < old.length && common < next.length && old[common] === next[common]) common++;
      edits.push({start: index + whitespace + common, length: old.length - common, newText: next.slice(common)});
    }
    whitespace += old.length;
  }
  return edits;
}
function plan(source,ir,size,eol){
  const opaque=[];
  for(const param of ir.params)opaque.push(param.rawSpan);
  for(const state of ir.states)opaque.push(state.typeSpan,state.exprSpan);
  for(const calc of ir.calcs)opaque.push(calc.exprSpan);
  for(const event of ir.events)for(const param of event.params)opaque.push(param.rawSpan);
  for(const action of ir.actions)opaque.push(action.paramsSpan,action.bodySpan);
  if(ir.disposal)opaque.push(ir.disposal.exprSpan);
  function ui(nodes){for(const node of nodes){
    for(const name of ['exprSpan','labelSpan','collectionSpan','keySpan','classSpan','disabledSpan','ariaPressedSpan','ariaCurrentSpan','errorSpan','focusInvalidSpan','onInputSpan'])if(node[name])opaque.push(node[name]);
    for(const prop of node.props??[])opaque.push(prop.exprSpan);
    if(node.children)ui(node.children);
  }}
  ui(ir.ui);
  const ranges=merged(opaque),neutral=masked(source,ranges),lexical=scan(neutral);
  const protectedRanges=[...ranges,...lexical.filter(token=>[ts.SyntaxKind.MultiLineCommentTrivia,ts.SyntaxKind.StringLiteral].includes(token.kind))];
  const braces=lexical.filter(token=>[ts.SyntaxKind.OpenBraceToken,ts.SyntaxKind.CloseBraceToken].includes(token.kind));
  // Parameter/header continuation layout is deliberately retained. Only body
  // indentation is selected; braces inside TS parameter types are opaque above.
  const componentOpen=braces.find(token=>token.kind===ts.SyntaxKind.OpenBraceToken);
  if(componentOpen)protectedRanges.push({start:ir.nameSpan.start,end:componentOpen.end});
  for(const action of ir.actions)protectedRanges.push({start:action.nameSpan.start,end:action.bodySpan.start});
  const sourceLines=lines(source),edits=new Map(),actionLevels=new Map();
  let depth=0,index=0;
  function indent(line,count){
    const desired=' '.repeat(count);
    if(line.prefix!==desired)edits.set(line.start,{start:line.begin,length:line.prefix.length,newText:desired});
  }
  for(const line of sourceLines){
    const first=braces[index];
    const closing=first?.start===line.content&&first.kind===ts.SyntaxKind.CloseBraceToken;
    if(source.slice(line.content,line.end).trim()&&!covered(line.content,protectedRanges)){
      if(depth-(closing?1:0)<0)throw refusal('ELN-FORMAT-STRUCTURE','Cannot determine Surface indentation',line.content);
      indent(line,(depth-(closing?1:0))*size);
    }
    while(index<braces.length&&braces[index].start<line.end){
      const token=braces[index++];
      if(token.kind===ts.SyntaxKind.OpenBraceToken){actionLevels.set(token.start,depth);depth++;}else depth--;
      if(depth<0)throw refusal('ELN-FORMAT-STRUCTURE','Unbalanced formatting structure',token.start,1);
    }
  }
  if(depth!==0)throw refusal('ELN-FORMAT-STRUCTURE','Unbalanced formatting structure');
  const originalLines=new Map(sourceLines.map(line=>[line.content,line]));
  function indentTypeScript(text,sf,span,offset,level){
    const literals=literalRanges(sf),protectedTs=[...literals,...comments(text,literals)];
    const changes=tsIndentEdits(text,size,eol);
    for(const line of lines(text)){
      const original=originalLines.get(line.content+offset);
      if(!original||original.content<span.start||original.content>=span.start+span.length||
         !text.slice(line.content,line.end).trim()||covered(line.content,protectedTs))continue;
      const prefixEdits=changes.filter(edit=>edit.span.start>=line.begin&&edit.span.start+edit.span.length<=line.content&&/^[ \t]*$/.test(edit.newText))
        .map(edit=>({start:edit.span.start-line.begin,length:edit.span.length,newText:edit.newText})).sort((a,b)=>a.start-b.start);
      const relative=applyFormatEdits(line.prefix,prefixEdits);
      indent(original,level*size+columns(relative,size));
    }
  }
  for(const action of ir.actions){
    const text=actionFormattingSource(source,action);
    const sf=ts.createSourceFile('action.ts',text,ts.ScriptTarget.Latest,true),body=sf.statements[0]?.body;
    if(!body)throw refusal('ELN-FORMAT-STRUCTURE','Cannot identify action body',action.nameSpan.start,action.nameSpan.length);
    const offset=action.bodySpan.start-body.getStart(sf)-1;
    const level=actionLevels.get(action.bodySpan.start-1);
    if(level===undefined)throw refusal('ELN-FORMAT-STRUCTURE','Cannot identify action indentation',action.bodySpan.start);
    indentTypeScript(text,sf,action.bodySpan,offset,level);
  }
  for(const binding of [...ir.states,...ir.calcs]){
    if(!binding.expr.includes('\n'))continue;
    const prefix='const value = ';
    const text=prefix+binding.expr+';';
    const sf=ts.createSourceFile('initializer.ts',text,ts.ScriptTarget.Latest,true);
    indentTypeScript(text,sf,binding.exprSpan,binding.exprSpan.start-prefix.length,1);
  }
  return [...edits.values()].sort((a,b)=>a.start-b.start);
}

export function formatSurface(source,{filename='Component.eln',indentSize=2}={}){
  if(typeof source!=='string')throw new TypeError('Expected Surface source text');
  function diagnostic(code,message,start=0,length=0,extra={}){
    return {edits:[],diagnostics:[{code,message,file:filename,start,length,line:source.slice(0,start).split('\n').length,...extra}]};
  }
  if(![2,4].includes(indentSize))return diagnostic('ELN-FORMAT-OPTIONS','indentSize must be 2 or 4');
  const endings=new Set(source.match(/\r\n|\r|\n/g)??[]);
  if(endings.size>1||endings.has('\r'))return diagnostic('ELN-FORMAT-EOL','Mixed or lone-CR line endings require an explicit normalization step');
  let ir;
  try{ir=parseSurface(source,filename);}catch(error){
    if(!error.code?.startsWith('ELN-'))throw error;
    return diagnostic('ELN-FORMAT-PARSE',error.message,error.start??0,error.length??0,{causeCode:error.code});
  }
  try{
    const eol=endings.has('\r\n')?'\r\n':'\n';
    const layout=layoutSource(source,ir,indentSize,eol);
    let layoutIR, after, candidate, indentation;
    try{
      layoutIR=layout===source?ir:parseSurface(layout,filename);
      indentation=plan(layout,layoutIR,indentSize,eol);
      candidate=applyFormatEdits(layout,indentation);
      after=parseSurface(candidate,filename);
    }catch(error){
      if (error.code?.startsWith('ELN-FORMAT-') || !error.code?.startsWith('ELN-')) throw error;
      throw refusal('ELN-FORMAT-EQUIVALENCE','Formatted source did not retain strict parsing');
    }
    if(JSON.stringify(semanticShape(ir))!==JSON.stringify(semanticShape(after)))
      throw refusal('ELN-FORMAT-EQUIVALENCE','Formatted source did not retain its semantic structure');
    if(layoutSource(candidate,after,indentSize,eol)!==candidate || plan(candidate,after,indentSize,eol).length)
      throw refusal('ELN-FORMAT-UNSTABLE','Formatting did not reach an idempotent result');
    const edits=layout===source?indentation:whitespaceEdits(source,candidate);
    return {edits,diagnostics:[]};
  }catch(error){
    if(!error.code?.startsWith('ELN-FORMAT-'))throw error;
    return diagnostic(error.code,error.message,error.start,error.length);
  }
}

export function applyFormatEdits(source,edits){
  if(typeof source!=='string'||!Array.isArray(edits))throw new TypeError('Expected source text and an edit array');
  let previousEnd=0,previousStart=-1;
  for(const edit of edits){
    if(!Number.isInteger(edit.start)||!Number.isInteger(edit.length)||edit.start<previousEnd||edit.start===previousStart||edit.length<0||edit.start+edit.length>source.length||typeof edit.newText!=='string')throw Error('Invalid or overlapping format edits');
    previousEnd=edit.start+edit.length;previousStart=edit.start;
  }
  return [...edits].reverse().reduce((text,edit)=>text.slice(0,edit.start)+edit.newText+text.slice(edit.start+edit.length),source);
}
