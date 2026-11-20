import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {createWorkerProbe} from './fixtures/worker-client.mjs';
import {childSource, consumerSource} from './fixtures/recovery-cases.mjs';

test('a worker preserves source operations while its caller can process a timer', {timeout: 15000}, async t => {
  const root = path.resolve('tests', 'worker workspace');
  const child = path.join(root, 'Badge.eln'), consumer = path.join(root, 'Screen.eln');
  const worker = createWorkerProbe(root);
  t.after(() => worker.close());
  const direct = createSurfaceLanguageService({root});
  t.after(() => direct.dispose());
  await worker.ready;
  const invalid = consumerSource.replace('Badge la', 'Badge missing="Ready"');
  for (const [file, source] of [[child, childSource], [consumer, invalid]]) {
    await worker.call('open', file, source);
    direct.open(file, source);
  }
  const order = [];
  const tick = new Promise(resolve => setTimeout(() => { order.push('timer'); resolve(); }, 0));
  const response = worker.call('diagnostics', consumer).then(result => { order.push('diagnostics'); return result; });
  const [diagnostics] = await Promise.all([response, tick]);
  assert.deepEqual(order, ['timer', 'diagnostics']);
  assert.deepEqual(diagnostics, direct.diagnostics(consumer));
  assert.deepEqual(await worker.call('definitions', consumer, invalid.indexOf('Badge missing') + 2), direct.definitions(consumer, invalid.indexOf('Badge missing') + 2));
  await worker.call('open', consumer, consumerSource);
  direct.open(consumer, consumerSource);
  const cursor = consumerSource.indexOf('Badge la') + 8;
  assert.deepEqual(await worker.call('completions', consumer, cursor), direct.completions(consumer, cursor));
  const healthy = consumerSource.replace('Badge la', 'Badge label="Ready"');
  await worker.call('open', consumer, healthy);
  direct.open(consumer, healthy);
  const plan = await worker.call('rename', child, childSource.indexOf('label: string'), 'caption');
  assert.deepEqual(plan, direct.rename(child, childSource.indexOf('label: string'), 'caption'));
  await worker.call('open', consumer, healthy + '\n');
  assert.equal(await worker.call('isCurrent', plan), false);
  await assert.rejects(worker.call('applyRename', plan), /stale/i);
  await assert.rejects(worker.call('executeUserCode'), /unsupported/i);
});
