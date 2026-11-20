import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {setupDOM,FakeNode,tick} from './fake-dom.mjs';

test('comparison Surface fixture uses ordinary compilation and preserves keyed rows, events and disposal',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-comparison-'));
  t.after(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('elnor-comparison-'));fs.rmSync(root,{recursive:true,force:true});});
  const entry=new URL('../benchmarks/runtime/elnor/App.eln',import.meta.url),before=fs.readFileSync(entry,'utf8');
  const built=buildSurfaceProject(fileURLToPath(entry),{outputDir:path.join(root,'out'),checkOutputDir:path.join(root,'check')});
  const {mount}=await import(pathToFileURL(path.join(built.output,built.entryOutput)).href);setupDOM();const target=new FakeNode('root'),dispose=mount(target,{size:100});
  const click=async index=>{target.descendants('button')[index].click();await tick();};
  await click(0);let rows=target.descendants('li');assert.equal(rows.length,100);const first=rows[0],last=rows.at(-1);
  await click(1);assert.equal(target.descendants('li')[0],first);assert.match(first.textContent,/Row 1!/);
  await click(56);assert.equal(target.descendants('span')[1].textContent,'51');
  await click(3);assert.equal(target.descendants('li')[0],last);assert.equal(target.descendants('li').at(-1),first);
  await click(2);assert.equal(target.descendants('li').length,110);await click(4);assert.equal(target.descendants('li').length,109);
  await click(5);assert.equal(target.descendants('li').length,0);dispose();assert.equal(target.childNodes.length,0);assert.equal(fs.readFileSync(entry,'utf8'),before);
});
