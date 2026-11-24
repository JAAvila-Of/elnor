// The intent journal stores durable intents per account scope and reconciles
// them with the provider through a transport, so that a write survives a
// reload, a lost reply or an unmount without being applied twice.
//
// All intents of a scope live under one key of an intent store,
// `elnor-intents:{scope}`, as the JSON text of {format: 1, epoch, records}.
// Every read-modify-write of that key runs inside a Web Lock of the same name,
// and a write resolves only once it is committed, so two tabs never admit two
// intents for one owner and each terminal outcome has one consumer. The store
// is IndexedDB, whose transactions are coherent across tabs; localStorage is
// not, even under the lock, so it is not offered.
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
const objectStore = 'journals';
const blockReasons = new Set(['key-conflict', 'epoch', 'mismatch', 'version', 'unknown-operation', 'corrupt']);
const identityFields = ['journal', 'owner', 'member', 'operation', 'key', 'admittedBy'];

export function createIntentJournal({store, scope, locks = globalThis.navigator?.locks, createKey = () => crypto.randomUUID(), retry = {firstMs: 1000, maxMs: 60000}} = {}) {
  if (!locks) throw new TypeError('Durable intents need the Web Locks API');
  if (typeof scope !== 'string' || !scope) throw new TypeError('A journal needs the account scope as a non-empty string');
  store ??= indexedDbIntentStore();
  const name = storagePrefix + scope, instance = crypto.randomUUID();
  const operations = new Map(), watchers = new Set(), pauseListeners = new Set();
  const inFlight = new Map(), waiting = new Map(), attempts = new Map(), adopted = new Set();
  // A journal that was stopped admits nothing until it starts again; one that
  // never started admits, so a host can mount views before calling start.
  let running = false, stopped = false, paused = false, unsubscribe;
  // Each read for watchers and each committed write takes a ticket in order.
  // Watchers only see a state whose ticket is newer than the last one shown,
  // so a read that started before a write never shows the older records.
  let issued = 0, shownTicket = 0;

  const exclusive = task => locks.request(name, task);
  const read = async () => parseJournal(await store.read(name));
  const readOrEmpty = () => read().catch(() => parseJournal(null));
  const write = async state => {
    await store.write(name, JSON.stringify({format: 1, epoch: state.epoch, records: state.records}));
    notify(state);
  };
  const remove = test => exclusive(async () => {
    const state = await read(), index = state.unreadable === null ? state.records.findIndex(test) : -1;
    if (index >= 0) await write({...state, records: state.records.toSpliced(index, 1)});
  });
  const valid = item => wellFormed(item, scope);
  const find = (state, key, phase) => state.unreadable === null ? state.records.find(item => valid(item) && item.key === key && item.state === phase) : undefined;
  const owned = (state, journal, owner) => state.records.filter(item => item?.journal === journal && item?.owner === owner);
  // The record an owner's members observe: a blocked or unreadable one first,
  // then the pending one, then the oldest terminal one.
  const observed = records => records.find(item => !valid(item) || item.state === 'blocked') ?? records.find(item => item.state === 'pending') ?? records.find(item => item.state === 'terminal');
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
      const item = observed(owned(state, watcher.journal, watcher.owner));
      if (item !== undefined) current = view(item);
    }
    const text = JSON.stringify(current);
    if (text === watcher.last) return;
    watcher.last = text;
    try { watcher.listener(current); } catch (error) { report(error); }
  };
  const notify = (state, ticket = ++issued) => {
    if (ticket < shownTicket) return;
    shownTicket = ticket;
    for (const watcher of watchers) show(watcher, state);
  };
  // A read that fails shows nothing: it does not mean that no record exists.
  const refresh = async () => {
    const ticket = ++issued;
    let state;
    try { state = await read(); } catch { return; }
    notify(state, ticket);
    adopt(state);
  };
  // A pending record that this journal can send and is not sending may have
  // been left by a tab that closed with its request in flight. It is sent
  // after one backoff, so the admitting tab usually decides it first; a
  // concurrent replay is safe by protocol.
  const adopt = state => {
    if (!running || paused || state.unreadable !== null) return;
    for (const item of state.records) {
      if (!valid(item) || item.state !== 'pending' || !sendable(item) || inFlight.has(item.key) || waiting.has(item.key)) continue;
      adopted.add(item.key);
      schedule(item.key);
    }
  };
  const sendable = item => operations.get(item.operation)?.version === item.version;

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
      adopted.delete(key);
      drive(key);
    }, delay));
  };

  // Sends one pending record until the provider decides it, the scope pauses,
  // a retry waits, or the journal stops. An answer that arrives after stop is
  // still recorded, but nothing more is sent.
  async function drive(key) {
    // A reconcile or an admission sends at once instead of waiting for an
    // adoption scheduled by a refresh.
    if (adopted.delete(key)) {
      clearTimeout(waiting.get(key));
      waiting.delete(key);
      attempts.delete(key);
    }
    if (!running || paused || inFlight.has(key) || waiting.has(key)) return;
    const controller = new AbortController();
    inFlight.set(key, controller);
    try {
      while (running && !paused && !controller.signal.aborted) {
        const record = find(await read(), key, 'pending');
        const operation = record && operations.get(record.operation);
        if (!operation || operation.version !== record.version) return;
        let answer;
        try {
          answer = await operation.transport.send({operation: record.operation, key, scope, epoch: record.epoch, input: record.input, signal: controller.signal});
        } catch {
          answer = {kind: 'retry'};
        }
        const next = await exclusive(async () => {
          const state = await read(), current = find(state, key, 'pending');
          if (!current) return 'done';
          // Another tab stamped the record while this request was out.
          if (current.epoch !== record.epoch) return 'send';
          const {record: updated, epoch, next} = applyAnswer(current, answer, state.epoch);
          if (updated !== current || epoch !== state.epoch) await write({...state, epoch, records: state.records.map(item => item === current ? updated : item)});
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

  // Blocks records of an older operation version and drives the records this
  // journal can send. A record of a newer version, or of an operation this
  // journal does not know, was admitted by a newer release in another tab:
  // it stays pending, unsent, for a tab that knows it.
  async function reconcile() {
    let keys;
    try {
      keys = await exclusive(async () => {
        const state = await read();
        if (state.unreadable !== null) return [];
        let changed = false;
        const records = state.records.map(item => {
          if (!valid(item) || item.state !== 'pending') return item;
          const operation = operations.get(item.operation);
          if (!operation || item.version >= operation.version) return item;
          changed = true;
          return block(item, 'version');
        });
        if (changed) await write({...state, records});
        return records.filter(item => valid(item) && item.state === 'pending' && sendable(item)).map(item => item.key);
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
    adopted.clear();
    reconcile();
  };
  // Another tab committed a write or a removal.
  const changed = key => {
    if (key === name) refresh();
  };

  const hook = {
    watch(journal, owner, listener) {
      const watcher = {journal, owner, listener, last: undefined};
      watchers.add(watcher);
      refresh();
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
        key = await exclusive(async () => {
          if (stopped) return undefined;
          const state = await read();
          // Unconsumed outcomes do not hold the owner back; a pending or blocked record does.
          if (state.unreadable !== null || owned(state, journal, owner).some(item => !valid(item) || item.state !== 'terminal')) return undefined;
          const record = {
            format: 1, journal, scope, owner, member, operation, version, key: createKey(), epoch: state.epoch,
            params: frozen.params, input: frozen.input, state: 'pending', admittedBy: instance
          };
          await write({...state, records: [...state.records, record]});
          return record.key;
        });
      } catch {
        return undefined;
      }
      if (key !== undefined) drive(key);
      return key;
    },
    consume(id, deliver, accept = () => true) {
      return exclusive(async () => {
        const state = await read(), record = find(state, id, 'terminal');
        // The outcomes of one owner are consumed in admission order.
        if (!record || owned(state, record.journal, record.owner).find(item => valid(item) && item.state === 'terminal') !== record) return false;
        // A consumer that stopped watching the owner while it waited for the
        // lock leaves the record for the next one.
        if (!accept()) return false;
        let failure;
        try { deliver(view(record)); } catch (error) { failure = {error}; }
        // A failing handler still counts as delivered, so it does not run again.
        await write({...state, records: state.records.filter(item => item !== record)});
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
      stopped = false;
      if (!running) {
        unsubscribe = store.subscribe(changed);
        running = true;
        globalThis.addEventListener?.('online', online);
      }
      reconcile();
    },
    stop() {
      if (!running) return;
      running = false;
      stopped = true;
      globalThis.removeEventListener?.('online', online);
      unsubscribe();
      unsubscribe = undefined;
      for (const controller of inFlight.values()) controller.abort();
      for (const timer of waiting.values()) clearTimeout(timer);
      inFlight.clear();
      waiting.clear();
      attempts.clear();
      adopted.clear();
    },
    async outcomes() {
      const state = await readOrEmpty();
      if (state.unreadable !== null) return [];
      return state.records.filter(item => valid(item) && item.state === 'terminal').map(record => ({
        id: record.key, journal: record.journal, owner: record.owner, member: record.member, operation: record.operation,
        input: record.input, outcome: outcomeOf(record),
        acknowledge: () => remove(item => valid(item) && item.key === record.key && item.state === 'terminal')
      }));
    },
    async blocked() {
      const state = await readOrEmpty(), text = state.unreadable;
      if (text !== null) {
        return [{
          id: corruptId(text), journal: '', owner: '', member: '', operation: '', reason: 'corrupt', export: () => text,
          discard: () => exclusive(async () => {
            if (await store.read(name) !== text) return;
            await store.remove(name);
            notify(parseJournal(null));
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

// The intent store over IndexedDB: one database with one object store that
// keeps each journal's text under an out-of-line key. A write or a removal
// resolves once its transaction has completed, then tells the other tabs
// through a BroadcastChannel so that their journals read the change.
export function indexedDbIntentStore({name = 'elnor-intents', indexedDB: factory = globalThis.indexedDB, channel = () => new BroadcastChannel('elnor-intents')} = {}) {
  if (!factory) throw new TypeError('Durable intents need IndexedDB');
  const listeners = new Set();
  let opening, port;
  // The connection opens on first use. When another page upgrades or deletes
  // the database, it is closed and the next call opens it again.
  const open = () => opening ??= new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(objectStore); };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); opening = undefined; };
      database.onclose = () => { opening = undefined; };
      resolve(database);
    };
    request.onerror = () => reject(request.error);
  }).catch(error => {
    opening = undefined;
    throw error;
  });
  const run = async (mode, operate) => {
    const database = await open();
    return new Promise((resolve, reject) => {
      // A write is flushed to disk before it completes, because the journal
      // sends an intent only after storing it: an intent the provider applied
      // must not be lost to a crash of the system.
      const transaction = database.transaction(objectStore, mode, mode === 'readwrite' ? {durability: 'strict'} : undefined);
      const request = operate(transaction.objectStore(objectStore));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? new DOMException('The intent store transaction was aborted', 'AbortError'));
    });
  };
  // The change is already committed, so a notice that fails does not fail it.
  const announce = key => {
    try {
      const target = port ?? channel();
      target.postMessage(key);
      if (target !== port) target.close();
    } catch (error) {
      report(error);
    }
  };
  return {
    async read(key) {
      const value = await run('readonly', journals => journals.get(key));
      return value === undefined ? null : String(value);
    },
    async write(key, text) {
      await run('readwrite', journals => journals.put(String(text), key));
      announce(key);
    },
    async remove(key) {
      await run('readwrite', journals => journals.delete(key));
      announce(key);
    },
    subscribe(listener) {
      if (!port) {
        port = channel();
        port.onmessage = event => {
          if (typeof event.data === 'string') for (const each of [...listeners]) each(event.data);
        };
      }
      listeners.add(listener);
      return () => {
        if (!listeners.delete(listener) || listeners.size) return;
        port.close();
        port = undefined;
      };
    }
  };
}

// A transport that sends each intent to the provider with PUT
// {baseUrl}/{operation}/{key}. `headers` adds the host's session headers on
// every request. Answers outside the protocol, network failures, 404 and 5xx
// leave the intent pending, and any 403 pauses the scope. A 200, 412 or 422
// whose body is not JSON or echoes another scope, key or epoch blocks it,
// because an endpoint outside the protocol may have applied it.
export function httpIntentTransport({baseUrl, fetch: send = globalThis.fetch, headers = () => ({})} = {}) {
  if (typeof baseUrl !== 'string' || !baseUrl) throw new TypeError('An HTTP transport needs a base URL');
  const base = baseUrl.replace(/\/+$/, '');
  return {
    async send({operation, key, scope, epoch, input, signal}) {
      let response, body;
      try {
        response = await send(`${base}/${encodeURIComponent(operation)}/${encodeURIComponent(key)}`, {
          method: 'PUT', cache: 'no-store', signal, body: JSON.stringify({input}),
          headers: {...headers(), 'Content-Type': 'application/json', 'Intent-Scope': scope, ...(epoch !== null && {'Intent-Epoch': epoch})}
        });
        if (response.status === 404 || response.status >= 500) return {kind: 'retry'};
        try { body = await response.json(); } catch (error) { if (signal?.aborted) throw error; }
      } catch {
        return {kind: 'retry'};
      }
      return mapResponse(response.status, body, {scope, key, epoch});
    }
  };
}

function mapResponse(status, body, {scope, key, epoch}) {
  // A 403 that is not the protocol's comes from a proxy, a firewall or an
  // expired session, which refuse the session as the provider's does: a
  // valid intent is not blocked because the session changed under it.
  if (status === 403) return {kind: 'scope-refused'};
  const echoed = !!body && typeof body === 'object' && !Array.isArray(body) && body.scope === scope && body.key === key;
  // A 409 names a key conflict only with the protocol's body; any other 409
  // applied nothing.
  if (status === 409) return echoed && body.status === 'key-conflict' ? {kind: 'key-conflict'} : {kind: 'retry'};
  if (![200, 412, 422].includes(status)) return {kind: 'retry'};
  if (!echoed) return {kind: 'mismatch'};
  const state = body.status;
  if (status === 412 && typeof body.epoch === 'string') return {kind: 'epoch', epoch: body.epoch};
  const decided = status === 200 ? ['applied', 'rejected', 'unavailable'] : status === 422 ? ['rejected'] : [];
  if (!decided.includes(state)) return {kind: 'retry'};
  if (body.epoch !== epoch) return {kind: 'mismatch'};
  if (state === 'applied') return {kind: state, epoch: body.epoch, result: body.result};
  if (state === 'rejected') return {kind: state, epoch: body.epoch, reason: body.reason};
  return {kind: state, epoch: body.epoch};
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
