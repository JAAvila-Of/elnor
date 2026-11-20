import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFile} from 'node:child_process';import {fileURLToPath} from 'node:url';import {promisify} from 'node:util';
import {parsePilotArgs,startPilot} from '../examples/persistent-task-desk/serve.mjs';
const cli=fileURLToPath(new URL('../examples/persistent-task-desk/serve.mjs',import.meta.url));
function directory(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-task-origin-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elnor-task-origin-'));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
async function occupied(){const server=http.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));return {server,port:server.address().port,close:()=>new Promise(r=>server.close(r))};}
import {launchLocalProcess} from '../examples/persistent-task-desk/local-process.mjs';
function child(args) {
 const run = launchLocalProcess(process.execPath, [cli, ...args], {label: 'Task desk CLI', startupTimeout: 30000});
 return {
  process: run.child, done: run.done, ready: run.ready,
  async stop(split=false) {
   if (run.child.exitCode !== null || run.child.signalCode !== null) return;
   if (!split) return run.stop();
   run.child.stdin.write('st');
   await new Promise(resolve => setTimeout(resolve, 15));
   await run.stop('op\n');
  },
  get error() { return run.error; }
 };
}
test('CLI defaults to a stable port and preserves literal database paths',()=>{assert.deepEqual(parsePilotArgs(['--db','task desk.sqlite']),{database:'task desk.sqlite',seed:false,port:4337});assert.deepEqual(parsePilotArgs(['--port','0','--seed','--db','x']),{database:'x',seed:true,port:0});});
test('CLI rejects ambiguous options and invalid ports before starting work',()=>{for(const args of [[],['--db'],['--db','--seed'],['--db','x','--unknown'],['--db','x','--seed','--seed'],['--db','x','--db','y'],['--db','x','--port','4337','--port','4338'],...['-1','65536','1.2','NaN','','1e3'].map(p=>['--db','x','--port',p])])assert.throws(()=>parsePilotArgs(args));});
test('occupied requested port refuses startup before creating or seeding the database',async t=>{const dir=directory(t),held=await occupied();t.after(held.close);const db=path.join(dir,'uncreated.sqlite');await assert.rejects(startPilot({database:db,seed:true,port:held.port}),{code:'EADDRINUSE'});assert.equal(fs.existsSync(db),false);});
test('programmatic invalid port is refused before creating the database',async t=>{const dir=directory(t),db=path.join(dir,'invalid.sqlite');for(const port of [-1,65536,NaN,1.5,'4337'])await assert.rejects(startPilot({database:db,seed:true,port}));assert.equal(fs.existsSync(db),false);});

test('HTTP validation reports shared field paths and keeps the original durable rejection',async t=>{
  const pilot=await startPilot({database:path.join(directory(t),'schema.sqlite'),seed:true});
  try{
    const commands=pilot.url+'/api/scopes/alice/commands/';
    const headers={'Content-Type':'application/json','X-Provider-Epoch':pilot.identity.epoch};
    const task={id:'TASK-schema',title:'Open task',assignee:'',description:'',priority:'normal',status:'open'};
    const put=(key,fields)=>fetch(commands+key,{method:'PUT',headers,body:JSON.stringify({kind:'create',task:{...task,...fields}})});
    const malformed=await put('bad-fields',{title:'😀'.repeat(100)+'x',assignee:'a'.repeat(121),priority:'urgent'});
    assert.equal(malformed.status,400);
    assert.deepEqual(await malformed.json(),{error:'Invalid request',issues:[
      {path:['task','title'],message:'Title must have at most 200 characters.'},
      {path:['task','assignee'],message:'Assignee must have at most 120 characters.'},
      {path:['task','priority'],message:'Priority must be normal or high.'},
    ]});
    assert.equal((await (await fetch(commands+'bad-fields',{headers})).json()).status,'absent');

    const rejection=await put('short-title',{title:'  x  '});
    assert.equal(rejection.status,422);
    const receipt=await rejection.json();
    assert.equal(receipt.status,'rejected');
    assert.equal(receipt.intent.task.title,'  x  ');
    assert.deepEqual(receipt.issues,[{path:['title'],message:'Use at least 3 characters for the title.'}]);
    assert.deepEqual(await (await fetch(commands+'short-title',{headers})).json(),receipt);
    assert.deepEqual(await (await put('short-title',{title:'  x  '})).json(),receipt);

    const title='😀'.repeat(100);
    const bytes=Buffer.from(JSON.stringify({kind:'create',task:{...task,title}}));
    const split=bytes.indexOf(Buffer.from('😀'))+1;
    const accepted=await new Promise((resolve,reject)=>{
      const request=http.request(commands+'split-utf8',{method:'PUT',headers:{...headers,'Content-Length':bytes.length}},response=>{
        const chunks=[];
        response.on('data',chunk=>chunks.push(chunk));
        response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))}));
        response.on('error',reject);
      });
      request.on('error',reject);
      request.write(bytes.subarray(0,split),()=>setTimeout(()=>request.end(bytes.subarray(split)),25));
    });
    assert.equal(accepted.status,200);
    assert.equal(accepted.body.intent.task.title,title);
  }finally{await pilot.close();}
});
test('CLI invalid arguments do not create a database',async t=>{const dir=directory(t),db=path.join(dir,'invalid-cli.sqlite'),run=await child(['--db',db,'--port','65536']);await run.done;assert.notEqual(run.process.exitCode,0);assert.equal(fs.existsSync(db),false);});
test('CLI fixed-port host restarts on the same origin and history, with split stop input',async t=>{const dir=directory(t),db=path.join(dir,'tasks.sqlite'),probe=await occupied(),port=probe.port;await probe.close();const first=await child(['--db',db,'--seed','--port',String(port)]);t.after(()=>first.stop());const ready=await first.ready();assert.equal(ready.url,'http://127.0.0.1:'+port);const response=await fetch(ready.url);assert.ok(response.headers.get('content-security-policy').includes("connect-src 'self'"));await first.stop(true);const second=await child(['--db',db,'--port',String(port)]);t.after(()=>second.stop());const reopened=await second.ready();assert.equal(reopened.url,ready.url);assert.deepEqual(reopened.identity,ready.identity);const snapshot=await (await fetch(reopened.url+'/api/scopes/alice/tasks',{headers:{'X-Provider-Epoch':reopened.identity.epoch}})).json();assert.equal(snapshot.tasks.length,2);await second.stop();});

test('receipt scheduling rejects invalid intervals before creating a database', async t => {
  const database = path.join(directory(t), 'uncreated.sqlite');
  assert.equal(parsePilotArgs(['--db', database, '--receipt-maintenance-seconds', '1']).receiptIntervalSeconds, 1);
  for (const text of ['0', '-1', '1.5', '1e3', '2147484']) {
    assert.throws(() => parsePilotArgs(['--db', database, '--receipt-maintenance-seconds', text]), /maintenance interval/);
  }
  await assert.rejects(startPilot({database, receiptIntervalSeconds: 0}), /maintenance interval/);
  assert.equal(fs.existsSync(database), false);
});

test('the host starts scheduled batches only when enabled and forwards their reports', async t => {
  const database = path.join(directory(t), 'scheduled.sqlite');
  const python = process.env.ELNOR_TEST_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  const runPython = script => promisify(execFile)(python, ['-B', '-c', script, database],
    {cwd: path.dirname(cli), windowsHide: true});
  await runPython(`
from contextlib import closing
from ledger import Ledger
import sys
ledger = Ledger(sys.argv[1], clock=lambda: 0)
command = dict(kind='delete', taskId='missing', expectedRevision=1)
assert ledger.apply('alice', ledger.epoch, 'aged', command)['status'] == 'missing'
with closing(ledger.connect()) as db:
    db.execute("""CREATE TRIGGER fail_batch BEFORE UPDATE ON results
        BEGIN SELECT RAISE(ABORT, 'injected failure'); END""")
`);
  const args = ['--db', database, '--port', '0'];
  const check = ({url, identity}) => fetch(url + '/api/scopes/alice/commands/aged', {
    headers: {'X-Provider-Epoch': identity.epoch}
  });
  const manual = await child(args);
  t.after(() => manual.stop());
  const initial = await manual.ready();
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await check(initial)).status, 200);
  assert.equal(manual.error, '');
  await manual.stop();

  const scheduled = await child([...args, '--receipt-maintenance-seconds', '1']);
  t.after(() => scheduled.stop());
  const ready = await scheduled.ready();
  assert.deepEqual(ready.identity, initial.identity);
  async function waitForReport(status) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const lines = scheduled.error.split('\n').slice(0, -1);
      const found = lines.map(line => JSON.parse(line)).find(report => report.status === status);
      if (found) return found;
      assert.equal(scheduled.process.exitCode, null);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail(`Timed out waiting for a ${status} maintenance report`);
  }
  await waitForReport('waiting-for-clock');
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await check(ready)).status, 200);
  scheduled.process.stdin.write('receipt-clock invalid\n');
  await waitForReport('clock-rejected');
  const utc = new Date().toISOString().split('.')[0] + 'Z';
  scheduled.process.stdin.write(`receipt-clock ${utc}\n`);
  assert.equal((await waitForReport('clock-confirmed')).utc, utc);
  assert.deepEqual(await waitForReport('failed'), {
    event: 'receipt-maintenance', scope: 'alice', epoch: ready.identity.epoch,
    status: 'failed', error: 'injected failure'
  });
  assert.equal((await check(ready)).status, 200);
  await runPython(`
from contextlib import closing
import sqlite3, sys
with closing(sqlite3.connect(sys.argv[1])) as db, db:
    db.execute('DROP TRIGGER fail_batch')
`);
  assert.deepEqual(await waitForReport('completed'), {
    event: 'receipt-maintenance', scope: 'alice', epoch: ready.identity.epoch,
    status: 'completed', retired: 1, hasMoreEligible: false, batchLimit: 100
  });
  assert.equal((await check(ready)).status, 410);
  await scheduled.stop();
});
