import {actionFunctionPrefix, guardedBodyOffset} from './action-guards.mjs';
import {getTs} from './typescript.mjs';

const ts = getTs();

// A durable group names its journal with a double-quoted string, because the
// name is persisted with every intent and must survive renames of the file.
export const durableJournalPattern = /^"[A-Za-z0-9._-]{1,80}"$/;

export function durableGroupNames(ir) {
  return new Set(ir.actionGroups.filter(group => group.policy === 'durable').map(group => group.name));
}

const isAwaitUsing = list => (list.flags & ts.NodeFlags.AwaitUsing) === ts.NodeFlags.AwaitUsing;

// A durable member starts with `const NAME = await CALLEE(ARGUMENT);` or
// `await CALLEE(ARGUMENT);`. The callee is a prop or a property path of a prop,
// so the component can find the journal at mount, and that await is the only
// one in the body outside nested functions, so the rest of the body can run
// synchronously when the outcome is known, even in a later page. The rest is
// the lowered body text after the first statement; it equals the source under
// restSpan unless it contains guards.
export function analyzeDurableMember(action, ir) {
  const diagnostics = [];
  const script = ts.createSourceFile('action.ts', action.functionSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fn = script.statements[0];
  const prefix = actionFunctionPrefix(action).length;
  const toSource = offset => action.bodySegments
    ? guardedBodyOffset(action.bodySegments, offset - prefix)
    : action.bodySpan.start + offset - prefix;
  function spanOf(start, end) {
    const from = toSource(start), last = end > start ? toSource(end - 1) : from;
    if (from === undefined || last === undefined) return {...action.nameSpan};
    return {start: from, length: last + (end > start ? 1 : 0) - from};
  }
  const nodeSpan = node => spanOf(node.getStart(script), node.end);
  function report(span, message) {
    diagnostics.push({code: 'ELN-DURABLE-MEMBER', message, file: ir.filename, ...span,
      line: ir.source.slice(0, span.start).split('\n').length});
  }
  const body = fn && ts.isFunctionDeclaration(fn) ? fn.body : undefined;
  if (!body) return {durable: null, diagnostics};
  const shape = 'Start a durable member with const result = await operation(input); or await operation(input);';
  const first = body.statements[0];
  if (!first) {
    report({...action.nameSpan}, shape);
    return {durable: null, diagnostics};
  }
  let resultName = null, awaited;
  if (ts.isVariableStatement(first)) {
    const list = first.declarationList, [declaration] = list.declarations;
    const plainConst = (list.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const;
    if (plainConst && list.declarations.length === 1 && ts.isIdentifier(declaration.name) && !declaration.type
      && !declaration.exclamationToken && declaration.initializer && ts.isAwaitExpression(declaration.initializer)) {
      resultName = declaration.name.text;
      awaited = declaration.initializer;
    }
  } else if (ts.isExpressionStatement(first) && ts.isAwaitExpression(first.expression)) {
    awaited = first.expression;
  }
  const call = awaited?.expression;
  if (!call || !ts.isCallExpression(call)) {
    // A guard lowers to an if whose keyword has no source text.
    const guard = toSource(first.getStart(script)) === undefined && action.guardSpans?.[0];
    report(guard ? {...guard.keywordSpan} : nodeSpan(first), shape);
    return {durable: null, diagnostics};
  }

  const params = new Set();
  function bind(name) {
    if (ts.isIdentifier(name)) params.add(name.text);
    else for (const element of name.elements) if (!ts.isOmittedExpression(element)) bind(element.name);
  }
  for (const parameter of fn.parameters) bind(parameter.name);
  const props = new Set(ir.params.map(prop => prop.name));
  let root = call.expression, path = true;
  while (ts.isPropertyAccessExpression(root) && !root.questionDotToken && ts.isIdentifier(root.name)) root = root.expression;
  if (!ts.isIdentifier(root) || !props.has(root.text) || params.has(root.text)) path = false;
  let valid = true;
  if (!path) {
    valid = false;
    report(nodeSpan(call.expression), 'Call a prop or a property of a prop as the durable operation, such as notes.save');
  } else if (call.questionDotToken || call.typeArguments) {
    valid = false;
    report(nodeSpan(call), 'Call the durable operation directly, such as notes.save(input)');
  }
  if (call.arguments.length !== 1) {
    valid = false;
    if (call.arguments.length) report(spanOf(call.arguments[1].getStart(script), call.arguments.at(-1).end),
      'Pass the durable operation one argument');
    else report(nodeSpan(call), 'Pass the durable operation one argument');
  } else if (ts.isSpreadElement(call.arguments[0])) {
    valid = false;
    report(nodeSpan(call.arguments[0]), 'Pass the durable operation one argument without spreading it');
  }

  function visit(node) {
    if (ts.isFunctionLike(node)) {
      if (node.name && ts.isComputedPropertyName(node.name)) visit(node.name);
      return;
    }
    if (node !== awaited && ts.isAwaitExpression(node)) {
      report(spanOf(node.getStart(script), node.getStart(script) + 5),
        'Await only the durable operation in a durable member. Move other awaited work to another action');
    } else if (ts.isForOfStatement(node) && node.awaitModifier) {
      report(nodeSpan(node.awaitModifier), 'Move the for await loop to another action. A durable member awaits only its durable operation');
    } else if (ts.isVariableDeclarationList(node) && isAwaitUsing(node)) {
      report(spanOf(node.getStart(script), node.getStart(script) + 5), 'Use using, or move await using to another action. A durable member awaits only its durable operation');
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  if (!valid) return {durable: null, diagnostics};

  const text = node => node.getText(script);
  const [argument] = call.arguments;
  const restStart = first.end, restEnd = body.end - 1;
  return {durable: {
    resultName,
    callee: text(call.expression), calleeSpan: nodeSpan(call.expression),
    argument: text(argument), argumentSpan: nodeSpan(argument),
    rest: action.functionSource.slice(restStart, restEnd), restSpan: restSpan(),
  }, diagnostics};

  function restSpan() {
    const end = action.bodySpan.start + action.bodySpan.length;
    const before = toSource(restStart - 1);
    const start = before === undefined ? end : before + 1;
    return {start, length: end - start};
  }
}

export function durableMemberDiagnostics(ir) {
  const durable = durableGroupNames(ir);
  if (!durable.size) return [];
  return ir.actions.filter(action => durable.has(action.group))
    .flatMap(action => analyzeDurableMember(action, ir).diagnostics);
}
