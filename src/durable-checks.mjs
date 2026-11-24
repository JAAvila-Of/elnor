// Types of durable members, for the editor and the project checker.
//
// A durable member projects as an async function whose first statement keeps
// its source text, with the awaited call wrapped by a generated helper:
//   const outcome = await __elnor_durable(notes.save(edit));
// The helper reads the operation types from the request's durable brand, so
// `outcome` has the type DurableOutcome<R, E> of the operation. The member
// value has the six durable statuses, with `result` and `reason` read from the
// same brand of the callee.
//
// The brand is the `durableBrand` unique symbol declared by Elnor's
// intents.d.mts. It is recognized by its declaration, `declare const
// durableBrand: unique symbol`, at the top level of a declaration file named
// intents.d.mts, so a copy of that file or the installed package both count,
// and a property that only has the same name does not.
import path from 'node:path';
import {getTs} from './typescript.mjs';

export function durableHelperNames(ir) {
  if (!ir.actions.some(action => action.durable)) return null;
  let base = '__elnor_durable';
  while (ir.source.includes(base)) base += '_';
  return {call: base, types: `${base}Types`, any: `${base}Any`};
}

// One line, so the line based projection of the checker keeps its line map.
export function durableHelpers(names) {
  const {call, types, any} = names;
  return `type ${any} = {readonly input: any; readonly result: any; readonly reason: any}; `
    + `type ${types}<T> = {[K in keyof T]-?: K extends symbol ? T[K] : never}[keyof T] extends infer P ? [P] extends [never] ? ${any} `
    + `: [P] extends [{readonly input: unknown; readonly result: unknown; readonly reason: unknown}] ? P : ${any} : never; `
    + `declare function ${call}<T>(request: T): Promise<{status: 'applied'; result: ${types}<T>['result']; late: boolean} `
    + `| {status: 'rejected'; reason: ${types}<T>['reason']; late: boolean} | {status: 'unavailable'; late: boolean}>;`;
}

export function durableMemberTypes(names, action) {
  return `${names.types}<typeof ${action.durable.callee}>`;
}

// The first statement is the awaited call and an optional semicolon, so the
// call ends where TypeScript ends the expression before restSpan.
function callEnd(source, durable) {
  const ts = getTs(), start = durable.calleeSpan.start;
  const script = ts.createSourceFile('call.ts', source.slice(start, durable.restSpan.start), ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const statement = script.statements[0];
  return statement && ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
    ? start + statement.expression.end : undefined;
}

// The body pieces of an action: source spans and generated text, with the
// durable call of a member wrapped by the helper. The piece that opens the
// wrapper is marked, so the projection can record where the call starts.
export function memberBodyPieces(action, source, names) {
  const pieces = action.bodySegments ?? [{span: action.bodySpan}];
  const end = action.durable && names ? callEnd(source, action.durable) : undefined;
  if (end === undefined) return pieces;
  const inserts = [{at: action.durable.calleeSpan.start, text: `${names.call}(`, call: true}, {at: end, text: ')'}];
  const result = [];
  for (const piece of pieces) {
    if (!piece.span) { result.push(piece); continue; }
    let cursor = piece.span.start;
    const last = piece.span.start + piece.span.length;
    while (inserts.length && inserts[0].at >= cursor && inserts[0].at <= last) {
      const {at, text, call} = inserts.shift();
      if (at > cursor) result.push({span: {start: cursor, length: at - cursor}});
      result.push(call ? {text, durableCall: true} : {text});
      cursor = at;
    }
    if (last > cursor) result.push({span: {start: cursor, length: last - cursor}});
  }
  return inserts.length ? pieces : result;
}

const brandCache = new WeakMap();

function brandSymbols(ts, program, checker) {
  if (brandCache.has(program)) return brandCache.get(program);
  const brands = new Set();
  for (const file of program.getSourceFiles()) {
    if (!file.isDeclarationFile || path.basename(file.fileName) !== 'intents.d.mts') continue;
    for (const statement of file.statements) {
      if (!ts.isVariableStatement(statement) || !statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword)) continue;
      if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) continue;
      for (const declaration of statement.declarationList.declarations) {
        const type = declaration.type;
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'durableBrand' || !type || !ts.isTypeOperatorNode(type)
          || type.operator !== ts.SyntaxKind.UniqueKeyword || type.type.kind !== ts.SyntaxKind.SymbolKeyword) continue;
        const symbol = checker.getSymbolAtLocation(declaration.name);
        if (symbol) brands.add(symbol);
      }
    }
  }
  brandCache.set(program, brands);
  return brands;
}

function brandProperty(ts, checker, brands, type) {
  if (!brands.size) return undefined;
  return checker.getPropertiesOfType(type).find(property => String(property.escapedName).startsWith('__@durableBrand@')
    && property.declarations?.some(declaration => declaration.name && ts.isComputedPropertyName(declaration.name)
      && brands.has(checker.getSymbolAtLocation(declaration.name.expression))));
}

// The first part of a type that JSON cannot store, or undefined. An object
// property may be undefined, because JSON leaves it out and it reads back as
// undefined. An object with a method or a symbol key is reported as a whole.
function nonJson(ts, checker, type, seen = new Set(), property = false) {
  const flags = type.flags, F = ts.TypeFlags;
  if (flags & (F.Any | F.Never | F.Null | F.Boolean | F.BooleanLiteral | F.StringLike | F.NumberLike)) return undefined;
  if (flags & (F.Undefined | F.Void)) return property ? undefined : type;
  if (type.isUnion()) {
    for (const part of type.types) {
      const found = nonJson(ts, checker, part, seen, property);
      if (found) return found;
    }
    return undefined;
  }
  // A branded primitive, such as string & {brand: 'id'}, is the primitive.
  if (type.isIntersection() && type.types.some(part => part.flags & (F.StringLike | F.NumberLike | F.BooleanLike))) return undefined;
  if (flags & F.TypeParameter) {
    const constraint = checker.getBaseConstraintOfType(type);
    return constraint && constraint !== type ? nonJson(ts, checker, constraint, seen, property) : type;
  }
  if (!(flags & F.Object) && !type.isIntersection()) return type;
  if (seen.has(type)) return undefined;
  seen.add(type);
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    for (const element of checker.getTypeArguments(type)) {
      const found = nonJson(ts, checker, element, seen);
      if (found) return found;
    }
    return undefined;
  }
  if (type.getCallSignatures().length || type.getConstructSignatures().length) return type;
  for (const member of checker.getPropertiesOfType(type)) {
    if (String(member.escapedName).startsWith('__@')) return type;
    const found = nonJson(ts, checker, checker.getTypeOfSymbol(member), seen, true);
    if (found) return found.getCallSignatures().length ? type : found;
  }
  for (const info of checker.getIndexInfosOfType(type)) {
    if (!(info.keyType.flags & (F.String | F.Number))) return type;
    const found = nonJson(ts, checker, info.type, seen, true);
    if (found) return found.getCallSignatures().length ? type : found;
  }
  return undefined;
}

function isOwnerType(ts, checker, type, list = false) {
  const F = ts.TypeFlags;
  if (type.flags & (F.Any | F.Never | F.StringLike | F.NumberLike)) return true;
  if (type.isUnion()) return type.types.every(part => isOwnerType(ts, checker, part, list));
  if (type.isIntersection()) return type.types.some(part => part.flags & (F.StringLike | F.NumberLike));
  if (list || !(checker.isArrayType(type) || checker.isTupleType(type))) return false;
  return checker.getTypeArguments(type).every(element => isOwnerType(ts, checker, element, true));
}

const jsonTypes = 'strings, numbers, booleans, null, arrays and plain objects';

// Errors in original offsets: {code, message, start, length}. A position the
// projection cannot map is returned as {code, message, generated}.
export function durableTypeErrors(ts, program, file, projection) {
  const source = program?.getSourceFile(file), durable = projection?.durable;
  if (!source || !durable) return [];
  const checker = program.getTypeChecker(), brands = brandSymbols(ts, program, checker);
  const errors = [];
  const at = (offset, test) => {
    const find = node => {
      if (offset < node.pos || offset >= node.end) return undefined;
      if (node.kind !== ts.SyntaxKind.SourceFile && node.getStart(source) === offset && test(node)) return node;
      return ts.forEachChild(node, find);
    };
    return offset < 0 ? undefined : find(source);
  };
  const report = (code, node, message) => {
    const start = node.getStart(source), length = node.getEnd() - start;
    const original = durable.toOriginal(start, length);
    errors.push(original ? {code, message, ...original} : {code, message, generated: start});
  };
  const roots = new Map();
  for (const member of durable.members) {
    const call = at(member.callOffset, ts.isCallExpression), fn = at(member.functionOffset, node => ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node));
    if (!call || !fn) continue;
    const callee = call.expression, name = member.callee;
    const brand = brandProperty(ts, checker, brands, checker.getTypeAtLocation(callee));
    if (!brand) {
      report('ELN-DURABLE-TYPE', callee, `Call a durable operation here, typed as DurableOperation and created with journal.operation. '${name}' is not one.`);
    } else {
      const types = checker.getTypeOfSymbolAtLocation(brand, callee);
      for (const [key, label] of [['input', 'input'], ['result', 'result'], ['reason', 'rejection reason']]) {
        const part = checker.getPropertyOfType(types, key);
        const found = part && nonJson(ts, checker, checker.getTypeOfSymbolAtLocation(part, callee));
        if (found) report('ELN-DURABLE-TYPE', callee, `Use a JSON type for the ${label} of '${name}': ${jsonTypes}. The journal stores it, and '${checker.typeToString(found)}' is not JSON.`);
      }
      const first = roots.get(member.group);
      if (!first) roots.set(member.group, member.root);
      else if (first !== member.root) {
        report('ELN-DURABLE-TYPE', callee, `Call an operation of '${first}' here, as the other members of group '${member.group}' do. A group has one journal, which only operations of one prop can share.`);
      }
    }
    for (const parameter of fn.parameters) {
      const found = nonJson(ts, checker, checker.getTypeAtLocation(parameter.name));
      if (!found) continue;
      // An optional parameter is undefined when it is left out.
      const optional = parameter.questionToken && found.flags & ts.TypeFlags.Undefined;
      report('ELN-DURABLE-TYPE', optional ? parameter.name : parameter.type ?? parameter.name, `Give parameter '${parameter.name.getText(source)}' a JSON type: ${jsonTypes}. The journal stores it, and '${checker.typeToString(found)}' is not JSON.`);
    }
  }
  for (const owner of durable.owners) {
    const node = at(owner.offset, node => node.getEnd() === owner.offset + owner.length && ts.isExpression(node));
    if (node && !isOwnerType(ts, checker, checker.getTypeAtLocation(node))) {
      report('ELN-DURABLE-TYPE', node, `Use a string, a number or a list of them as the owner of a durable group, such as an id. The journal stores the owner with every intent.`);
    }
  }
  if (brands.size) {
    const allowed = new Set(durable.members.map(member => member.callOffset));
    const skipped = durable.skipped ?? [];
    const visit = node => {
      if (ts.isCallExpression(node) && !allowed.has(node.getStart(source))
        && !skipped.some(range => node.getStart(source) >= range.start && node.end <= range.end)
        && brandProperty(ts, checker, brands, checker.getTypeAtLocation(node.expression))) {
        const name = node.expression.getText(source);
        report('ELN-DURABLE-CALL', node.expression, `Call '${name}' only as the first statement of a durable member, as in const outcome = await ${name}(input). A call anywhere else skips the journal.`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return errors;
}
