// Functions and new in UI expressions, calcs, initializers and props of the
// region backend. The general renderer, built with regionBackend: false, is the
// oracle, including closures that escape an expression and run after their row
// is removed or the component unmounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';
import {analyzeRegion} from '../src/region-compiler.mjs';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {FakeNode, setupDOM} from './fake-dom.mjs';

const types = `export interface Task { id: number; title: string; done: boolean; tags: string[] }
export interface Group { id: number; name: string; ids: number[] }
`;

const label = `component Label(format: (value: string) => string, text: string) {
  ui {
    span (format(text))
  }
}
`;

const board = `import type { Task, Group } from "./types.js";
import Label from "./Label.eln";

component Board(keep: (read: () => string) => void) {
  state tasks: Task[] = [{id: 1, title: "write", done: false, tags: ["a", "b"]}, {id: 2, title: "test", done: true, tags: ["c"]}, {id: 3, title: "ship", done: false, tags: []}];
  state groups: Group[] = [{id: 10, name: "now", ids: [1, 2]}, {id: 20, name: "later", ids: [3]}];
  state suffix = "!";
  state started = [3, 1, 2].map(value => value * 2).join("-");
  calc open = tasks.filter(task => !task.done).map(task => task.title);
  calc byId = tasks.reduce((index, task) => ({...index, [task.id]: task.title}), {} as Record<number, string>);
  action rename() { tasks = tasks.map(task => ({...task, title: task.title + suffix})); }
  action drop() { tasks = tasks.slice(1); groups = groups.map(group => ({...group, ids: group.ids.filter(id => id !== 1)})); }
  action shout() { suffix = suffix + "!"; }

  ui {
    section {
      p started
      p (open.join(","))
      p (Object.values(byId).join("/"))
      p (Object.entries(tasks.reduce((counts, task) => { counts[String(task.done)] = (counts[String(task.done)] ?? 0) + 1; return counts; }, {} as Record<string, number>)).join(";"))
      p (new Intl.NumberFormat("en-US").format(tasks.length * 1000))
      p ([...tasks].sort((a, b) => b.id - a.id).map(task => task.title).join(" "))
      button "Rename" => rename()
      button "Drop" => drop()
      button "Shout" => shout()
      Label format=((value: string) => value.toUpperCase() + suffix) text=(open[0] ?? "none")
      each task in tasks by task.id {
        div {
          p (task.tags.map(tag => "#" + tag).join(" ") || "-")
          p (keep(() => task.title + suffix) ?? task.title)
        }
      }
      each group in groups by group.id {
        div {
          p (group.ids.map(id => tasks.find(task => task.id === id)?.title ?? "?").map(title => group.name + ":" + title).join(","))
        }
      }
    }
  }
}
`;

test('UI expressions with functions and new keep the sequential region backend', () => {
  const plan = analyzeRegion(parseSurface(board, path.resolve('Board.eln')), {components: new Map()});
  assert.ok(plan.eligible || !JSON.stringify(plan).includes('lexical-escape'), JSON.stringify(plan.sequentialFailures ?? plan.failures));
});

function serialize(node) {
  if (node.tag === '#comment') return '';
  if (node.tag === '#text') return node.textContent;
  const inner = node.childNodes.map(serialize).join('');
  if (node.tag === 'fragment' || node.tag === 'root') return inner;
  return `<${node.tag}>${node._text ?? ''}${inner}</${node.tag}>`;
}

async function run(t, region) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-closures-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.writeFileSync(path.join(directory, 'types.ts'), types);
  fs.writeFileSync(path.join(directory, 'Label.eln'), label);
  const file = path.join(directory, 'Board.eln');
  fs.writeFileSync(file, board);
  const outputDir = path.join(directory, 'build');
  // regionBackend: false builds the same components with the general renderer.
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check'), regionBackend: region});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  assert.equal(/region-runtime/.test(output), region);
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const readers = [];
  const root = new FakeNode('root');
  const unmount = module.mount(root, {keep: read => { readers.push(read); return undefined; }});
  const settle = async () => { for (let index = 0; index < 4; index++) await new Promise(resolve => setImmediate(resolve)); };
  const click = async label => { root.descendants('button').find(node => node.textContent === label).click(); await settle(); };
  const views = [serialize(root)];
  const firstReader = readers[0];
  for (const label of ['Rename', 'Shout', 'Drop', 'Shout']) { await click(label); views.push(serialize(root)); }
  const afterDrop = firstReader();
  const latest = readers.at(-1);
  unmount();
  return {views, afterDrop, afterUnmount: [firstReader(), latest()], readers: readers.length > 0};
}

test('functions and new in expressions render like the general renderer', {timeout: 30000}, async t => {
  const oracle = await run(t, false);
  assert.ok(oracle.readers);
  assert.deepEqual(await run(t, true), oracle);
});

// Actions referenced from calcs, initializers and UI expressions.
const helpers = `component Helpers(register: (publish: (value: string) => void) => () => string) {
  state first = "Ada";
  state last = "Lovelace";
  state published = "";
  state reader = register(publish);
  calc full = format(first, last);
  action format(a: string, b: string) { return a + " " + b; }
  action publish(value: string) { published = value + ":" + full; }
  action rename() { first = first + "!"; }

  ui {
    section {
      p full
      p published
      p (format(last, first))
      p (reader())
      button "Rename" => rename()
    }
  }
}
`;

async function runHelpers(t, region) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-helpers-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'Helpers.eln');
  fs.writeFileSync(file, helpers);
  const outputDir = path.join(directory, 'build');
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check'), regionBackend: region});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  assert.equal(/region-runtime/.test(output), region);
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  let publish;
  const root = new FakeNode('root');
  const unmount = module.mount(root, {register: callback => { publish = callback; return () => 'registered'; }});
  const settle = async () => { for (let index = 0; index < 4; index++) await new Promise(resolve => setImmediate(resolve)); };
  const views = [serialize(root)];
  publish('one'); await settle(); views.push(serialize(root));
  root.descendants('button')[0].click(); await settle(); views.push(serialize(root));
  publish('two'); await settle(); views.push(serialize(root));
  unmount();
  publish('late');
  return views;
}

test('actions used from calcs, initializers and expressions behave like the general renderer', {timeout: 30000}, async t => {
  const oracle = await runHelpers(t, false);
  assert.notEqual(oracle[1], oracle[0]);
  assert.deepEqual(await runHelpers(t, true), oracle);
});

// Bodies whose downlevel output needs TypeScript helpers, such as using.
const resourceTypes = `/// <reference lib="esnext.disposable" />
export interface Resource extends Disposable, AsyncDisposable { name: string }
`;

const resources = `import type { Resource } from "./resource.js";

component Resources(open: (name: string) => Resource) {
  state log = "";
  calc size = describe(log);
  action describe(value: string) { return value.length; }
  action run() {
    using resource = open("sync");
    log = log + resource.name + ";";
  }
  action async runAsync() {
    await using resource = open("async");
    await Promise.resolve();
    log = log + resource.name + ";";
  }

  ui {
    section {
      p log
      p size
      button "Run" => run()
      button "Async" => runAsync()
    }
  }
}
`;

async function runResources(t, region) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-resources-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'Resources.eln');
  fs.writeFileSync(path.join(directory, 'resource.ts'), resourceTypes);
  fs.writeFileSync(file, resources);
  const outputDir = path.join(directory, 'build');
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check'), regionBackend: region});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  assert.equal(/region-runtime/.test(output), region);
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const events = [];
  const root = new FakeNode('root');
  const unmount = module.mount(root, {open: name => ({name, [Symbol.dispose]() { events.push('dispose ' + name); }, async [Symbol.asyncDispose]() { events.push('async dispose ' + name); }})});
  const settle = async () => { for (let index = 0; index < 4; index++) await new Promise(resolve => setImmediate(resolve)); };
  const views = [];
  for (const label of ['Run', 'Async', 'Run']) { root.descendants('button').find(node => node.textContent === label).click(); await settle(); views.push(serialize(root)); }
  unmount();
  return {views, events};
}

test('bodies that need TypeScript downlevel helpers run like the general renderer', {timeout: 30000}, async t => {
  const oracle = await runResources(t, false);
  assert.deepEqual(oracle.events, ['dispose sync', 'async dispose async', 'dispose sync']);
  assert.deepEqual(await runResources(t, true), oracle);
});
