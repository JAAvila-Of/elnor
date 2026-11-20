import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseSurface} from '../src/parser.mjs';
import {check,build,graphFor,DIST,EXAMPLES} from '../src/compiler.mjs';
import {typecheckGraph} from '../src/checker.mjs';
import {setupDOM,FakeNode,findInput,findButton,tick} from './fake-dom.mjs';
import {cell} from '../dist/runtime.mjs';
import {mount as mountUserList} from '../dist/UserList.mjs';
import {mount as mountEditor} from '../dist/UserEditor.mjs';
import {mount as mountDialog} from '../dist/ConfirmDialog.mjs';
import {mount as mountPanel} from '../dist/Panel.mjs';

const users=()=>[
  {id:'u1',name:'Ana Torres',role:'admin',email:'ana@example.test'},
  {id:'u2',name:'Luis Ramos',role:'member',email:'luis@example.test'},
  {id:'u3',name:'Sara Diaz',role:'member',email:'sara@example.test'}
];
const componentPath=name=>path.join(EXAMPLES,name+'.eln');
function mutatedGraph(name,transform){
  const graph=graphFor('UserEditor');
  const file=componentPath(name);
  graph.set(file,parseSurface(transform(fs.readFileSync(file,'utf8')),file));
  return graph;
}
function errorsFor(graph){return typecheckGraph(graph,path.resolve('.elnor','test-check'));}

// The parser + checker run across all source components, not JS-only stand-ins.
test('01: parses cross-file props, events, and slots',()=>{
  const {graph,diagnostics}=check('UserEditor');
  assert.deepEqual(diagnostics,[]);
  assert.equal(graph.size,4);
  assert.deepEqual(graph.get(componentPath('Panel')).slots,['actions','default']);
  assert.deepEqual(graph.get(componentPath('ConfirmDialog')).events.map(e=>e.name),['confirmed','cancelled']);
  assert.deepEqual(graph.get(componentPath('UserEditor')).events.map(e=>e.name),['saved','deleted']);
});
test('02: TypeScript catches wrong prop types across component imports',()=>{
  const graph=mutatedGraph('UserEditor',s=>s.replace('UserList users=visible','UserList users=42'));
  assert.ok(errorsFor(graph).some(d=>d.code==='TS2322'&&d.message.includes('number')));
});
test('03: TypeScript catches nonexistent custom event',()=>{
  const graph=mutatedGraph('UserEditor',s=>s.replace('on selected(value) => choose(value)','on missing(value) => choose(value)'));
  assert.ok(errorsFor(graph).some(d=>d.code==='TS2353'&&d.message.includes('missing')));
});
test('04: TypeScript catches wrong emit argument',()=>{
  const graph=mutatedGraph('UserList',s=>s.replace('emit.selected(user)','emit.selected(123)'));
  assert.ok(errorsFor(graph).some(d=>d.code==='TS2345'));
});
test('05: unknown slots are rejected before codegen',()=>{
  const graph=mutatedGraph('UserEditor',s=>s.replace('fill actions {','fill unknown {'));
  assert.ok(errorsFor(graph).some(d=>d.code==='ELN-SLOT-UNKNOWN'));
});
test('06: non-state binding is rejected semantically',()=>{
  const file=componentPath('UserEditor');
  const src=fs.readFileSync(file,'utf8').replace('input "Nombre" <-> draftName','input "Nombre" <-> visible');
  assert.throws(()=>parseSurface(src,file),/ELN-SEM-BIND/);
});
test('07: UserList runs individually and emits a typed payload',async()=>{
  setupDOM();const root=new FakeNode('root'),received=[];
  const dispose=mountUserList(root,{users:users()},{selected:user=>received.push(user)});
  assert.ok(findButton(root,'Luis Ramos'));
  findButton(root,'Luis Ramos').click();await tick();
  assert.equal(received[0].id,'u2');
  dispose();assert.equal(root.childNodes.length,0);
});
test('08: ConfirmDialog runs individually and emits two distinct events',()=>{
  setupDOM();const root=new FakeNode('root'),calls=[];
  const dispose=mountDialog(root,{title:'Eliminar',message:'¿Confirmar?'},{confirmed:()=>calls.push('confirmed'),cancelled:()=>calls.push('cancelled')});
  const retainedButton=findButton(root,'Eliminar');
  findButton(root,'Cancelar').click();retainedButton.click();
  assert.deepEqual(calls,['cancelled','confirmed']);
  dispose();retainedButton.click();assert.equal(calls.length,2);
});
test('09: slots fill named actions and default content with correct lifetime',()=>{
  setupDOM();const root=new FakeNode('root');const events=[];
  const dispose=mountPanel(root,{title:'Mis usuarios'},{},{
    actions:(p,owner)=>{
      const b=document.createElement('button');b.textContent='Agregar';const handler=()=>events.push('add');
      b.addEventListener('click',handler);owner.own(()=>b.removeEventListener('click',handler));p.append(b);
    },
    default:(p)=>{const text=document.createElement('p');text.textContent='Contenido del panel';p.append(text);}
  });
  const b=findButton(root,'Agregar');assert.ok(b);
  assert.match(root.textContent,/Contenido del panel/);
  b.click();assert.deepEqual(events,['add']);
  dispose();b.click();assert.deepEqual(events,['add']);
});
test('10: composed UserEditor handles search, nested selected event, edit and async save',async()=>{
  setupDOM();const root=new FakeNode('root'),saved=[];const rows=users();
  let complete;const pending=new Promise(resolve=>{complete=resolve;});
  const dispose=mountEditor(root,{users:rows,persist:()=>pending,remove:async()=>{}},{saved:user=>saved.push(user)});
  const search=findInput(root,'Buscar usuarios');
  search.value='Luis';search.dispatch('input');await tick();
  assert.ok(findButton(root,'Luis Ramos'));
  assert.equal(findButton(root,'Ana Torres'),undefined);
  findButton(root,'Luis Ramos').click();await tick();
  assert.equal(findInput(root,'Nombre').value,'Luis Ramos');
  const name=findInput(root,'Nombre');name.value='Luis Rivera';name.dispatch('input');await tick();
  assert.equal(findInput(root,'Nombre'),name,'input identity preserved on update');
  findButton(root,'Guardar').click();await tick();
  assert.ok(findButton(root,'Guardando...'));
  complete();await tick();
  assert.equal(saved[0].name,'Luis Rivera');
  assert.ok(findButton(root,'Luis Rivera'),'saved name updates the child list reactively');
  assert.ok(findButton(root,'Guardar'));
  assert.equal(findInput(root,'Buscar usuarios'),search);
  dispose();assert.equal(root.childNodes.length,0);
});
test('11: composed dialog cancels without deleting, then confirms and disposes',async()=>{
  setupDOM();const root=new FakeNode('root'),deleted=[];const rows=users();let removal=0;
  const dispose=mountEditor(root,{users:rows,persist:async()=>{},remove:async()=>{removal++;}},{deleted:id=>deleted.push(id)});
  findButton(root,'Ana Torres').click();await tick();
  findButton(root,'Eliminar usuario...').click();await tick();
  assert.match(root.textContent,/Esta acción no se puede deshacer/);
  findButton(root,'Cancelar').click();await tick();
  assert.equal(removal,0);assert.equal(findButton(root,'Cancelar'),undefined);
  findButton(root,'Eliminar usuario...').click();await tick();
  findButton(root,'Eliminar').click();await tick();
  assert.equal(removal,1);assert.deepEqual(deleted,['u1']);
  assert.equal(findButton(root,'Ana Torres'),undefined,'deleted user disappears from the list');
  assert.equal(findInput(root,'Nombre'),undefined);
  dispose();
});
test('12: invalid edits are rejected and do not call persistence',async()=>{
  setupDOM();const root=new FakeNode('root');let persists=0;
  const dispose=mountEditor(root,{users:users(),persist:async()=>{persists++;},remove:async()=>{}});
  findButton(root,'Sara Diaz').click();await tick();
  const name=findInput(root,'Nombre');name.value='x';name.dispatch('input');await tick();
  findButton(root,'Guardar').click();await tick();
  assert.equal(persists,0);assert.match(root.textContent,/2 caracteres/);
  dispose();
});
test('13: keyed list reuses DOM nodes on reorder, updating their text',async()=>{
  setupDOM();const root=new FakeNode('root'),data=cell(users());
  const props={};Object.defineProperty(props,'users',{get:()=>data.value});
  const dispose=mountUserList(root,props);
  const first=findButton(root,'Ana Torres');
  data.value=[{...data.value[2]},{...data.value[1]},{...data.value[0],name:'Ana Updated'}];await tick();
  assert.equal(findButton(root,'Ana Updated'),first);
  assert.deepEqual(root.descendants('li').map(li=>li.textContent),['Sara Diazmember','Luis Ramosmember','Ana Updatedadmin']);
  dispose();
});
test('14: standalone build includes only the target dependency graph',()=>{
  const output=build('ConfirmDialog');
  assert.equal(output.graph.size,1);
  assert.deepEqual(fs.readdirSync(DIST).filter(n=>n.endsWith('.mjs')).sort(),['ConfirmDialog.mjs','entry.mjs','preview-fixtures.mjs','region-runtime.mjs','runtime.mjs']);
  const regionalRuntime=fs.readFileSync(path.join(DIST,'region-runtime.mjs'));
  assert.equal(output.regionRuntime.sha256,createHash('sha256').update(regionalRuntime).digest('hex'));
  assert.equal(output.regionRuntime.features.lists,false);
  assert.equal(output.regionRuntime.features.components,false);
  const manifest=JSON.parse(fs.readFileSync(path.join(DIST,'manifest.json')));
  assert.equal(manifest.components.length,1);
  assert.equal(manifest.entrySource,'ConfirmDialog.eln');
  assert.equal(manifest.entryOutput,manifest.components[0].file);
  assert.match(manifest.entryOutput,/^\.elnor-components\/[a-f0-9]{64}\.mjs$/);
  assert.ok(fs.readFileSync(path.join(DIST,'entry.mjs'),'utf8').includes(manifest.entryOutput));
  build('UserEditor');
});
test('15: output has no inline event handler, eval, or innerHTML',()=>{
  build('UserEditor');
  for(const file of fs.readdirSync(DIST).filter(f=>f.endsWith('.mjs')&&!f.includes('fixtures'))){
    const source=fs.readFileSync(path.join(DIST,file),'utf8');
    assert.doesNotMatch(source,/\beval\s*\(|\.innerHTML\b|\.outerHTML\b|new Function\s*\(/);
  }
  const html=fs.readFileSync(path.join(DIST,'index.html'),'utf8');
  assert.doesNotMatch(html,/\bonclick\s*=|<script(?![^>]*src=)/);
});
test('16: real HTTP preview serves a restrictive CSP and external modules',async()=>{
  const {createServer}=await import('../src/server.mjs');
  build('UserEditor');
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const port=server.address().port;
    const response=await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status,200);
    const policy=response.headers.get('content-security-policy');
    assert.match(policy,/script-src 'self'/);
    assert.match(policy,/style-src 'self'/);
    assert.match(policy,/connect-src 'none'/);
    assert.doesNotMatch(policy,/unsafe-inline|unsafe-eval/);
    const html=await response.text();
    assert.match(html,/<script type="module" src="\/entry\.mjs"><\/script>/);
    const script=await fetch(`http://127.0.0.1:${port}/UserEditor.mjs`);
    assert.equal(script.status,200);
    assert.match(script.headers.get('content-type'),/text\/javascript/);
    const regional=await fetch(`http://127.0.0.1:${port}/region-runtime.mjs`);
    assert.equal(regional.status,200);
    assert.match(regional.headers.get('content-type'),/text\/javascript/);
    assert.equal(regional.headers.get('content-security-policy'),policy);
    assert.match(await regional.text(),/export function mountRegion\b/);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('17: TypeScript Language Service resolves imported component, rename and prop completion in virtual files',async()=>{
  const {languageServiceProbe}=await import('../src/editor.mjs');
  const result=languageServiceProbe();
  const {sourceHash}=await import('../src/source-identity.mjs');
  assert.ok(result.definitionVirtualFile.endsWith(sourceHash(result.definitionOriginalFile)+'.eln.mts'));
  assert.ok(result.definitionOriginalFile.endsWith('UserList.eln'));
  assert.equal(result.renamePossible,true);
  assert.ok(result.renameLocationCount>=2);
  assert.deepEqual(result.propSuggestions,['users']);
});
