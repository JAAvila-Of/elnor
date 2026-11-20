import {parentPort, workerData} from 'node:worker_threads';
import {startLanguageWorker} from './language-worker-server.mjs';

await startLanguageWorker({port: parentPort, root: workerData.root});
