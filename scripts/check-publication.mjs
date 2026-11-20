import {spawnSync} from 'node:child_process';

function git(args, {allowNoMatches = false} = {}) {
  const result = spawnSync('git', args, {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
  if (result.error || (result.status !== 0 && !(allowNoMatches && result.status === 1))) {
    throw new Error('Could not inspect the proposed publication.');
  }
  return result.stdout;
}

try {
  const revision = process.argv[2];
  const staged = revision === '--cached';
  if (!staged && !/^[a-f\d]{40}$/i.test(revision ?? '')) throw new Error('Expected a validated commit revision.');
  const configured = process.env.PUBLICATION_RESTRICTED_TERMS
    || (staged ? git(['config', '--local', '--get', 'publication.restrictedTerms'], {allowNoMatches: true}).trim() : '');
  if (!configured) throw new Error('The publication policy must be configured.');
  const restrictedPath = new RegExp(configured, 'iu');
  const files = staged ? git(['ls-files', '-z']) : git(['ls-tree', '-r', '--name-only', '-z', revision]);
  const paths = files.split('\0').filter(Boolean);
  const protectedPath = /(^|\/)(\.env(?:\.[^/]+)?|node_modules|__pycache__|\.elnor|dist)(\/|$)|\.(?:pem|pfx|p12|key|log|pyc)$/i;
  const invalidPaths = paths.filter(file => restrictedPath.test(file) || protectedPath.test(file));
  const content = git(['grep', '-I', '-l', '-i', '-E', '-z', '-e', configured,
    ...(staged ? ['--cached'] : [revision]), '--', '.'], {allowNoMatches: true});
  const messages = !staged && process.env.PR_BASE
    ? git(['log', '--format=%B', process.env.PR_BASE + '..' + revision]) : '';
  if (invalidPaths.length || content || restrictedPath.test(messages + '\n' + (process.env.PR_TITLE ?? ''))) {
    throw new Error('The changes contain restricted material. Review the publication policy before resubmitting.');
  }
  console.log('Publication scope verified for ' + paths.length + ' paths.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
