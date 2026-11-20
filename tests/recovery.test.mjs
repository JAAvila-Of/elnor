import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {parseSurface} from '../src/parser.mjs';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {childSource, consumerSource, recoveryCases} from './fixtures/recovery-cases.mjs';

const root = path.resolve('tests', 'recovery workspace');
const child = path.join(root, 'Badge.eln');
const consumer = path.join(root, 'Screen.eln');

for (const scenario of recoveryCases) {
  test(`editor recovery boundary: ${scenario.name}`, t => {
    const service = createSurfaceLanguageService({root});
    t.after(() => service.dispose());
    const isConsumer = scenario.role === 'consumer';
    const damaged = isConsumer ? consumer : child;
    const caller = isConsumer ? scenario.source : consumerSource;
    service.open(child, isConsumer ? childSource : scenario.source);
    service.open(consumer, caller);
    assert.throws(() => parseSurface(scenario.source, damaged), undefined, 'strict grammar must still reject incomplete input');
    assert.ok(service.diagnostics(damaged).length > 0, 'recovery never silently accepts broken source');
    const definitions = service.definitions(consumer, caller.indexOf('Badge l') + 2);
    if (scenario.expected === 'recover') {
      assert.ok(definitions.some(d => d.file === child && childSource.slice(d.start, d.start + d.length) === 'Badge'), 'component contract survives');
      assert.ok(service.completions(consumer, caller.lastIndexOf('Badge la') + 'Badge la'.length).some(c => c.name === 'label'), 'consumer prop completion survives');
      if (!isConsumer) {
        const use = scenario.source.lastIndexOf('span label') + 6;
        if (use >= 6) assert.ok(service.definitions(child, use).some(d => d.file === child && d.start === scenario.source.indexOf('label: string')), 'intact local source mapping survives');
      }
    } else {
      assert.ok(definitions.every(d => d.file !== child), 'an unknown contract is not invented');
      assert.ok(service.completions(consumer, caller.lastIndexOf('Badge la') + 8).every(c => c.name !== 'label'), 'no fabricated prop contract');
    }
    assert.throws(() => service.rename(child, childSource.indexOf('label: string'), 'caption'), /incomplete|invalid/i);
    const healthyCaller = consumerSource.replace('Badge la', 'Badge label="Ready"');
    service.open(child, childSource);
    service.open(consumer, healthyCaller);
    assert.deepEqual(service.diagnostics(child), []);
    assert.deepEqual(service.diagnostics(consumer), []);
    assert.equal(service.text(damaged), isConsumer ? healthyCaller : childSource);
  });
}

test('recovery reports multiple damaged lines and preserves exact Unicode/CRLF ranges', t => {
  const service = createSurfaceLanguageService({root});
  t.after(() => service.dispose());
  const source = childSource.replace('    span label', '\tp "unfinished 😀\n\tspan\n\tspan label').replaceAll('\n', '\r\n');
  service.open(child, source);
  const errors = service.diagnostics(child);
  assert.ok(errors.some(d => d.code === 'ELN-UI-UNSUPPORTED' && d.start === source.indexOf('span\r')));
  const definition = service.definitions(child, source.lastIndexOf('span label') + 6).find(d => d.file === child);
  assert.equal(definition?.start, source.indexOf('label: string'));
});

test('recovery preserves valid multiline TS strings and templates beside a damaged UI line', t => {
  const service = createSurfaceLanguageService({root});
  t.after(() => service.dispose());
  const source = childSource.replace('  ui {', '  action inspect() {\n    const continued = "café\\\n    😀";\n    const template = `first\n    ${label}\n    last`;\n    console.log(label, continued, template);\n  }\n  ui {')
    .replace('    span label', '    span\n    span label').replaceAll('\n', '\r\n');
  service.open(child, source);
  const errors = service.diagnostics(child);
  assert.ok(errors.some(d => d.code === 'ELN-UI-UNSUPPORTED'));
  assert.ok(errors.every(d => d.code !== 'TS1002'), 'valid continuations must not become unterminated strings');
  const definition = service.definitions(child, source.indexOf('log(label') + 5).find(d => d.file === child);
  assert.equal(definition?.start, source.indexOf('label: string'));
});
