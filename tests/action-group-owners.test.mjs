// Action group owners may be an expression or a list. The owner key changes
// identity only when one of its elements changes, compared with Object.is.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {setImmediate as flush} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {parseSurface} from '../src/parser.mjs';
import {checkSurfaceProject} from '../src/project-check.mjs';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {FakeNode, findButton, setupDOM} from './fake-dom.mjs';

function scope(t) {
  const temp = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temp, 'elnor-action-owner-'));
  t.after(() => {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved), temp);
    assert.ok(path.basename(resolved).startsWith('elnor-action-owner-'));
    fs.rmSync(resolved, {recursive: true, force: true});
  });
  return {directory, file: path.join(directory, 'Owners.eln')};
}

const hostTypes = `export interface OwnerHost {
  load(label: string): Promise<string>;
}
`;

const component = owner => `import type { OwnerHost } from "./host.js";

component Owners(host: OwnerHost) {
  state customer = {id: 1, name: "Ada"};
  state filter = "open";
  action group work(${owner}) latest

  action async load() in work {
    return await host.load(customer.name);
  }

  action rename() { customer = {...customer, name: "Grace"}; }
  action switchCustomer() { customer = {id: 2, name: "Linus"}; }
  action refilter() { filter = "closed"; }

  ui {
    section {
      p (load.status)
      button "Load" => load()
      button "Rename" => rename()
      button "Switch" => switchCustomer()
      button "Refilter" => refilter()
    }
  }
}
`;

async function mount(t, owner) {
  const {file, directory} = scope(t);
  fs.writeFileSync(file, component(owner));
  fs.writeFileSync(path.join(directory, 'host.ts'), hostTypes);
  const outputDir = path.join(directory, 'build');
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check')});
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const root = new FakeNode('root'), gates = [];
  t.after(module.mount(root, {host: {load() { const gate = Promise.withResolvers(); gates.push(gate); return gate.promise; }}}));
  return {
    gates,
    click: label => findButton(root, label).click(),
    status: () => root.descendants('p')[0].textContent
  };
}

async function outcome(t, owner, change) {
  const view = await mount(t, owner);
  view.click('Load');
  view.click(change);
  await flush();
  view.gates[0].resolve('done');
  await flush();
  await flush();
  return view.status();
}

test('owners accept an expression and a list of expressions', () => {
  const ir = parseSurface(component('customer.id, filter'));
  assert.deepEqual(ir.actionGroups[0].owners.map(owner => owner.expr), ['customer.id', 'filter']);
  const single = parseSurface(component('customer.id'));
  assert.deepEqual(single.actionGroups[0].owners.map(owner => owner.expr), ['customer.id']);
  assert.throws(() => parseSurface(component('')), {code: 'ELN-ACTION-GROUP-OWNER'});
  assert.throws(() => parseSurface(component('unknownOwner')), {code: 'ELN-ACTION-GROUP-OWNER'});
  assert.throws(() => parseSurface(component('customer.id, unknownOwner')), {code: 'ELN-ACTION-GROUP-OWNER'});
});

test('an expression owner keeps the invocation when an equal key is recomputed', {timeout: 10000}, async t => {
  assert.equal(await outcome(t, 'customer.id', 'Rename'), 'success');
});

test('an expression owner retires the invocation when the key changes', {timeout: 10000}, async t => {
  assert.equal(await outcome(t, 'customer.id', 'Switch'), 'idle');
});

test('a direct state owner still retires on every assignment', {timeout: 10000}, async t => {
  assert.equal(await outcome(t, 'customer', 'Rename'), 'idle');
});

test('a list owner retires when any element changes and keeps equal keys', {timeout: 10000}, async t => {
  assert.equal(await outcome(t, 'customer.id, filter', 'Refilter'), 'idle');
  assert.equal(await outcome(t, 'customer.id, filter', 'Rename'), 'success');
});

test('the editor and the checker type owner expressions', t => {
  const {file, directory} = scope(t);
  fs.writeFileSync(path.join(directory, 'host.ts'), hostTypes);
  const service = createSurfaceLanguageService({root: directory});
  t.after(() => service.dispose());
  const valid = component('customer.id, filter');
  service.open(file, valid);
  assert.deepEqual(service.diagnostics(file), []);
  fs.writeFileSync(file, valid);
  const outputDir = path.join(directory, 'check');
  assert.deepEqual(checkSurfaceProject(file, {outputDir}).diagnostics, []);
  const typo = component('customer.missing');
  service.open(file, typo);
  const error = service.diagnostics(file).find(item => item.code === 'TS2339');
  assert.ok(error, 'editor reports the unknown property');
  assert.equal(typo.slice(error.start, error.start + error.length), 'missing');
  fs.writeFileSync(file, typo);
  assert.ok(checkSurfaceProject(file, {outputDir}).diagnostics.some(item => item.code === 'TS2339' && /missing/.test(item.message)));
});
