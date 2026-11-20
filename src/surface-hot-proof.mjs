import {getTs} from './typescript.mjs';
import {sourceImport, sourceKey} from './source-identity.mjs';
import {proveRenderModule} from './render-module-proof.mjs';
import {componentHotContract, hotContract} from './hot-contract.mjs';

const ts = getTs();
const identifier = /^[A-Za-z_$][\w$]*$/;
const dataStyle = ['classExpr', 'disabledExpr', 'errorExpr', 'ariaPressedExpr', 'ariaCurrentExpr'];

function sourceFile(code) {
  return ts.createSourceFile('surface-hot.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function parseExpression(code) {
  const file = sourceFile(`(${code}\n);`);
  const [statement] = file.statements;
  if (file.parseDiagnostics.length || file.statements.length !== 1 || !ts.isExpressionStatement(statement) ||
      !ts.isParenthesizedExpression(statement.expression)) return undefined;
  return statement.expression.expression;
}

function localHelpers(ir, imports, proofs) {
  const names = [];
  for (const statement of sourceFile(ir.header).statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return undefined;
    const source = statement.moduleSpecifier.text, clause = statement.importClause;
    if (clause?.isTypeOnly || source.endsWith('.eln')) continue;
    const bindings = clause?.namedBindings;
    if (clause?.name || !bindings || !ts.isNamedImports(bindings)) return undefined;
    const file = imports.get(source)?.slice(2);
    const proof = proofs.find(record => record.file === file);
    for (const binding of bindings.elements) {
      if (binding.isTypeOnly) continue;
      const original = (binding.propertyName ?? binding.name).text;
      if (!proof?.functions.some(fn => fn.name === original && fn.readOnly) || !identifier.test(binding.name.text)) return undefined;
      names.push(binding.name.text);
    }
  }
  return names;
}

function proveReads(fragments, helpers) {
  // Replace verified imported calls with inert declarations. The same lexical
  // checker then rejects calls through a parameter or a local shadow.
  const occupied = new Set(helpers);
  function gather(node) {
    if (ts.isIdentifier(node)) occupied.add(node.text);
    ts.forEachChild(node, gather);
  }
  for (const {node, names} of fragments) {
    gather(node);
    for (const name of names) occupied.add(name);
  }
  let prefix = '__elnorHotRead';
  while ([...occupied].some(name => name.startsWith(prefix))) prefix += '_';
  const declarations = helpers.map(name => `function ${name}() { return null; }`);
  const probes = fragments.map(({code, names}, index) =>
    `export function ${prefix}${index}(${[...new Set(names)].join(',')}) { return (\n${code}\n); }`);
  const proof = proveRenderModule([...declarations, ...probes].join('\n'));
  return proof.functions.length === probes.length && proof.functions.every((fn, index) => fn.name === prefix + index && fn.readOnly);
}

// One stateless child may render a list derived from JSON-backed root data.
// Compatibility of ordinary modules is keyed separately by their emitted revision.
export function proveDerivedListReplacement(root, sources, imports, proofs) {
  if (!root.states.length || !root.params.length || root.disposal || root.slots.length || root.events.length) return undefined;
  const helpers = localHelpers(root, imports, proofs);
  if (!helpers?.length) return undefined;
  const components = root.imports.filter(entry => !entry.typeOnly && entry.path.endsWith('.eln'));
  if (components.length !== 1) return undefined;
  const [dependency] = components;
  const child = sources.get(sourceKey(sourceImport(root.filename, dependency.path)));
  if (!child || child.states.length || child.calcs.length || child.actions.length || child.disposal || child.slots.length ||
      child.imports.some(entry => !entry.typeOnly) || child.params.some(param => param.name === 'emit')) return undefined;

  const fragments = [], childFragments = [];
  function read(target, code, names) {
    const node = parseExpression(code);
    if (!node) return false;
    target.push({code, names, node});
    return true;
  }
  const reads = (target, args, names) => args.every(arg => read(target, arg.getText(), names));
  const rootParams = root.params.map(param => param.name);
  const childParams = child.params.map(param => param.name);
  if (![...rootParams, ...childParams].every(name => identifier.test(name))) return undefined;
  const rootNames = [...rootParams];
  const stateNames = new Set(root.states.map(state => state.name));
  for (const binding of [...root.states, ...root.calcs]) {
    if (!read(fragments, binding.expr, [...rootNames])) return undefined;
    rootNames.push(binding.name);
  }
  const actions = new Map();
  for (const action of root.actions) {
    const [fn] = sourceFile(action.functionSource).statements;
    if (action.async || !fn || !ts.isFunctionDeclaration(fn) || !fn.body || !fn.body.statements.length ||
        fn.parameters.some(param => !ts.isIdentifier(param.name) || param.initializer || param.dotDotDotToken)) return undefined;
    const names = [...rootNames, ...fn.parameters.map(param => param.name.text)];
    for (const statement of fn.body.statements) {
      if (!ts.isExpressionStatement(statement)) return undefined;
      const assignment = statement.expression;
      if (!ts.isBinaryExpression(assignment) || assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
          !ts.isIdentifier(assignment.left) || !stateNames.has(assignment.left.text) ||
          fn.parameters.some(param => param.name.text === assignment.left.text) || !read(fragments, assignment.right.getText(), names)) return undefined;
    }
    actions.set(action.name, fn.parameters.length);
  }

  const events = new Map(child.events.map(event => [event.name, event.params.length]));
  const placements = [], handlers = [], lists = [];
  function eventCall(code, names, leaf) {
    const call = parseExpression(code);
    if (!call || !ts.isCallExpression(call) || call.questionDotToken) return false;
    const target = call.expression;
    if (leaf) {
      return ts.isPropertyAccessExpression(target) && !target.questionDotToken && ts.isIdentifier(target.expression) &&
        target.expression.text === 'emit' && !names.includes('emit') && events.get(target.name.text) === call.arguments.length &&
        reads(childFragments, call.arguments, names);
    }
    return ts.isIdentifier(target) && !names.includes(target.text) && actions.get(target.text) === call.arguments.length &&
      reads(fragments, call.arguments, names);
  }

  function visit(nodes, names, leaf) {
    const target = leaf ? childFragments : fragments;
    for (const node of nodes) {
      if (!dataStyle.every(field => node[field] === undefined || read(target, node[field], names))) return false;
      switch (node.kind) {
        case 'text':
          if (!read(target, node.expr, names)) return false;
          break;
        case 'input':
          if (leaf || node.onInputExpr !== undefined || !stateNames.has(node.binding)) return false;
          break;
        case 'button':
          if (node.submit || node.reset || !read(target, node.label, names) || !eventCall(node.expr, names, leaf)) return false;
          break;
        case 'container':
          if (node.submitExpr !== undefined || node.resetExpr !== undefined || !visit(node.children, names, leaf)) return false;
          break;
        case 'if':
          if (!read(target, node.expr, names) || !visit(node.children, names, leaf)) return false;
          break;
        case 'each': {
          const [variable, field, extra] = node.key.split('.');
          if (!leaf || lists.length || !childParams.includes(node.collection) || variable !== node.variable || extra !== undefined ||
              (field !== undefined && !identifier.test(field))) return false;
          lists.push([node.collection, node.key]);
          if (!read(target, node.collection, names) || !read(target, node.key, [...names, node.variable]) ||
              !visit(node.children, [...names, node.variable], leaf)) return false;
          break;
        }
        case 'component': {
          if (leaf || node.name !== dependency.local || placements.length ||
              !node.props.every(prop => read(target, prop.expr, names)) || !node.children.every(handler =>
                handler.kind === 'on' && events.has(handler.name) && eventCall(handler.expr, handler.param ? [...names, handler.param] : names, false))) return false;
          placements.push([node.name, node.props.map(prop => [prop.name, prop.expr])]);
          handlers.push(node.children.map(handler => [handler.name, handler.param, handler.expr]));
          break;
        }
        default: return false;
      }
    }
    return true;
  }

  if (!visit(root.ui, rootNames, false) || !visit(child.ui, childParams, true) || placements.length !== 1 || lists.length !== 1 ||
      !proveReads(fragments, helpers) || !proveReads(childFragments, [])) return undefined;
  return hotContract([componentHotContract(root), componentHotContract(child)], [placements, lists], handlers);
}
