import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {retainedModuleSource} from '../src/module-plan.mjs';

const source = fs.readFileSync(new URL('../src/form-schema.ts', import.meta.url), 'utf8');
const code = retainedModuleSource(source, 'form-schema.ts');
const {bindFormSchema, bindFormPaths} = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const standard = validate => ({'~standard': {version: 1, vendor: 'fixture', validate}});

test('form schema exposes only validated output and retains the original issues on failure', () => {
  const issues = [{path: ['title'], message: 'Title is too short.'}];
  const form = bindFormSchema(standard(value => value.title.length < 3
    ? {value, issues}
    : {value: {title: value.title.trim()}, extra: 'vendor metadata'}), ['title', 'description']);
  const failed = form.validate({title: 'x'});
  assert.equal(failed.value, undefined);
  assert.equal(failed.issues, issues);
  assert.deepEqual(form.fieldErrors(failed), {title: issues[0].message, description: ''});
  const valid = form.validate({title: '  Ready  '});
  assert.deepEqual(valid, {value: {title: 'Ready'}});
  assert.equal(form.fieldErrors(valid), form.fieldErrors());
  assert.ok(Object.isFrozen(form.fieldErrors()));
  assert.ok(Object.isFrozen(form.fieldErrors(failed)));
});

test('form paths match full segments, preserve first messages, and snapshot bindings', () => {
  const paths = {requester: ['requester', 'name'], reviewer: ['reviewer', 'name']};
  const issues = [
    {message: 'Form error'},
    {path: ['requester.name'], message: 'Literal dotted key'},
    {path: ['requester'], message: 'Parent error'},
    {path: [{key: 'requester'}, {key: 'name'}], message: 'Requester error'},
    {path: ['requester', 'name'], message: 'Later requester error'},
    {path: ['reviewer', 'name'], message: 'Reviewer error'}
  ];
  const form = bindFormPaths(standard(() => ({issues})), paths);
  paths.requester[0] = 'reviewer';
  const failed = form.validate({});
  assert.deepEqual(form.fieldErrors(failed), {requester: 'Requester error', reviewer: 'Reviewer error'});
  assert.equal(failed.issues, issues);
  assert.deepEqual(form.unboundIssues(failed), issues.slice(0, 3));
  assert.ok(Object.isFrozen(form.unboundIssues(failed)));
  assert.deepEqual(form.unboundIssues({value: {requestedBy: 'Ada'}}), []);
  assert.deepEqual(form.unboundIssues(), []);
});

test('form schema refuses pending validation even when the promise comes from another realm', () => {
  const form = bindFormSchema(standard(() => vm.runInNewContext('Promise.reject(new Error("Async validator"))')), ['title']);
  assert.throws(() => form.validate({title: 'Ready'}), /must validate synchronously/);
});

test('array indices match numeric issue segments exactly', () => {
  const form = bindFormPaths(standard(() => ({issues: []})), {
    rowA: ['contacts', 0, 'email'],
    rowB: ['contacts', 1, 'email']
  });
  const stringIndex = {path: ['contacts', '0', 'email'], message: 'String key'};
  const result = {issues: [
    stringIndex,
    {path: ['contacts', {key: 0}, 'email'], message: 'First row'},
    {path: ['contacts', 1, 'email'], message: 'Second row'}
  ]};
  assert.deepEqual(form.fieldErrors(result), {rowA: 'First row', rowB: 'Second row'});
  assert.deepEqual(form.unboundIssues(result), [stringIndex]);
});
