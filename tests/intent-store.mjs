// An in-memory IntentStore for tests, standing in for the IndexedDB store that
// Node.js does not have. Stores created on the same map act as tabs of one
// profile: each committed write or removal notifies the subscribers of the
// other stores on that map, never the store that made it, as a BroadcastChannel
// would.
const tabs = new WeakMap();

export function memoryIntentStore(values = new Map()) {
  if (!tabs.has(values)) tabs.set(values, new Set());
  const peers = tabs.get(values), listeners = new Set();
  const changed = key => {
    for (const peer of peers) if (peer !== store) queueMicrotask(() => peer.emit(key));
  };
  const store = {
    values,
    // When set, writes and removals reject without storing; failNextWrite
    // resets itself after one rejection.
    failWrites: false,
    failNextWrite: false,
    async read(key) {
      await null;
      return values.has(key) ? values.get(key) : null;
    },
    async write(key, text) {
      await null;
      refuse();
      values.set(key, String(text));
      changed(key);
    },
    async remove(key) {
      await null;
      refuse();
      values.delete(key);
      changed(key);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    emit(key) {
      for (const listener of listeners) listener(key);
    }
  };
  function refuse() {
    if (store.failNextWrite) {
      store.failNextWrite = false;
      throw new Error('storage write failed');
    }
    if (store.failWrites) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  }
  peers.add(store);
  return store;
}

// The stored text of a key, read synchronously for assertions.
export function storedText(store, key) {
  return store.values.has(key) ? store.values.get(key) : null;
}
