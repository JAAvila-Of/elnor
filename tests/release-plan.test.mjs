import assert from 'node:assert/strict';
import test from 'node:test';
import {parseCommit} from '../scripts/commit-policy.mjs';
import {planRelease} from '../scripts/release-plan.mjs';

test('initial releases use the development baseline', () => {
  assert.equal(planRelease(undefined, '0.0.4', ['feat: publish the first snapshot']).version, '0.0.4');
});

test('the highest applicable change determines the pre-1.0 version', () => {
  assert.equal(planRelease('v0.3.9', '0.0.4', ['fix: retain the selected row']).version, '0.3.10');
  assert.equal(planRelease('v0.3.9', '0.0.4', ['perf: reduce reads', 'feat(editor): add hover']).version, '0.4.0');
  assert.equal(planRelease('v0.3.9', '0.0.4', ['refactor!: change the entry contract']).version, '0.4.0');
  assert.equal(planRelease('v0.3.9', '0.0.4', ['docs: describe preview']), null);
});

test('a breaking footer triggers a major release after 1.0', () => {
  const message = 'refactor: simplify the entry contract\n\nBREAKING CHANGE: rename the entry point';
  assert.equal(planRelease('v1.3.9', '0.0.4', [message]).version, '2.0.0');
  assert.equal(parseCommit('docs: describe syntax\n\nBREAKING CHANGE: example text\n\nA final paragraph.').breaking, false);
  assert.throws(() => parseCommit('Update the docs'), /Conventional Commits/);
});
