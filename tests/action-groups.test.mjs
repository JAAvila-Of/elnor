import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {setImmediate as flush} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {createAsyncLanguageService} from '../src/async-language-service.mjs';
import {applyFormatEdits, formatSurface} from '../src/formatter.mjs';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {parseSurface} from '../src/parser.mjs';
import {checkSurfaceProject} from '../src/project-check.mjs';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {FakeNode, findButton, setupDOM} from './fake-dom.mjs';

const source = `component Dashboard(workspace: string, load: (workspace: string) => Promise<{ openOrders: number }>) {
  action group dashboard(workspace) single-flight

  action async refresh() in dashboard {
    return await load(workspace);
  }

  ui {
    section {
      button disabled=(dashboard.pending) "Refresh" => refresh()
      p (refresh.status === "success" ? refresh.result.openOrders : 0)
    }
  }
}
`;

function scope(t) {
  const temp = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temp, 'elnor-native-action-group-'));
  t.after(() => {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved), temp);
    assert.ok(path.basename(resolved).startsWith('elnor-native-action-group-'));
    fs.rmSync(resolved, {recursive: true, force: true});
  });
  const service = createSurfaceLanguageService({root: directory});
  t.after(() => service.dispose());
  return {service, file:path.join(directory, 'Dashboard.eln'), directory};
}

test('action group syntax retains names, ownership, policy and action membership', () => {
  const ir = parseSurface(source);
  assert.equal(ir.actionGroups.length, 1);
  const [group] = ir.actionGroups;
  assert.equal(group.name, 'dashboard');
  assert.equal(group.owner, 'workspace');
  assert.equal(group.policy, 'single-flight');
  assert.equal(ir.actions[0].group, 'dashboard');
  assert.equal(parseSurface(source.replace('single-flight', 'latest;')).actionGroups[0].policy, 'latest');
  assert.throws(() => parseSurface(source.replace('action async refresh', 'action refresh')),
    {code:'ELN-ACTION-GROUP-ASYNC'});
  assert.throws(() => parseSurface(source.replace('dashboard(workspace)', 'dashboard(unknownOwner)')),
    {code:'ELN-ACTION-GROUP-OWNER'});
});

test('native editor and project checker infer result and validate the original call', t => {
  const {service,file,directory}=scope(t);
  fs.writeFileSync(file,source);
  service.open(file,source);
  assert.deepEqual(service.diagnostics(file),[]);
  const outputDir=path.join(directory,'check');
  assert.deepEqual(checkSurfaceProject(file,{outputDir}).diagnostics,[]);
  const bad=source.replace('result.openOrders','result.missingField').replace(/\n/g,'\r\n');
  service.open(file,bad);
  const error=service.diagnostics(file).find(item=>item.code==='TS2339');
  assert.equal(bad.slice(error.start,error.start+error.length),'missingField');
  fs.writeFileSync(file,bad);
  assert.ok(checkSurfaceProject(file,{outputDir}).diagnostics.some(item=>item.code==='TS2339'&&/missingField/.test(item.message)));
});

test('native completion and definitions work on action groups while the author is typing', t => {
  const {service,file}=scope(t);
  const partial=source.replace('single-flight','lat').replace('in dashboard','in dash')
    .replace('result.openOrders','result.');
  service.open(file,partial);
  const suggestions=target=>service.completions(file,partial.indexOf(target)+target.length);
  assert.deepEqual(suggestions(') lat').map(item=>item.name),['single-flight','latest']);
  assert.deepEqual(suggestions('in dash').map(item=>item.name),['dashboard']);
  assert.ok(suggestions('result.').some(item=>item.name==='openOrders'));
  const diagnostics=service.diagnostics(file);
  for(const [code,token] of [['ELN-ACTION-GROUP-POLICY','lat'],['ELN-ACTION-GROUP-MEMBER','dash']]){
    const error=diagnostics.find(item=>item.code===code);
    assert.equal(partial.slice(error.start,error.start+error.length),token);
  }
  service.open(file,source);
  assert.ok(service.definitions(file,source.indexOf('in dashboard')+4).some(span=>span.start===source.indexOf('dashboard(')));
  service.applyRename(service.rename(file,source.indexOf('in dashboard')+4,'summaryGroup'));
  const renamed=service.text(file);
  assert.match(renamed,/action group summaryGroup\(workspace\)/);
  assert.match(renamed,/in summaryGroup/);
  assert.match(renamed,/disabled=\(summaryGroup\.pending\)/);
});

test('formatting retains groups and membership on a second pass', () => {
  const bad=source.replace('  action group','action group').replace('    return await','return await').replace(/\n/g,'\r\n');
  const first=formatSurface(bad);
  assert.deepEqual(first.diagnostics,[]);
  const formatted=applyFormatEdits(bad,first.edits);
  assert.equal(formatted,source.replace(/\n/g,'\r\n'));
  assert.deepEqual(formatSurface(formatted).edits,[]);
});

test('the editor worker transports group completion and original diagnostic ranges', async t => {
  const {directory,file}=scope(t);
  const worker=createAsyncLanguageService({root:directory});
  t.after(()=>worker.dispose());
  const partial=source.replace('single-flight','lat');
  worker.open(file,partial);
  const offset=partial.indexOf(') lat')+') lat'.length;
  const completion=await worker.query('completions',[file,offset]);
  assert.ok(completion.value.some(item=>item.name==='latest'));
  const diagnostics=await worker.query('diagnostics',[file]);
  const error=diagnostics.value.find(item=>item.code==='ELN-ACTION-GROUP-POLICY');
  assert.equal(partial.slice(error.start,error.start+error.length),'lat');
});

const executable = `component Grouped(load: (owner: string) => Promise<string>, review: () => Promise<void>, finish: () => void) {
  state workspace = "A";
  state message = "Ready";
  action group dashboard(workspace) single-flight

  action write(value: string) { message = value; }
  action switchOwner() { workspace = workspace === "A" ? "B" : "A"; message = "Ready " + workspace; }
  action edit() { write("Independent edit"); }

  action async refresh() in dashboard {
    try {
      const value = await load(workspace);
      await review();
      write(value);
      return value;
    } finally {
      finish();
      const writeMessage = write;
      writeMessage(message + " [cleanup]");
    }
  }

  action async other() in dashboard {
    return await load(workspace);
  }

  ui {
    section {
      p message
      p (refresh.status)
      p (refresh.status === "success" ? refresh.result : "")
      p (refresh.error instanceof Error ? refresh.error.message : "")
      p (other.status)
      button disabled=(dashboard.pending) "Refresh" => refresh()
      button "Other" => other()
      button "Edit" => edit()
      button "Switch" => switchOwner()
    }
  }
}
`;

async function mountGroup(t, text = executable, dependencies = {}) {
  const {file,directory}=scope(t);
  fs.writeFileSync(file,text);
  for (const [name, code] of Object.entries(dependencies)) fs.writeFileSync(path.join(directory,name),code);
  const outputDir=path.join(directory,'build');
  const build=buildSurfaceProject(file,{outputDir,checkOutputDir:path.join(directory,'check')});
  const module=await import(pathToFileURL(path.join(outputDir,build.entryOutput)));
  setupDOM();
  const root=new FakeNode('root'), requests=[], reviews=[];
  let cleanups=0;
  const unmount=module.mount(root,{
    load(owner){const gate=Promise.withResolvers();requests.push({owner,...gate});return gate.promise;},
    review(){const gate=Promise.withResolvers();reviews.push(gate);return gate.promise;},
    finish(){cleanups++;}
  });
  t.after(unmount);
  return {requests,reviews,unmount,cleanups:()=>cleanups,
    click:label=>findButton(root,label).click(),
    pending:()=>findButton(root,'Refresh').disabled,
    view:()=>root.descendants('p').map(node=>node.textContent)};
}

for(const reject of [false,true]){
  test(`native single-flight preserves the new owner after a stale ${reject?'rejection':'result'} at the second await`,async t=>{
    const form=await mountGroup(t);
    form.click('Refresh');
    form.requests[0].resolve('Old result');
    await flush();
    assert.equal(form.reviews.length,1);
    form.click('Other');
    form.click('Refresh');
    assert.equal(form.requests.length,1);
    assert.equal(form.pending(),true);
    form.click('Switch');
    await flush();
    assert.deepEqual(form.view(),['Ready B','idle','','','idle']);
    assert.equal(form.pending(),false);
    form.click('Refresh');
    assert.deepEqual(form.requests.map(request=>request.owner),['A','B']);
    form.click('Edit');
    form.requests[1].resolve('New result');
    await flush();
    if(reject)form.reviews[0].reject(Error('Old failure'));else form.reviews[0].resolve();
    await flush();
    assert.deepEqual(form.view(),['Independent edit','pending','','','idle']);
    assert.equal(form.cleanups(),1);
    assert.equal(form.pending(),true);
    form.reviews[1].resolve();
    await flush();
    assert.deepEqual(form.view(),['New result [cleanup]','success','New result','','idle']);
    assert.equal(form.cleanups(),2);
    assert.equal(form.pending(),false);
  });
}

test('returning to the same state owner in one turn does not revive the old action',async t=>{
  const form=await mountGroup(t);
  form.click('Refresh');
  form.requests[0].resolve('Old result');
  await flush();
  form.click('Switch');
  form.click('Switch');
  form.reviews[0].resolve();
  await flush();
  assert.deepEqual(form.view(),['Ready A','idle','','','idle']);
  assert.equal(form.cleanups(),1);
});

test('native latest retires a different group member and preserves current failures',async t=>{
  const form=await mountGroup(t,executable.replace('single-flight','latest'));
  form.click('Refresh');
  form.requests[0].resolve('Superseded');
  await flush();
  form.click('Other');
  form.reviews[0].reject(Error('Old failure'));
  await flush();
  assert.deepEqual(form.view(),['Ready','idle','','','pending']);
  form.requests[1].resolve('Current');
  await flush();
  assert.deepEqual(form.view(),['Ready','idle','','','success']);
  form.click('Refresh');
  form.requests[2].reject(Error('Current failure'));
  await flush();
  assert.deepEqual(form.view(),['Ready [cleanup]','error','','Current failure','success']);
  assert.equal(form.pending(),false);
});

test('unmount retires a managed action and its synchronous cleanup still runs',async t=>{
  const form=await mountGroup(t);
  form.click('Refresh');
  form.requests[0].resolve('Old result');
  await flush();
  form.unmount();
  form.reviews[0].reject(Error('After unmount'));
  await flush();
  assert.equal(form.cleanups(),1);
  assert.deepEqual(form.view(),[]);
});

test('an await in a computed method name belongs to the managed action',async t=>{
  const form=await mountGroup(t,executable.replace('const value = await load(workspace);',
    'const record = { [await load(workspace)]() {} };\n      const value = Object.keys(record)[0];'));
  form.click('Refresh');
  form.requests[0].resolve('key');
  await flush();
  form.reviews[0].resolve();
  await flush();
  assert.deepEqual(form.view(),['key [cleanup]','success','key','','idle']);
});

test('synchronous using disposes a retired action and preserves the replacement state',async t=>{
  const text='import type { ActionResource } from "./resource.js";\n'+executable.replace('    try {',
    `    using resource: ActionResource = {
      [Symbol.dispose]() { finish(); write("Old resource write"); }
    };
    try {`);
  const form=await mountGroup(t,text,{'resource.ts':'/// <reference lib="esnext.disposable" />\nexport type ActionResource = Disposable;'});
  form.click('Refresh');
  form.requests[0].resolve('Old result');
  await flush();
  form.click('Switch');
  form.reviews[0].resolve();
  await flush();
  assert.deepEqual(form.view(),['Ready B','idle','','','idle']);
  assert.equal(form.cleanups(),2);
});

test('a direct call can return undefined when an invocation is skipped or fails',t=>{
  const {service,file}=scope(t);
  const text=source.replace('  ui {',`  action async read() {
    const summary = await refresh();
    console.log(summary.openOrders);
  }

  ui {`);
  service.open(file,text);
  const diagnostic=service.diagnostics(file).find(item=>item.code==='TS18048');
  assert.equal(text.slice(diagnostic.start,diagnostic.start+diagnostic.length),'summary');
});

const cleanupHostTypes = `/// <reference lib="esnext.disposable" />
export interface CleanupHost {
  wait(label: string): Promise<string>;
  log(entry: string): void;
  items(labels: string[]): AsyncIterable<string>;
  syncItems(labels: string[]): Iterable<string | Promise<string>>;
  resource(label: string): AsyncDisposable;
  syncResource(label: string): Disposable;
}
`;

function cleanupComponent(body, policy = 'latest') {
  return `import type { CleanupHost } from "./host.js";

component Cleanup(host: CleanupHost) {
  state workspace = "A";
  state message = "Ready";
  action group work(workspace) ${policy}

  action write(value: string) { message = value; }
  action switchOwner() { workspace = workspace === "A" ? "B" : "A"; }

  action async run() in work {
${body}
  }

  ui {
    section {
      p message
      p (run.status)
      p (run.status === "success" ? String(run.result) : "")
      p (run.error instanceof Error ? run.error.name + ": " + run.error.message : "")
      button "Run" => run()
      button "Switch" => switchOwner()
    }
  }
}
`;
}

async function mountCleanup(t, body, policy) {
  const {file,directory}=scope(t);
  fs.writeFileSync(file,cleanupComponent(body,policy));
  fs.writeFileSync(path.join(directory,'host.ts'),cleanupHostTypes);
  const outputDir=path.join(directory,'build');
  const build=buildSurfaceProject(file,{outputDir,checkOutputDir:path.join(directory,'check')});
  const module=await import(pathToFileURL(path.join(outputDir,build.entryOutput)));
  setupDOM();
  const log=[], gates=new Map(), reported=[];
  // Each request owns one gate, settled in request order for its label.
  const gate=label=>{const gate=Promise.withResolvers();gates.set(label,[...(gates.get(label)??[]),gate]);return gate;};
  const next=label=>{
    const queue=gates.get(label);
    assert.ok(queue?.length,`no pending request for ${label}`);
    return queue.shift();
  };
  const previousReport=Object.getOwnPropertyDescriptor(globalThis,'reportError');
  globalThis.reportError=error=>reported.push(error);
  t.after(()=>previousReport?Object.defineProperty(globalThis,'reportError',previousReport):delete globalThis.reportError);
  const host={
    wait(label){log.push(`wait ${label}`);return gate(label).promise;},
    log(entry){log.push(entry);},
    items(labels){
      let index=0;
      const iterator={
        [Symbol.asyncIterator](){return iterator;},
        next(){
          log.push('next');
          const label=labels[index++];
          return label===undefined?Promise.resolve({done:true,value:undefined})
            :gate(`item ${label}`).promise.then(value=>({done:false,value}));
        },
        return(){log.push('return');return gate('return').promise.then(()=>({done:true,value:undefined}));}
      };
      return iterator;
    },
    syncItems(labels){
      let index=0;
      const iterator={
        [Symbol.iterator](){return iterator;},
        next(){const label=labels[index++];return label===undefined?{done:true,value:undefined}:{done:false,value:gate(`item ${label}`).promise};},
        return(){log.push('sync return');return {done:true,value:undefined};}
      };
      return iterator;
    },
    resource(label){return {[Symbol.asyncDispose](){log.push(`dispose ${label}`);return gate(`dispose ${label}`).promise;}};},
    syncResource(label){return {[Symbol.dispose](){log.push(`dispose ${label}`);}};}
  };
  const root=new FakeNode('root');
  const unmount=module.mount(root,{host});
  t.after(unmount);
  return {log,reported,unmount,
    resolve:(label,value=label)=>next(label).resolve(value),
    reject:(label,error)=>next(label).reject(error),
    click:label=>findButton(root,label).click(),
    view:()=>root.descendants('p').map(node=>node.textContent)};
}

async function settle(){for(let index=0;index<4;index++)await flush();}

test('retirement during an awaited finally completes the cleanup and stops after the try',async t=>{
  const form=await mountCleanup(t,`    try {
      await host.wait("load");
    } finally {
      await host.wait("release");
      host.log("released");
      write("cleanup write");
    }
    host.log("after try");
    write("after try");
    return await host.wait("next");`);
  form.click('Run');
  form.resolve('load');
  await settle();
  assert.deepEqual(form.log,['wait load','wait release']);
  form.click('Switch');
  form.resolve('release');
  await settle();
  assert.deepEqual(form.log,['wait load','wait release','released']);
  assert.deepEqual(form.view(),['Ready','idle','','']);
  assert.deepEqual(form.reported,[]);
});

for(const [name,body,reported=[]] of [
  ['a labeled break',`    block: try {
      await host.wait("load");
      break block;
    } finally {
      await host.wait("release");
    }
    host.log("after try");
    await host.wait("next");`],
  ['a loop continue',`    for (const round of [1, 2]) {
      try {
        await host.wait("load");
        continue;
      } finally {
        await host.wait("release");
      }
    }
    host.log("after try");`],
  ['an error caught outside',`    try {
      try {
        await host.wait("load");
        throw new Error("Failed");
      } finally {
        await host.wait("release");
      }
    } catch {
      host.log("after try");
    }`,['Failed']]
]){
  test(`retirement during cleanup stops ${name} from reaching ordinary code`,async t=>{
    const form=await mountCleanup(t,body);
    form.click('Run');
    form.resolve('load');
    await settle();
    assert.deepEqual(form.log,['wait load','wait release']);
    form.click('Switch');
    form.resolve('release');
    await settle();
    assert.deepEqual(form.log,['wait load','wait release']);
    // An error thrown by ordinary code is reported; nothing else escapes.
    assert.deepEqual(form.reported.map(error=>error.message),reported);
    assert.deepEqual(form.view(),['Ready','idle','','']);
  });
}

test('a retired cleanup failure is rethrown in a microtask without reportError',async t=>{
  const form=await mountCleanup(t,`    try {
      await host.wait("load");
    } finally {
      await host.wait("release");
    }`);
  delete globalThis.reportError;
  const uncaught=[], schedule=globalThis.queueMicrotask;
  globalThis.queueMicrotask=task=>schedule(()=>{try{task();}catch(error){uncaught.push(error);}});
  t.after(()=>{globalThis.queueMicrotask=schedule;});
  form.click('Run');
  form.click('Switch');
  form.resolve('load');
  await settle();
  form.reject('release',Error('Release failed'));
  await settle();
  globalThis.queueMicrotask=schedule;
  assert.deepEqual(uncaught.map(error=>error.message),['Release failed']);
});

test('a for await loop inside finally is cleanup and finishes after retirement',async t=>{
  const form=await mountCleanup(t,`    try {
      await host.wait("load");
    } finally {
      for await (const item of host.items(["a", "b"])) host.log("drain " + item);
    }
    host.log("after try");`);
  form.click('Run');
  form.click('Switch');
  form.resolve('load');
  await settle();
  form.resolve('item a','A');
  await settle();
  form.resolve('item b','B');
  await settle();
  assert.deepEqual(form.log,['wait load','next','drain A','next','drain B','next']);
});

test('a current invocation awaits its finally and records the result',async t=>{
  const form=await mountCleanup(t,`    try {
      return await host.wait("load");
    } finally {
      await host.wait("release");
      write("cleaned");
    }`);
  form.click('Run');
  form.resolve('load','Loaded');
  await settle();
  assert.deepEqual(form.view(),['Ready','pending','','']);
  form.resolve('release');
  await settle();
  assert.deepEqual(form.view(),['cleaned','success','Loaded','']);
});

test('retirement at an ordinary await still runs the awaited finally to completion',async t=>{
  const form=await mountCleanup(t,`    try {
      await host.wait("load");
      host.log("loaded");
    } finally {
      host.log("cleanup start");
      await host.wait("release");
      host.log("cleanup end");
    }`);
  form.click('Run');
  form.click('Switch');
  form.reject('load',Error('Stale failure'));
  await settle();
  assert.deepEqual(form.log,['wait load','cleanup start','wait release']);
  form.resolve('release');
  await settle();
  assert.deepEqual(form.log,['wait load','cleanup start','wait release','cleanup end']);
  assert.deepEqual(form.reported,[]);
});

test('a retired cleanup failure is reported without touching the replacement',async t=>{
  const form=await mountCleanup(t,`    try {
      return await host.wait("load");
    } finally {
      await host.wait("release");
    }`);
  form.click('Run');
  form.click('Switch');
  form.resolve('load');
  await settle();
  form.click('Run');
  form.reject('release',Error('Release failed'));
  await settle();
  assert.equal(form.reported.length,1);
  assert.equal(form.reported[0].message,'Release failed');
  assert.deepEqual(form.view(),['Ready','pending','','']);
});

test('a stale failure passing through a retired cleanup is not reported',async t=>{
  const form=await mountCleanup(t,`    try {
      return await host.wait("load");
    } finally {
      await host.wait("release");
    }`);
  form.click('Run');
  form.reject('load',Error('Request failed'));
  await settle();
  form.click('Switch');
  form.resolve('release');
  await settle();
  assert.deepEqual(form.reported,[]);
  assert.deepEqual(form.view(),['Ready','idle','','']);
});

for(const [name,body,reported=[]] of [
  ['finally',`    try {
      try {
        await host.wait("load");
        (host as unknown as {missing(): void}).missing();
      } finally {
        await host.wait("release");
      }
    } catch {
      host.log("caught");
    }`],
  ['await using',`    try {
      await using resource = host.resource("release");
      await host.wait("load");
      (host as unknown as {missing(): void}).missing();
    } catch {
      host.log("caught");
    }`]
]){
  test(`a programming error pending in a retired ${name} cleanup is reported once`,async t=>{
    const form=await mountCleanup(t,body);
    form.click('Run');
    form.resolve('load');
    await settle();
    form.click('Switch');
    form.resolve(name==='finally'?'release':'dispose release');
    await settle();
    assert.equal(form.log.includes('caught'),false);
    assert.equal(form.reported.length,1);
    assert.ok(form.reported[0] instanceof TypeError);
    assert.deepEqual(form.view(),['Ready','idle','','']);
  });
}

test('a current cleanup failure becomes the member error',async t=>{
  const form=await mountCleanup(t,`    try {
      return await host.wait("load");
    } finally {
      await host.wait("release");
    }`);
  form.click('Run');
  form.resolve('load');
  await settle();
  form.reject('release',Error('Release failed'));
  await settle();
  assert.deepEqual(form.view(),['Ready','error','','Error: Release failed']);
  assert.deepEqual(form.reported,[]);
});

test('for await consumes values and does not close an exhausted iterator',async t=>{
  const form=await mountCleanup(t,`    let joined = "";
    for await (const item of host.items(["a", "b"])) joined += item;
    return joined;`);
  form.click('Run');
  form.resolve('item a','A');
  await settle();
  form.resolve('item b','B');
  await settle();
  assert.deepEqual(form.view(),['Ready','success','AB','']);
  assert.deepEqual(form.log,['next','next','next']);
});

test('retirement during for await closes the iterator before unwinding',async t=>{
  const form=await mountCleanup(t,`    try {
      for await (const item of host.items(["a", "b"])) {
        host.log("item " + item);
        write(item);
      }
      host.log("after loop");
    } finally {
      host.log("finally");
    }`);
  form.click('Run');
  form.resolve('item a','A');
  await settle();
  assert.deepEqual(form.log,['next','item A','next']);
  form.click('Switch');
  form.resolve('item b','B');
  await settle();
  assert.deepEqual(form.log,['next','item A','next','return']);
  form.click('Switch');
  form.resolve('return');
  await settle();
  assert.deepEqual(form.log,['next','item A','next','return','finally']);
  assert.deepEqual(form.view(),['A','idle','','']);
});

test('break, labeled continue and destructuring follow for await semantics',async t=>{
  const form=await mountCleanup(t,`    const seen: string[] = [];
    let first = "";
    outer: for await ([first] of host.items(["x1", "y2", "z3"])) {
      if (first === "y") continue outer;
      seen.push(first);
      if (first === "z") break;
    }
    host.log("after");
    return seen.join(",");`);
  form.click('Run');
  for(const [label,value] of [['item x1','x1'],['item y2','y2'],['item z3','z3']]){form.resolve(label,value);await settle();}
  assert.deepEqual(form.log,['next','next','next','return']);
  form.resolve('return');
  await settle();
  assert.equal(form.log.at(-1),'after');
  assert.deepEqual(form.view(),['Ready','success','x,z','']);
});

test('a failing loop body closes the iterator and keeps the body error',async t=>{
  const form=await mountCleanup(t,`    for await (const item of host.items(["a"])) {
      throw new Error("Body failed " + item);
    }`);
  form.click('Run');
  form.resolve('item a','a');
  await settle();
  form.reject('return',Error('Return failed'));
  await settle();
  assert.deepEqual(form.log,['next','return']);
  assert.deepEqual(form.view(),['Ready','error','','Error: Body failed a']);
});

test('return inside for await closes the iterator before completing',async t=>{
  const form=await mountCleanup(t,`    for await (const item of host.items(["a", "b"])) return item;
    return "unreachable";`);
  form.click('Run');
  form.resolve('item a','A');
  await settle();
  assert.deepEqual(form.log,['next','return']);
  assert.deepEqual(form.view(),['Ready','pending','','']);
  form.resolve('return');
  await settle();
  assert.deepEqual(form.view(),['Ready','success','A','']);
});

test('a failed next does not close the iterator',async t=>{
  const form=await mountCleanup(t,`    for await (const item of host.items(["a"])) host.log(item);`);
  form.click('Run');
  form.reject('item a',Error('Next failed'));
  await settle();
  assert.deepEqual(form.log,['next']);
  assert.deepEqual(form.view(),['Ready','error','','Error: Next failed']);
});

test('a rejected value from a synchronous iterable closes that iterable',async t=>{
  const form=await mountCleanup(t,`    for await (const item of host.syncItems(["a", "b"])) host.log(item);`);
  form.click('Run');
  form.reject('item a',Error('Value failed'));
  await settle();
  assert.deepEqual(form.log,['sync return']);
  assert.deepEqual(form.view(),['Ready','error','','Error: Value failed']);
});

test('for await over a synchronous iterable awaits each value',async t=>{
  const form=await mountCleanup(t,`    let joined = "";
    for await (const item of host.syncItems(["a", "b"])) {
      joined += item;
      if (item === "B") break;
    }
    return joined;`);
  form.click('Run');
  form.resolve('item a','A');
  await settle();
  form.resolve('item b','B');
  await settle();
  assert.deepEqual(form.view(),['Ready','success','AB','']);
  assert.deepEqual(form.log,['sync return']);
});

test('await using disposes mixed resources in reverse order and awaits each one',async t=>{
  const form=await mountCleanup(t,`    {
      await using first = host.resource("first");
      using second = host.syncResource("second");
      await using third = host.resource("third");
      host.log("body");
    }
    host.log("after block");
    return "done";`);
  form.click('Run');
  await settle();
  assert.deepEqual(form.log,['body','dispose third']);
  form.resolve('dispose third');
  await settle();
  assert.deepEqual(form.log,['body','dispose third','dispose second','dispose first']);
  form.resolve('dispose first');
  await settle();
  assert.equal(form.log.at(-1),'after block');
  assert.deepEqual(form.view(),['Ready','success','done','']);
});

test('retirement disposes await using resources and reports their failures',async t=>{
  const form=await mountCleanup(t,`    await using lease = host.resource("lease");
    await host.wait("load");
    host.log("loaded");`);
  form.click('Run');
  form.click('Switch');
  form.resolve('load');
  await settle();
  assert.deepEqual(form.log,['wait load','dispose lease']);
  form.reject('dispose lease',Error('Dispose failed'));
  await settle();
  assert.equal(form.reported.length,1);
  assert.equal(form.reported[0].message,'Dispose failed');
  assert.deepEqual(form.view(),['Ready','idle','','']);
});

test('await using falls back to Symbol.dispose and still awaits disposal',async t=>{
  const form=await mountCleanup(t,`    {
      await using resource = host.syncResource("sync");
      host.log("body");
    }
    host.log("after block");
    return "done";`);
  form.click('Run');
  assert.deepEqual(form.log,['body','dispose sync']);
  await settle();
  assert.deepEqual(form.log,['body','dispose sync','after block']);
  assert.deepEqual(form.view(),['Ready','success','done','']);
});

test('await using in a for await head disposes each resource before the next step',async t=>{
  const form=await mountCleanup(t,`    async function* resources() {
      yield host.resource("a");
      yield host.resource("b");
    }
    for await (await using resource of resources()) host.log("use");
    return "done";`);
  form.click('Run');
  await settle();
  assert.deepEqual(form.log,['use','dispose a']);
  form.resolve('dispose a');
  await settle();
  assert.deepEqual(form.log,['use','dispose a','use','dispose b']);
  form.resolve('dispose b');
  await settle();
  assert.deepEqual(form.view(),['Ready','success','done','']);
});

test('retirement during disposal finishes every resource and stops after the block',async t=>{
  const form=await mountCleanup(t,`    {
      await using first = host.resource("first");
      await using second = host.resource("second");
    }
    host.log("after block");
    await host.wait("next");`);
  form.click('Run');
  await settle();
  assert.deepEqual(form.log,['dispose second']);
  form.click('Switch');
  form.resolve('dispose second');
  await settle();
  assert.deepEqual(form.log,['dispose second','dispose first']);
  form.resolve('dispose first');
  await settle();
  assert.deepEqual(form.log,['dispose second','dispose first']);
  assert.deepEqual(form.reported,[]);
});

test('a disposal failure after a body failure produces SuppressedError',async t=>{
  const form=await mountCleanup(t,`    await using lease = host.resource("lease");
    await using empty = null;
    throw new Error("Body failed");`);
  form.click('Run');
  await settle();
  form.reject('dispose lease',Error('Dispose failed'));
  await settle();
  assert.deepEqual(form.view(),['Ready','error','','SuppressedError: An error was suppressed during disposal']);
});

test('await using in a loop head keeps an explicit diagnostic in the editor and the build',t=>{
  const {service,file,directory}=scope(t);
  const text=cleanupComponent(`    for (await using item of [host.resource("a")]) host.log("x");`);
  service.open(file,text);
  const diagnostic=service.diagnostics(file).find(item=>item.code==='ELN-ACTION-GROUP-SUSPENSION');
  assert.ok(diagnostic);
  assert.equal(text.slice(diagnostic.start,diagnostic.start+diagnostic.length),'await');
  fs.writeFileSync(file,text);
  fs.writeFileSync(path.join(directory,'host.ts'),cleanupHostTypes);
  assert.throws(()=>buildSurfaceProject(file,{outputDir:path.join(directory,'build'),checkOutputDir:path.join(directory,'check')}),error=>{
    const reported=error.diagnostics?.find(item=>item.code==='ELN-ACTION-GROUP-SUSPENSION');
    return reported&&text.slice(reported.start,reported.start+reported.length)==='await';
  });
});
