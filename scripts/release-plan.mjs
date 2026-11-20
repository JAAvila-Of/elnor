import {parseCommit} from './commit-policy.mjs';

export const releaseTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function planRelease(previous, baseline, messages) {
  const commits = messages.map(parseCommit);
  if (!previous) {
    if (!releaseTag.test('v' + baseline)) throw new Error('Invalid development baseline.');
    return {version: baseline, commits};
  }
  const [, major, minor, patch] = previous.match(releaseTag).map(Number);
  const breaking = commits.some(commit => commit.breaking);
  if (breaking && major > 0) return {version: (major + 1) + '.0.0', commits};
  if (breaking || commits.some(commit => commit.type === 'feat')) {
    return {version: [major, minor + 1, 0].join('.'), commits};
  }
  if (commits.some(commit => ['fix', 'perf', 'revert'].includes(commit.type))) {
    return {version: [major, minor, patch + 1].join('.'), commits};
  }
  return null;
}
