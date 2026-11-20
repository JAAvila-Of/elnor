import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {launchLocalProcess} from '../examples/persistent-task-desk/local-process.mjs';

test('startup timeout reports stderr and reaps an unresponsive child', {timeout: 10000}, async () => {
  const run = launchLocalProcess(process.execPath, ['-e', 'console.error("starting"); setInterval(() => {}, 1000)'],
    {label: 'Test provider', startupTimeout: 40, stopTimeout: 1000});
  await once(run.child.stderr, 'data');
  await assert.rejects(run.ready(), /Test provider: startup timed out after 40 ms\nstarting/);
  assert.ok((await run.done).signal);
});

test('malformed readiness stops the child gracefully and retains the parse failure', {timeout: 10000}, async () => {
  const run = launchLocalProcess(process.execPath, ['-e',
    'console.error("fixture diagnostic"); console.log("bad JSON"); process.stdin.resume()'],
  {label: 'Test provider'});
  await assert.rejects(run.ready(), error => error.cause instanceof SyntaxError && /fixture diagnostic/.test(error.message));
  assert.deepEqual(await run.done, {code: 0, signal: null});
});
