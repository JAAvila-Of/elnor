import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {parseSurface} from '../src/parser.mjs';
import {SourceMap} from '../src/language-projection.mjs';

const root = path.resolve('tests', 'virtual workspace');
const child = path.join(root, 'Badge.eln');
const parent = path.join(root, 'Screen.eln');
const badge = 'component Badge(label: string) {\n  ui {\n    span label\n  }\n}\n';
const screen = 'import Badge from "./Badge.eln";\ncomponent Screen() {\n  ui {\n    Badge label="Ready"\n  }\n}\n';
function workspace(t, childSource = badge, parentSource = screen) {
  const service = createSurfaceLanguageService({root});
  t.after(() => service.dispose());
  service.open(child, childSource);
  service.open(parent, parentSource);
  return service;
}

test('maps a TypeScript prop error to the exact Surface range', t => {
  const source = screen.replace('label="Ready"', 'missing="Ready"');
  const service = workspace(t, badge, source);
  const diagnostic = service.diagnostics(parent).find(d => d.code === 'TS2353');
  assert.ok(diagnostic);
  assert.equal(diagnostic.file, parent);
  assert.equal(source.slice(diagnostic.start, diagnostic.start + diagnostic.length), 'missing');
  assert.equal(diagnostic.line, 4);
  assert.equal(diagnostic.column, 11);
});

test('navigates from component use and prop use to their original declarations', t => {
  const service = workspace(t);
  const component = service.definitions(parent, screen.indexOf('Badge label') + 2);
  assert.ok(component.some(d => d.file === child && badge.slice(d.start, d.start + d.length) === 'Badge'));
  const prop = service.definitions(parent, screen.indexOf('label="') + 2);
  assert.ok(prop.some(d => d.file === child && badge.slice(d.start, d.start + d.length) === 'label'));
});

test('completes a partial Surface prop and a TypeScript member expression', t => {
  const partial = screen.replace('label="Ready"', 'la');
  const service = workspace(t, badge, partial);
  const completion = service.completions(parent, partial.indexOf('Badge la') + 'Badge la'.length);
  const label = completion.find(c => c.name === 'label');
  assert.ok(label);
  assert.equal(partial.slice(label.replacementSpan.start, label.replacementSpan.start + label.replacementSpan.length), 'la');
  const completed = partial.slice(0, label.replacementSpan.start) + 'label="Ready"' + partial.slice(label.replacementSpan.start + label.replacementSpan.length);
  assert.equal(completed, screen);
  service.open(parent, completed);
  assert.deepEqual(service.diagnostics(parent), []);
  const source = 'component Badge(user: { name: string }) {\n  ui {\n    span user.\n  }\n}';
  service.open(child, source);
  assert.ok(service.completions(child, source.indexOf('user.') + 5).some(c => c.name === 'name'));
});

test('renames a prop across declaration, local references and multiple Surface consumers', t => {
  const service = workspace(t);
  const other = path.join(root, 'Other.eln');
  service.open(other, screen.replaceAll('Screen', 'Other'));
  const plan = service.rename(parent, screen.indexOf('label="') + 2, 'caption');
  assert.deepEqual(new Set(plan.edits.map(e => e.file)), new Set([child, parent, other]));
  service.applyRename(plan);
  assert.equal(service.text(child), badge.replaceAll('label', 'caption'));
  assert.equal(service.text(parent), screen.replace('label=', 'caption='));
  assert.deepEqual(service.diagnostics(parent), []);
  assert.deepEqual(service.diagnostics(child), []);
});

test('updates unsaved dependent documents and rejects stale rename edits atomically', t => {
  const service = workspace(t);
  const plan = service.rename(child, badge.indexOf('label'), 'caption');
  assert.equal(service.isCurrent(plan), true);
  service.open(child, badge.replace('label: string', 'label: number'));
  assert.equal(service.isCurrent(plan), false);
  assert.ok(service.diagnostics(parent).some(d => d.code === 'TS2322'));
  assert.throws(() => service.applyRename(plan), /stale/i);
  assert.equal(service.text(parent), screen);
  service.open(child, badge);
  assert.deepEqual(service.diagnostics(parent), []);
});

test('preserves offsets with CRLF, tabs, accents and astral characters', t => {
  const source = screen.replace('Badge label="Ready"', 'Badge missing="Ready"')
    .replace('  ui {', '  // café 😀\n  ui {').replaceAll('    Badge', '\tBadge').replaceAll('\n', '\r\n');
  const service = workspace(t, badge, source);
  const diagnostic = service.diagnostics(parent).find(d => d.code === 'TS2353');
  assert.ok(diagnostic);
  assert.equal(diagnostic.start, source.indexOf('missing'));
  assert.equal(diagnostic.length, 7);
  const plan = service.rename(child, badge.indexOf('label'), 'caption');
  assert.ok(plan.edits.every(e => e.start >= 0));
});

test('does not confuse same-named local variables, comments or strings during rename', t => {
  const source = badge.replace('  ui {', '  action inspect() {\n    const label = "label";\n    console.log(label); // label\n  }\n  ui {');
  const service = workspace(t, source);
  const plan = service.rename(child, source.indexOf('label: string'), 'caption');
  service.applyRename(plan);
  assert.equal(service.text(child), source.replace('label: string', 'caption: string').replace('span label', 'span caption'));
});

test('reports incomplete input, recovers a missing final brace and clears obsolete errors', t => {
  const service = workspace(t);
  service.open(child, badge.slice(0, badge.lastIndexOf('}')));
  assert.ok(service.diagnostics(child).some(d => d.code.startsWith('ELN-')));
  assert.ok(service.definitions(parent, screen.indexOf('Badge label') + 2).some(d => d.file === child));
  assert.throws(() => service.rename(parent, screen.indexOf('label="'), 'caption'), /incomplete|invalid/i);
  service.open(child, badge);
  assert.deepEqual(service.diagnostics(child), []);
  assert.deepEqual(service.diagnostics(parent), []);
});

test('accepts multiline TypeScript action bodies without shifting mapped ranges', t => {
  const source = badge.replace('  ui {', '  action show() {\n    const greeting = `😀 ${label}`;\n    console.log(greeting);\n  }\n  ui {');
  const service = workspace(t, source);
  const plan = service.rename(child, source.indexOf('label: string'), 'caption');
  service.applyRename(plan);
  assert.equal(service.text(child), source.replaceAll('label', 'caption'));
});

test('completes props immediately after the component name and does not suggest globals', t => {
  const source = screen.replace('label="Ready"', '   ');
  const service = workspace(t, badge, source);
  const completions = service.completions(parent, source.indexOf('Badge    ') + 'Badge    '.length);
  assert.deepEqual(completions.map(c => c.name), ['label']);
});

test('rename preserves Unicode, CRLF, tabs and unrelated text exactly', t => {
  const source = badge.replace('  ui {', '  // café 😀 label\n  ui {').replace('    span', '\tspan').replaceAll('\n', '\r\n');
  const service = workspace(t, source);
  const plan = service.rename(child, source.indexOf('span label') + 6, 'caption');
  service.applyRename(plan);
  assert.equal(service.text(child), source.replace('label: string', 'caption: string').replace('span label', 'span caption'));
});

test('rename rejects binding collisions, reserved words and non-symbol positions', t => {
  const source = badge.replace('  ui {', '  state caption = "Taken";\n  ui {');
  const service = workspace(t, source);
  assert.throws(() => service.rename(child, source.indexOf('label'), 'caption'), /invalid|duplicate/i);
  assert.throws(() => service.rename(child, source.indexOf('label'), 'return'), /identifier/i);
  assert.throws(() => service.rename(child, source.indexOf('ui {'), 'other'), /renamable/i);
  assert.equal(service.text(child), source);
});

test('generated scaffolding has no fabricated source range', () => {
  const map = new SourceMap('café 😀');
  map.generated('const generated = ');
  map.copy({start: 0, length: 7});
  map.generated(';');
  assert.equal(map.toOriginal(0, 5), null);
  assert.equal(map.toOriginal(18, 8), null);
  assert.deepEqual(map.toOriginal(18, 7), {start: 0, length: 7});
});

test('editor recovery does not expand the compiler grammar', t => {
  const partial = screen.replace('label="Ready"', 'la');
  assert.throws(() => parseSurface(partial), /ELN-UI-ATTR/);
  const service = workspace(t, badge, partial);
  assert.ok(service.diagnostics(parent).some(d => d.code === 'ELN-UI-ATTR'));
  assert.ok(service.completions(parent, partial.indexOf('Badge la') + 8).some(c => c.name === 'label'));
});

test('resolves equal component names in separate directories without collisions', t => {
  const service = workspace(t);
  const other = path.join(root, 'nested', 'Badge.eln');
  const consumer = path.join(root, 'nested', 'Consumer.eln');
  service.open(other, badge.replaceAll('label', 'value'));
  const source = screen.replaceAll('Screen', 'Consumer').replace('label=', 'value=');
  service.open(consumer, source);
  assert.ok(service.definitions(consumer, source.indexOf('Badge value')).some(d => d.file === other));
  const plan = service.rename(child, badge.indexOf('label'), 'caption');
  assert.ok(plan.edits.every(e => e.file !== other && e.file !== consumer));
});

test('preserves TypeScript object shorthand keys when renaming a local binding', t => {
  const source = badge.replace('  ui {', '  action inspect() {\n    const item = "Ready";\n    const data = { item };\n    console.log(item, data.item);\n  }\n  ui {');
  const service = workspace(t, source);
  const plan = service.rename(child, source.indexOf('const item') + 7, 'entry');
  service.applyRename(plan);
  assert.equal(service.text(child), source.replace('const item', 'const entry').replace('{ item }', '{ item: entry }').replace('log(item,', 'log(entry,'));
});

test('checks the real Spike 003 sources and navigates into an ordinary TypeScript file', t => {
  const examples = fileURLToPath(new URL('../examples/components/', import.meta.url));
  const service = createSurfaceLanguageService({root: examples});
  t.after(() => service.dispose());
  const entry = path.join(examples, 'UserEditor.eln');
  const source = fs.readFileSync(entry, 'utf8');
  service.open(entry, source);
  for (const name of ['UserEditor', 'UserList', 'Panel', 'ConfirmDialog']) {
    assert.deepEqual(service.diagnostics(path.join(examples, name + '.eln')), [], name);
  }
  const userType = source.indexOf('User[]');
  assert.ok(service.definitions(entry, userType + 1).some(d => d.file === path.resolve(examples, '../types.ts')));
  const childFile = path.join(examples, 'UserList.eln');
  const childSource = fs.readFileSync(childFile, 'utf8');
  const plan = service.rename(childFile, childSource.indexOf('users: User[]'), 'rows');
  service.applyRename(plan);
  assert.match(service.text(entry), /UserList rows=visible/);
  assert.deepEqual(service.diagnostics(entry), []);
  assert.equal(fs.readFileSync(entry, 'utf8'), source, 'no source was written to disk');
});

test('keeps default import aliases local when renaming a component reference', t => {
  const source = screen.replaceAll('Badge', 'Tag').replace('./Tag.eln', './Badge.eln');
  const service = workspace(t, badge, source);
  const plan = service.rename(parent, source.indexOf('Tag label') + 1, 'Chip');
  service.applyRename(plan);
  assert.equal(service.text(parent), source.replace('import Tag', 'import Chip').replace('Tag label', 'Chip label'));
  assert.equal(service.text(child), badge);
  assert.deepEqual(service.diagnostics(parent), []);
});

test('reports an unrecoverable file without crashing or keeping obsolete definitions', t => {
  const service = workspace(t);
  service.open(child, 'component Badge(label: string) {\n  ui {\n    /* unterminated\n');
  assert.ok(service.diagnostics(child).length > 0);
  // TS may fall back to the local import; it must not retain the old export.
  assert.ok(service.definitions(parent, screen.indexOf('Badge label') + 2).every(d => d.file !== child));
  assert.throws(() => service.rename(parent, screen.indexOf('Badge label') + 2, 'Other'), /incomplete|invalid/i);
  service.open(child, badge);
  assert.ok(service.definitions(parent, screen.indexOf('Badge label') + 2).some(d => d.file === child));
});
