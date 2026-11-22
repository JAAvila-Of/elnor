import {actionFunctionPrefix, guardedBodyOffset} from './action-guards.mjs';
import {getTs} from './typescript.mjs';

const ts = getTs();
const factory = ts.factory;

function parseAction(action) {
  return ts.createSourceFile('action.ts', action.functionSource, ts.ScriptTarget.Latest, true);
}

const isAwaitUsing = list => (list.flags & ts.NodeFlags.AwaitUsing) === ts.NodeFlags.AwaitUsing;
const isUsing = list => (list.flags & ts.NodeFlags.Using) !== 0;
const declaresAwaitUsing = statement => ts.isVariableStatement(statement) && isAwaitUsing(statement.declarationList);

export function managedSuspensionDiagnostics(ir) {
  const diagnostics = [];
  for (const action of ir.actions) {
    if (!action.group) continue;
    const script = parseAction(action);
    const prefix = actionFunctionPrefix(action).length;
    function report(node, message) {
      const offset = node.getStart(script) - prefix;
      const start = (action.bodySegments ? guardedBodyOffset(action.bodySegments, offset) : action.bodySpan.start + offset)
        ?? action.nameSpan.start;
      diagnostics.push({code:'ELN-ACTION-GROUP-SUSPENSION',message,file:ir.filename,start,length:5,
        line:ir.source.slice(0,start).split('\n').length});
    }
    function visit(node) {
      if (ts.isFunctionLike(node)) {
        if (node.name && ts.isComputedPropertyName(node.name)) visit(node.name);
        return;
      }
      const loopHead = ts.isForStatement(node) || ts.isForInStatement(node) || (ts.isForOfStatement(node) && !node.awaitModifier)
        ? node.initializer : undefined;
      if (loopHead && ts.isVariableDeclarationList(loopHead) && isAwaitUsing(loopHead)) {
        report(loopHead, 'Declare await using inside the loop body or use for await in a managed action');
      }
      ts.forEachChild(node, visit);
    }
    visit(script.statements[0].body);
  }
  return diagnostics;
}

// Lowers a managed action body to a generator driven by createActionGroup.
// `await` in ordinary code yields its operand; retirement unwinds there.
// `await` inside finally, await using disposal and the closing of a for await
// iterator yield a cleanup step that runs to completion after retirement.
// A checkpoint closes each awaited cleanup in ordinary code. It applies a
// retirement observed during that cleanup: return() at the end of the finally
// block replaces a pending break, continue, return or throw, so no ordinary
// code runs afterwards. The checkpoint carries the pending error, which the
// runtime reports unless it is the rejection of awaited work. Nested cleanup
// gets no checkpoint, because return() there would skip the rest of the
// enclosing finally block.
export function managedGeneratorBody(action, {lease, fresh}) {
  const script = parseAction(action);
  const id = name => factory.createIdentifier(name);
  const call = (target, name, args = []) =>
    factory.createCallExpression(factory.createPropertyAccessExpression(id(target), name), undefined, args);
  const suspend = (expression, cleanup) =>
    factory.createYieldExpression(undefined, cleanup ? call(lease, 'cleanup', [expression]) : expression);
  const delegate = expression =>
    factory.createExpressionStatement(factory.createYieldExpression(factory.createToken(ts.SyntaxKind.AsteriskToken), expression));
  const constant = (name, initializer) => factory.createVariableStatement(undefined, factory.createVariableDeclarationList(
    [factory.createVariableDeclaration(name, undefined, undefined, initializer)], ts.NodeFlags.Const));

  const result = ts.transform(script.statements[0].body, [context => root => {
    let cleanupSuspensions = 0;
    const visitor = cleanup => node => visit(node, cleanup);
    // try/catch/finally whose finally contains awaited cleanup. In ordinary
    // code, the error pending at the end of the cleanup reaches the checkpoint.
    function settled(attempt, catchClause, cleanupStatements, cleanup) {
      if (cleanup) return factory.createTryStatement(attempt, catchClause, factory.createBlock(cleanupStatements, true));
      const failure = fresh('failure');
      const capture = () => {
        const error = fresh('error');
        return factory.createCatchClause(error, factory.createBlock([
          factory.createExpressionStatement(factory.createAssignment(id(failure), id(error))),
          factory.createThrowStatement(id(error))
        ], true));
      };
      const guarded = catchClause ? factory.createBlock([factory.createTryStatement(attempt, catchClause, undefined)], true) : attempt;
      return factory.createBlock([
        factory.createVariableStatement(undefined, factory.createVariableDeclarationList(
          [factory.createVariableDeclaration(failure, undefined, undefined, factory.createPropertyAccessExpression(id(lease), 'none'))],
          ts.NodeFlags.Let)),
        factory.createTryStatement(guarded, capture(), factory.createBlock([
          factory.createTryStatement(factory.createBlock(cleanupStatements, true), capture(), factory.createBlock([
            factory.createExpressionStatement(factory.createYieldExpression(undefined, call(lease, 'checkpoint', [id(failure)])))
          ], true))
        ], true))
      ], true);
    }

    function disposalBlock(statements, cleanup) {
      const stack = fresh('disposables'), error = fresh('error');
      const body = statements.map(statement => {
        if (!ts.isVariableStatement(statement) || !isUsing(statement.declarationList)) {
          return ts.visitNode(statement, visitor(cleanup));
        }
        const list = statement.declarationList;
        const async = isAwaitUsing(list) ? factory.createTrue() : factory.createFalse();
        return factory.createVariableStatement(statement.modifiers, factory.createVariableDeclarationList(
          list.declarations.map(declaration => factory.createVariableDeclaration(declaration.name, undefined, declaration.type,
            call(stack, 'use', [ts.visitNode(declaration.initializer, visitor(cleanup)), async]))),
          ts.NodeFlags.Const));
      });
      cleanupSuspensions++;
      return factory.createBlock([
        constant(stack, call(lease, 'disposables')),
        settled(factory.createBlock(body, true),
          factory.createCatchClause(error, factory.createBlock([factory.createExpressionStatement(call(stack, 'fail', [id(error)]))], true)),
          [delegate(call(stack, 'dispose'))], cleanup)
      ], true);
    }

    function forAwait(node, labels, cleanup) {
      const iteration = fresh('iteration'), error = fresh('error');
      const value = () => factory.createPropertyAccessExpression(id(iteration), 'value');
      const initializer = node.initializer;
      const head = ts.isVariableDeclarationList(initializer)
        ? factory.createVariableStatement(undefined, factory.createVariableDeclarationList(
          [factory.createVariableDeclaration(initializer.declarations[0].name, undefined, undefined, value())], initializer.flags))
        : factory.createExpressionStatement(factory.createAssignment(initializer, value()));
      const statements = [head, node.statement];
      const current = statements.some(declaresAwaitUsing)
        ? disposalBlock(statements, cleanup)
        : factory.createBlock(statements.map(statement => ts.visitNode(statement, visitor(cleanup))), true);
      if (cleanup) cleanupSuspensions++;
      const loop = labels.reduceRight((statement, label) => factory.createLabeledStatement(label, statement),
        factory.createWhileStatement(factory.createTrue(), factory.createBlock([
          factory.createIfStatement(suspend(call(iteration, 'next'), cleanup), factory.createBreakStatement()),
          current
        ], true)));
      cleanupSuspensions++;
      return factory.createBlock([
        constant(iteration, call(lease, 'asyncIteration', [ts.visitNode(node.expression, visitor(cleanup))])),
        settled(factory.createBlock([loop], true),
          factory.createCatchClause(error, factory.createBlock([
            factory.createExpressionStatement(call(iteration, 'fail')),
            factory.createThrowStatement(id(error))
          ], true)),
          [delegate(call(iteration, 'close'))], cleanup)
      ], true);
    }

    function visit(node, cleanup) {
      if (ts.isFunctionLike(node)) {
        return ts.visitEachChild(node, child => child === node.name && ts.isComputedPropertyName(child) ? visit(child, cleanup) : child, context);
      }
      if (ts.isAwaitExpression(node)) {
        if (cleanup) cleanupSuspensions++;
        return suspend(ts.visitNode(node.expression, visitor(cleanup)), cleanup);
      }
      if (ts.isLabeledStatement(node)) {
        const labels = [];
        let statement = node;
        while (ts.isLabeledStatement(statement)) { labels.push(statement.label); statement = statement.statement; }
        if (ts.isForOfStatement(statement) && statement.awaitModifier) return forAwait(statement, labels, cleanup);
      }
      if (ts.isForOfStatement(node) && node.awaitModifier) return forAwait(node, [], cleanup);
      if (ts.isTryStatement(node)) {
        const tryBlock = ts.visitNode(node.tryBlock, visitor(cleanup));
        const catchClause = ts.visitNode(node.catchClause, visitor(cleanup));
        const before = cleanupSuspensions;
        const finallyBlock = ts.visitNode(node.finallyBlock, visitor(true));
        if (!finallyBlock || cleanupSuspensions === before || cleanup) {
          return factory.updateTryStatement(node, tryBlock, catchClause, finallyBlock);
        }
        return settled(tryBlock, catchClause, finallyBlock.statements, cleanup);
      }
      if (ts.isBlock(node) && node.statements.some(declaresAwaitUsing)) return disposalBlock(node.statements, cleanup);
      return ts.visitEachChild(node, visitor(cleanup), context);
    }
    return visit(root, false);
  }]);
  try {
    return ts.createPrinter().printNode(ts.EmitHint.Unspecified, result.transformed[0], script);
  } finally {
    result.dispose();
  }
}
