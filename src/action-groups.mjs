export const actionGroupPolicies = ['single-flight', 'latest'];

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
