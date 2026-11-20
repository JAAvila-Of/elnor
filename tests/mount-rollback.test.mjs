import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';
import {generate} from '../src/compiler.mjs';
import {typecheckGraph} from '../src/checker.mjs';
import {cell,scope,effect,text,button,input,when,repeat,mountBoundary,mountComponent} from '../src/runtime.mjs';
import {setupDOM,FakeNode,tick} from './fake-dom.mjs';

test('a failing first effect run removes subscriptions and queued work',async () => {
  const owner = scope(), value = cell(0), failure = new Error('effect failed');
  let runs = 0;
  assert.throws(() => effect(() => {
    value.value; runs++;
    if (runs === 1) { value.value = 1; throw failure; }
  },owner),error => error === failure);
  await tick(); assert.equal(runs,1);
  value.value = 2; await tick(); assert.equal(runs,1); owner.dispose();
});

test('scope disposal attempts every disposer once even when some throw',() => {
  const owner = scope(), calls = [], a = new Error('a'), b = new Error('b');
  owner.own(() => {calls.push('first');});
  owner.own(() => {calls.push('second'); throw a;});
  owner.own(() => {calls.push('third'); throw b;});
  assert.throws(() => owner.dispose(),error => {
    assert.ok(error instanceof AggregateError); assert.deepEqual(error.errors,[b,a]); return true;
  });
  assert.deepEqual(calls,['third','second','first']);
  owner.dispose(); assert.deepEqual(calls,['third','second','first']);
  owner.own(() => calls.push('late')); assert.equal(calls.at(-1),'late');
});

test('effects created in an already disposed scope never start',async () => {
  const owner = scope(), value = cell(0); let runs = 0;
  owner.dispose(); effect(() => {value.value; runs++;},owner);
  value.value = 1; await tick(); assert.equal(runs,0);
});

test('effect does not resubscribe after its owner is disposed during the first run',async () => {
  const owner = scope(), value = cell(0); let runs = 0;
  effect(() => {runs++; owner.dispose(); value.value;},owner);
  value.value = 1; await tick(); assert.equal(runs,1);
});

test('failed mount preserves prior nodes and removes new effects, listeners and nodes',async () => {
  setupDOM(); const root = new FakeNode('root'), prior = new FakeNode('aside'); root.append(prior);
  const value = cell('Before'), failure = new Error('render failed');
  let reads = 0, clicks = 0, writes = 0, control, field;
  const read = () => {reads++; return value.value;};
  assert.throws(() => mountBoundary(root,(target,owner) => {
    control = button(target,read,() => clicks++,owner);
    field = input(target,'Value',read,() => writes++,owner);
    value.value = 'Queued'; throw failure;
  }),error => error === failure);
  assert.deepEqual(root.childNodes,[prior]);
  const previousReads = reads;
  control.click(); field.value = 'Changed'; field.dispatch('input');
  assert.equal(clicks,0); assert.equal(writes,0);
  await tick(); value.value = 'After'; await tick(); assert.equal(reads,previousReads);
  assert.equal(control.parentNode,null);
});

test('cleanup failures preserve the mount error as cause and still remove nodes',() => {
  setupDOM(); const root = new FakeNode('root'), prior = new FakeNode('aside'); root.append(prior);
  const original = new Error('original'), cleanup = new Error('cleanup'); let cleaned = false;
  assert.throws(() => mountBoundary(root,(target,owner) => {
    button(target,() => 'Created',() => {},owner);
    owner.own(() => {cleaned=true;}); owner.own(() => {throw cleanup;}); throw original;
  }),error => {
    assert.ok(error instanceof AggregateError); assert.equal(error.cause,original);
    assert.deepEqual(error.errors,[original,cleanup]); return true;
  });
  assert.ok(cleaned); assert.deepEqual(root.childNodes,[prior]);
});

test('normal disposal removes nodes even if a user disposer throws',() => {
  setupDOM(); const root = new FakeNode('root'), failure = new Error('dispose'); let control;
  const dispose = mountBoundary(root,(target,owner) => {
    control = button(target,() => 'Created',() => {},owner);
    owner.own(() => {throw failure;});
  });
  assert.throws(dispose,error => error === failure);
  assert.equal(root.childNodes.length,0); assert.equal(control.listeners.click.length,0);
  assert.doesNotThrow(dispose);
});

test('failed conditional fragment cleans its detached resources',async () => {
  setupDOM(); const root = new FakeNode('root'), value = cell('Label'), failure = new Error('part');
  let control, reads = 0, clicks = 0;
  assert.throws(() => mountBoundary(root,(target,owner) => {
    when(target,() => true,(part,partOwner) => {
      control = button(part,() => {reads++; return value.value;},() => clicks++,partOwner);
      throw failure;
    },owner);
  }),error => error === failure);
  assert.equal(root.childNodes.length,0); assert.equal(control.parentNode,null);
  control.click(); assert.equal(clicks,0);
  value.value = 'After'; await tick(); assert.equal(reads,1);
});

for (const failureMode of ['duplicate key','row build']) {
  test(`failed list mount cleans every partially built row: ${failureMode}`,async () => {
    setupDOM(); const root = new FakeNode('root'), value = cell('Label'), failure = new Error('row');
    const controls = []; let reads = 0, clicks = 0;
    const rows = failureMode === 'duplicate key' ? [1,1] : [1,2];
    assert.throws(() => mountBoundary(root,(target,owner) => {
      repeat(target,() => rows,id => id,(item,part,partOwner) => {
        controls.push(button(part,() => {reads++; return value.value;},() => clicks++,partOwner));
        if (failureMode === 'row build' && item.value === 2) throw failure;
      },owner);
    }),error => failureMode === 'duplicate key' ? /duplicate each key/.test(error.message) : error === failure);
    assert.equal(root.childNodes.length,0);
    const before = reads; controls.forEach(control => control.click()); assert.equal(clicks,0);
    value.value = 'After'; await tick(); assert.equal(reads,before);
    assert.ok(controls.every(control => control.parentNode === null));
  });
}

test('parent rollback disposes an already mounted child component',async () => {
  setupDOM(); const root = new FakeNode('root'), value = cell('Child'), failure = new Error('parent');
  let reads = 0, clicks = 0, control;
  const child = target => mountBoundary(target,(part,owner) => {
    control = button(part,() => {reads++; return value.value;},() => clicks++,owner);
  });
  assert.throws(() => mountBoundary(root,(target,owner) => {
    mountComponent(target,child,{}, {}, {},owner); throw failure;
  }),error => error === failure);
  assert.equal(root.childNodes.length,0); control.click(); assert.equal(clicks,0);
  value.value = 'After'; await tick(); assert.equal(reads,1);
});

test('standalone list and conditional initial failures remove their anchors',() => {
  setupDOM(); const root = new FakeNode('root'), failure = new Error('standalone');
  assert.throws(() => when(root,() => true,() => {throw failure;}),error => error === failure);
  assert.equal(root.childNodes.length,0);
  assert.throws(() => repeat(root,() => [1,1],id => id,(item,part,partOwner) => text(part,'span',() => item.value,partOwner)),/duplicate each key/);
  assert.equal(root.childNodes.length,0);
});

test('successful mount remains usable after an independent mount fails',async () => {
  setupDOM(); const root = new FakeNode('root'), value = cell('Before');
  const dispose = mountBoundary(root,(target,owner) => text(target,'span',() => value.value,owner));
  const prior = root.childNodes[0], failure = new Error('second mount');
  assert.throws(() => mountBoundary(root,(target,owner) => {
    button(target,() => 'Temporary',() => {},owner); throw failure;
  }),error => error === failure);
  assert.deepEqual(root.childNodes,[prior]);
  value.value = 'After'; await tick(); assert.equal(root.textContent,'After');
  dispose(); assert.equal(root.childNodes.length,0);
});

async function generatedFixture(t,source,dependencies = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'elnor-rollback-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const graph = new Map();
  for (const [name,text] of Object.entries({Main:source,...dependencies})) {
    const file = path.join(root,name+'.eln'); graph.set(file,parseSurface(text,file));
  }
  assert.deepEqual(typecheckGraph(graph,path.join(root,'check')),[]);
  fs.copyFileSync('src/runtime.mjs',path.join(root,'runtime.mjs'));
  for (const ir of graph.values()) fs.writeFileSync(path.join(root,ir.name+'.mjs'),generate(ir));
  const {mount} = await import(pathToFileURL(path.join(root,'Main.mjs')).href);
  // Signals must come from the same runtime instance as the generated effects.
  const runtime = await import(pathToFileURL(path.join(root,'runtime.mjs')).href);
  return {mount,runtime,file:path.join(root,'Main.eln')};
}

test('generated ELN-INIT failure releases earlier calc effects and permits a safe retry',async t => {
  const source = 'component Main(read: () => number, shouldFail: boolean) {\n  calc earlier = read();\n  calc broken = shouldFail ? readLater() : earlier;\n  calc later = earlier * 2;\n  action readLater() { return later; }\n  ui {\n    span broken\n  }\n}';
  const {mount,runtime,file} = await generatedFixture(t,source);
  setupDOM(); const root = new FakeNode('root'), prior = new FakeNode('aside'); root.append(prior);
  const value = runtime.cell(3); let reads = 0;
  const read = () => {reads++; return value.value;};
  assert.throws(() => mount(root,{read,shouldFail:true}),error => {
    assert.equal(error.code,'ELN-INIT'); assert.equal(error.binding,'later'); assert.equal(error.file,file); return true;
  });
  assert.deepEqual(root.childNodes,[prior]); value.value = 4; await tick(); assert.equal(reads,1);
  const dispose = mount(root,{read,shouldFail:false}); assert.equal(root.textContent,'4');
  value.value = 5; await tick(); assert.equal(root.textContent,'5');
  dispose(); const before = reads; value.value = 6; await tick(); assert.equal(reads,before);
  assert.deepEqual(root.childNodes,[prior]);
});

test('generated parent render failure cleans child, slot effects and event listeners',async t => {
  const source = 'import Child from "./Child.eln";\ncomponent Main(read: () => number, fail: () => string, clicked: () => void) {\n  ui {\n    Child value=(read()) {\n      on selected() => clicked()\n      span read()\n    }\n    span fail()\n  }\n}';
  const child = 'component Child(value: number) {\n  event selected()\n  ui {\n    button "Hit" => emit.selected()\n    span value\n    slot\n  }\n}';
  const {mount,runtime} = await generatedFixture(t,source,{Child:child});
  setupDOM(); const root = new FakeNode('root'), value = runtime.cell(3), failure = new Error('render');
  let reads = 0, clicks = 0, control;
  assert.throws(() => mount(root,{
    read:() => {reads++; return value.value;}, clicked:() => clicks++,
    fail:() => {control=root.descendants('button')[0]; throw failure;},
  }),error => error === failure);
  assert.equal(root.childNodes.length,0); control.click(); assert.equal(clicks,0);
  const before = reads; value.value = 4; await tick(); assert.equal(reads,before);
});

test('generated list failure cleans completed and failing rows',async t => {
  const source = 'component Main(read: () => number, crash: (item: number) => string, clicked: () => void) {\n  ui {\n    each item in [1,2] by item {\n      button "Row" => clicked()\n      span read() + crash(item)\n    }\n  }\n}';
  const {mount,runtime} = await generatedFixture(t,source);
  setupDOM(); const root = new FakeNode('root'), value = runtime.cell(3), failure = new Error('row');
  const append = FakeNode.prototype.append, controls = []; let reads = 0, clicks = 0;
  // Observe the mounted controls, including clones, rather than detached
  // allocation prototypes that never own a running listener or effect.
  FakeNode.prototype.append = function(...nodes){for(const node of nodes)if(node.tag==='button')controls.push(node);return append.apply(this,nodes);};
  t.after(()=>{FakeNode.prototype.append=append;});
  assert.throws(() => mount(root,{
    read:() => {reads++; return value.value;}, clicked:() => clicks++,
    crash:item => {if(item===2)throw failure;return 'Ready';},
  }),error => error === failure);
  assert.equal(root.childNodes.length,0); assert.equal(controls.length,2);
  controls.forEach(control => control.click()); assert.equal(clicks,0);
  const before = reads; value.value = 4; await tick(); assert.equal(reads,before);
});
