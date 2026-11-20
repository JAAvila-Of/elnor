// Find the exact opener reported by the strict parser before allowing a repair.
export function missingGuardClose(source, error) {
  if (!['ELN-PARSE-002','ELN-PARSE-003'].includes(error.code) || source[error.start] !== '(') return null;
  const opening=error.start;
  const lineStart=source.lastIndexOf('\n',opening-1)+1;
  const lead=/^([ \t]*)guard[ \t]*$/.exec(source.slice(lineStart,opening));
  if (!lead) return null;
  const newline=source.indexOf('\n',opening);
  if (newline < 0) return null;
  const start=lineStart+lead[1].length;
  let end=source[newline-1]==='\r'?newline-1:newline;
  for (let cursor=newline+1;cursor<source.length;) {
    const lf=source.indexOf('\n',cursor);
    const lineEnd=lf<0?source.length:source[lf-1]==='\r'?lf-1:lf;
    const line=source.slice(cursor,lineEnd);
    if (/[\r\u2028\u2029]/.test(line)) return null;
    const indent=/^[ \t]*/.exec(line)[0];
    const content=line.slice(indent.length);
    if (content) {
      if (indent.length<=lead[1].length) {
        // An operator at the boundary could still belong to the condition.
        if (/^[?&|.+*\/%,:()[\]<>!=^-]/.test(content)) return null;
        return {start,opening,end};
      }
      if (lf<0||!indent.startsWith(lead[1])) return null;
      end=lineEnd;
    }
    if (lf<0) break;
    cursor=lf+1;
  }
  return null;
}

// A guarded action is split into original spans and synthetic TypeScript.
export function projectGuardedBody(ts, source, action, prefix, readBlock, report, recovery) {
  const {start, length} = action.bodySpan;
  const original = source.slice(start, start + length);
  if (!original.includes('guard')) return null;
  const offset = start - prefix.length;
  const missing = recovery && recovery.start >= start && recovery.end <= start + length ? recovery : null;
  if (missing) {
    const condition=source.slice(missing.opening+1,missing.end);
    if (condition.includes('\n')) {
      const expression='void ('+condition;
      const checked=ts.createSourceFile('guard-condition.ts',expression+');',ts.ScriptTarget.Latest,true);
      const earlyError=checked.parseDiagnostics.some(error=>error.start<expression.length);
      if (checked.statements.length!==1||earlyError) {
        report('ELN-GUARD-CLOSE',missing.opening,'Cannot determine the end of the guard condition');
      }
    }
  }
  let virtualBody=original;
  if (missing) {
    const from=missing.start-start, to=missing.end-start;
    const masked=original.slice(from+1,to).replace(/[^\r\n]/g,' ');
    virtualBody=original.slice(0,from)+';'+masked+original.slice(to);
  }
  const syntax = ts.createSourceFile('action.ts', prefix + virtualBody + '}', ts.ScriptTarget.Latest, true);
  const statements = syntax.statements[0]?.body?.statements ?? [];
  if (missing && !statements.some(statement=>ts.isEmptyStatement(statement) &&
      offset+statement.getStart(syntax)===missing.start)) {
    report('ELN-GUARD-CLOSE',missing.opening,'Expected a closing parenthesis for the guard condition');
  }
  const guards = [];
  if (missing) {
    report('ELN-GUARD-CLOSE',missing.opening,'Expected a closing parenthesis for the guard condition',{canRecover:true});
    guards.push({keywordSpan:{start:missing.start,length:5},end:missing.end,incompleteCondition:missing});
  }
  for (const statement of statements) {
    if (!ts.isExpressionStatement(statement)) continue;
    const call = statement.expression;
    if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression) ||
        call.expression.getText(syntax) !== 'guard' || call.questionDotToken || call.typeArguments) continue;

    const keyword = offset + call.expression.getStart(syntax);
    const conditionEnd = offset + call.end;
    const tail = source.slice(conditionEnd, start + length);
    const then = /^[ \t]*then\b/.exec(tail);
    const explicitSemicolon = statement.getLastToken(syntax)?.kind === ts.SyntaxKind.SemicolonToken;
    const singleCondition = call.arguments.length === 1 && !ts.isSpreadElement(call.arguments[0]) &&
      !call.arguments.hasTrailingComma && source[conditionEnd - 1] === ')';
    if (!then) {
      if (!singleCondition) continue;
      if (!explicitSemicolon) {
        const scanner=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.Standard,tail);
        if (scanner.scan()!==ts.SyntaxKind.EndOfFileToken && !scanner.hasPrecedingLineBreak()) continue;
      }
    }
    if (!singleCondition) {
      report('ELN-GUARD-CONDITION', keyword, 'Expected one condition inside guard parentheses');
    }
    const guard = {keywordSpan:{start:keyword,length:5},conditionEnd};
    if (then) {
      const thenStart = conditionEnd + then[0].length - 4;
      const blockStart = conditionEnd + /^[ \t]*then\b[ \t]*/.exec(tail)[0].length;
      guard.thenSpan = {start:thenStart,length:4};
      if (source[blockStart] === '{') {
        guard.end = readBlock(blockStart);
      } else {
        const next = source[blockStart];
        const canRecover = blockStart >= start + length || [';', '\r', '\n'].includes(next);
        report('ELN-GUARD-BODY', thenStart, 'Expected a block after then. Remove then to return immediately.', {length:4,canRecover});
        guard.incompleteBlock = true;
        guard.end = next === ';' ? blockStart + 1 : thenStart + 4;
      }
    } else {
      guard.end = explicitSemicolon ? offset + statement.end : conditionEnd;
      guard.hasSemicolon = explicitSemicolon;
    }
    guards.push(guard);
  }
  if (!guards.length) return null;

  const segments = [];
  const copy = (from,to) => { if (to > from) segments.push({span:{start:from,length:to-from}}); };
  const generated = text => segments.push({text});
  let cursor = start;
  for (const guard of guards.sort((a,b)=>a.keywordSpan.start-b.keywordSpan.start)) {
    if (guard.keywordSpan.start < cursor) continue;
    copy(cursor, guard.keywordSpan.start);
    if (guard.incompleteCondition) {
      generated('void (');
      copy(guard.incompleteCondition.opening+1,guard.end);
      segments.push({text:');',recoveryTail:true});
      cursor=guard.end;
      continue;
    }
    if(guard.thenSpan)generated('if');
    else segments.push({text:'if',legacyCallSpan:guard.keywordSpan});
    copy(guard.keywordSpan.start + 5, guard.conditionEnd);
    if (guard.thenSpan) {
      copy(guard.conditionEnd, guard.thenSpan.start);
      if (guard.incompleteBlock) {
        // A partial guard must not narrow types past a return the author has not finished.
        generated(' {}');
      } else {
        copy(guard.thenSpan.start + 4, guard.end - 1);
        generated('\nreturn;\n');
        copy(guard.end - 1, guard.end);
      }
    } else {
      if(guard.hasSemicolon)copy(guard.conditionEnd,guard.end-1);
      generated(' { return; }');
    }
    cursor = guard.end;
  }
  copy(cursor,start + length);
  return {guardSpans:guards.map(({keywordSpan,thenSpan})=>({keywordSpan,thenSpan})),bodySegments:segments};
}

export function actionBodyText(source, segments) {
  return segments.map(({span,text})=>span?source.slice(span.start,span.start+span.length):text).join('');
}

export function guardedBodyOffset(segments, offset) {
  if (!Number.isInteger(offset) || offset < 0) return undefined;
  for (const {span,text} of segments) {
    const length = span?.length ?? text.length;
    if (offset < length) return span ? span.start + offset : undefined;
    offset -= length;
  }
  return undefined;
}

export function actionFunctionPrefix(action) {
  return `${action.async?'async ':''}function ${action.name}(${action.params}) {`;
}

export function guardCallChecks(action, generatedOffset) {
  const checks = [];
  for (const {span,text,legacyCallSpan} of action.bodySegments ?? []) {
    if (legacyCallSpan) checks.push({offset:generatedOffset,span:legacyCallSpan});
    generatedOffset += span?.length ?? text.length;
  }
  return checks;
}

export function guardCallConflicts(ts, program, file, checks) {
  const source = program?.getSourceFile(file);
  if (!source || !checks?.length) return [];
  const checker = program.getTypeChecker();
  return checks.flatMap(({offset,span}) => {
    function findGuard(node) {
      if (offset < node.pos || offset >= node.end) return undefined;
      if (ts.isIfStatement(node) && node.getStart(source) === offset) return node;
      return ts.forEachChild(node,findGuard);
    }
    const statement = findGuard(source);
    if (!statement || !checker.resolveName('guard',statement,ts.SymbolFlags.Value,false)) return [];
    return [{
      ...span,
      code:'ELN-GUARD-CALL',
      message:'This standalone guard statement conflicts with a function or value named guard. Rename the binding or call it through an explicit receiver.'
    }];
  });
}

// The formatter only needs an equally wide TypeScript view of the source.
export function actionFormattingSource(source, action) {
  if (!action.guardSpans) return action.functionSource;
  const prefix = actionFunctionPrefix(action);
  let body = source.slice(action.bodySpan.start,action.bodySpan.start+action.bodySpan.length);
  for (const {keywordSpan,thenSpan} of action.guardSpans ?? []) {
    const replace = (span,text) => {
      const index = span.start - action.bodySpan.start;
      body = body.slice(0,index)+text+body.slice(index+span.length);
    };
    replace(keywordSpan,thenSpan?'if   ':'void ');
    if (thenSpan) replace(thenSpan,'    ');
  }
  return prefix+body+'}';
}
