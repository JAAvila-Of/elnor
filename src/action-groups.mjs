export const actionGroupPolicies = ['single-flight', 'latest', 'keep-latest', 'queue', 'durable'];

// A member of the group also reads the AbortSignal of its own invocation.
export const actionGroupType = '{readonly pending: boolean}';
export const memberGroupType = '{readonly pending: boolean; readonly signal: AbortSignal}';

export function managedActionNames(ir) {
  const names = new Map();
  if (!ir.actions.some(action => action.groupSpan)) return names;
  const source = ir.source.replace(/\\u(?:\{([\da-fA-F]{1,6})\}|([\da-fA-F]{4}))/g, (raw, braced, fixed) => {
    const point = Number.parseInt(braced ?? fixed, 16);
    return point <= 0x10ffff ? String.fromCodePoint(point) : raw;
  });
  for (const [index, action] of ir.actions.entries()) {
    if (!action.groupSpan) continue;
    let name = `__elnor_managedAction_${index}`;
    while (source.includes(name)) name += '_';
    names.set(action.name, name);
  }
  return names;
}

export function managedActionType(implementation) {
  const result = `Awaited<ReturnType<typeof ${implementation}>>`;
  return `((...args: Parameters<typeof ${implementation}>) => Promise<${result} | undefined>) & (
    | {readonly status: 'idle'; readonly pending: false; readonly result?: undefined; readonly error?: undefined}
    | {readonly status: 'pending'; readonly pending: true; readonly result?: undefined; readonly error?: undefined}
    | {readonly status: 'success'; readonly pending: false; readonly result: ${result}; readonly error?: undefined}
    | {readonly status: 'error'; readonly pending: false; readonly result?: undefined; readonly error: unknown}
  )`;
}

// A durable member has no error status: a transport failure does not end an
// intent. `types` names the operation's input, result and reason.
export function durableActionType(implementation, types) {
  const value = `Awaited<ReturnType<typeof ${implementation}>>`;
  const none = 'readonly result?: undefined; readonly reason?: undefined';
  return `((...args: Parameters<typeof ${implementation}>) => Promise<${value} | undefined>) & (
    | {readonly status: 'idle'; readonly pending: false; ${none}}
    | {readonly status: 'pending'; readonly pending: true; ${none}}
    | {readonly status: 'success'; readonly pending: false; readonly result: ${types}['result']; readonly reason?: undefined}
    | {readonly status: 'rejected'; readonly pending: false; readonly result?: undefined; readonly reason: ${types}['reason']}
    | {readonly status: 'unconfirmed'; readonly pending: false; ${none}}
    | {readonly status: 'blocked'; readonly pending: false; ${none}}
  )`;
}

// Owners other than direct state are compared with Object.is. An object owner
// retires the running action when an equal object replaces it, so the editor
// suggests a primitive key. The warning does not block builds.
export function ownerIdentityWarnings(ts, program, file, checks) {
  const source = program?.getSourceFile(file);
  if (!source || !checks?.length) return [];
  const checker = program.getTypeChecker();
  return checks.flatMap(({offset, length, span, expr}) => {
    function find(node) {
      if (offset < node.pos || offset + length > node.end) return undefined;
      if (node.kind !== ts.SyntaxKind.SourceFile && node.getStart(source) === offset && node.end === offset + length) return node;
      return ts.forEachChild(node, find);
    }
    const node = find(source);
    if (!node) return [];
    const type = checker.getTypeAtLocation(node);
    const parts = type.isUnion() ? type.types : [type];
    const objects = parts.filter(part => (part.flags & (ts.TypeFlags.Object | ts.TypeFlags.NonPrimitive)) !== 0);
    if (!objects.length) return [];
    const key = objects.every(part => checker.getPropertyOfType(part, 'id')) ? `${expr}.id` : null;
    return [{
      ...span,
      code: 'ELN-ACTION-GROUP-OWNER-IDENTITY',
      severity: 'warning',
      message: `Action group owner '${expr}' is an object compared by identity, so an equal object that replaces it retires the running action. `
        + (key ? `Use a key such as '${key}' as the owner.` : 'Use a primitive key, such as an id, as the owner.')
    }];
  });
}

// An async action outside a group can run again before an earlier run ends,
// so a write to component state after an await may apply an obsolete result.
// A write counts as guarded when a live value is checked first: by an
// enclosing if whose condition reads one, or by an earlier if in an enclosing
// block, after the await, that reads one and returns or throws. Live values are
// component bindings, properties declared as getters and AbortSignal.aborted;
// a property of captured data, such as response.ok, is not live. No await may
// separate the check from the write. An action whose body starts with an entry
// lock, an if that reads a binding and exits followed by a write to that
// binding before the first await, cannot overlap itself and is not reported.
// A write at the start of a catch is guarded when every await in the try block
// reaches it through a live check: a rejection only through an inner catch
// that starts with a live check, and a completion only past a live check.
// Names are resolved by the type checker, so locals that shadow state are not
// writes to state. Nested functions are not followed.
export function staleWriteWarnings(ts, program, file, projection) {
  const source = program?.getSourceFile(file), checks = projection?.staleWriteChecks;
  if (!source || !checks?.length) return [];
  const checker = program.getTypeChecker(), bindings = new Set(projection.bindingOffsets);
  const isBinding = node => {
    const declaration = checker.getSymbolAtLocation(node)?.declarations?.[0];
    const name = declaration && (ts.isParameter(declaration) || ts.isVariableDeclaration(declaration)) ? declaration.name : null;
    return !!name && ts.isIdentifier(name) && bindings.has(name.getStart(source));
  };
  const liveProperty = node => {
    const declarations = checker.getSymbolAtLocation(node.name)?.declarations ?? [];
    return declarations.some(declaration => ts.isGetAccessorDeclaration(declaration)
      || (node.name.text === 'aborted' && ts.isInterfaceDeclaration(declaration.parent) && declaration.parent.name.text === 'AbortSignal'));
  };
  const readsBinding = node => {
    let found = false;
    const visit = n => {
      if (found || ts.isFunctionLike(n)) return;
      if ((ts.isIdentifier(n) && isBinding(n)) || (ts.isPropertyAccessExpression(n) && liveProperty(n))) found = true;
      else ts.forEachChild(n, visit);
    };
    visit(node);
    return found;
  };
  const exits = statement => ts.isReturnStatement(statement) || ts.isThrowStatement(statement)
    || (ts.isBlock(statement) && statement.statements.some(exits));
  const findFunction = (node, offset) => {
    if (offset < node.pos || offset >= node.end) return undefined;
    if (ts.isFunctionDeclaration(node) && node.getStart(source) === offset) return node;
    return ts.forEachChild(node, child => findFunction(child, offset));
  };
  const warnings = [];
  for (const offset of checks) {
    const fn = findFunction(source, offset);
    if (!fn?.body) continue;
    const awaits = [], loops = [];
    const collect = n => {
      if (ts.isFunctionLike(n) && n !== fn) return;
      if (ts.isAwaitExpression(n) || (ts.isForOfStatement(n) && n.awaitModifier)) awaits.push(n);
      if (ts.isIterationStatement(n, false)) loops.push(n);
      ts.forEachChild(n, collect);
    };
    collect(fn.body);
    if (!awaits.length) continue;
    const contains = (outer, inner) => inner.getStart(source) >= outer.getStart(source) && inner.end <= outer.end;
    const afterAwait = node => awaits.some(a => a.end <= node.getStart(source))
      || loops.some(loop => contains(loop, node) && awaits.some(a => contains(loop, a)));
    // No await runs between the end of a check and the write, including one in
    // the write's own right-hand side.
    const adjacent = (check, write) => !awaits.some(a => a.getStart(source) >= check.end && a.getStart(source) < write.end);
    const firstAwait = Math.min(...awaits.map(a => a.getStart(source)));
    const locked = fn.body.statements.some((statement, index) => {
      if (!ts.isIfStatement(statement) || statement.end > firstAwait || !exits(statement.thenStatement)) return false;
      const names = new Set();
      const read = n => { if (ts.isFunctionLike(n)) return; if (ts.isIdentifier(n) && isBinding(n)) names.add(checker.getSymbolAtLocation(n)); ts.forEachChild(n, read); };
      read(statement.expression);
      return fn.body.statements.slice(index + 1).some(next => next.end <= firstAwait && ts.isExpressionStatement(next)
        && ts.isBinaryExpression(next.expression) && next.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isIdentifier(next.expression.left) && names.has(checker.getSymbolAtLocation(next.expression.left)));
    });
    if (locked) continue;
    const liveExit = statement => ts.isIfStatement(statement) && readsBinding(statement.expression) && exits(statement.thenStatement);
    const caught = (clause, node) => {
      const block = clause.parent.tryBlock, inside = awaits.filter(a => contains(block, a));
      if (!inside.length || !adjacent({end: clause.block.getStart(source)}, node)) return false;
      const last = Math.max(...inside.map(a => a.end));
      const checks = [];
      const find = n => { if (ts.isFunctionLike(n) || ts.isCatchClause(n)) return; if (liveExit(n) && n.getStart(source) >= last) checks.push(n); ts.forEachChild(n, find); };
      find(block);
      if (!checks.length) return false;
      return inside.every(a => {
        for (let parent = a.parent; parent && parent !== block; parent = parent.parent) {
          const first = ts.isTryStatement(parent) && contains(parent.tryBlock, a) ? parent.catchClause?.block.statements[0] : undefined;
          if (first && liveExit(first)) return true;
        }
        return false;
      });
    };
    const guarded = node => {
      for (let child = node, parent = node.parent; parent && parent !== fn; child = parent, parent = parent.parent) {
        if (ts.isIfStatement(parent) && child !== parent.expression && readsBinding(parent.expression) && adjacent(parent.expression, node)) return true;
        if (ts.isCatchClause(parent) && caught(parent, node)) return true;
        if (ts.isBlock(parent) || ts.isSourceFile(parent)) {
          for (const statement of parent.statements) {
            if (statement === child) break;
            if (ts.isIfStatement(statement) && afterAwait(statement) && readsBinding(statement.expression) && exits(statement.thenStatement) && adjacent(statement, node)) return true;
          }
        }
      }
      return false;
    };
    const target = n => {
      let root = n;
      while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root) || ts.isParenthesizedExpression(root) || ts.isNonNullExpression(root)) root = root.expression;
      return ts.isIdentifier(root) && isBinding(root) ? root : null;
    };
    const visit = n => {
      if (ts.isFunctionLike(n) && n !== fn) return;
      let written = null;
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) written = target(n.left);
      else if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(n.operator)) written = target(n.operand);
      // The write also follows an await in its own right-hand side.
      const ownAwait = ts.isBinaryExpression(n) && awaits.some(a => contains(n.right, a));
      if (written && (afterAwait(n) || ownAwait) && !guarded(n)) {
        warnings.push({
          start: written.getStart(source), length: written.getWidth(source),
          code: 'ELN-ASYNC-STALE-WRITE', severity: 'warning',
          message: `'${written.text}' is written after an await in an action outside an action group. If the action runs again before this run ends, an older result can overwrite a newer one. Add the action to a group, such as 'action group loading(owner) latest', or check current state before the write.`
        });
      }
      ts.forEachChild(n, visit);
    };
    visit(fn.body);
  }
  return warnings;
}
