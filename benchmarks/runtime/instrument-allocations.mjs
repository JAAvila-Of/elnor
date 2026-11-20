import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// Diagnostic-only counters. Never benchmark CPU using this transformed runtime.
export function instrumentAllocations(input){
  let source=input;
  const replace=(before,after,count=1)=>{
    if(source.split(before).length-1!==count)throw Error('Unsupported allocation probe source: '+before);
    source=source.split(before).join(after);
  };
  if(source.includes('__elnorAllocationProbe'))throw Error('Runtime already instrumented');
  replace('const subs=new Set();',"const subs=__allocationProbe.newSet('subscriber');");
  const eager=source.includes('deps:new Set()');
  if(eager)replace('deps:new Set()',"deps:__allocationProbe.newSet('effect')");
  else if(source.includes('this.deps=new Set()'))replace('this.deps=new Set()',"this.deps=__allocationProbe.newSet('effect')");
  else replace('new Set([e.dep,subs])',"__allocationProbe.newSet('effect',[e.dep,subs])");
  replace('export function cell(initial){','export function cell(initial){\n  __allocationProbe.cells++;');
  replace('export function scope(){','export function scope(){\n  __allocationProbe.scopes++;');
  replace('export function effect(fn, owner){','export function effect(fn, owner){\n  __allocationProbe.effects++;');
  replace('function notify(subs){','function notify(subs){\n  __allocationProbe.notifications++;');
  const snapshotLoop='for(const e of [...subs]) pending.add(e);',directLoop='for(const e of subs) pending.add(e);';
  if(source.includes(snapshotLoop))replace(snapshotLoop,'__allocationProbe.subscriberSnapshots++;for(const e of [...subs]){__allocationProbe.queuedEdges++;pending.add(e);}');
  else replace(directLoop,'for(const e of subs){__allocationProbe.queuedEdges++;pending.add(e);}');
  if(source.includes('cleanAll(disposers.splice(0).reverse());'))
    replace('cleanAll(disposers.splice(0).reverse());','__allocationProbe.cleanupSnapshots++;cleanAll(disposers.splice(0).reverse());');
  else if(source.includes('try{cleanAll(disposers.reverse());}finally{disposers.length=0;}'))
    // Recognize the reused array explicitly; there is no snapshot constructor.
    replace('try{cleanAll(disposers.reverse());}finally{disposers.length=0;}','try{cleanAll(disposers.reverse());}finally{disposers.length=0;}');
  else if(!source.includes('disposers[i]=null;'))throw Error('Unsupported scope disposal probe source');
  replace('try{if(!e.disposed)e.run();}catch(error){dispose();throw error;}',
    'try{if(!e.disposed){e.run();__allocationProbe.initialDeps[Math.min(e.deps?e.deps.size:e.dep?1:0,2)]++;}}catch(error){dispose();throw error;}');
  const prelude=`const __allocationProbe=globalThis.__elnorAllocationProbe={
  reset(){this.cells=0;this.scopes=0;this.effects=0;this.cleanupSnapshots=0;this.notifications=0;this.subscriberSnapshots=0;this.queuedEdges=0;this.sets={subscriber:0,effect:0};this.initialDeps=[0,0,0];},
  newSet(kind,values){this.sets[kind]++;return new Set(values);},
  snapshot(){return {cells:this.cells,scopes:this.scopes,effects:this.effects,cleanupSnapshots:this.cleanupSnapshots,notifications:this.notifications,subscriberSnapshots:this.subscriberSnapshots,queuedEdges:this.queuedEdges,sets:{...this.sets},initialDeps:[...this.initialDeps]};}
};__allocationProbe.reset();\n`;
  return prelude+source;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==3)throw Error('Expected source runtime path');
  const here=path.dirname(fileURLToPath(import.meta.url));
  const internal=path.resolve(here,'../../.elnor/mvp/framework-comparison');
  const directory=fs.mkdtempSync(path.join(internal,'allocation-probe-'));
  const input=fs.readFileSync(path.resolve(process.argv[2]));
  const transformed=instrumentAllocations(input.toString('utf8'));
  fs.writeFileSync(path.join(directory,'runtime.mjs'),transformed,{flag:'wx'});
  fs.writeFileSync(path.join(directory,'producer.mjs'),fs.readFileSync(fileURLToPath(import.meta.url)),{flag:'wx'});
  fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({kind:'elnor-reactive-allocation-probe-v1',diagnosticOnly:true,
    source:path.resolve(process.argv[2]),sourceSha256:createHash('sha256').update(input).digest('hex'),
    outputSha256:createHash('sha256').update(transformed).digest('hex'),
    limitations:['Counts source constructor calls; not allocated bytes','Heap sampling and counters perturb execution; not CPU timing evidence']},null,2),{flag:'wx'});
  console.log(JSON.stringify({directory,runtimeSource:path.join(directory,'runtime.mjs')}));
}
