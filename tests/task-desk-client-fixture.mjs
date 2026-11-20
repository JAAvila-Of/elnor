import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createModulePlanner} from '../src/module-plan.mjs';
import {launchLocalProcess} from '../examples/persistent-task-desk/local-process.mjs';

const provider = fileURLToPath(new URL('../examples/persistent-task-desk/provider_fixture.py', import.meta.url));

export async function startDeskProvider(database, seed = false) {
  const run = launchLocalProcess(process.env.ELNOR_TEST_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'),
    ['-B', '-u', provider, '--db', database, '--faults', ...(seed ? ['--seed'] : [])], {label: 'Task desk provider'});
  const ready = await run.ready();
  return {...ready, child: run.child, url: 'http://127.0.0.1:' + ready.port, stop: run.stop};
}

export async function deskProviderFixture(t, command) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'elnor-task-provider-'));
  const database = path.join(dir, 'ledger.sqlite');
  let server;
  t.after(async () => {
    await server?.stop();
    assert.equal(path.dirname(dir), fs.realpathSync.native(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('elnor-task-provider-'));
    fs.rmSync(dir, {recursive: true, force: true});
  });
  server = await startDeskProvider(database, true);
  const url = () => server.url + '/scopes/alice/';
  return {
    dir,
    get server() { return server; },
    async restart() {
      await server.stop();
      server = await startDeskProvider(database);
    },
    get(key, epoch = server.epoch) {
      return fetch(url() + 'commands/' + key, {headers: {'X-Provider-Epoch': epoch}});
    },
    put(key, intent = command(), fault, epoch = server.epoch) {
      return fetch(url() + 'commands/' + key, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json', 'X-Provider-Epoch': epoch, ...(fault ? {'X-Fixture-Fault': fault} : {})},
        body: JSON.stringify(intent)
      });
    },
    async snapshot() {
      const response = await fetch(url() + 'tasks', {headers: {'X-Provider-Epoch': server.epoch}});
      return (await response.json()).tasks;
    }
  };
}

export async function loadDeskClient(outputDir) {
  const planner = createModulePlanner();
  const host = fileURLToPath(new URL('../examples/persistent-task-desk/serve.mjs', import.meta.url));
  const client = planner.include('./client.js', host);
  assert.deepEqual(client.errors, []);
  for (const [file, code] of planner.files()) {
    const output = path.join(outputDir, file);
    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.writeFileSync(output, code);
  }
  return import(pathToFileURL(path.join(outputDir, client.path)));
}
