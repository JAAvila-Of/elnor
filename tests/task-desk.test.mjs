import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {setupDOM, FakeNode, findButton, findInput as findTextInput, tick} from './fake-dom.mjs';

const findInput=(root,label)=>findTextInput(root,label)??root.descendants('label').find(n=>n.descendants('span')[0]?.textContent===label)?.descendants('textarea')[0];
const source=fileURLToPath(new URL('../examples/task-desk/',import.meta.url));
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-task-desk-'));
  t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(dir).startsWith('elnor-task-desk-'));fs.rmSync(dir,{recursive:true,force:true});});
  const root=path.join(dir,'examples/task-desk');
  fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}\n');
  fs.cpSync(source,root,{recursive:true});
  fs.mkdirSync(path.join(dir,'src'));
  fs.copyFileSync(new URL('../src/form-schema.ts',import.meta.url),path.join(dir,'src/form-schema.ts'));
  const entry=path.join(root,'App.eln'),outputDir=path.join(dir,'output'),checkOutputDir=path.join(dir,'check');
  return {root,outputDir,build:()=>buildSurfaceProject(entry,{outputDir,checkOutputDir})};
}

test('task desk preserves drafts and keyed rows through search, CRUD and status changes',async t=>{
  const f=fixture(t),built=f.build(),props=JSON.parse(fs.readFileSync(path.join(source,'preview-props.json'),'utf8')),original=JSON.stringify(props);
  const {mount}=await import(pathToFileURL(path.join(f.outputDir,built.entryOutput)));setupDOM();const root=new FakeNode('root'),stop=mount(root,props);t.after(stop);
  const click=async label=>{const button=findButton(root,label);assert.ok(button,label);if(button.type==='submit'||button.type==='reset'){let host=button.parentNode;while(host&&host.tag!=='form')host=host.parentNode;assert.ok(host);for(const listener of host.listeners[button.type]??[])listener({preventDefault(){}});}else button.click();await tick();};
  const row=id=>root.descendants('button').find(node=>node.textContent.startsWith(id+' · '));
  const choose=async id=>{assert.ok(row(id));row(id).click();await tick();};
  const fill=async(label,value)=>{const input=findInput(root,label);assert.ok(input,label);input.value=value;input.dispatch('input');await tick();return input;};
  assert.match(root.textContent,/4 tasks · 2 open · 1 in progress · 1 completed/);
  assert.equal(findButton(root,'All tasks').getAttribute('aria-current'),'true');assert.equal(findButton(root,'Open').getAttribute('aria-pressed'),'false');await click('Open');assert.equal(findButton(root,'Open').getAttribute('aria-pressed'),'true');await click('Open');assert.equal(findButton(root,'Open').getAttribute('aria-pressed'),'false');assert.equal(findButton(root,'All tasks').getAttribute('aria-current'),'true');
  const search=findInput(root,'Search tasks');let first=row('TASK-1');assert.equal(findButton(root,'Clear filters').disabled,true);
  await fill('Search tasks','PARSER');assert.equal(root.descendants('li').length,1);assert.equal(findButton(root,'Clear filters').disabled,false);assert.equal(row('TASK-1'),first);
  await click('Clear filters');await click('Completed');assert.equal(root.descendants('li').length,1);assert.ok(row('TASK-3'));await click('Clear filters');
  first=row('TASK-1');
  await choose('TASK-1');assert.equal(row('TASK-1').getAttribute('aria-current'),'true');assert.equal(row('TASK-2').getAttribute('aria-current'),'false');await click('Edit task');const draft=await fill('Edit title','Unsaved parser draft');
  await choose('TASK-2');assert.ok(findButton(root,'Keep editing'));assert.equal(row('TASK-1').getAttribute('aria-current'),'true');assert.equal(row('TASK-2').getAttribute('aria-current'),'false');assert.equal(findInput(root,'Edit title'),draft);assert.equal(draft.value,'Unsaved parser draft');
  await click('Keep editing');assert.equal(findButton(root,'Discard draft and switch'),undefined);
  await choose('TASK-2');await click('Discard draft and switch');assert.equal(findInput(root,'Edit title'),undefined);assert.match(root.textContent,/Review preview messages/);
  await choose('TASK-1');await click('Edit task');assert.equal(findInput(root,'Edit title').value,'Improve parser recovery');
  await fill('Edit title',' ');await click('Save changes');assert.match(root.textContent,/Use at least 3 characters/);assert.equal(row('TASK-1'),first);
  assert.equal(findInput(root,'Edit title').getAttribute('aria-invalid'),'true');
  assert.ok(findInput(root,'Edit title').getAttribute('aria-describedby'));
  const description=await fill('Edit description','First line\nSecond line');assert.equal(description.tag,'textarea');
  await fill('Edit title','Improve scoped parser recovery');assert.equal(findInput(root,'Edit title').getAttribute('aria-invalid'),null);
  const assignee=await fill('Edit assignee','x'.repeat(121));await click('Save changes');
  assert.equal(assignee.getAttribute('aria-invalid'),'true');assert.match(root.textContent,/Assignee must have at most 120 characters/);
  assert.doesNotMatch(first.textContent,/Improve scoped parser recovery/);
  await fill('Edit assignee','  Taylor  ');assert.equal(assignee.getAttribute('aria-invalid'),null);
  const prioritySelect=root.descendants('select')[0];assert.equal(prioritySelect.value,'high');prioritySelect.value='normal';prioritySelect.dispatch('change');await tick();prioritySelect.value='high';prioritySelect.dispatch('change');await tick();await click('Save changes');
  assert.equal(row('TASK-1'),first);assert.match(first.textContent,/Improve scoped parser recovery/);assert.ok(root.textContent.includes('First line\nSecond line'));assert.match(root.textContent,/Saved TASK-1/);assert.equal(findInput(root,'Edit title'),undefined);
  await click('Complete task');assert.match(root.textContent,/4 tasks · 1 open · 1 in progress · 2 completed/);
  await click('Completed');assert.equal(root.descendants('li').length,2);
  const priority=findInput(root,'High priority');assert.equal(priority.type,'checkbox');assert.equal(priority.checked,false);priority.checked=true;priority.dispatch('change');await tick();await click('Create task');assert.match(root.textContent,/Use at least 3 characters/);assert.match(root.textContent,/4 tasks/);assert.equal(priority.checked,true,'Failed validation preserves checkbox draft');
  assert.equal(findInput(root,'New task title').getAttribute('aria-invalid'),'true');
  await fill('New task title','  Triage import resolution  ');const longDescription=await fill('New task description','x'.repeat(10001));await click('Create task');
  assert.match(root.textContent,/Description must have at most 10000 characters/);assert.equal(longDescription.value.length,10001);assert.equal(row('TASK-5'),undefined);
  const composer=await fill('New task title','  Triage import resolution  ');
  await fill('New task assignee','Alex');
  longDescription.value='  Follow the local module\nresolution path.  ';
  longDescription.dispatch('input');
  await click('Create task');
  assert.ok(root.textContent.includes('Follow the local module\nresolution path.'));
  assert.equal(findInput(root,'High priority'),priority);assert.equal(priority.checked,false,'Successful creation resets the draft');assert.match(row('TASK-5').parentNode.textContent,/high priority/);assert.match(root.textContent,/Created TASK-5/);assert.equal(root.descendants('li').length,5);assert.ok(row('TASK-5'));assert.equal(composer.value,'');assert.equal(findInput(root,'New task title'),composer);assert.equal(findInput(root,'Search tasks'),search);
  await click('Delete task');await click('Keep task');assert.ok(row('TASK-5'));
  await click('Delete task');const retired=findButton(root,'Delete permanently');await click('Delete permanently');assert.equal(row('TASK-5'),undefined);assert.match(root.textContent,/Deleted TASK-5/);retired.click();await tick();assert.match(root.textContent,/4 tasks/);
  await fill('New task title','Keep local numbers monotonic');await click('Create task');assert.ok(row('TASK-6'));assert.match(row('TASK-6').parentNode.textContent,/normal priority/);assert.equal(row('TASK-5'),undefined);
  await fill('New task title','Discarded draft');await fill('New task assignee','Discarded assignee');await fill('New task description','Discarded\nnotes');priority.checked=true;priority.dispatch('change');await tick();const rowsBeforeClear=root.descendants('li').length;await click('Clear draft');assert.equal(findInput(root,'New task title').value,'');assert.equal(findInput(root,'New task assignee').value,'');assert.equal(root.descendants('textarea').find(node=>node.parentNode.descendants('span')[0]?.textContent==='New task description').value,'');assert.equal(priority.checked,false);assert.equal(root.descendants('li').length,rowsBeforeClear);assert.ok(row('TASK-6'));
  assert.equal(JSON.stringify(props),original,'Entry data must not be mutated');stop();stop();first.click();retired.click();await tick();assert.equal(root.childNodes.length,0);
});

test('task desk status errors map to Surface and cannot replace a valid generation',t=>{
  const f=fixture(t);f.build();const manifest=fs.readFileSync(path.join(f.outputDir,'manifest.json'),'utf8'),file=path.join(f.root,'TaskDetails.eln');
  const original=fs.readFileSync(file,'utf8');assert.ok(original.includes('changeStatus("done")'));fs.writeFileSync(file,original.replace('changeStatus("done")','changeStatus("closed")'));
  assert.throws(()=>f.build(),error=>error.diagnostics?.some(d=>d.code==='TS2345'&&path.basename(d.file)==='TaskDetails.eln'&&d.line>0));
  assert.equal(fs.readFileSync(path.join(f.outputDir,'manifest.json'),'utf8'),manifest);
});

test('task schema errors complete field names and mark misspellings at the Surface property',t=>{
  const f=fixture(t),file=path.join(f.root,'TaskComposer.eln');
  const source=fs.readFileSync(file,'utf8');
  const property='errors.description';
  assert.ok(source.includes(property));
  const editor=createSurfaceLanguageService({root:path.dirname(file)});
  t.after(()=>editor.dispose());
  const partial=source.replace(property,'errors.');
  editor.open(file,partial);
  const caret=partial.indexOf('errors.')+'errors.'.length;
  assert.deepEqual(editor.completions(file,caret).map(item=>item.name).sort(),
    ['assignee','description','priority','title']);

  const typo='descripton',bad=source.replace(property,'errors.'+typo);
  editor.open(file,bad);
  const errors=editor.diagnostics(file);
  assert.equal(errors.length,1);
  assert.equal(bad.slice(errors[0].start,errors[0].start+errors[0].length),typo);
  assert.match(errors[0].message,/descripton.*description/);
  fs.writeFileSync(file,bad);
  assert.throws(()=>f.build(),error=>error.diagnostics?.some(d=>d.code===errors[0].code&&
    path.basename(d.file)==='TaskComposer.eln'&&d.line===errors[0].line));
});
