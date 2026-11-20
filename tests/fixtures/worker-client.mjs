import {Worker} from 'node:worker_threads';

// Minimal client for the worker-boundary experiment, not used by VS Code.
export function createWorkerProbe(root) {
  const worker = new Worker(new URL('./service-worker.mjs', import.meta.url), {workerData: {root}});
  const pending = new Map();
  let sequence = 0, readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  function rejectPending(error) {
    readyReject(error);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }
  worker.on('message', message => {
    if (message.ready) { readyResolve(); return; }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(Error(message.error)); else request.resolve(message.result);
  });
  worker.on('error', rejectPending);
  worker.on('exit', () => rejectPending(Error('Probe worker exited')));
  return {
    ready,
    call(method, ...args) {
      const id = ++sequence;
      return new Promise((resolve, reject) => { pending.set(id, {resolve, reject}); worker.postMessage({id, method, args}); });
    },
    close: () => worker.terminate(),
  };
}
