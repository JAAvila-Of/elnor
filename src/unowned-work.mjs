// Work without an end of its own, started by a component and never released,
// keeps running after the component unmounts: an interval keeps calling its
// callback, a listener stays registered, and a subscription, connection or
// observer stays open. The editor warns with ELN-UNOWNED-WORK when such work is
// started in the component and nothing releases it.
//
// Work counts as released when:
// - its handle is kept in a component binding that the disposal hook releases:
//   passes it to a call, calls it, or calls a method on it, directly or through
//   actions the hook calls;
// - its handle is kept in a local that is used again;
// - its handle leaves the code that started it: returned, passed to a call or
//   stored in a property;
// - a listener receives a signal, unless that signal belongs to a component
//   binding that the hook does not release, or the hook removes the same
//   listener from the same target.
//
// Only browser APIs from the default library and subscriptions recognized by
// their type are covered: a call that receives a callback and returns a stopper
// without parameters or properties, and a result with Symbol.dispose. Work that
// ends by itself, such as setTimeout or a single request, is not covered.

const connections = new Map([['WebSocket', 'close'], ['EventSource', 'close'], ['BroadcastChannel', 'close'], ['Worker', 'terminate'], ['SharedWorker', 'port.close']]);
const observers = new Set(['ResizeObserver', 'MutationObserver', 'IntersectionObserver', 'PerformanceObserver']);

export function unownedWorkWarnings(ts, program, file, projection) {
  const source = program?.getSourceFile(file);
  const component = source?.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === '__validate');
  if (!component?.body || !projection?.bindingOffsets) return [];
  const checker = program.getTypeChecker(), bindings = new Set(projection.bindingOffsets);
  const outer = node => {
    while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression?.(node) || ts.isTypeAssertionExpression(node)) node = node.expression;
    return node;
  };
  const binding = node => {
    node = outer(node);
    if (!ts.isIdentifier(node)) return undefined;
    const symbol = checker.getSymbolAtLocation(node), declaration = symbol?.declarations?.[0];
    const name = declaration && (ts.isParameter(declaration) || ts.isVariableDeclaration(declaration)) ? declaration.name : null;
    return name && ts.isIdentifier(name) && bindings.has(name.getStart(source)) ? symbol : undefined;
  };
  const library = node => {
    const declarations = checker.getSymbolAtLocation(node)?.declarations ?? [];
    return declarations.length > 0 && declarations.every(declaration => program.isSourceFileDefaultLibrary(declaration.getSourceFile()));
  };
  const at = (offset, test) => {
    const find = node => {
      if (offset < node.pos || offset >= node.end) return undefined;
      if (node.getStart(source) === offset && test(node)) return node;
      return ts.forEachChild(node, find);
    };
    return offset < 0 ? undefined : find(source);
  };

  // Actions by symbol, so the disposal hook can be followed into them.
  const actions = new Map();
  for (const offsets of projection.actionOffsets ?? []) {
    const name = at(offsets.name, ts.isIdentifier);
    const fn = at(offsets.body, node => ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node));
    const symbol = name && checker.getSymbolAtLocation(name);
    if (symbol && fn?.body) actions.set(symbol, fn);
  }

  // What the disposal hook releases.
  const released = new Set(), removals = new Set(), followed = new Set();
  const text = node => outer(node).getText(source).replace(/\s+/g, '');
  const listenerKey = (target, args) => [!target || ['window', 'globalThis', 'self'].includes(text(target)) ? 'window' : text(target), text(args[0]), text(args[1])].join('|');
  const scan = node => {
    if (ts.isCallExpression(node)) {
      const callee = outer(node.expression);
      const action = ts.isIdentifier(callee) ? actions.get(checker.getSymbolAtLocation(callee)) : undefined;
      if (action && !followed.has(action)) { followed.add(action); scan(action.body); }
      const receiver = ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee) ? callee.expression : null;
      for (const used of [callee, receiver, ...node.arguments]) { const symbol = used && binding(used); if (symbol) released.add(symbol); }
      const name = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
      if (ts.isIdentifier(name) && name.text === 'removeEventListener' && node.arguments.length >= 2) {
        removals.add(listenerKey(ts.isPropertyAccessExpression(callee) ? callee.expression : null, node.arguments));
      }
    }
    ts.forEachChild(node, scan);
  };
  const disposal = at(projection.disposalOffset ?? -1, node => !!node.parent && ts.isCallExpression(node.parent) && node.parent.arguments[0] === node);
  if (disposal) scan(disposal);

  const functionType = type => type.getCallSignatures().length > 0;
  const stopper = (type, call) => {
    const signatures = type.getCallSignatures();
    if (signatures.length !== 1 || signatures[0].getParameters().length !== 0 || checker.getPropertiesOfType(type).length) return false;
    if (!(checker.getReturnTypeOfSignature(signatures[0]).flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined))) return false;
    const callbacks = call.arguments.map(arg => checker.getTypeAtLocation(arg)).filter(functionType);
    // A wrapper such as once(callback) returns the callback's own type.
    return callbacks.length > 0 && !callbacks.includes(type);
  };
  const disposable = type => checker.getPropertiesOfType(type).some(property => /^__@(async)?[dD]ispose@/.test(property.escapedName));

  // The work a call or construction starts, if it is covered.
  const work = node => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && library(node.expression)) {
      const name = node.expression.text;
      if (connections.has(name)) return {node: node.expression, what: `This ${name} stays open after the component unmounts.`, release: handle => `${handle}.${connections.get(name)}()`};
      if (observers.has(name)) return {node: node.expression, what: `This ${name} keeps observing after the component unmounts.`, release: handle => `${handle}.disconnect()`};
      return undefined;
    }
    if (!ts.isCallExpression(node)) return undefined;
    const callee = outer(node.expression);
    const name = ts.isIdentifier(callee) ? callee : ts.isPropertyAccessExpression(callee) ? callee.name : null;
    if (!name) return undefined;
    if (name.text === 'setInterval' && library(name)) return {node: name, what: `'setInterval' keeps calling its callback after the component unmounts.`, release: handle => `clearInterval(${handle})`};
    if (name.text === 'addEventListener' && library(name)) return {node: name, listener: true, target: ts.isPropertyAccessExpression(callee) ? callee.expression : null};
    const type = checker.getTypeAtLocation(node);
    if (stopper(type, node)) return {node: name, what: 'This subscription stays active after the component unmounts.', release: handle => `${handle}()`};
    if (disposable(type)) return {node: name, what: 'This resource stays open after the component unmounts.', release: handle => `${handle}[Symbol.dispose]()`};
    return undefined;
  };

  // Where the handle goes: nowhere, a binding, a local, or out of this code.
  const fate = (node, depth = 0) => {
    let expression = node;
    while (ts.isParenthesizedExpression(expression.parent) || ts.isAsExpression(expression.parent) || ts.isNonNullExpression(expression.parent)
      || ts.isSatisfiesExpression?.(expression.parent) || ts.isTypeAssertionExpression(expression.parent)) expression = expression.parent;
    const parent = expression.parent;
    if (ts.isExpressionStatement(parent) || ts.isVoidExpression(parent)) return {kind: 'discarded'};
    if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === expression) return {kind: 'discarded'};
    let target = null;
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.right === expression) target = outer(parent.left);
    else if (ts.isVariableDeclaration(parent) && parent.initializer === expression) target = parent.name;
    if (!target || !ts.isIdentifier(target)) return {kind: 'escaped'};
    const symbol = binding(target);
    if (symbol) return {kind: 'binding', symbol, name: target.text};
    // A local is released when it is used again. A use that only moves the
    // handle into a binding or another local takes the fate of that target.
    if (depth > 8) return {kind: 'escaped'};
    const local = checker.getSymbolAtLocation(target);
    let result = {kind: 'discarded'};
    const uses = n => {
      if (result.kind === 'escaped') return;
      if (ts.isIdentifier(n) && n !== target && checker.getSymbolAtLocation(n) === local) {
        const parent = n.parent;
        if (ts.isBinaryExpression(parent) && parent.left === n && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) return;
        const moved = (ts.isBinaryExpression(parent) && parent.right === n && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken)
          || (ts.isVariableDeclaration(parent) && parent.initializer === n);
        const next = moved ? fate(n, depth + 1) : {kind: 'escaped'};
        if (next.kind === 'escaped' || (next.kind === 'binding' && released.has(next.symbol))) result = {kind: 'escaped'};
        else if (next.kind === 'binding') result = next;
        return;
      }
      ts.forEachChild(n, uses);
    };
    uses(component.body);
    return result;
  };

  const warnings = [];
  const warn = (node, message) => warnings.push({start: node.getStart(source), length: node.getWidth(source), code: 'ELN-UNOWNED-WORK', severity: 'warning', message});
  const visit = node => {
    if (node === disposal) return;
    const found = work(node);
    if (found?.listener) {
      const options = node.arguments[2] && outer(node.arguments[2]);
      const signal = options && checker.getTypeAtLocation(options).getProperty('signal');
      const literal = options && ts.isObjectLiteralExpression(options)
        ? options.properties.find(property => property.name && ts.isIdentifier(property.name) && property.name.text === 'signal') : undefined;
      const value = literal && (ts.isPropertyAssignment(literal) ? outer(literal.initializer) : ts.isShorthandPropertyAssignment(literal) ? literal.name : undefined);
      const owner = value && ts.isPropertyAccessExpression(value) ? binding(value.expression) : value ? binding(value) : undefined;
      const message = 'This listener stays registered after the component unmounts.';
      if (signal && !(signal.flags & ts.SymbolFlags.Optional) || literal) {
        if (owner && !released.has(owner)) warn(found.node, `${message} Its signal comes from '${owner.name}', but 'on dispose' does not abort it. Add 'on dispose() => ${owner.name}.abort()'.`);
      } else if (node.arguments.length >= 2 && !removals.has(listenerKey(found.target, node.arguments))) {
        warn(found.node, `${message} Pass a 'signal' that 'on dispose' aborts, or remove the listener in 'on dispose'.`);
      }
    } else if (found) {
      const where = fate(node);
      if (where.kind === 'discarded') warn(found.node, `${found.what} Keep its handle in state and release it in 'on dispose', for example 'on dispose() => ${found.release('handle')}'.`);
      else if (where.kind === 'binding' && !released.has(where.symbol)) warn(found.node, `${found.what} '${where.name}' holds it, but 'on dispose' does not release it. Add 'on dispose() => ${found.release(where.name)}'.`);
    }
    ts.forEachChild(node, visit);
  };
  visit(component.body);
  return warnings;
}
