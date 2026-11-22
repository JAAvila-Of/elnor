// Differential check of the managed action lowering against native async
// functions. Each body runs once as a native async function and once through
// managedGeneratorBody and createActionGroup without retirement. Both runs
// must log the same events and settle with the same result or error.
import assert from 'node:assert/strict';
import test from 'node:test';
import {managedGeneratorBody} from '../src/managed-action-lowering.mjs';
import {cell, createActionGroup, scope} from '../src/runtime.mjs';

function createHost(log) {
  const resource = (label, method) => ({[method]() {
    log.push(`dispose ${label}`);
    if (label.startsWith('bad')) throw new Error(`dispose ${label} failed`);
    return method === Symbol.asyncDispose ? Promise.resolve() : undefined;
  }});
  return {
    log(entry) { log.push(entry); },
    value(value) { log.push(`value ${String(value)}`); return Promise.resolve(value); },
    fail(message) { log.push(`fail ${message}`); return Promise.reject(new Error(message)); },
    async *items(labels, failAt) {
      try {
        for (const label of labels) {
          if (label === failAt) throw new Error(`items ${label} failed`);
          log.push(`yield ${label}`);
          yield label;
        }
      } finally {
        log.push('items finally');
      }
    },
    closing(labels, returnBehavior) {
      let index = 0;
      const iterator = {
        [Symbol.asyncIterator]() { return iterator; },
        next() { log.push('next'); return Promise.resolve(index < labels.length ? {done:false, value:labels[index++]} : {done:true}); },
        return() {
          log.push('return');
          if (returnBehavior === 'throw') throw new Error('return failed');
          if (returnBehavior === 'primitive') return Promise.resolve(1);
          return Promise.resolve({done:true});
        }
      };
      return iterator;
    },
    syncValues(values) {
      let index = 0;
      const iterator = {
        [Symbol.iterator]() { return iterator; },
        next() { log.push('sync next'); return index < values.length ? {done:false, value:values[index++]} : {done:true}; },
        return() { log.push('sync return'); return {done:true}; }
      };
      return iterator;
    },
    rejected(message) { const promise = Promise.reject(new Error(message)); promise.catch(() => {}); return promise; },
    asyncResource(label) { return resource(label, Symbol.asyncDispose); },
    syncResource(label) { return resource(label, Symbol.dispose); }
  };
}

// TypeError messages are engine specific, so only their type is compared.
function describe(value) {
  if (value instanceof Error) {
    const result = {name:value.name, message:value instanceof TypeError ? 'TypeError' : value.message};
    if (value.name === 'SuppressedError') Object.assign(result, {error:describe(value.error), suppressed:describe(value.suppressed)});
    return result;
  }
  return {value};
}

async function runNative(body) {
  const log = [];
  const action = new Function('host', `return (async function (host) {\n${body}\n})(host);`);
  try {
    return {log, outcome:{status:'success', ...describe(await action(createHost(log)))}};
  } catch (error) {
    return {log, outcome:{status:'error', ...describe(error)}};
  }
}

async function runManaged(body) {
  const log = [];
  const action = {functionSource:`async function run(host) {\n${body}\n}`};
  let counter = 0;
  const generator = managedGeneratorBody(action, {lease:'lease', fresh:hint => `__elnor_${hint}_${counter++}`});
  const createBody = new Function('lease', `return function* (host) ${generator};`);
  const group = createActionGroup('latest', () => 'owner', scope());
  const run = group.action(createBody);
  await run(createHost(log));
  if (run.status === 'success') return {log, outcome:{status:'success', ...describe(run.result)}};
  assert.equal(run.status, 'error');
  return {log, outcome:{status:'error', ...describe(run.error)}};
}

const cases = {
  'await in nested expressions': `
    const record = {[await host.value("key")]: (await host.value(1)) + (await host.value(2))};
    const label = \`\${await host.value("a")}-\${await host.value("b")}\`;
    const chosen = (await host.value(false)) ? await host.value("left") : await host.value("right");
    const optional = (await host.value(null))?.missing ?? await host.value("fallback");
    return [record.key, label, chosen, optional, ...[await host.value("spread")]].join("|");`,
  'try catch finally with return overridden by finally': `
    try {
      return await host.value("try");
    } catch (error) {
      host.log("catch");
    } finally {
      await host.value("cleanup");
      return "finally";
    }`,
  'rejection caught and rethrown through awaited finally': `
    try {
      try {
        await host.fail("load");
      } catch ({message}) {
        host.log("caught " + message);
        throw new Error("wrapped " + message);
      } finally {
        await host.value("release");
      }
    } catch (error) {
      host.log("outer " + error.message);
    }
    return "done";`,
  'failure in finally replaces the pending error': `
    try {
      await host.fail("body");
    } finally {
      await host.fail("cleanup");
    }`,
  'nested awaited finally blocks': `
    try {
      try {
        await host.value("inner");
      } finally {
        await host.value("inner cleanup");
        try { await host.fail("deep"); } catch { host.log("deep caught"); } finally { await host.value("deep cleanup"); }
      }
    } finally {
      await host.value("outer cleanup");
    }
    return "done";`,
  'labeled break and continue across awaited finally': `
    outer: for (const round of [1, 2, 3]) {
      block: try {
        if (round === 1) continue outer;
        if (round === 2) break block;
        break outer;
      } finally {
        await host.value("cleanup " + round);
      }
      host.log("after block " + round);
    }
    return "done";`,
  'switch with awaits and fallthrough': `
    switch (await host.value(2)) {
      case 1: host.log("one");
      case 2: host.log(await host.value("two"));
      case 3: host.log("three"); break;
      default: host.log("default");
    }
    return "done";`,
  'for await over an async generator with continue and break': `
    const seen = [];
    for await (const item of host.items(["a", "b", "c", "d"])) {
      if (item === "b") continue;
      seen.push(item + await host.value("!"));
      if (item === "c") break;
    }
    return seen.join(",");`,
  'labeled continue to an outer loop from for await': `
    const seen = [];
    outer: for (const round of [1, 2]) {
      for await (const item of host.items(["x", "y"])) {
        if (item === "y") continue outer;
        seen.push(round + item);
      }
    }
    return seen.join(",");`,
  'return from for await closes the generator': `
    for await (const item of host.items(["a", "b"])) return item;
    return "unreachable";`,
  'throw in for await body keeps body error over return failure': `
    for await (const item of host.closing(["a"], "throw")) throw new Error("body " + item);`,
  'break with a primitive return result': `
    for await (const item of host.closing(["a"], "primitive")) break;
    return "done";`,
  'iterator failure in for await does not close it': `
    for await (const item of host.items(["a", "b"], "b")) host.log("got " + item);`,
  'for await with destructuring and closures per iteration': `
    const readers = [];
    for await (const [first, ...rest] of host.items(["ab", "cd"])) readers.push(() => first + rest.length);
    let last;
    for await (last of host.items(["z"])) {}
    return readers.map(read => read()).join(",") + last;`,
  'for await over a sync iterable of promises': `
    let joined = "";
    for await (const item of host.syncValues([host.value("a"), "b", host.value("c")])) joined += item;
    return joined;`,
  'for await over a sync iterable with a rejected value': `
    for await (const item of host.syncValues(["a", host.rejected("value"), "c"])) host.log("got " + item);`,
  'for await break over a sync iterable': `
    for await (const item of host.syncValues(["a", "b"])) break;
    return "done";`,
  'await using with mixed resources and null': `
    {
      await using first = host.asyncResource("first");
      using second = host.syncResource("second");
      await using empty = null;
      await using third = host.syncResource("third");
      host.log("body");
    }
    return "done";`,
  'await using failures chain SuppressedError': `
    await using first = host.asyncResource("bad first");
    await using second = host.asyncResource("bad second");
    throw new Error("body");`,
  'await using with an invalid resource': `
    await using invalid = 42;`,
  'await using inside a for await head': `
    async function* resources() {
      yield host.asyncResource("a");
      yield host.asyncResource("b");
    }
    for await (await using resource of resources()) host.log("use");
    return "done";`,
  'return value disposal order': `
    await using resource = host.asyncResource("resource");
    return await host.value("result");`,
  'await of thenables and non-promises': `
    const thenable = {then(resolve) { host.log("then"); resolve("thenable"); }};
    return [await thenable, await 1, await undefined].join(",");`
};

for (const [name, body] of Object.entries(cases)) {
  test(`managed lowering matches native async: ${name}`, async () => {
    const native = await runNative(body);
    const managed = await runManaged(body);
    assert.deepEqual(managed, native);
  });
}
