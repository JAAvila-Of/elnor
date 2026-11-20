import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseSurface} from '../src/parser.mjs';
import {typecheckGraph} from '../src/checker.mjs';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {createAsyncLanguageService} from '../src/async-language-service.mjs';

const childSource = 'component Badge() {\n  event changed(value: string)\n  event dismissed()\n  ui {\n    slot actions\n  }\n}';
const cases = [
  ['ELN-EVENT-CONTEXT', 'on dismissed() => 1', 'dismissed'],
  ['ELN-SLOT-CONTEXT', 'fill actions {\n      span "x"\n    }', 'actions'],
  ['ELN-COMPONENT-IMPORT', 'Unknown', 'Unknown'],
  ['ELN-SLOT-MISSING', 'Badge {\n      span "x"\n    }', 'Badge'],
  ['ELN-SLOT-UNKNOWN', 'Badge {\n      fill missing {\n        span "x"\n      }\n    }', 'missing'],
  ['ELN-SLOT-DUP', 'Badge {\n      fill actions {\n        span "a"\n      }\n      fill actions {\n        span "b"\n      }\n    }', 'Badge'],
  ['ELN-EVENT-DUP', 'Badge {\n      on dismissed() => 1\n      on dismissed() => 2\n    }', 'Badge'],
  ['ELN-EVENT-ARITY', 'Badge {\n      on changed() => 1\n    }', 'changed'],
  ['ELN-EVENT-ARITY', 'Badge {\n      on dismissed(value) => value\n    }', 'dismissed'],
];
for (const [code, ui, token] of cases) {
  test(`CLI/editor contract parity: ${code} (${ui.split('\n')[0]})`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'elnor-parity-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const child = path.join(root, 'Badge.eln');
    const parent = path.join(root, 'Screen.eln');
    const source = `import Badge from "./Badge.eln";\r\ncomponent Screen() {\r\n  // Unicode: café 😀\r\n  ui {\r\n    ${ui.replaceAll('\n', '\r\n')}\r\n  }\r\n}`;
    const graph = new Map([[child, parseSurface(childSource, child)], [parent, parseSurface(source, parent)]]);
    const cli = typecheckGraph(graph, path.join(root, 'check')).filter(d => d.file === parent && d.code.startsWith('ELN-'));
    assert.ok(cli.some(d => d.code === code), `CLI must exercise ${code}`);
    const service = createSurfaceLanguageService({root});
    t.after(() => service.dispose());
    service.open(child, childSource);
    service.open(parent, source);
    const editor = service.diagnostics(parent).filter(d => d.code.startsWith('ELN-'));
    assert.deepEqual(editor.map(d => [d.code, d.message]), cli.map(d => [d.code, d.message]));
    const error = editor.find(d => d.code === code);
    assert.equal(source.slice(error.start, error.start + error.length), token);
    assert.equal(error.line, source.slice(0, error.start).split('\n').length);
    service.open(parent, source.slice(0, source.indexOf('    ')) + '    Badge\r\n  }\r\n}');
    assert.deepEqual(service.diagnostics(parent), []);
  });
}

test('contract diagnostics follow unsaved dependencies, including unreadable contracts', t => {
  const root = path.resolve('tests/contract workspace');
  const service = createSurfaceLanguageService({root});
  t.after(() => service.dispose());
  const source = 'import Badge from "./Badge.eln";\ncomponent Screen() {\n  ui {\n    Badge {\n      fill missing {\n        span "x"\n      }\n    }\n  }\n}';
  service.open('Badge.eln', childSource);
  service.open('Screen.eln', source);
  assert.ok(service.diagnostics('Screen.eln').some(d => d.code === 'ELN-SLOT-UNKNOWN'));
  service.open('Badge.eln', childSource.replace('slot actions', 'slot missing'));
  assert.deepEqual(service.diagnostics('Screen.eln'), []);
  service.open('Badge.eln', 'component Badge(value: {');
  assert.ok(service.diagnostics('Badge.eln').some(d => d.code.startsWith('ELN-')));
  assert.deepEqual(service.diagnostics('Screen.eln').filter(d => d.code.startsWith('ELN-')), []);
  service.open('Badge.eln', childSource);
  assert.ok(service.diagnostics('Screen.eln').some(d => d.code === 'ELN-SLOT-UNKNOWN'));
});

test('missing imports have an original path range and resolve after opening the dependency', t => {
  const service = createSurfaceLanguageService({root: path.resolve('tests/missing contract workspace')});
  t.after(() => service.dispose());
  const source = 'import Badge from "./Badge.eln";\ncomponent Screen() {\n  ui {\n    Badge\n  }\n}';
  service.open('Screen.eln', source);
  const error = service.diagnostics('Screen.eln').find(d => d.code === 'ELN-IMPORT');
  assert.ok(error);
  assert.equal(source.slice(error.start, error.start + error.length), './Badge.eln');
  service.open('Badge.eln', childSource);
  assert.deepEqual(service.diagnostics('Screen.eln'), []);
});

test('shared contract diagnostics reach the asynchronous editor boundary', async t => {
  const service = createAsyncLanguageService({root: path.resolve('tests/async contract workspace')});
  t.after(() => service.dispose());
  service.open('Badge.eln', childSource);
  const source = 'import Badge from "./Badge.eln";\ncomponent Screen() {\n  ui {\n    Badge {\n      on changed() => 1\n    }\n  }\n}';
  service.open('Screen.eln', source);
  const {value, snapshot} = await service.query('diagnostics', ['Screen.eln']);
  const error = value.find(d => d.code === 'ELN-EVENT-ARITY');
  assert.ok(error);
  assert.equal(source.slice(error.start, error.start + error.length), 'changed');
  assert.equal(service.isCurrent(snapshot), true);
  service.open('Badge.eln', childSource.replace('changed(value: string)', 'changed()'));
  assert.equal(service.isCurrent(snapshot), false);
  assert.deepEqual((await service.query('diagnostics', ['Screen.eln'])).value, []);
});
