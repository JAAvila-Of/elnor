import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export function getTs() {
  try { return require('typescript'); } catch (cause) {
    throw new Error('Local TypeScript is required. Run npm install in the Elnor project.', {cause});
  }
}

function declaredStringValues(ts, diagnostic, getChecker) {
  const {file, start} = diagnostic;
  if (!file || start === undefined) return [];

  // TS2322 on a variable initializer points at the declaration name.
  function findDeclaration(node) {
    if (start < node.pos || start >= node.end) return undefined;
    if (ts.isVariableDeclaration(node) && node.name.getStart(file) === start) return node;
    return ts.forEachChild(node, findDeclaration);
  }

  const declaration = findDeclaration(file);
  if (!declaration?.type || !declaration.initializer) return [];

  const expected = getChecker()?.getTypeFromTypeNode(declaration.type);
  if (!expected) return [];
  const members = expected.isUnion() ? expected.types : [expected];
  if (!members.every(type => type.isStringLiteral() && !(type.flags & ts.TypeFlags.EnumLiteral))) return [];
  return members.map(type => type.value);
}

export function surfaceDiagnosticMessage(ts, diagnostic, getChecker) {
  const {code, messageText} = diagnostic;
  if (code === 2322 && typeof messageText === 'string') {
    // Match only the simple diagnostic with a quoted string literal type.
    const match = /^Type '("(?:[^"\\\r\n]|\\.)*")' is not assignable to type ('.+')\.$/.exec(messageText);
    if (match) {
      const message = 'The string value ' + match[1] + ' is not assignable to type ' + match[2] + '.';
      const values = declaredStringValues(ts, diagnostic, getChecker);
      if (!values.length) return message;
      const shown = values.slice(0, 12).map(value => JSON.stringify(value));
      const label = shown.length === values.length
        ? 'Allowed values'
        : 'Allowed values (first ' + shown.length + ' of ' + values.length + ')';
      return message + ' ' + label + ': ' + shown.join(', ') + '.';
    }
  }
  return ts.flattenDiagnosticMessageText(messageText, ' ');
}
