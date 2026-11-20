import test from 'node:test';
import assert from 'node:assert/strict';
import {proveRenderModule} from '../src/render-module-proof.mjs';

test('render proof accepts module-local helpers and read-only callbacks with lexical captures', () => {
  const result = proveRenderModule(`
    function normalize(text) { return text.trim().toLowerCase(); }
    export function visibleBooks(books, query, filter) {
      const text = normalize(query);
      return books.filter(book =>
        (filter === 'all' || !book.finished) &&
        (book.title.toLowerCase().includes(text) || book.author.toLowerCase().includes(text))
      );
    }
  `);
  assert.deepEqual(result, {functions: [{name: 'visibleBooks', readOnly: true}]});
});

const rejected = [
  ['an input property write', 'export function select(book) { book.finished = true; return book; }', 'unsupported-statement'],
  ['a captured global', 'export function select(books) { return books.filter(book => window.read(book)); }', 'external-read'],
  ['a callback with an input write', 'export function select(books) { return books.filter(book => (book.finished = true)); }', 'unsupported-expression'],
  ['a shadowed helper', 'function read(x) { return x; } export function select(read) { return read(1); }', 'unknown-call'],
  ['an unknown method', 'export function select(books) { return books.sort(); }', 'unknown-call'],
  ['a dynamic property read', 'export function select(book, key) { return book[key]; }', 'unsupported-expression'],
  ['a prototype read', 'export function select(book) { return book.constructor; }', 'unsupported-expression'],
  ['a recursive call', 'export function select(book) { return select(book); }', 'recursive-call'],
  ['an asynchronous predicate', 'export function select(books) { return books.filter(async book => !book.finished); }', 'unsupported-function'],
  ['an effectful default parameter', 'export function select(book = read()) { return book; }', 'unsupported-parameter'],
];

for (const [label, source, expected] of rejected) {
  test(`render proof rejects ${label}`, () => {
    const {functions: [fn]} = proveRenderModule(source);
    assert.equal(fn.readOnly, false);
    assert.equal(fn.issue.reason, expected);
    assert.equal(fn.issue.line, 1);
    assert.ok(fn.issue.column >= 1);
  });
}

test('top-level evaluation and imports remain outside the module proof', () => {
  for (const source of [
    'let selected; export function read(book) { return selected; }',
    'globalThis.executed = true; export function read(book) { return book; }',
    'import {read} from "./other.mjs"; export function select(item) { return read(item); }',
  ]) {
    const result = proveRenderModule(source);
    assert.equal(result.issue.reason, 'module-initialization');
    assert.deepEqual(result.functions, []);
  }
});
