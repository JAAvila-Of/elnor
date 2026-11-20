// Deterministically hold real service work in flight, only in Node tests.
import {parentPort, workerData} from 'node:worker_threads';
import {startLanguageWorker} from '../../src/language-worker-server.mjs';

const gate = new Int32Array(workerData.gate);
await startLanguageWorker({port: parentPort, root: workerData.root, beforeQuery() {
  if (Atomics.compareExchange(gate, 0, 1, 2) === 1) {
    Atomics.notify(gate, 0);
    if (Atomics.wait(gate, 1, 0, 8000) === 'timed-out') throw Error('Test gate was not released');
  }
}});
