import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {deskProviderFixture, startDeskProvider as start} from './task-desk-client-fixture.mjs';
const provider=fileURLToPath(new URL('../examples/persistent-task-desk/provider_fixture.py',import.meta.url));
const task={id:'TASK-1',title:'Edited task',assignee:'Ada',description:'One\nTwo',priority:'high',status:'in-progress'};
const command=(revision=1,title=task.title)=>({kind:'replace',taskId:task.id,expectedRevision:revision,task:{...task,title}});
const fixture = t => deskProviderFixture(t, command);
const create=(id='TASK-new')=>({kind:'create',task:{...task,id,status:'open'}}),remove=(id='TASK-new',revision=1)=>({kind:'delete',taskId:id,expectedRevision:revision});
async function all(f){return (await (await fetch(f.server.url+'/scopes/alice/tasks',{headers:{'X-Provider-Epoch':f.server.epoch}})).json());}
test('create replay and delete replay never recreate or renumber a task',async t=>{const f=await fixture(t),created=await (await f.put('create-one',create())).json();assert.equal(created.status,'applied');assert.equal(created.revision,1);const deleted=await (await f.put('delete-one',remove())).json();assert.equal(deleted.status,'applied');assert.equal(deleted.deleted,true);assert.equal(deleted.revision,2);await f.restart();assert.deepEqual(await (await f.put('create-one',create())).json(),created);assert.deepEqual(await (await f.put('delete-one',remove())).json(),deleted);const snapshot=await all(f);assert.ok(!snapshot.tasks.some(v=>v.id==='TASK-new'));assert.deepEqual(snapshot.tombstones,[{id:'TASK-new',revision:2}]);});
test('different create keys cannot reuse a live or deleted task identity',async t=>{const f=await fixture(t);const values=await Promise.all(['a','b'].map(key=>f.put(key,create()).then(r=>r.json())));assert.deepEqual(values.map(v=>v.status).sort(),['applied','conflict']);await f.put('delete',remove());assert.equal((await (await f.put('resurrect',create())).json()).status,'conflict');assert.equal((await f.snapshot()).length,2);});
test('delete requires current revision and stale edits cannot resurrect a tombstone',async t=>{const f=await fixture(t);await f.put('edit',command());assert.equal((await (await f.put('stale-delete',remove('TASK-1',1))).json()).status,'conflict');await f.put('delete',remove('TASK-1',2));assert.equal((await (await f.put('stale-edit',command(2))).json()).status,'missing');assert.equal((await (await f.put('again',remove('TASK-1',3))).json()).status,'missing');assert.equal((await all(f)).tombstones[0].revision,3);});
test('lost create and delete replies recover durable outcomes after restart',async t=>{const f=await fixture(t);await assert.rejects(f.put('create',create(),'after'));await f.restart();assert.equal((await (await f.get('create')).json()).status,'applied');await assert.rejects(f.put('delete',remove(),'after'));await f.restart();assert.equal((await (await f.get('delete')).json()).deleted,true);assert.equal((await all(f)).tombstones.length,1);});
test('before-commit create loss authorizes same-ID replay without duplicate task',async t=>{const f=await fixture(t);await assert.rejects(f.put('create',create(),'before'));assert.equal((await (await f.get('create')).json()).status,'absent');await f.put('create',create());await f.put('create',create());assert.equal((await f.snapshot()).filter(v=>v.id==='TASK-new').length,1);});
test('transaction rollback leaves neither a partial create nor a partial delete',async t=>{const f=await fixture(t);assert.equal((await f.put('create',create(),'rollback')).status,503);assert.equal((await (await f.get('create')).json()).status,'absent');assert.equal((await f.snapshot()).length,2);await f.put('create',create());assert.equal((await f.put('delete',remove(),'rollback')).status,503);assert.equal((await (await f.get('delete')).json()).status,'absent');assert.equal((await f.snapshot()).length,3);assert.deepEqual((await all(f)).tombstones,[]);});
test('malformed create/delete are refused; short-title create is retained rejection',async t=>{const f=await fixture(t);assert.equal((await f.put('bad-delete',{...remove(),expectedRevision:true})).status,400);assert.equal((await f.put('bad-create',{...create(),extra:1})).status,400);const bad=create();bad.task.title='x';assert.equal((await f.put('reject',bad)).status,422);assert.equal((await (await f.get('reject')).json()).status,'rejected');assert.equal((await f.snapshot()).length,2);});
test('legacy edit-only database migrates without changing epoch, tasks or old receipts',async t=>{const f=await fixture(t),db=path.join(f.dir,'legacy.sqlite'),intent=command();const script=`import sqlite3,json,sys
db=sqlite3.connect(sys.argv[1]);cmd=json.loads(sys.argv[2]);encode=lambda v:json.dumps(v,sort_keys=True,separators=(',',':'))
db.executescript('CREATE TABLE metadata(name TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE tasks(scope TEXT,id TEXT,revision INTEGER,payload TEXT,PRIMARY KEY(scope,id)); CREATE TABLE results(scope TEXT,key TEXT,intent TEXT,result TEXT,PRIMARY KEY(scope,key));')
db.execute('INSERT INTO metadata VALUES(?,?)',('epoch','legacy-epoch'));db.execute('INSERT INTO tasks VALUES(?,?,?,?)',('alice','TASK-1',2,encode(cmd['task'])))
result=dict(scope='alice',epoch='legacy-epoch',key='old-key',intent=cmd,status='applied',revision=2)
db.execute('INSERT INTO results VALUES(?,?,?,?)',('alice','old-key',encode(cmd),encode(result)))
rejected=dict(scope='alice',epoch='legacy-epoch',key='old-rejection',intent=cmd,status='rejected',reason='Legacy provider rule')
db.execute('INSERT INTO results VALUES(?,?,?,?)',('alice','old-rejection',encode(cmd),encode(rejected)));db.commit();db.close()
`;await promisify(execFile)(process.env.ELNOR_TEST_PYTHON??(process.platform==='win32'?'python':'python3'),['-B','-c',script,db,JSON.stringify(intent)],{windowsHide:true});
  const legacy = await start(db);
  try {
    assert.equal(legacy.epoch, 'legacy-epoch');
    const headers = {'X-Provider-Epoch': legacy.epoch, 'Content-Type': 'application/json'};
    const snapshot = await (await fetch(legacy.url + '/scopes/alice/tasks', {headers})).json();
    assert.equal(snapshot.tasks[0].revision, 2);
    assert.deepEqual(snapshot.tombstones, []);
    const commands = legacy.url + '/scopes/alice/commands/';
    const receipt = await (await fetch(commands + 'old-key', {headers})).json();
    assert.equal(receipt.revision, 2);
    const replay = await (await fetch(commands + 'old-key', {method: 'PUT', headers, body: JSON.stringify(intent)})).json();
    assert.deepEqual(replay, receipt);
    const rejection = await (await fetch(commands + 'old-rejection', {headers})).json();
    assert.equal(rejection.status, 'rejected');
    assert.equal(rejection.reason, 'Legacy provider rule');
    assert.equal(Object.hasOwn(rejection, 'issues'), false);
    const rejectedReplay = await fetch(commands + 'old-rejection', {method: 'PUT', headers, body: JSON.stringify(intent)});
    assert.equal(rejectedReplay.status, 422);
    assert.deepEqual(await rejectedReplay.json(), rejection);
    const deleted = await (await fetch(commands + 'delete', {method: 'PUT', headers, body: JSON.stringify(remove('TASK-1', 2))})).json();
    assert.equal(deleted.deleted, true);
  } finally {
    await legacy.stop();
  }
});

test('receipt maintenance previews read-only and applies one bounded batch across restart', async t => {
  const f = await fixture(t);
  const database = path.join(f.dir, 'ledger.sqlite');
  const epoch = f.server.epoch;
  assert.equal((await f.put('old-first', command())).status, 200);
  assert.equal((await f.put('old-second', command(2, 'Second edit'))).status, 200);
  assert.equal((await f.put('recent', command(3, 'Current task'))).status, 200);
  const executable = process.env.ELNOR_TEST_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  const run = args => promisify(execFile)(executable, ['-B', ...args], {windowsHide: true});
  await run(['-c', `
from contextlib import closing
import sqlite3, sys
with closing(sqlite3.connect(sys.argv[1])) as db, db:
    db.execute("UPDATE results SET recorded_at_ns=0 WHERE key='old-first'")
    db.execute("UPDATE results SET recorded_at_ns=1 WHERE key='old-second'")
`, database]);
  const cli = path.join(path.dirname(provider), 'maintain_receipts.py');
  const invoke = (limit, ...args) => run([cli, '--db', database, '--scope', 'alice', '--limit', String(limit), ...args]);
  const report = async (...args) => JSON.parse((await invoke(1, ...args)).stdout);
  const before = fs.readFileSync(database);
  const expectedPreview = {
    mode: 'preview', database: fs.realpathSync(database), scope: 'alice', epoch,
    eligible: 2, retired: 0, remainingEligible: 2, batchLimit: 1
  };
  assert.deepEqual(await report(), expectedPreview);
  await assert.rejects(invoke(1, '--apply'), {stderr: /requires the ledger epoch/});
  await assert.rejects(invoke(1, '--apply', '--epoch', 'wrong-epoch'), {stderr: /epoch mismatch/});
  await assert.rejects(invoke(1, '--app', '--epoch', epoch), {stderr: /unrecognized arguments/});
  await assert.rejects(invoke(101), {stderr: /from 1 to 100/});
  assert.deepEqual(fs.readFileSync(database), before);

  const editSchema = sql => run(['-c', `
from contextlib import closing
import sqlite3, sys
with closing(sqlite3.connect(sys.argv[1])) as db, db:
    db.execute(sys.argv[2])
`, database, sql]);
  await editSchema(`CREATE TRIGGER fail_second BEFORE UPDATE ON results
    WHEN OLD.key = 'old-second' BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
  await assert.rejects(invoke(2, '--apply', '--epoch', epoch), {stderr: /injected failure/});
  assert.deepEqual(await report(), expectedPreview);
  await editSchema('DROP TRIGGER fail_second');

  assert.deepEqual(await report('--apply', '--epoch', epoch), {
    mode: 'apply', database: fs.realpathSync(database), scope: 'alice', epoch,
    eligible: 2, retired: 1, remainingEligible: 1, batchLimit: 1
  });
  await f.restart();
  assert.equal(f.server.epoch, epoch);
  assert.equal((await f.get('old-first')).status, 410);
  assert.equal((await f.put('old-first', command())).status, 410);
  assert.equal((await f.put('old-first', command(4, 'Different replay'))).status, 410);
  assert.equal((await (await f.get('old-second')).json()).status, 'applied');
  assert.equal((await report('--apply', '--epoch', epoch)).remainingEligible, 0);
  assert.equal((await report('--apply', '--epoch', epoch)).retired, 0);
  assert.equal((await f.get('old-second')).status, 410);
  assert.equal((await (await f.get('recent')).json()).status, 'applied');
  assert.equal((await f.snapshot()).find(task => task.id === 'TASK-1').title, 'Current task');
});

test('receipt maintenance refuses missing and unmigrated databases without changing them', async t => {
  const f = await fixture(t);
  const cli = path.join(path.dirname(provider), 'maintain_receipts.py');
  const executable = process.env.ELNOR_TEST_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  const run = args => promisify(execFile)(executable, ['-B', ...args], {windowsHide: true});
  const database = path.join(f.dir, 'old ledger.sqlite');
  const invoke = (...args) => run([cli, '--db', database, '--scope', 'alice', ...args]);
  await assert.rejects(invoke(), {stderr: /Database file does not exist/});
  assert.equal(fs.existsSync(database), false);
  await run(['-c', `
from contextlib import closing
import sqlite3, sys
with closing(sqlite3.connect(sys.argv[1])) as db, db:
    db.execute('CREATE TABLE results(scope TEXT, key TEXT, intent TEXT, result TEXT)')
`, database]);
  const before = fs.readFileSync(database);
  await assert.rejects(invoke(), {stderr: /Start the current Task Desk provider to migrate/});
  await assert.rejects(invoke('--apply', '--epoch', f.server.epoch), {stderr: /migrate the ledger/});
  assert.deepEqual(fs.readFileSync(database), before);
});
