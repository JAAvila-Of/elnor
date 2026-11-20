import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const header = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([a-z0-9][a-z0-9./-]*\))?(!)?: (\S[^\r\n]*)$/;

export function parseCommit(message) {
  const [subject, ...body] = message.trimEnd().split(/\r?\n/);
  const match = header.exec(subject);
  if (!match) throw new Error('Use Conventional Commits in English for the title and each commit.');
  const paragraphs = body.join('\n').trim().split(/\n[ \t]*\n/);
  const footer = paragraphs.at(-1);
  const breaking = Boolean(match[2]) || /^BREAKING(?: CHANGE|-CHANGE): \S/m.test(footer);
  return {type: match[1], breaking, subject};
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const {PR_TITLE, PR_BASE, PR_HEAD} = process.env;
    if (!PR_BASE || !PR_HEAD) throw new Error('Missing pull request revisions.');
    parseCommit(PR_TITLE ?? '');
    const commits = execFileSync('git', ['log', '--no-merges', '--format=%B%x00', PR_BASE + '..' + PR_HEAD], {encoding: 'utf8'});
    for (const message of commits.split('\0').map(item => item.trim()).filter(Boolean)) parseCommit(message);
    const merges = execFileSync('git', ['rev-list', '--merges', PR_BASE + '..' + PR_HEAD], {encoding: 'utf8'});
    if (merges.trim()) throw new Error('Rebase the topic branch to remove merge commits.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
