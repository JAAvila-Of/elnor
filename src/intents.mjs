// The intent journal stores durable intents per account scope and reconciles
// them with the provider through a transport, so that a write survives a
// reload, a lost reply or an unmount without being applied twice.
//
// All intents of a scope live under one storage key, `elnor-intents:{scope}`,
// as {format: 1, epoch, records}. Every read-modify-write of that key runs
// inside a Web Lock of the same name, so two tabs never admit two intents for
// one owner and each terminal outcome has one consumer.
//
// A record is pending until the provider decides it, terminal until a member
// consumes it or the host acknowledges it, and blocked when it cannot be sent
// safely, until the host discards it. A record that cannot be read is blocked
// as corrupt and is never rewritten or removed silently.
//
// Components reach the journal through the operations the host passes as
// props: each one carries an internal hook under Symbol.for('elnor.durable'),
// so the runtime never imports this module.

const hookKey = Symbol.for('elnor.durable');
const storagePrefix = 'elnor-intents:';
const blockReasons = new Set(['key-conflict', 'epoch', 'mismatch', 'version', 'unknown-operation', 'corrupt']);
const identityFields = ['journal', 'owner', 'member', 'operation', 'key', 'admittedBy'];

export function createIntentJournal({storage, scope, locks = globalThis.navigator?.locks, createKey = () => crypto.randomUUID(), retry = {firstMs: 1000, maxMs: 60000}} = {}) {
  if (!locks) throw new TypeError('Durable intents need the Web Locks API');
  if (typeof scope !== 'string' || !scope) throw new TypeError('A journal needs the account scope as a non-empty string');
  const name = storagePrefix + scope, instance = crypto.randomUUID();
  const operations = new Map(), watchers = new Set(), pauseListeners = new Set();
  const inFlight = new Map(), waiting = new Map(), attempts = new Map();
  let running = false, paused = false;

  const exclusive = task => locks.request(name, task);
  const read = () => parseJournal(storage.getItem(name));
  const readOrEmpty = () => {
    try { return read(); } catch { return parseJournal(null); }
  };
  const write = state => {
    storage.setItem(name, JSON.stringify({format: 1, epoch: state.epoch, records: state.records}));
    notify(state);
  };
  const remove = test => exclusive(() => {
    const state = read(), index = state.unreadable === null ? state.records.findIndex(test) : -1;
    if (index >= 0) write({...state, records: state.records.toSpliced(index, 1)});
  });
  const valid = item => wellFormed(item, scope);
  const find = (state, key, phase) => state.unreadable === null ? state.records.find(item => valid(item) && item.key === key && item.state === phase) : undefined;
  const outcomeOf = record => ({...record.outcome, late: record.admittedBy !== instance});
  const view = item => {
    if (!valid(item)) return {id: corruptId(JSON.stringify(item)), member: '', state: 'blocked', params: []};
    return {id: item.key, member: item.member, state: item.state, ...(item.state === 'terminal' && {outcome: outcomeOf(item)}), params: item.params};
  };

  // Watchers see their owner's record, or null, each time it changes.
  const show = (watcher, state) => {
    let current = null;
    if (state.unreadable !== null) current = {id: corruptId(state.unreadable), member: '', state: 'blocked', params: []};
    else {
      const item = state.records.find(item => item?.journal === watcher.journal && item?.owner === watcher.owner);
      if (item !== undefined) current = view(item);
    }
    const text = JSON.stringify(current);
    if (text === watcher.last) return;
    watcher.last = text;
    try { watcher.listener(current); } catch (error) { report(error); }
  };
  const notify = state => {
    for (const watcher of watchers) show(watcher, state);
  };

  const pause = () => {
    if (paused) return;
    paused = true;
    for (const listener of pauseListeners) {
      try { listener('scope-refused'); } catch (error) { report(error); }
    }
  };
  const schedule = key => {
    if (!running || waiting.has(key)) return;
    const attempt = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, attempt);
    const delay = Math.min(retry.firstMs * 2 ** (attempt - 1), retry.maxMs);
    waiting.set(key, setTimeout(() => {
      waiting.delete(key);
      drive(key);
    }, delay));
  };

  // Sends one pending record until the provider decides it, the scope pauses,
  // a retry waits, or the journal stops. An answer that arrives after stop is
  // still recorded, but nothing more is sent.
  async function drive(key) {
    if (!running || paused || inFlight.has(key) || waiting.has(key)) return;
    const controller = new AbortController();
    inFlight.set(key, controller);
    try {
      while (running && !paused && !controller.signal.aborted) {
        const record = find(read(), key, 'pending');
        const operation = record && operations.get(record.operation);
        if (!operation || operation.version !== record.version) return;
        let answer;
        try {
          answer = await operation.transport.send({operation: record.operation, key, scope, epoch: record.epoch, input: record.input, signal: controller.signal});
        } catch {
          answer = {kind: 'retry'};
        }
        const next = await exclusive(() => {
          const state = read(), current = find(state, key, 'pending');
          if (!current) return 'done';
          // Another tab stamped the record while this request was out.
          if (current.epoch !== record.epoch) return 'send';
          const {record: updated, epoch, next} = applyAnswer(current, answer, state.epoch);
          if (updated !== current || epoch !== state.epoch) write({...state, epoch, records: state.records.map(item => item === current ? updated : item)});
          return next;
        });
        if (next === 'retry') return schedule(key);
        attempts.delete(key);
        if (next === 'pause') return pause();
        if (next !== 'send') return;
      }
    } catch {
      // Storage failed while the answer was recorded; the replay is safe.
      schedule(key);
    } finally {
      if (inFlight.get(key) === controller) inFlight.delete(key);
    }
  }

  // Blocks records this journal cannot send and drives the rest.
  async function reconcile() {
    let keys;
    try {
      keys = await exclusive(() => {
        const state = read();
        if (state.unreadable !== null) return [];
        let changed = false;
        const records = state.records.map(item => {
          if (!valid(item) || item.state !== 'pending') return item;
          const operation = operations.get(item.operation);
          const reason = !operation ? 'unknown-operation' : operation.version !== item.version ? 'version' : null;
          if (!reason) return item;
          changed = true;
          return block(item, reason);
        });
        if (changed) write({...state, records});
        return records.filter(item => valid(item) && item.state === 'pending').map(item => item.key);
      });
    } catch {
      return;
    }
    for (const key of keys) drive(key);
  }

  const online = () => {
    for (const timer of waiting.values()) clearTimeout(timer);
    waiting.clear();
    attempts.clear();
    reconcile();
  };
  const storageChanged = event => {
    if (event.key === name || event.key === null) notify(readOrEmpty());
  };

  const hook = {
    watch(journal, owner, listener) {
      const watcher = {journal, owner, listener, last: undefined};
      watchers.add(watcher);
      show(watcher, readOrEmpty());
      return () => { watchers.delete(watcher); };
    },
    async admit({journal, owner, member, operation, version, params, input}) {
      const registered = operations.get(operation);
      if (!registered || registered.version !== version) return undefined;
      if (typeof journal !== 'string' || typeof owner !== 'string' || typeof member !== 'string' || !Array.isArray(params)) return undefined;
      const frozen = jsonCopy({params, input});
      if (!frozen) return undefined;
      let key;
      try {
        key = await exclusive(() => {
          const state = read();
          if (state.unreadable !== null || state.records.some(item => item?.journal === journal && item?.owner === owner)) return undefined;
          const record = {
            format: 1, journal, scope, owner, member, operation, version, key: createKey(), epoch: state.epoch,
            params: frozen.params, input: frozen.input, state: 'pending', admittedBy: instance
          };
          write({...state, records: [...state.records, record]});
          return record.key;
        });
      } catch {
        return undefined;
      }
      if (key !== undefined) drive(key);
      return key;
    },
    consume(id, deliver) {
      return exclusive(() => {
        const state = read(), record = find(state, id, 'terminal');
        if (!record) return false;
        let failure;
        try { deliver(view(record)); } catch (error) { failure = {error}; }
        // A failing handler still counts as delivered, so it does not run again.
        write({...state, records: state.records.filter(item => item !== record)});
        if (failure) throw failure.error;
        return true;
      });
    }
  };

  return {
    operation(operationName, {version, transport} = {}) {
      if (typeof operationName !== 'string' || !operationName) throw new TypeError('A durable operation needs a name');
      if (operations.has(operationName)) throw new TypeError(`The durable operation '${operationName}' is already registered`);
      if (!Number.isInteger(version)) throw new TypeError(`The durable operation '${operationName}' needs an integer version`);
      if (typeof transport?.send !== 'function') throw new TypeError(`The durable operation '${operationName}' needs a transport`);
      operations.set(operationName, {version, transport});
      const operation = input => Object.freeze({operation: operationName, input});
      Object.defineProperty(operation, hookKey, {value: Object.freeze({journal: hook, name: operationName, version})});
      return operation;
    },
    start() {
      paused = false;
      if (!running) {
        running = true;
        globalThis.addEventListener?.('online', online);
        globalThis.addEventListener?.('storage', storageChanged);
      }
      reconcile();
    },
    stop() {
      if (!running) return;
      running = false;
      globalThis.removeEventListener?.('online', online);
      globalThis.removeEventListener?.('storage', storageChanged);
      for (const controller of inFlight.values()) controller.abort();
      for (const timer of waiting.values()) clearTimeout(timer);
      inFlight.clear();
      waiting.clear();
      attempts.clear();
    },
    outcomes() {
      const state = readOrEmpty();
      if (state.unreadable !== null) return [];
      return state.records.filter(item => valid(item) && item.state === 'terminal').map(record => ({
        id: record.key, journal: record.journal, owner: record.owner, member: record.member, operation: record.operation,
        input: record.input, outcome: outcomeOf(record),
        acknowledge: () => remove(item => valid(item) && item.key === record.key && item.state === 'terminal')
      }));
    },
    blocked() {
      const state = readOrEmpty(), text = state.unreadable;
      if (text !== null) {
        return [{
          id: corruptId(text), journal: '', owner: '', member: '', operation: '', reason: 'corrupt', export: () => text,
          discard: () => exclusive(() => {
            if (storage.getItem(name) !== text) return;
            storage.removeItem(name);
            notify(read());
          })
        }];
      }
      return state.records.filter(item => !valid(item) || item.state === 'blocked').map(item => {
        const stored = JSON.stringify(item), field = key => typeof item?.[key] === 'string' ? item[key] : '';
        return {
          id: valid(item) ? item.key : corruptId(stored), journal: field('journal'), owner: field('owner'), member: field('member'),
          operation: field('operation'), reason: valid(item) ? item.reason : 'corrupt', export: () => stored,
          discard: () => remove(other => JSON.stringify(other) === stored)
        };
      });
    },
    onPaused(listener) {
      pauseListeners.add(listener);
      return () => { pauseListeners.delete(listener); };
    }
  };
}

// The next record and journal epoch after one answer from the transport, and
// what the journal does next: send again, wait for a retry, pause the scope,
// or nothing because the record is decided or blocked.
function applyAnswer(record, answer, knownEpoch) {
  const kind = answer?.kind;
  if (kind === 'epoch' && typeof answer.epoch === 'string') {
    if (record.epoch === null) return {record: {...record, epoch: answer.epoch}, epoch: answer.epoch, next: 'send'};
    // An earlier request may have been applied in the history the provider lost.
    return {record: block(record, 'epoch'), epoch: answer.epoch, next: 'done'};
  }
  if (kind === 'applied' || kind === 'rejected' || kind === 'unavailable') {
    if (answer.epoch !== record.epoch) return {record: block(record, 'mismatch'), epoch: knownEpoch, next: 'done'};
    const outcome = kind === 'applied' ? {status: kind, result: answer.result} : kind === 'rejected' ? {status: kind, reason: answer.reason} : {status: kind};
    return {record: {...record, state: 'terminal', outcome}, epoch: answer.epoch, next: 'done'};
  }
  if (kind === 'key-conflict' || kind === 'mismatch') return {record: block(record, kind), epoch: knownEpoch, next: 'done'};
  if (kind === 'scope-refused') return {record, epoch: knownEpoch, next: 'pause'};
  return {record, epoch: knownEpoch, next: 'retry'};
}

function block(record, reason) {
  return {...record, state: 'blocked', reason};
}

// Stored text that is not a journal of this format is kept as it is.
function parseJournal(text) {
  if (text === null) return {epoch: null, records: [], unreadable: null};
  let value;
  try { value = JSON.parse(text); } catch { value = undefined; }
  const readable = value && typeof value === 'object' && value.format === 1 && Array.isArray(value.records) && (value.epoch === null || typeof value.epoch === 'string');
  return readable ? {epoch: value.epoch, records: value.records, unreadable: null} : {epoch: null, records: [], unreadable: text};
}

function wellFormed(item, scope) {
  if (!item || typeof item !== 'object' || Array.isArray(item) || item.format !== 1 || item.scope !== scope) return false;
  if (!identityFields.every(field => typeof item[field] === 'string') || !Number.isInteger(item.version)) return false;
  if ((item.epoch !== null && typeof item.epoch !== 'string') || !Array.isArray(item.params) || !Object.hasOwn(item, 'input')) return false;
  if (item.state === 'pending') return true;
  if (item.state === 'blocked') return blockReasons.has(item.reason);
  return item.state === 'terminal' && ['applied', 'rejected', 'unavailable'].includes(item.outcome?.status);
}

// A JSON copy of the value, or undefined when the copy would differ from it,
// so admission never stores a different value than the one it was given.
function jsonCopy(value) {
  let copy;
  try { copy = JSON.parse(JSON.stringify(value)); } catch { return undefined; }
  return sameJson(value, copy) ? copy : undefined;
}

function sameJson(value, copy) {
  if (value === null || typeof value !== 'object') return Object.is(value, copy);
  if (copy === null || typeof copy !== 'object') return false;
  const prototype = Object.getPrototypeOf(value), keys = Reflect.ownKeys(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || !Array.isArray(copy) || copy.length !== value.length || keys.length !== value.length + 1) return false;
    for (let index = 0; index < value.length; index++) if (!sameJson(value[index], copy[index])) return false;
    return true;
  }
  if (prototype !== Object.prototype && prototype !== null) return false;
  return keys.length === Object.keys(copy).length && keys.every(key => typeof key === 'string' && Object.hasOwn(copy, key) && sameJson(value[key], copy[key]));
}

function corruptId(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return `corrupt-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function report(error) {
  if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
  else queueMicrotask(() => { throw error; });
}
