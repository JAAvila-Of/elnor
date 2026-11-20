import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planRelease, releaseTag} from './release-plan.mjs';

const run = (command, args, options = {}) => execFileSync(command, args, {encoding: 'utf8', ...options});
const git = (...args) => run('git', args, {maxBuffer: 16 * 1024 * 1024});
const gh = (...args) => run('gh', args, {stdio: 'inherit'});
const repository = process.env.GITHUB_REPOSITORY;
const revision = git('rev-parse', 'HEAD').trim();
const dryRun = process.argv[2] === '--dry-run';
if (!dryRun) {
  if (!repository || process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_SHA !== revision) {
    throw new Error('Publishing requires the verified main revision in GitHub Actions.');
  }
  if (!git('ls-remote', 'origin', 'refs/heads/main').startsWith(revision + '\t')) {
    console.log('A later revision of main will handle publication.');
    process.exit(0);
  }
}
const previous = git('tag', '--merged', 'HEAD', '--sort=-version:refname').trim().split('\n').find(tag => releaseTag.test(tag));
const messages = git('log', '--first-parent', '--format=%B%x00', previous ? previous + '..HEAD' : 'HEAD')
  .split('\0').map(message => message.trim()).filter(Boolean);
const {version: baseline} = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const plan = planRelease(previous, baseline, messages);

if (!plan) {
  console.log('No versioned changes since the latest release.');
} else {
  const {version, commits} = plan;
  const tag = 'v' + version;
  const name = 'elnor-' + version;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'elnor-release-'));
  try {
    const archive = path.join(temporary, name + '.tar.gz');
    const staging = path.join(temporary, name);
    const sourceTar = path.join(temporary, 'source.tar');
    git('archive', '--format=tar', '--output=' + sourceTar, '--prefix=' + name + '/', revision);
    run('tar', ['-xf', sourceTar, '-C', temporary]);
    for (const file of ['package.json', 'package-lock.json', 'editors/vscode/package.json']) {
      const target = path.join(staging, file);
      const manifest = JSON.parse(fs.readFileSync(target, 'utf8'));
      manifest.version = version;
      if (file === 'package-lock.json') manifest.packages[''].version = version;
      fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
    }
    run('tar', ['-czf', archive, '-C', temporary, name]);
    const digest = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    const checksum = archive + '.sha256';
    fs.writeFileSync(checksum, digest + '  ' + path.basename(archive) + '\n');
    const notes = path.join(temporary, 'release-notes.md');
    fs.writeFileSync(notes, '## Changes\n\n' + commits.map(commit => '- ' + commit.subject).join('\n') + '\n');
    console.log('Prepared ' + tag + ' for ' + revision);
    if (!dryRun) {
      const existing = spawnSync('gh', ['release', 'view', tag, '--repo', repository,
        '--json', 'isDraft,targetCommitish'], {encoding: 'utf8'});
      if (existing.error) throw existing.error;
      if (existing.status === 0) {
        const {isDraft, targetCommitish} = JSON.parse(existing.stdout);
        if (!isDraft) throw new Error('The release version is already in use.');
        if (targetCommitish !== revision) {
          git('merge-base', '--is-ancestor', targetCommitish, revision);
          gh('release', 'edit', tag, '--repo', repository, '--target', revision, '--notes-file', notes);
        }
      } else {
        gh('release', 'create', tag, '--repo', repository, '--target', revision,
          '--title', tag, '--notes-file', notes, '--draft');
      }
      gh('release', 'upload', tag, '--repo', repository, '--clobber', archive, checksum);
      gh('release', 'edit', tag, '--repo', repository, '--draft=false');
    }
  } finally {
    fs.rmSync(temporary, {recursive: true, force: true});
  }
}
