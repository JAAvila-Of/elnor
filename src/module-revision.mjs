import {createHash} from 'node:crypto';

export const localModuleDirectory = '.elnor-modules/';
export const localModuleFile = /^\.elnor-modules\/[a-f0-9]{64}\.mjs$/;

export function moduleGraphRevision(records) {
  const ordered = [...records].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

export function sharedModuleUrl(revision, file) {
  return `/.elnor/dev/modules/${revision}/${file}`;
}
