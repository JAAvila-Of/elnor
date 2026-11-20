import {bindSource} from './binding-analysis.mjs';
import {getTs} from './typescript.mjs';

const ts = getTs();
const binary = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.PlusToken,
]);
const inheritedNames = new Set([Object.prototype, Array.prototype, String.prototype, Number.prototype, Boolean.prototype]
  .flatMap(prototype => Object.getOwnPropertyNames(prototype)));
inheritedNames.delete('length');
const stringReaders = new Map([['trim', 0], ['toLowerCase', 0], ['includes', 1]]);

// This proof is conditional on plain JSON inputs and standard, unmodified
// intrinsics. It covers emitted code and never evaluates the module.
export function proveRenderModule(source) {
  const {sf, checker} = bindSource(source);
  const rejected = Symbol('unsupported render code');
  function fail(node, reason) {
    const {line, character} = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    throw {rejected, issue: {reason, line: line + 1, column: character + 1}};
  }
  function diagnostic(error) {
    if (error?.rejected !== rejected) throw error;
    return error.issue;
  }

  const functions = new Map();
  const exports = [];
  try {
    if (sf.parseDiagnostics.length) fail(sf, 'invalid-source');
    if (sf.statements.length > 128) fail(sf, 'proof-budget');
    for (const statement of sf.statements) {
      if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body ||
          statement.modifiers?.some(modifier => ![ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.AsyncKeyword].includes(modifier.kind))) {
        fail(statement, 'module-initialization');
      }
      functions.set(checker.getSymbolAtLocation(statement.name), statement);
      if (statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) exports.push(statement);
    }
  } catch (error) {
    return {functions: [], issue: diagnostic(error)};
  }

  const proven = new Set();
  const inProgress = new Set();
  let depth = 0;
  let remaining = 4096;
  function proveLocal(fn) {
    if (proven.has(fn)) return;
    if (inProgress.has(fn)) fail(fn, 'recursive-call');
    inProgress.add(fn);
    try {
      proveFunction(fn, new Set());
      proven.add(fn);
    } finally {
      inProgress.delete(fn);
    }
  }

  function proveFunction(fn, outer) {
    if (fn.asteriskToken || fn.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
      fail(fn, 'unsupported-function');
    }
    const locals = new Set(outer);
    for (const parameter of fn.parameters) {
      if (!ts.isIdentifier(parameter.name) || parameter.initializer || parameter.dotDotDotToken) {
        fail(parameter, 'unsupported-parameter');
      }
      locals.add(checker.getSymbolAtLocation(parameter.name));
    }
    if (!ts.isBlock(fn.body)) {
      expression(fn.body, locals);
      return;
    }
    const statements = fn.body.statements;
    const last = statements.at(-1);
    if (!last || !ts.isReturnStatement(last) || !last.expression) fail(fn.body, 'missing-value-return');
    for (const statement of statements.slice(0, -1)) {
      if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) {
        fail(statement, 'unsupported-statement');
      }
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) fail(declaration, 'unsupported-binding');
        expression(declaration.initializer, locals);
        locals.add(checker.getSymbolAtLocation(declaration.name));
      }
    }
    expression(last.expression, locals);
  }

  function call(node, locals) {
    const target = node.expression;
    if (node.questionDotToken) fail(node, 'unsupported-call');
    if (ts.isIdentifier(target)) {
      const fn = functions.get(checker.getSymbolAtLocation(target));
      if (!fn) fail(target, 'unknown-call');
      for (const argument of node.arguments) expression(argument, locals);
      proveLocal(fn);
      return;
    }
    if (!ts.isPropertyAccessExpression(target) || target.questionDotToken) fail(target, 'unknown-call');
    const name = target.name.text;
    expression(target.expression, locals);
    if (['filter', 'map'].includes(name) && node.arguments.length === 1 && ts.isArrowFunction(node.arguments[0])) {
      proveFunction(node.arguments[0], locals);
      return;
    }
    if (stringReaders.get(name) !== node.arguments.length) fail(target, 'unknown-call');
    for (const argument of node.arguments) expression(argument, locals);
  }

  function expression(node, locals) {
    if (depth >= 64 || --remaining < 0) fail(node, 'proof-budget');
    depth += 1;
    try { readExpression(node, locals); }
    finally { depth -= 1; }
  }

  function readExpression(node, locals) {
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) ||
        [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return;
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (!symbol || !locals.has(symbol)) fail(node, 'external-read');
    } else if (ts.isParenthesizedExpression(node)) {
      expression(node.expression, locals);
    } else if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
      expression(node.operand, locals);
    } else if (ts.isBinaryExpression(node) && binary.has(node.operatorToken.kind)) {
      expression(node.left, locals);
      expression(node.right, locals);
    } else if (ts.isConditionalExpression(node)) {
      expression(node.condition, locals);
      expression(node.whenTrue, locals);
      expression(node.whenFalse, locals);
    } else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      return;
    } else if (ts.isTemplateExpression(node)) {
      for (const span of node.templateSpans) expression(span.expression, locals);
    } else if (ts.isArrayLiteralExpression(node)) {
      for (const item of node.elements) expression(ts.isSpreadElement(item) ? item.expression : item, locals);
    } else if (ts.isObjectLiteralExpression(node)) {
      for (const item of node.properties) {
        if (ts.isSpreadAssignment(item)) expression(item.expression, locals);
        else if (ts.isPropertyAssignment(item) && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) &&
            item.name.text !== '__proto__') expression(item.initializer, locals);
        else fail(item, 'unsupported-expression');
      }
    } else if (ts.isPropertyAccessExpression(node) && !node.questionDotToken && !inheritedNames.has(node.name.text)) {
      expression(node.expression, locals);
    } else if (ts.isCallExpression(node)) {
      call(node, locals);
    } else {
      fail(node, 'unsupported-expression');
    }
  }

  return {functions: exports.map(fn => {
    const name = fn.name.text;
    try {
      proveLocal(fn);
      return {name, readOnly: true};
    } catch (error) {
      return {name, readOnly: false, issue: diagnostic(error)};
    }
  })};
}
