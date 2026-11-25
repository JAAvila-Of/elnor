// The durable intents documentation shows Surface and TypeScript examples.
// These tests compile them, so an example that stops type-checking fails here
// instead of drifting from the implementation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {getTs} from '../src/typescript.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(repository, file), 'utf8').replace(/\r\n/g, '\n');
const design = read('docs/mvp/DURABLE-INTENTS-DESIGN.md');
const policy = read('docs/mvp/ASYNC-POLICY.md');
const readme = read('examples/durable-save/README.md');

// The fenced block of a language whose code starts with the given text.
function block(document, language, start) {
  const found = [...document.matchAll(new RegExp('```' + language + '\\n([\\s\\S]*?)```', 'g'))]
    .map(match => match[1]).filter(code => code.startsWith(start));
  assert.equal(found.length, 1, `one ${language} block starting with ${start}`);
  return found[0];
}

const indent = code => code.trimEnd().split('\n').map(line => line ? '  ' + line : line).join('\n');

function workspace(t) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-durable-docs-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.copyFileSync(path.join(repository, 'src/intents.d.mts'), path.join(directory, 'intents.d.mts'));
  fs.writeFileSync(path.join(directory, 'types.ts'), block(design, 'ts', 'export type TaskEdit'));
  return directory;
}

const operations = 'update: DurableOperation<TaskEdit, TaskRevision, TaskRejection>; remove: DurableOperation<{id: string; revision: number}, null, TaskRejection>';

// The documented group and members inside a component with the props and
// state they use.
function surfaceDiagnostics(t, directory, declarations) {
  const file = path.join(directory, 'Editor.eln');
  const text = `import type {DurableOperation} from "./intents.d.mts";
import type {TaskEdit, TaskRevision, TaskRejection} from "./types.js";

component Editor(task: {id: string}, tasks: {${operations}}) {
  state revision = 0;
  state message = "";
  state current: TaskEdit | null = null;
  state draft: TaskEdit | null = null;

${declarations.map(indent).join('\n\n')}

  ui {
    section {
      p message
    }
  }
}
`;
  const service = createSurfaceLanguageService({root: directory});
  t.after(() => service.dispose());
  service.open(file, text);
  return service.diagnostics(file).map(item => `${item.code} ${item.message}`);
}

// A TypeScript file written next to the journal types, checked strictly.
function typeDiagnostics(directory, name, text) {
  const ts = getTs();
  const file = path.join(directory, name);
  fs.writeFileSync(file, text);
  const program = ts.createProgram([file], {
    strict: true, noEmit: true, skipLibCheck: true, types: [],
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts']
  });
  return ts.getPreEmitDiagnostics(program).map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'));
}

const hostPrelude = `import {createIntentJournal, httpIntentTransport} from "./intents.mjs";
import type {DurableOperation} from "./intents.mjs";
import type {TaskEdit, TaskRevision, TaskRejection} from "./types.js";
declare const account: {id: string};
declare const session: {headers(): Record<string, string>};
`;

test('the design group and members compile with no diagnostics', t => {
  const directory = workspace(t);
  const group = block(design, 'elnor', 'action group editing');
  const members = block(design, 'elnor', 'action async save');
  assert.match(members, /action async remove\(\)/);
  assert.deepEqual(surfaceDiagnostics(t, directory, [group, members]), []);
});

test('the design host gives the operations the members call', t => {
  const directory = workspace(t);
  const host = block(design, 'ts', 'const journal = createIntentJournal');
  const text = `${hostPrelude}${host}
const props: {${operations}} = tasks;
void props;
`;
  assert.deepEqual(typeDiagnostics(directory, 'host.ts', text), []);
});

test('an example with an unnarrowed reason would fail these checks', t => {
  // The form the design used before: the rejected branch after a compound
  // condition does not narrow the reason.
  const directory = workspace(t);
  const group = block(design, 'elnor', 'action group editing');
  const members = `action async save(edit: TaskEdit) in editing {
  const outcome = await tasks.update(edit);
  if (outcome.status === "rejected" && outcome.reason.kind === "conflict") {
    current = outcome.reason.current;
  } else if (outcome.status === "rejected") {
    message = outcome.reason.message;
  }
}`;
  const found = surfaceDiagnostics(t, directory, [group, members]);
  assert.equal(found.length, 1, found.join('\n'));
  assert.match(found[0], /^TS2339 .*'message'/);
});

test('the async policy examples compile with no diagnostics', t => {
  const directory = workspace(t);
  const section = policy.slice(policy.indexOf('## Durable intents'));
  const members = block(section, 'elnor', 'action group editing(task.id) durable');
  assert.deepEqual(surfaceDiagnostics(t, directory, [members]), []);
  const host = block(section, 'ts', 'const journal = createIntentJournal');
  const text = `${hostPrelude}${host}
const props: Pick<{${operations}}, "update"> = tasks;
void props;
`;
  assert.deepEqual(typeDiagnostics(directory, 'host.ts', text), []);
});

test('the example README shows the view as written and a host call that type-checks', t => {
  const view = read('examples/durable-save/DurableSave.eln');
  const excerpt = block(readme, 'elnor', 'action group saving');
  assert.ok(view.includes(indent(excerpt)), 'the README excerpt is a part of DurableSave.eln');

  const directory = workspace(t);
  const host = read('examples/durable-save/host.ts');
  assert.ok(host.includes('"../../src/intents.mjs"'));
  fs.writeFileSync(path.join(directory, 'host.ts'), host.replaceAll('"../../src/intents.mjs"', '"./intents.mjs"'));
  const usage = block(readme, 'ts', 'const {journal, notes} = createNotes');
  const text = `import {createNotes} from "./host.js";
import type {Notes} from "./host.js";
declare const account: string, baseUrl: string, root: Element;
declare function mount(root: Element, props: {notes: Notes}): () => void;
${usage}
void journal;
`;
  assert.deepEqual(typeDiagnostics(directory, 'usage.ts', text), []);
});
