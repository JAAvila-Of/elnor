// The caller stores text and versions; TS and Surface parsing stay in a worker.
// Logical cancellation drops a result, but cannot preempt synchronous TS work.
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {sourceKey} from './source-identity.mjs';
import {createDocumentStore} from './document-store.mjs';
import {describeTypeScriptConfiguration} from './typescript-configuration.mjs';

function failure(name, message) { return Object.assign(new Error(message), {name}); }
const queryMethods = new Set(['diagnostics', 'definitions', 'completions', 'rename', 'format']);
export function isDiscardedResponse(error) {
  return ['StaleResponseError', 'CancelledError', 'WorkerRestartedError', 'DisposedError'].includes(error?.name);
}

export function createAsyncLanguageService({root = process.cwd(), workerFactory} = {}) {
  root = path.resolve(root);
  const store=createDocumentStore(root),documents=store.documents,pending=new Map(),listeners=new Set();
  const key=file=>sourceKey(path.resolve(root,file));
  let epoch = 0, generation = 0, sequence = 0, active = null, disposed = false;
  const emit = event => { for (const listener of listeners) { try { listener(event); } catch { /* An observer cannot break protocol state. */ } } };
  function settle(id, error, value) {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id); request.cleanup();
    if (error) request.reject(error); else request.resolve(value);
  }
  function current(snapshot) {
    try{store.assertCurrent();}catch{return false;}
    return !disposed && active !== null && snapshot.epoch === epoch && snapshot.generation === generation;
  }
  function invalidate(name, message) {
    for (const [id, request] of pending) {
      if (request.sent && active) active.worker.postMessage({type: 'cancel', id});
      emit({type: name === 'StaleResponseError' ? 'stale' : 'cancelled', id, method: request.method, snapshot: request.snapshot});
      settle(id, failure(name, message));
    }
  }
  function replay(slot) {
    try {
      store.assertCurrent();
      slot.worker.postMessage({type: 'reset', generation: slot.generation, epoch,
        documents: store.snapshots()});
    } catch (error) {
      lost(slot, error);
      void slot.worker.terminate();
    }
  }
  function lost(slot, error) {
    if (active !== slot) return;
    active = null; slot.reject(error);
    for (const [id, request] of pending) if (request.snapshot.generation === slot.generation) settle(id, error);
    emit({type: 'failure', generation: slot.generation, message: error.message});
  }
  function ensureWorker() {
    if (disposed) throw failure('DisposedError', 'Language client is disposed');
    store.assertCurrent();
    if (active) return active;
    const worker = workerFactory ? workerFactory() : new Worker(new URL('./language-worker.mjs', import.meta.url), {workerData: {root}});
    const slot = {worker, generation: ++generation, ready: false};
    slot.promise = new Promise((resolve, reject) => { slot.resolve = resolve; slot.reject = reject; });
    active = slot;
    worker.on('message', message => {
      if (active !== slot || disposed) return;
      if (message.type === 'ready') replay(slot);
      else if (message.type === 'replayed') {
        if (message.epoch !== epoch) { replay(slot); return; }
        slot.ready = true; slot.resolve(); emit({type: 'ready', generation, epoch});
      } else if (message.type === 'fatal') {
        lost(slot, failure('WorkerExitedError', message.error));
        void worker.terminate();
      } else if (message.type === 'result') {
        const request = pending.get(message.id);
        if (!request) return;
        if (!current(request.snapshot) || message.epoch !== request.snapshot.epoch || message.generation !== request.snapshot.generation) {
          emit({type: 'stale', id: message.id, method: request.method, snapshot: request.snapshot});
          settle(message.id, failure('StaleResponseError', 'Workspace changed during analysis'));
        } else if (message.error) settle(message.id, failure(message.error.name, message.error.message));
        else if (request.method === 'rename' && message.value.edits.some(edit => !documents.has(key(edit.file)))) {
          settle(message.id, Error('Rename touches a file outside the versioned editor workspace'));
        } else settle(message.id, null, {value: message.value, snapshot: request.snapshot});
      }
    });
    worker.on('error', error => lost(slot, failure('WorkerExitedError', error.message)));
    worker.on('exit', code => lost(slot, failure('WorkerExitedError', `Language worker exited (${code})`)));
    return slot;
  }
  function open(file, source) {
    if (disposed) throw failure('DisposedError', 'Language client is disposed');
    file = path.resolve(root, file);
    if (typeof source !== 'string' || (!file.endsWith('.eln') && !/\.[cm]?tsx?$/.test(file))) throw Error('Expected a Surface or TypeScript document');
    if (store.get(file)?.source === source&&store.isAcknowledged(file)) return;
    store.open(file,source);epoch++;
    invalidate('StaleResponseError', 'Workspace changed during analysis');
    if (active?.ready) active.worker.postMessage({type: 'open', file, source, epoch});
  }
  function close(file) {
    if (disposed) throw failure('DisposedError', 'Language client is disposed');
    file = path.resolve(root, file);
    store.close(file);epoch++;
    invalidate('StaleResponseError', 'Workspace changed during analysis');
    if (active?.ready) active.worker.postMessage({type: 'close', file, epoch});
  }
  function invalidateDisk(file) {
    if (disposed) throw failure('DisposedError', 'Language client is disposed');
    if (typeof file !== 'string' || !/\.(?:ts|tsx|mts|cts)$/.test(file)) throw Error('Expected a TypeScript disk path');
    file = path.resolve(root, file); epoch++;
    invalidate('StaleResponseError', 'Disk dependencies changed during analysis');
    if (active?.ready) active.worker.postMessage({type: 'disk', file, epoch});
    emit({type: 'disk', file, epoch});
  }
  function query(method, args, {signal} = {}) {
    if (disposed) return Promise.reject(failure('DisposedError', 'Language client is disposed'));
    if (!queryMethods.has(method)) return Promise.reject(Error('Unsupported language query'));
    try{
      store.assertCurrent({synchronized:method==='rename'||method==='format',operation:method==='format'?'formatting':'rename'});
      if(method==='format'&&(typeof args?.[0]!=='string'||!args[0].endsWith('.eln')||!store.isAcknowledged(args[0])))
        throw Error('Formatting requires an explicitly opened Surface document');
    }catch(error){return Promise.reject(error);}
    if (signal?.aborted) return Promise.reject(failure('CancelledError', 'Language query cancelled'));
    const slot = ensureWorker();
    const snapshot = Object.freeze({epoch, generation: slot.generation});
    const id = ++sequence;
    const result = new Promise((resolve, reject) => {
      const cancel = () => {
        if (!pending.has(id)) return;
        if (active === slot) slot.worker.postMessage({type: 'cancel', id});
        emit({type: 'cancelled', id, method, snapshot});
        settle(id, failure('CancelledError', 'Language query cancelled'));
      };
      pending.set(id, {resolve, reject, snapshot, method, sent: false, cleanup: () => signal?.removeEventListener('abort', cancel)});
      signal?.addEventListener('abort', cancel, {once: true});
    });
    emit({type: 'requested', id, method, snapshot});
    slot.promise.then(() => {
      const request = pending.get(id);
      if (!request) return;
      if (!current(snapshot)) { settle(id, failure('StaleResponseError', 'Workspace changed before dispatch')); return; }
      request.sent = true;
      slot.worker.postMessage({type: 'query', id, method, args, ...snapshot});
      emit({type: 'dispatched', id, method, snapshot});
    }, error => settle(id, error));
    return result;
  }
  async function restart() {
    if (disposed) throw failure('DisposedError', 'Language client is disposed');
    store.assertCurrent();
    const previous = active;
    invalidate('WorkerRestartedError', 'Language worker restarted');
    active = null;
    if (previous) { previous.reject(failure('WorkerRestartedError', 'Language worker restarted')); await previous.worker.terminate(); }
    await ensureWorker().promise;
  }
  async function dispose() {
    if (disposed) return;
    disposed = true;
    invalidate('DisposedError', 'Language client is disposed');
    const previous = active; active = null;
    store.clear();
    if (previous) { previous.reject(failure('DisposedError', 'Language client is disposed')); await previous.worker.terminate(); }
    listeners.clear();
  }
  return {open, close, invalidateDisk, query, restart, dispose, isCurrent: current,
    configuration:describeTypeScriptConfiguration,
    text: file => store.get(file)?.source,
    ready: () => { try { return ensureWorker().promise; } catch (error) { return Promise.reject(error); } },
    status: () => ({epoch, generation, pending: pending.size, alive: active !== null, ready: active?.ready ?? false}),
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
