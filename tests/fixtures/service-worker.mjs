// Test/probe fixture only. This is not an editor transport or production API.
import {parentPort, workerData} from 'node:worker_threads';
import {createSurfaceLanguageService} from '../../src/language-service.mjs';

const service = createSurfaceLanguageService({root: workerData.root});
const allowed = new Set(['open', 'text', 'diagnostics', 'definitions', 'completions', 'rename', 'isCurrent', 'applyRename']);
parentPort.on('message', ({id, method, args}) => {
  try {
    if (!allowed.has(method)) throw Error('Unsupported probe method');
    parentPort.postMessage({id, result: service[method](...args)});
  } catch (error) { parentPort.postMessage({id, error: error.message}); }
});
parentPort.postMessage({ready: true});
