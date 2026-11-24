// A durable member is typed from its operation: the outcome of the first
// statement, the member's status, result and reason. The editor and the
// checker reject types the journal cannot store and calls that skip it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {checkSurfaceProject} from '../src/project-check.mjs';

const intents = fileURLToPath(new URL('../src/intents.d.mts', import.meta.url));

const props = [
  'note: {id: string; tags: string[]; meta: {owner: string}}',
  'notes: {save: DurableOperation<{id: string; text: string}, {revision: number}, {kind: "conflict"; current: string}>; remove: DurableOperation<{id: string}, null, string>}',
  'drafts: {keep: DurableOperation<{id: string; text: string}, null, null>}',
  'dated: {save: DurableOperation<{id: string}, {at: Date}, null>}',
  'plain: {save: (edit: {id: string; text: string}) => Promise<{revision: number}>}',
].join(', ');

const save = `  action async save(edit: {id: string; text: string}) in editing {
    const outcome = await notes.save(edit);
    if (outcome.status === "applied") {
      revision = outcome.result.revision;
      message = "Saved";
    } else if (outcome.status === "rejected") {
      message = outcome.reason.current;
    } else {
      message = "Unavailable";
    }
  }`;

function component({owner = 'note.id', members = save, actions = '', ui = ''} = {}) {
  return `import type {DurableOperation} from "./intents.d.mts";
component Editor(${props}) {
  state revision = 0;
  state message = "";
  action group editing(${owner}) durable "note-edit"
${members}
${actions}
  ui {
    section {
      p message
${ui}
    }
  }
}
`;
}

function workspace(t) {
  const temp = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temp, 'elnor-durable-types-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.copyFileSync(intents, path.join(directory, 'intents.d.mts'));
  return directory;
}

function diagnose(t, options) {
  const directory = workspace(t), text = component(options), file = path.join(directory, 'Editor.eln');
  const service = createSurfaceLanguageService({root: directory});
  t.after(() => service.dispose());
  service.open(file, text);
  const diagnostics = service.diagnostics(file).map(item => ({...item, text: text.slice(item.start, item.start + item.length)}));
  return {directory, file, text, diagnostics};
}

const errors = (diagnostics, code) => diagnostics.filter(item => item.code === code);
const lineOf = (text, fragment) => text.slice(0, text.indexOf(fragment)).split('\n').length;

test('a valid durable member has no diagnostics', t => {
  const {diagnostics} = diagnose(t);
  assert.deepEqual(diagnostics, []);
});

test('the outcome is typed from the operation and errors map to the member', t => {
  const misuse = save.replace('revision = outcome.result.revision;', 'message = outcome.result.revision.toUpperCase();');
  const {text, diagnostics} = diagnose(t, {members: misuse});
  assert.equal(diagnostics.length, 1, JSON.stringify(diagnostics));
  const [error] = diagnostics;
  assert.equal(error.code, 'TS2339');
  assert.match(error.message, /'toUpperCase' does not exist on type 'number'/);
  assert.equal(error.text, 'toUpperCase');
  assert.equal(error.line, lineOf(text, 'outcome.result.revision.toUpperCase'));
});

test('an outcome that is not narrowed has no result', t => {
  const misuse = save.replace('const outcome = await notes.save(edit);', 'const outcome = await notes.save(edit);\n    revision = outcome.result.revision;');
  const {diagnostics} = diagnose(t, {members: misuse});
  assert.deepEqual(diagnostics.map(item => [item.code, item.text]), [['TS2339', 'result']]);
});

test('the member exposes the durable statuses with the operation result and reason', t => {
  const ui = `      p (save.status === "success" ? save.result.revision.toFixed(0) : "")
      p (save.status === "rejected" ? save.reason.current : "")`;
  assert.deepEqual(diagnose(t, {ui}).diagnostics, []);
  const {diagnostics} = diagnose(t, {actions: '  action probe() { const status: "none" = save.status; void save.error; }'});
  assert.deepEqual(diagnostics.map(item => [item.code, item.text]), [['TS2322', 'status'], ['TS2339', 'error']]);
  const statuses = /^Type '([^']+)' is not assignable/.exec(diagnostics[0].message)[1].split(' | ').map(status => JSON.parse(status));
  assert.deepEqual(statuses.sort(), ['blocked', 'idle', 'pending', 'rejected', 'success', 'unconfirmed']);
});

test('an owner must be a string, a number or a list of them', t => {
  const {diagnostics} = diagnose(t, {owner: 'note.meta'});
  assert.deepEqual(diagnostics.map(item => [item.code, item.text]), [['ELN-DURABLE-TYPE', 'note.meta']]);
  assert.match(diagnostics[0].message, /string, a number or a list of them/);
  assert.deepEqual(diagnose(t, {owner: 'note.tags'}).diagnostics, []);
  assert.deepEqual(diagnose(t, {owner: 'note.id, revision'}).diagnostics, []);
});

test('a parameter the journal cannot store as JSON is an error', t => {
  const members = save.replace('save(edit: {id: string; text: string})', 'save(edit: {id: string; text: string}, when: Date)');
  const {diagnostics} = diagnose(t, {members});
  assert.deepEqual(diagnostics.map(item => [item.code, item.text]), [['ELN-DURABLE-TYPE', 'Date']]);
  assert.match(diagnostics[0].message, /parameter 'when'/);
  const stored = save.replace('save(edit: {id: string; text: string})',
    'save(edit: {id: string; text: string; note?: string}, count: number, tags: readonly string[], pair: [string, number | null], flag = false)');
  assert.deepEqual(diagnose(t, {members: stored}).diagnostics, []);
  const optional = save.replace('save(edit: {id: string; text: string})', 'save(edit: {id: string; text: string}, maybe?: string)');
  const found = diagnose(t, {members: optional}).diagnostics;
  assert.deepEqual(found.map(item => [item.code, item.text]), [['ELN-DURABLE-TYPE', 'maybe']]);
  assert.match(found[0].message, /'undefined' is not JSON/);
});

test('an operation result the journal cannot store as JSON is an error', t => {
  const members = `  action async stamp() in editing {
    const outcome = await dated.save({id: note.id});
    message = outcome.status;
  }`;
  const {diagnostics} = diagnose(t, {members});
  assert.deepEqual(diagnostics.map(item => [item.code, item.text]), [['ELN-DURABLE-TYPE', 'dated.save']]);
  assert.match(diagnostics[0].message, /result/);
  assert.match(diagnostics[0].message, /'Date'/);
});

test('a callee typed as a plain function is not a durable operation', t => {
  const members = save.replace('await notes.save(edit)', 'await plain.save(edit)');
  const {diagnostics} = diagnose(t, {members});
  assert.deepEqual(diagnostics.map(item => [item.code, item.text]), [['ELN-DURABLE-TYPE', 'plain.save']]);
  assert.match(diagnostics[0].message, /DurableOperation/);
});

test('the members of a group call operations of one prop', t => {
  const members = `${save}
  action async keep(edit: {id: string; text: string}) in editing {
    await drafts.keep(edit);
  }
  action async remove() in editing {
    await notes.remove({id: note.id});
  }`;
  const {diagnostics} = diagnose(t, {members});
  assert.deepEqual(diagnostics.map(item => [item.code, item.text]), [['ELN-DURABLE-TYPE', 'drafts.keep']]);
  assert.match(diagnostics[0].message, /'notes'/);
});

test('a durable operation called outside the first statement of a member is an error', t => {
  const {text, diagnostics} = diagnose(t, {
    actions: `  action touch(edit: {id: string; text: string}) { notes.save(edit); }
  action group other(note.id) single-flight
  action async later() in other { notes.remove({id: note.id}); }`,
    ui: '      button "Save" => notes.save({id: note.id, text: message})',
  });
  assert.deepEqual(diagnostics.map(item => [item.code, item.text, item.line]), [
    ['ELN-DURABLE-CALL', 'notes.save', lineOf(text, 'action touch')],
    ['ELN-DURABLE-CALL', 'notes.remove', lineOf(text, 'action async later')],
    ['ELN-DURABLE-CALL', 'notes.save', lineOf(text, 'button "Save"')],
  ]);
  assert.match(diagnostics[0].message, /first statement of a durable member/);
});

test('the rest of a member body cannot call the operation again', t => {
  const members = save.replace('message = "Saved";', 'notes.remove({id: note.id});');
  const {diagnostics} = diagnose(t, {members});
  assert.deepEqual(diagnostics.map(item => [item.code, item.text]), [['ELN-DURABLE-CALL', 'notes.remove']]);
});

test('durable members are not stale write candidates but unowned work still applies', t => {
  const members = save.replace('message = "Saved";', 'message = "Saved";\n      setInterval(() => {}, 1000);');
  const {diagnostics} = diagnose(t, {members});
  assert.deepEqual(errors(diagnostics, 'ELN-ASYNC-STALE-WRITE'), []);
  assert.deepEqual(diagnostics.map(item => [item.code, item.text]), [['ELN-UNOWNED-WORK', 'setInterval']]);
});

test('a guard in the rest of a member keeps types and lines in the editor and the checker', t => {
  const members = `  action async save(edit: {id: string; text: string}) in editing {
    const outcome = await notes.save(edit);
    guard (outcome.status !== "applied") then {
      message = "Not saved";
    }
    revision = outcome.result.revision;
    guard (revision > 10)
    notes.remove({id: edit.id});
    message = outcome.result.revision.toUpperCase();
  }`;
  const {directory, file, text, diagnostics} = diagnose(t, {members});
  const shape = item => `${item.code}:${item.line}`;
  const expected = [
    `ELN-DURABLE-CALL:${lineOf(text, 'notes.remove')}`,
    `TS2339:${lineOf(text, 'toUpperCase')}`,
  ];
  assert.deepEqual(diagnostics.map(shape).sort(), expected);
  assert.deepEqual(diagnostics.map(item => item.text).sort(), ['notes.remove', 'toUpperCase']);
  fs.writeFileSync(file, text);
  const checked = checkSurfaceProject(file, {outputDir: path.join(directory, 'check')}).diagnostics;
  assert.deepEqual(checked.map(shape).sort(), expected);
});

test('the project checker reports the same durable errors as the editor', t => {
  const options = {
    owner: 'note.meta',
    members: `${save.replace('save(edit: {id: string; text: string})', 'save(edit: {id: string; text: string}, when: Date)')}
  action async keep(edit: {id: string; text: string}) in editing {
    await drafts.keep(edit);
  }
  action async touch() in editing {
    await plain.save({id: note.id, text: message});
  }`,
    actions: '  action again(edit: {id: string; text: string}) { notes.save(edit); }',
    ui: '      button "Save" => notes.save({id: note.id, text: message})',
  };
  const {directory, file, text, diagnostics} = diagnose(t, options);
  fs.writeFileSync(file, text);
  const durable = item => item.code.startsWith('ELN-DURABLE');
  const shape = item => `${item.code}:${item.line}:${item.message}`;
  const editor = diagnostics.filter(durable).map(shape).sort();
  assert.equal(editor.length, 6, editor.join('\n'));
  const checked = checkSurfaceProject(file, {outputDir: path.join(directory, 'check')}).diagnostics;
  assert.deepEqual(checked.filter(durable).map(shape).sort(), editor);
  assert.deepEqual(checked.filter(item => !durable(item)), []);
});
