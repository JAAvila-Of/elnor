import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {buildSurfaceProject} from '../src/project-build.mjs';import {setupDOM,FakeNode,findInput,findButton,tick} from './fake-dom.mjs';
const task={id:'TASK-1',title:'First task',assignee:'Ada',description:'',priority:'normal',status:'open',revision:1},base={phase:'empty',message:'',tasks:[task],loaded:true};
async function fixture(t,overrides={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-task-surface-'));t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elnor-task-surface-'));fs.rmSync(dir,{recursive:true,force:true});});const output=path.join(dir,'build'),built=buildSurfaceProject(fileURLToPath(new URL('../examples/persistent-task-desk/App.eln',import.meta.url)),{outputDir:output,checkOutputDir:path.join(dir,'check')});const {mount}=await import(pathToFileURL(path.join(output,built.entryOutput)));setupDOM();const client={read:()=>base,refresh:async()=>base,save:async()=>base,recover:async()=>base,retry:async()=>base,acknowledge:()=>base,...overrides};const root=new FakeNode('root'),stop=mount(root,{client});t.after(stop);return {root,stop,choose:()=>findButton(root,'TASK-1 · First task').click(),async fill(text){const input=findInput(root,'Edit title');input.value=text;input.dispatch('input');await tick();},submit(){root.descendants('form')[0].listeners.submit[0]({preventDefault(){}});}};}
const attempt={key:'one',command:{kind:'replace',taskId:task.id,expectedRevision:1,task:{id:task.id,title:task.title,assignee:task.assignee,description:task.description,priority:task.priority,status:task.status}}};
test('persistent view compiles, loads explicitly and exposes the creation entry point',async t=>{let loads=0;const f=await fixture(t,{refresh:async()=>{loads++;return base;}});assert.equal(loads,0);findButton(f.root,'Refresh tasks').click();await tick();assert.equal(loads,1);assert.ok(findButton(f.root,'New task'));f.choose();await tick();assert.equal(findInput(f.root,'Edit title').value,'First task');});
test('pending save keeps editing open and later typing survives confirmation',async t=>{let resolve;const gate=new Promise(r=>resolve=r);const f=await fixture(t,{save:()=>gate});f.choose();await tick();await f.fill('First task');f.submit();await tick();assert.ok(findInput(f.root,'Edit title'));await f.fill('Later draft');resolve({...base,phase:'applied',attempt,submittedAttemptKey:attempt.key});await tick();findButton(f.root,'Finish attempt').click();await tick();assert.equal(findInput(f.root,'Edit title').value,'Later draft');});
test('conflict keeps draft and requires explicit adoption of current revision',async t=>{let expected;const f=await fixture(t,{save:async(_,r)=>{expected=r;return {...base,phase:'conflict',attempt};},refresh:async()=>({...base,tasks:[{...task,revision:2,title:'Remote task'}]})});f.choose();await tick();await f.fill('My draft');f.submit();await tick();assert.equal(expected,1);findButton(f.root,'Finish attempt').click();await tick();findButton(f.root,'Refresh tasks').click();await tick();findButton(f.root,'Use current revision').click();await tick();assert.equal(findInput(f.root,'Edit title').value,'My draft');f.submit();await tick();assert.equal(expected,2);});
test('restored journal opens attempted draft and blocks a new save',async t=>{const f=await fixture(t,{read:()=>({...base,phase:'unknown',attempt})});assert.equal(findInput(f.root,'Edit title').value,'First task');assert.equal(findButton(f.root,'Save changes').disabled,true);assert.equal(findButton(f.root,'Retry saved edit').disabled,true);});
test('retirement aborts active work without acknowledging or publishing late result',async t=>{let signal,resolve,ack=0;const gate=new Promise(r=>resolve=r);const f=await fixture(t,{refresh:s=>{signal=s;return gate;},acknowledge:()=>{ack++;return base;}});findButton(f.root,'Refresh tasks').click();f.stop();assert.equal(signal.aborted,true);resolve(base);await tick();assert.equal(ack,0);assert.equal(f.root.childNodes.length,0);});

test('finishing a peer attempt keeps an identical local draft open', async t => {
  let current = base;
  let publish;
  const f = await fixture(t, {
    read: () => current,
    observe(listener) {
      publish = listener;
      return () => { publish = undefined; };
    },
    async acknowledge(signal, key) {
      assert.equal(signal.aborted, false);
      assert.equal(key, attempt.key);
      current = base;
      return current;
    }
  });
  f.choose();
  await tick();
  current = {...base, phase: 'applied', attempt};
  publish(current);
  await tick();
  findButton(f.root, 'Finish attempt').click();
  await tick();
  assert.equal(findInput(f.root, 'Edit title').value, task.title);
  assert.equal(findButton(f.root, 'Save changes').disabled, false);
  f.stop();
  assert.equal(publish, undefined);
});

test('receipt review shows a deleted target and refreshing closes discard confirmation', async t => {
  const attempt = {key: 'delete-key', command: {kind: 'delete', taskId: task.id, expectedRevision: 1}};
  const blocked = {...base, phase: 'blocked', attempt, receiptReview: 'needs-refresh'};
  const tombstones = [{id: task.id, revision: 2}];
  const f = await fixture(t, {
    read: () => blocked,
    refresh: async () => ({...blocked, tasks: [], tombstones, receiptReview: 'ready'})
  });
  assert.equal(findButton(f.root, 'Discard saved attempt'), undefined);
  findButton(f.root, 'Refresh tasks').click();
  await tick();
  assert.match(f.root.textContent, /The task is deleted at revision 2/);
  findButton(f.root, 'Discard saved attempt').click();
  await tick();
  assert.ok(findButton(f.root, 'Confirm discard'));
  findButton(f.root, 'Refresh tasks').click();
  await tick();
  assert.equal(findButton(f.root, 'Confirm discard'), undefined);
  assert.match(f.root.textContent, /The task is deleted at revision 2/);
});
