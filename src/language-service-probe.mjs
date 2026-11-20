// Reproducible evidence on real .eln sources, with no source-file mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSurfaceLanguageService} from './language-service.mjs';

const root = fileURLToPath(new URL('../examples/components/', import.meta.url));
const entry = path.join(root, 'UserEditor.eln');
const child = path.join(root, 'UserList.eln');
const source = fs.readFileSync(entry, 'utf8');
const childSource = fs.readFileSync(child, 'utf8');
const service = createSurfaceLanguageService({root});
try {
  service.open(entry, source);
  assert.deepEqual(service.diagnostics(entry), []);
  const definitions = service.definitions(entry, source.indexOf('UserList users=') + 2);
  assert.ok(definitions.some(d => d.file === child));

  const invalid = source.replace('UserList users=visible', 'UserList missing=visible');
  service.open(entry, invalid);
  const diagnostic = service.diagnostics(entry).find(d => d.code === 'TS2353');
  assert.equal(invalid.slice(diagnostic.start, diagnostic.start + diagnostic.length), 'missing');

  const partial = source.replace('UserList users=visible', 'UserList us');
  service.open(entry, partial);
  const suggestions = service.completions(entry, partial.indexOf('UserList us') + 'UserList us'.length).map(c => c.name);
  assert.ok(suggestions.includes('users'));

  service.open(entry, source);
  assert.deepEqual(service.diagnostics(entry), []);
  const plan = service.rename(child, childSource.indexOf('users: User[]'), 'rows');
  service.applyRename(plan);
  assert.match(service.text(entry), /UserList rows=visible/);
  assert.deepEqual(service.diagnostics(entry), []);
  assert.equal(fs.readFileSync(entry, 'utf8'), source);
  assert.equal(fs.readFileSync(child, 'utf8'), childSource);
  console.log(JSON.stringify({
    environment: {node: process.version, platform: process.platform},
    definition: definitions,
    diagnostic: {...diagnostic, selectedText: 'missing'},
    propSuggestions: suggestions,
    rename: {appliedInMemory: true, edits: plan.edits, sourceFilesUnchanged: true},
    conclusion: 'Bounded Surface tooling is viable through mapped TypeScript projections.',
    limitations: ['In-process evidence only; no LSP/editor integration.', 'Recovery is bounded, not a complete error-tolerant parser.', 'No production latency or memory claims.'],
  }, null, 2));
} finally { service.dispose(); }
