import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {parseSurface} from '../src/parser.mjs';
import {proveDerivedListReplacement} from '../src/surface-hot-proof.mjs';
import {sourceKey} from '../src/source-identity.mjs';

const rootText = `import {visible as shown} from "./model.mjs";
import Rows from "./Rows.eln";
component Catalog(initial: {id: string}[]) {
  state rows = [...initial];
  state count = 0;
  calc current = shown(rows);
  action choose(id: string) { count = count + 1; }
  ui {
    h1 "Catalog"
    Rows rows=current {
      on choice(id) => choose(id)
    }
  }
}`;
const childText = `component Rows(rows: {id: string}[]) {
  event choice(id: string)
  ui {
    ul {
      each row in rows by row.id {
        li {
          button row.id => emit.choice(row.id)
        }
      }
    }
  }
}`;

function proof(rootSource = rootText, childSource = childText, readOnly = true) {
  const root = parseSurface(rootSource, path.resolve('Catalog.eln'));
  const child = parseSurface(childSource, path.resolve('Rows.eln'));
  const imports = new Map([['./model.mjs', './.elnor-modules/model.mjs']]);
  const modules = [{file: '.elnor-modules/model.mjs', functions: [{name: 'visible', readOnly}]}];
  return proveDerivedListReplacement(root, new Map([[sourceKey(child.filename), child]]), imports, modules);
}

test('derived child UI preserves the root contract while changes to row identity invalidate it', () => {
  const original = proof();
  assert.ok(original);
  assert.deepEqual(proof(rootText, childText.replace('button row.id', 'button "Choose"')), original);
  const changedKey = proof(rootText, childText.replace('by row.id', 'by row'));
  assert.ok(changedKey);
  assert.notDeepEqual(changedKey, original);
});

test('derived replacement requires proof of the actual import and rejects ambient calls', () => {
  assert.equal(proof(rootText, childText, false), undefined);
  assert.equal(proof(rootText.replace('shown(rows)', 'globalThis.shown(rows)')), undefined);
  assert.equal(proof(rootText.replace('shown(rows)', '__elnorHotRead0(rows)')), undefined);
});

test('derived replacement rejects extra event calls and unsafe actions', () => {
  assert.equal(proof(rootText.replace('=> choose(id)', '=> (choose(id), choose(id))')), undefined);
  assert.equal(proof(rootText.replace('count = count + 1;', 'globalThis.count = count + 1;')), undefined);
  assert.equal(proof(rootText, childText.replace('=> emit.choice(row.id)', '=> (emit.choice(row.id), emit.choice(row.id))')), undefined);
});
