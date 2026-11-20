// A fresh-process observation, not a production performance benchmark.
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {childSource, consumerSource, recoveryCases} from '../tests/fixtures/recovery-cases.mjs';
import {createWorkerProbe} from '../tests/fixtures/worker-client.mjs';

const moduleStart = performance.now();
const {createSurfaceLanguageService} = await import('../src/language-service.mjs');
const moduleLoadMs = performance.now() - moduleStart;
const root = path.resolve('tests', 'recovery workspace');
const child = path.join(root, 'Badge.eln'), consumer = path.join(root, 'Screen.eln');
const serviceStart = performance.now();
const service = createSurfaceLanguageService({root});
const createMs = performance.now() - serviceStart;
try {
  const queued = performance.now();
  const tick = new Promise(resolve => setTimeout(() => resolve(performance.now() - queued), 0));
  const start = performance.now();
  service.open(child, childSource);
  service.open(consumer, consumerSource.replace('Badge la', 'Badge label="Ready"'));
  service.diagnostics(consumer);
  const initialAnalysisMs = performance.now() - start;
  const initialTimerDelayMs = await tick;
  const results = [];
  for (const scenario of recoveryCases) {
    const caller = scenario.role === 'consumer' ? scenario.source : consumerSource;
    const began = performance.now();
    service.open(child, scenario.role === 'consumer' ? childSource : scenario.source);
    service.open(consumer, caller);
    const diagnostics = service.diagnostics(scenario.role === 'consumer' ? consumer : child);
    const definition = service.definitions(consumer, caller.indexOf('Badge l') + 2).some(d => d.file === child);
    const props = service.completions(consumer, caller.lastIndexOf('Badge la') + 'Badge la'.length).map(c => c.name);
    results.push({name: scenario.name, expected: scenario.expected, definition, propCompletion: props.includes('label'),
      diagnosticCount: diagnostics.length, elapsedMs: Math.round(performance.now() - began)});
  }
  const workerStart = performance.now();
  let workerReady = false;
  const startupTick = new Promise(resolve => setTimeout(() => resolve({delayMs: Math.round(performance.now() - workerStart), beforeReady: !workerReady}), 0));
  const worker = createWorkerProbe(root);
  let workerObservation;
  try {
    await worker.ready;
    workerReady = true;
    const startupMs = Math.round(performance.now() - workerStart);
    await worker.call('open', child, childSource);
    await worker.call('open', consumer, consumerSource.replace('Badge la', 'Badge label="Ready"'));
    let finished = false;
    const began = performance.now();
    const timer = new Promise(resolve => setTimeout(() => resolve({delayMs: Math.round(performance.now() - began), beforeResponse: !finished}), 0));
    const response = await worker.call('diagnostics', consumer);
    finished = true;
    const analysisMs = Math.round(performance.now() - began);
    workerObservation = {startupMs, startupTimer: await startupTick, analysisMs, analysisTimer: await timer, diagnosticCount: response.length};
  } finally { await worker.close(); }
  console.log(JSON.stringify({environment: {node: process.version, platform: process.platform},
    startup: {moduleLoadMs: Math.round(moduleLoadMs), createMs: Math.round(createMs), initialAnalysisMs: Math.round(initialAnalysisMs), initialTimerDelayMs: Math.round(initialTimerDelayMs)},
    cases: results, worker: workerObservation, limitations: ['The worker is a test fixture, not integrated into VS Code.', 'Timers observe the calling Node thread, not VS Code UI latency.', 'No latency thresholds or production benchmark claims.']}, null, 2));
} finally { service.dispose(); }
