// A durable group names its journal with a string, and each member starts with
// one awaited call to a durable operation reached through a prop. These tests
// cover the syntax only; types and code generation are checked elsewhere.
import assert from 'node:assert/strict';
import test from 'node:test';
import {parseSurface} from '../src/parser.mjs';
import {validateComponent} from '../src/component-validation.mjs';
import {validateGraph} from '../src/semantic-validation.mjs';
import {generate} from '../src/compiler.mjs';

const member = 'const outcome = await notes.save(edit); text = outcome.status;';

function component({policy = 'durable "task-edit"', body = member, async = 'async ', name = 'Editor'} = {}) {
  return `component ${name}(id: string, notes: {save: (edit: {text: string}) => Promise<unknown>}, pick: () => {save: (edit: unknown) => Promise<unknown>}) {
  state text = "";
  action group editing(id) ${policy}
  action ${async}save(edit: {text: string}) in editing { ${body} }
  ui {
    p text
  }
}
`;
}

const textAt = (source, span) => source.slice(span.start, span.start + span.length);

function memberErrors(body) {
  const source = component({body});
  const ir = parseSurface(source);
  return {source, errors: validateComponent(ir).filter(error => error.code === 'ELN-DURABLE-MEMBER')};
}

function groupError(policy) {
  const source = component({policy});
  try {
    parseSurface(source);
  } catch (error) {
    return {source, error};
  }
  assert.fail(`expected a parse error for ${policy}`);
}

test('a durable group keeps its journal name and its member shape', () => {
  const source = component();
  const ir = parseSurface(source);
  const [group] = ir.actionGroups;
  assert.equal(group.policy, 'durable');
  assert.equal(group.journal, 'task-edit');
  assert.equal(textAt(source, group.journalSpan), '"task-edit"');
  assert.deepEqual(validateComponent(ir), []);
  const {durable} = ir.actions[0];
  assert.equal(durable.resultName, 'outcome');
  assert.equal(durable.callee, 'notes.save');
  assert.equal(textAt(source, durable.calleeSpan), 'notes.save');
  assert.equal(durable.argument, 'edit');
  assert.equal(textAt(source, durable.argumentSpan), 'edit');
  assert.equal(durable.rest, ' text = outcome.status; ');
  assert.equal(textAt(source, durable.restSpan), durable.rest);
});

test('a durable member may await the call without naming its outcome', () => {
  const source = component({body: 'await notes.save({text: "x"}); text = "sent";'});
  const ir = parseSurface(source);
  assert.deepEqual(validateComponent(ir), []);
  const {durable} = ir.actions[0];
  assert.equal(durable.resultName, null);
  assert.equal(durable.callee, 'notes.save');
  assert.equal(durable.argument, '{text: "x"}');
  assert.equal(textAt(source, durable.argumentSpan), '{text: "x"}');
  assert.equal(durable.rest, ' text = "sent"; ');
});

test('a callee may be a prop itself', () => {
  const source = component({body: 'await pick({text: "x"});'});
  const ir = parseSurface(source);
  assert.deepEqual(validateComponent(ir), []);
  assert.equal(ir.actions[0].durable.callee, 'pick');
});

test('members of other groups have no durable shape', () => {
  const ir = parseSurface(component({policy: 'single-flight'}));
  assert.equal(ir.actions[0].durable, undefined);
  assert.equal(ir.actionGroups[0].journal, undefined);
});

test('durable takes only a journal name', () => {
  for (const [policy, offending] of [['durable "a" timeout 10s', 'timeout 10s'], ['durable "a" 5', '5'],
    ['durable timeout 10s', 'timeout'], ['durable', 'durable'], ['durable;', 'durable']]) {
    const {source, error} = groupError(policy);
    assert.equal(error.code, 'ELN-DURABLE-POLICY', policy);
    assert.equal(textAt(source, error), offending, policy);
  }
});

test('a journal name is a short double-quoted string of safe characters', () => {
  for (const [policy, offending] of [['durable "has space"', '"has space"'], ['durable task-edit', 'task-edit'],
    ['durable ""', '""'], [`durable "${'a'.repeat(81)}"`, `"${'a'.repeat(81)}"`], ['durable "a/b"', '"a/b"'],
    ["durable 'a'", "'a'"], ['durable "a"b', '"a"b']]) {
    const {source, error} = groupError(policy);
    assert.equal(error.code, 'ELN-DURABLE-NAME', policy);
    assert.equal(textAt(source, error), offending, policy);
  }
  const longest = `durable "${'a'.repeat(80)}"`;
  assert.equal(parseSurface(component({policy: longest})).actionGroups[0].journal, 'a'.repeat(80));
  assert.equal(parseSurface(component({policy: 'durable "Notes_v1.save-2";'})).actionGroups[0].journal, 'Notes_v1.save-2');
});

test('tolerant parsing keeps a durable group with an invalid name', () => {
  const source = component({policy: 'durable "has space" timeout 1s'});
  const ir = parseSurface(source, 'Editor.eln', {tolerant: true});
  assert.deepEqual(ir.recoveryDiagnostics.map(error => [error.code, textAt(source, error)]),
    [['ELN-DURABLE-NAME', '"has space"'], ['ELN-DURABLE-POLICY', 'timeout 1s']]);
  assert.equal(ir.actionGroups[0].policy, 'durable');
});

test('a durable member must start with one awaited call', () => {
  for (const [body, offending] of [
    ['text = "saving"; const outcome = await notes.save(edit);', 'text = "saving";'],
    ['const outcome = notes.save(edit);', 'const outcome = notes.save(edit);'],
    ['let outcome = await notes.save(edit);', 'let outcome = await notes.save(edit);'],
    ['const outcome: unknown = await notes.save(edit);', 'const outcome: unknown = await notes.save(edit);'],
    ['const {status} = await notes.save(edit);', 'const {status} = await notes.save(edit);'],
    ['await notes.save(edit, 1);', '1'],
    ['await notes.save();', 'notes.save()'],
    ['await notes.save(...[edit]);', '...[edit]'],
    ['await pick().save(edit);', 'pick().save'],
    ['await notes?.save(edit);', 'notes?.save'],
    ['await notes.save?.(edit);', 'notes.save?.(edit)'],
    ['await notes["save"](edit);', 'notes["save"]'],
    ['await text.save(edit);', 'text.save'],
    ['await edit.save(edit);', 'edit.save'],
    ['', 'save'],
  ]) {
    const {source, errors} = memberErrors(body);
    assert.deepEqual(errors.map(error => textAt(source, error)), [offending], body);
  }
});

test('a guard may follow the durable call but not precede it', () => {
  const after = memberErrors('const outcome = await notes.save(edit); guard (!outcome) then { text = "none"; } text = "ok";');
  assert.deepEqual(after.errors, []);
  const {durable} = parseSurface(after.source).actions[0];
  assert.match(durable.rest, /^ if \(!outcome\)/);
  assert.equal(textAt(after.source, durable.restSpan), ' guard (!outcome) then { text = "none"; } text = "ok"; ');
  const before = memberErrors('guard (!edit) then { text = "none"; } const outcome = await notes.save(edit);');
  assert.deepEqual(before.errors.map(error => textAt(before.source, error)), ['guard']);
});

test('the first await is the only await of a durable member', () => {
  for (const [body, offending] of [
    ['const outcome = await notes.save(edit); await Promise.resolve();', 'await'],
    ['const outcome = await notes.save(await Promise.resolve(edit));', 'await'],
    ['const outcome = await notes.save(edit); for await (const item of []) text = item;', 'await'],
    ['const outcome = await notes.save(edit); { await using handle = null; }', 'await'],
    ['await notes.save(edit); if (text) { text = String(await Promise.resolve(1)); }', 'await'],
  ]) {
    const {source, errors} = memberErrors(body);
    assert.equal(errors.length, 1, body);
    const at = source.indexOf('{ ' + body) + 2;
    assert.equal(textAt(source, errors[0]), offending, body);
    assert.ok(errors[0].start > source.indexOf('await', at), body);
  }
  for (const body of [
    'const outcome = await notes.save(edit); const later = async () => { await Promise.resolve(); };',
    'const outcome = await notes.save(edit); const later = {async run() { for await (const x of []) text = x; }};',
  ]) assert.deepEqual(memberErrors(body).errors, [], body);
});

test('a durable member without async reports the group async error once', () => {
  const source = component({async: ''});
  assert.throws(() => parseSurface(source), {code: 'ELN-ACTION-GROUP-ASYNC'});
  const ir = parseSurface(source, 'Editor.eln', {tolerant: true});
  assert.deepEqual(ir.recoveryDiagnostics.map(error => error.code), ['ELN-ACTION-GROUP-ASYNC']);
  assert.deepEqual(validateComponent(ir).filter(error => error.code.startsWith('ELN-DURABLE')), []);
});

test('a journal name is unique across the graph', () => {
  const first = component({policy: 'durable "notes"', name: 'First'});
  const second = component({policy: 'durable "notes"', name: 'Second'});
  const third = component({policy: 'durable "other"', name: 'Third'});
  const graph = new Map([['First.eln', parseSurface(first, 'First.eln')], ['Second.eln', parseSurface(second, 'Second.eln')],
    ['Third.eln', parseSurface(third, 'Third.eln')]]);
  const errors = validateGraph(graph).filter(error => error.code === 'ELN-DURABLE-NAME');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].file, 'Second.eln');
  assert.equal(textAt(second, errors[0]), '"notes"');
});

test('generating a durable group emits the journal group and its members', () => {
  const output = generate(parseSurface(component(), 'Editor.eln'));
  assert.match(output, /import \{ createDurableGroup as \w+ \} from "\.\/durable-runtime\.mjs";/);
  const runtime = /createDurableGroup as (\w+)/.exec(output)[1];
  assert.ok(output.includes(`const editing = ${runtime}("task-edit", () => (`), output);
  assert.match(output, /const save = \(?editing\.member\("save", \(\) => \(\w+\.notes\.save\), \(edit\) => \(\w+\.notes\.save\)\(edit\), function \(outcome, edit\)/);
  assert.doesNotMatch(output, /createActionGroup/);
});

test('invalid journal names are not reported again as duplicates', () => {
  const source = component({policy: 'durable "a b"'});
  const graph = new Map(['One.eln', 'Two.eln'].map(file => [file, parseSurface(source, file, {tolerant: true})]));
  assert.deepEqual(validateGraph(graph).filter(error => error.code === 'ELN-DURABLE-NAME'), []);
});
