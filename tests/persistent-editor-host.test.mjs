import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import host from '../editors/vscode/tests/persistent-host.cjs';
import contract from '../editors/vscode/tests/report-contract.cjs';

const runId='f127ab43-51f4-4308-a50d-917b334e7a78';
const env={ELNOR_EDITOR_MODE:'persistent',ELNOR_EDITOR_RUN_ID:runId,
  ELNOR_EDITOR_REPORT:path.join(host.runs,'run-unit','result.json')};
const context={mode:2,developmentMode:2,workspace:host.expectedWorkspace,env};

test('persistent harness requires its explicit mode and the isolated development workspace',()=>{
  assert.equal(host.persistentSession({...context,env:{}}),null);
  assert.equal(host.persistentSession(context).runId,runId);
  for(const override of [{mode:1},{mode:3},{developmentMode:undefined},{workspace:path.dirname(host.expectedWorkspace)}])
    assert.throws(()=>host.persistentSession({...context,...override}),/isolated fixture workspace/);
});
test('persistent harness refuses external reports and missing run identities',()=>{
  for(const override of [{ELNOR_EDITOR_RUN_ID:''},{ELNOR_EDITOR_REPORT:path.join(os.tmpdir(),'result.json')},
    {ELNOR_EDITOR_REPORT:path.join(host.runs,'run-unit','wrong.json')},{ELNOR_EDITOR_REPORT:path.join(host.runs,'wrong','result.json')}])
    assert.throws(()=>host.persistentSession({...context,env:{...env,...override}}),/isolated report path/);
});

function fixture(t,{trusted=true,enabled=true}={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-persistent-host-')),commands=[];
  t.after(()=>{
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(directory).startsWith('elnor-persistent-host-'));
    fs.rmSync(directory,{recursive:true,force:true});
  });
  const session={directory,runId,workspace:host.expectedWorkspace};
  const vscode={workspace:{isTrusted:trusted,getConfiguration:()=>({get:()=>enabled})},
    commands:{executeCommand:async command=>commands.push(command)}};
  return {session,vscode,commands,read:()=>JSON.parse(fs.readFileSync(path.join(directory,'host.json'),'utf8'))};
}
test('persistent host runs once, records enabled trust and quits its isolated application',async t=>{
  const f=fixture(t);let runs=0;
  await host.runPersistentSuite({...f,run:async()=>{runs++;assert.equal(f.read().completed,false);}});
  assert.equal(runs,1);assert.equal(f.read().completed,true);assert.equal(f.read().trustEnabled,true);
  assert.deepEqual(f.commands,['workbench.action.quit']);
  await assert.rejects(host.runPersistentSuite({...f,run:async()=>{runs++;}}),{code:'EEXIST'});assert.equal(runs,1);
});
test('persistent host refuses absent trust and disabled trust without running a test',async t=>{
  for(const options of [{trusted:false},{enabled:false}]){
    const f=fixture(t,options);let ran=false;await host.runPersistentSuite({...f,run:async()=>{ran=true;}});
    assert.equal(ran,false);assert.equal(f.read().completed,false);assert.match(f.read().error,/granted trust/);
    assert.deepEqual(f.commands,['workbench.action.quit']);
  }
});
test('persistent host records suite failures and still requests application exit',async t=>{
  const f=fixture(t);await host.runPersistentSuite({...f,run:async()=>{throw Error('controlled failure');}});
  assert.equal(f.read().completed,false);assert.match(f.read().error,/controlled failure/);assert.equal(f.read().runId,runId);
  assert.deepEqual(f.commands,['workbench.action.quit']);
});
test('a persistent launcher cannot accept a historical extension-test launch mode',()=>{
  assert.throws(()=>contract.validateEditorReport({suite:contract.suite,runId,launchMode:'extension-tests'},
    {runId,exitCode:0,launchMode:'persistent'}),/wrong launch mode/);
});

test('a fresh persistent profile waits for an actual trust event before continuing',async()=>{
  let grant,disposed=false,continued=false;const subscriptions=[];
  const vscode={workspace:{isTrusted:false,onDidGrantWorkspaceTrust(callback){grant=callback;return {dispose(){disposed=true;}};}}};
  const pending=host.waitForWorkspaceTrust(vscode,subscriptions).then(()=>{continued=true;});
  await Promise.resolve();assert.equal(continued,false);assert.equal(subscriptions.length,1);
  vscode.workspace.isTrusted=true;grant();await pending;assert.equal(continued,true);assert.equal(disposed,true);
  await host.waitForWorkspaceTrust(vscode,subscriptions);assert.equal(subscriptions.length,1);
});
