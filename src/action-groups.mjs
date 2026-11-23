export const actionGroupPolicies = ['single-flight', 'latest', 'keep-latest'];

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
