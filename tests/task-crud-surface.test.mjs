import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {buildSurfaceProject} from '../src/project-build.mjs';import {setupDOM,FakeNode,findInput,findButton,tick} from './fake-dom.mjs';
import {createAsyncLanguageService} from '../src/async-language-service.mjs';
import {applyFormatEdits} from '../src/formatter.mjs';
const task={id:'TASK-1',title:'First task',assignee:'Ada',description:'',priority:'normal',status:'open',revision:1},base={phase:'empty',message:'',tasks:[task],loaded:true};
function workspace(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-task-surface-'));
  t.after(()=>{
    assert.equal(path.dirname(dir),os.tmpdir());
    assert.ok(path.basename(dir).startsWith('elnor-task-surface-'));
    fs.rmSync(dir,{recursive:true,force:true});
  });
  return dir;
}

async function fixture(t,overrides={},built) {
  if (!built) {
    const dir=workspace(t);
    built=buildSurfaceProject(fileURLToPath(new URL('../examples/persistent-task-desk/App.eln',import.meta.url)),{
      outputDir:path.join(dir,'build'),checkOutputDir:path.join(dir,'check')
    });
  }
  const {mount}=await import(pathToFileURL(path.join(built.output,built.entryOutput)));
  setupDOM();
  const client={read:()=>base,refresh:async()=>base,save:async()=>base,recover:async()=>base,retry:async()=>base,acknowledge:()=>base,...overrides};
  const root=new FakeNode('root'),stop=mount(root,{client});
  t.after(stop);
  return {
    root,stop,choose:()=>findButton(root,'TASK-1 · First task').click(),
    async fill(text) {
      const input=findInput(root,'Edit title');
      input.value=text;
      input.dispatch('input');
      await tick();
    },
    submit() { root.descendants('form')[0].listeners.submit[0]({preventDefault(){}}); }
  };
}
const attempt={key:'one',command:{kind:'replace',taskId:task.id,expectedRevision:1,task:{id:task.id,title:task.title,assignee:task.assignee,description:task.description,priority:task.priority,status:task.status}}};

test('Task desk formats, diagnoses and repairs its deletion guard before running the recovered build',async t=>{
  const root=workspace(t);
  const files=[
    'examples/persistent-task-desk/App.eln','examples/persistent-task-desk/client.ts',
    'examples/task-desk/TaskList.eln','examples/task-desk/types.ts',
    'examples/task-desk/task-draft-form.ts','examples/task-desk/task-input-schema.ts','src/form-schema.ts'
  ];
  for(const file of files){
    const target=path.join(root,file);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(new URL('../'+file,import.meta.url),target);
  }
  fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}\n');
  const entry=path.join(root,files[0]);
  const build=()=>buildSurfaceProject(entry,{outputDir:path.join(root,'build'),checkOutputDir:path.join(root,'check')});
  const baseline=build();
  const manifest=fs.readFileSync(baseline.manifest,'utf8');
  const formatted=fs.readFileSync(entry,'utf8');
  const guard=formatted.match(/guard \(\r?\n +kind === "delete"\r?\n +&&[^\r\n]+\r?\n +\)/)?.[0];
  assert.ok(guard);
  const compact=formatted.replace(guard,guard.replace(/\r?\n +(?=\))/g,'').replace(/\r?\n +/g,' ').replace('( ','('));
  const editor=createAsyncLanguageService({root});
  t.after(()=>editor.dispose());
  const query=async method=>(await editor.query(method,[entry])).value;
  editor.open(entry,compact);
  assert.deepEqual(await query('diagnostics'),[]);
  const layout=await query('format');
  assert.deepEqual(layout.diagnostics,[]);
  assert.ok(layout.edits.length);
  assert.equal(applyFormatEdits(compact,layout.edits),formatted);
  assert.equal(fs.readFileSync(entry,'utf8'),formatted);

  const eol=guard.includes('\r\n')?'\r\n':'\n';
  const group='(!selected || !deleting || creating || deleted || status.phase !== "empty")';
  assert.ok(guard.includes(group));
  const expanded=formatted.replace(guard,guard.replace(group,[
    '(',
    '        !selected',
    '        || !deleting',
    '        || creating',
    '        || deleted',
    '        || status.phase !== "empty"',
    '      )'
  ].join(eol)));
  editor.open(entry,expanded);
  assert.deepEqual(await query('diagnostics'),[]);
  assert.deepEqual(await query('format'),{edits:[],diagnostics:[]});

  const malformed=formatted.replace(guard,guard+' then');
  const mistyped=formatted.replace(guard,guard.replace('"empty"','"blocked-phase"'));
  for(const [bad,code,span] of [
    [malformed,'ELN-GUARD-BODY','then'],
    [mistyped,'TS2367','status.phase !== "blocked-phase"']
  ]){
    editor.open(entry,bad);
    const diagnostic=(await query('diagnostics')).find(item=>item.code===code);
    assert.ok(diagnostic,JSON.stringify(await query('diagnostics')));
    assert.equal(bad.slice(diagnostic.start,diagnostic.start+diagnostic.length),span);
    if(bad===malformed){
      assert.match(diagnostic.message,/Expected a block after then/);
      const refused=await query('format');
      assert.deepEqual(refused.edits,[]);
      assert.equal(refused.diagnostics[0].causeCode,code);
    }
    fs.writeFileSync(entry,bad);
    assert.throws(build,error=>error.diagnostics?.some(item=>item.code===code&&item.line===diagnostic.line));
    assert.equal(fs.readFileSync(baseline.manifest,'utf8'),manifest);
  }

  editor.open(entry,formatted);
  assert.deepEqual(await query('diagnostics'),[]);
  assert.deepEqual((await query('format')).edits,[]);
  fs.writeFileSync(entry,formatted);
  const repaired=build();
  assert.notEqual(repaired.buildId,baseline.buildId);
  const commands=[];
  const f=await fixture(t,{remove:async (id,revision)=>{commands.push({id,revision});return base;}},repaired);
  f.choose();
  await tick();
  findButton(f.root,'Delete task').click();
  await tick();
  const confirm=findButton(f.root,'Confirm deletion');
  findButton(f.root,'Keep task').click();
  confirm.click();
  await tick();
  assert.deepEqual(commands,[]);
  findButton(f.root,'Delete task').click();
  await tick();
  findButton(f.root,'Confirm deletion').click();
  await tick();
  assert.deepEqual(commands,[{id:'TASK-1',revision:1}]);
});

test('draft validation identifies each field and clears as it is corrected',async t=>{
  const submitted=[];
  const f=await fixture(t,{create:async value=>{submitted.push(value);return base;}});
  findButton(f.root,'New task').click();
  await tick();
  const field=findInput(f.root,'Edit title');
  assert.equal(field.getAttribute('aria-invalid'),null);
  await f.fill('  ab  ');
  f.submit();
  await tick();
  assert.equal(submitted.length,0);
  assert.equal(field.getAttribute('aria-invalid'),'true');
  const id=field.getAttribute('aria-describedby');
  assert.ok(id);
  const message=f.root.descendants('span').find(node=>node.getAttribute('id')===id);
  assert.match(message?.textContent??'',/at least 3 characters/);
  assert.equal(message?.getAttribute('aria-live'),'polite');
  assert.equal(field.parentNode.textContent,'Edit title');
  await f.fill('a'.repeat(201));
  assert.equal(field.getAttribute('aria-invalid'),'true');
  assert.match(message.textContent,/at most 200 characters/);
  f.submit();
  await tick();
  assert.equal(submitted.length,0);
  await f.fill('  Ready  ');
  assert.equal(field.getAttribute('aria-invalid'),null);
  assert.equal(field.getAttribute('aria-describedby'),null);
  assert.equal(message.textContent,'');
  const assignee=findInput(f.root,'Edit assignee');
  const description=f.root.descendants('textarea')[0];
  assignee.value='a'.repeat(121);
  assignee.dispatch('input');
  description.value='a'.repeat(10001);
  description.dispatch('input');
  await tick();
  f.submit();
  await tick();
  assert.equal(submitted.length,0);
  assert.match(f.root.textContent,/assignee.*at most 120 characters/i);
  assert.equal(description.getAttribute('aria-invalid'),'true');
  const descriptionId=description.getAttribute('aria-describedby');
  assert.ok(descriptionId);
  const descriptionMessage=f.root.descendants('span').find(node=>node.getAttribute('id')===descriptionId);
  assert.match(descriptionMessage?.textContent??'',/Description must have at most 10000 characters/);
  const setDescriptionAttribute=description.setAttribute.bind(description);
  const descriptionAttributeWrites=[];
  description.setAttribute=(name,value)=>{
    descriptionAttributeWrites.push(name);
    setDescriptionAttribute(name,value);
  };
  assignee.value='  Ada  ';
  assignee.dispatch('input');
  await tick();
  assert.equal(assignee.getAttribute('aria-invalid'),null);
  assert.equal(description.getAttribute('aria-invalid'),'true');
  assert.deepEqual(descriptionAttributeWrites,[]);
  description.value='  Ready for review  ';
  description.dispatch('input');
  await tick();
  assert.equal(description.getAttribute('aria-invalid'),null);
  assert.equal(description.getAttribute('aria-describedby'),null);
  assert.equal(descriptionMessage.textContent,'');
  f.submit();
  await tick();
  assert.equal(submitted[0]?.title,'Ready');
  assert.equal(submitted[0]?.assignee,'Ada');
  assert.equal(submitted[0]?.description,'Ready for review');
});

test('persistent submit validates the current draft when an input and submit share a turn',async t=>{
  const submissions=[];
  const f=await fixture(t,{save:async value=>{submissions.push(value);return base;}});
  f.choose();
  await tick();
  const title=findInput(f.root,'Edit title');
  title.value='x';
  title.dispatch('input');
  f.submit();
  await tick();
  assert.deepEqual(submissions,[]);
  assert.equal(title.getAttribute('aria-invalid'),'true');

  title.value='  Revised title  ';
  title.dispatch('input');
  f.submit();
  await tick();
  assert.deepEqual(submissions.map(value=>value.title),['Revised title']);
  assert.equal(title.getAttribute('aria-invalid'),null);
});

test('a write rejection marks only the values still matching its saved attempt',async t=>{
  let settle;
  let submissions=0;
  const response=new Promise(resolve=>{settle=resolve;});
  const f=await fixture(t,{save:()=>{submissions++;return response;}});
  f.choose();
  await tick();
  await f.fill('  First task  ');
  f.submit();
  await tick();
  const title=findInput(f.root,'Edit title');
  const assignee=findInput(f.root,'Edit assignee');
  assignee.value='Taylor';
  assignee.dispatch('input');
  await tick();

  settle({...base,phase:'rejected',attempt,submittedAttemptKey:attempt.key,message:'Write rejected',issues:[
    {path:['title'],message:'Choose another title.'},
    {path:['assignee'],message:'Choose another assignee.'}
  ]});
  await tick();
  assert.equal(title.getAttribute('aria-invalid'),'true');
  const id=title.getAttribute('aria-describedby');
  assert.ok(id);
  assert.equal(f.root.descendants('span').find(node=>node.getAttribute('id')===id)?.textContent,'Choose another title.');
  assert.equal(assignee.getAttribute('aria-invalid'),null);
  assert.equal(assignee.value,'Taylor');
  await f.fill('Corrected title');
  assert.equal(title.getAttribute('aria-invalid'),null);
  assert.equal(title.getAttribute('aria-describedby'),null);
  assert.match(f.root.textContent,/Write rejected/);
  assert.match(f.root.textContent,/Saved attempt: First task/);
  f.submit();
  await tick();
  assert.equal(submissions,1);
  findButton(f.root,'Finish attempt').click();
  await tick();
  assert.equal(title.value,'Corrected title');
  assert.equal(findButton(f.root,'Save changes').disabled,false);
});

test('an observed rejection from another attempt keeps its message out of the local form',async t=>{
  let publish;
  const peer={...base,phase:'rejected',attempt,message:'Peer write rejected',issues:[
    {path:['title'],message:'Peer title error.'}
  ]};
  const f=await fixture(t,{
    observe(listener){publish=listener;return ()=>{};},
    read:()=>base,
    save:async()=>peer
  });
  f.choose();
  await tick();
  f.submit();
  await tick();
  publish(peer);
  await tick();
  assert.match(f.root.textContent,/Peer write rejected/);
  assert.equal(findInput(f.root,'Edit title').getAttribute('aria-invalid'),null);
  assert.doesNotMatch(f.root.textContent,/Peer title error/);
});
test('create keeps later draft edits and turns them into editing the confirmed identity',async t=>{let resolve,savedId;const gate=new Promise(r=>resolve=r),created={...attempt.command.task,id:'TASK-created',title:'New task'},f=await fixture(t,{create:()=>gate,save:async(value)=>{savedId=value.id;return base;}});findButton(f.root,'New task').click();await tick();await f.fill('New task');f.submit();await tick();await f.fill('Later task');resolve({...base,phase:'applied',submittedAttemptKey:'create',attempt:{key:'create',command:{kind:'create',task:created}}});await tick();findButton(f.root,'Finish attempt').click();await tick();assert.equal(findInput(f.root,'Edit title').value,'Later task');assert.ok(findButton(f.root,'Save changes'));f.submit();await tick();assert.equal(savedId,'TASK-created');});
test('deletion needs explicit confirmation and Keep task sends no command',async t=>{let calls=0;const f=await fixture(t,{remove:async()=>{calls++;return base;}});f.choose();await tick();findButton(f.root,'Delete task').click();await tick();assert.equal(calls,0);findButton(f.root,'Keep task').click();await tick();assert.equal(calls,0);findButton(f.root,'Delete task').click();await tick();findButton(f.root,'Confirm deletion').click();await tick();assert.equal(calls,1);});
test('confirmed deletion keeps the draft and can explicitly copy it to a new task',async t=>{const deleted={...base,tasks:[],tombstones:[{id:task.id,revision:2}]},f=await fixture(t,{remove:async()=>({...deleted,phase:'applied',attempt:{key:'delete',command:{kind:'delete',taskId:task.id,expectedRevision:1}}}),acknowledge:()=>deleted});f.choose();await tick();await f.fill('Retained draft');findButton(f.root,'Delete task').click();await tick();findButton(f.root,'Confirm deletion').click();await tick();findButton(f.root,'Finish attempt').click();await tick();assert.equal(findInput(f.root,'Edit title').value,'Retained draft');assert.equal(findButton(f.root,'Save changes').disabled,true);findButton(f.root,'Copy draft to new task').click();await tick();assert.equal(findInput(f.root,'Edit title').value,'Retained draft');assert.ok(findButton(f.root,'Create task'));});
test('restored delete intent exposes recovery without inventing an editable task',async t=>{const f=await fixture(t,{read:()=>({...base,phase:'unknown',attempt:{key:'delete',command:{kind:'delete',taskId:task.id,expectedRevision:1}}})});assert.equal(f.root.descendants('form').length,0);assert.equal(findButton(f.root,'New task').disabled,true);assert.equal(findButton(f.root,'Retry saved edit').disabled,true);});
test('restored create intent opens the attempted task and prevents a fresh creation',async t=>{const f=await fixture(t,{read:()=>({...base,phase:'unknown',attempt:{key:'create',command:{kind:'create',task:attempt.command.task}}})});assert.equal(findInput(f.root,'Edit title').value,'First task');assert.equal(findButton(f.root,'Create task').disabled,true);});
test('new tasks start open and cannot select another status before creation',async t=>{const f=await fixture(t);findButton(f.root,'New task').click();await tick();assert.equal(f.root.descendants('select')[1].disabled,true);assert.equal(f.root.descendants('select')[1].value,'open');});
