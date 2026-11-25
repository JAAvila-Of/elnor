// Runs the browser flows of every application in examples/ in a headless
// browser, one isolated context per application.
// Usage: npm run test:browser [application...]
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {browserChannel, root, runMatrix} from '../tests/browser/harness.mjs';

const directory = path.join(root, 'tests/browser');

export async function loadApplications(names = []) {
  const files = fs.readdirSync(directory).filter(file => file.endsWith('.browser.mjs')).sort();
  const applications = [];
  for (const file of files) {
    const {application} = await import(pathToFileURL(path.join(directory, file)));
    if (application?.name !== file.slice(0, -'.browser.mjs'.length))
      throw Error(`${file} must export an application named after the file`);
    applications.push(application);
  }
  const unknown = names.filter(name => !applications.some(application => application.name === name));
  if (unknown.length) throw Error('Unknown application: ' + unknown.join(', '));
  return names.length ? applications.filter(application => names.includes(application.name)) : applications;
}

async function main(names) {
  const applications = await loadApplications(names);
  const channel = browserChannel();
  const browser = await chromium.launch({channel, headless: true, chromiumSandbox: true, timeout: 30000});
  const runs = path.join(root, '.elnor/browser-runs');
  fs.mkdirSync(runs, {recursive: true});
  const run = fs.mkdtempSync(path.join(runs, 'run-'));
  const report = {kind: 'elnor-browser-matrix-v1', browser: {channel, version: browser.version()},
    platform: process.platform, startedAt: new Date().toISOString()};
  console.log(`Browser matrix: ${channel} ${browser.version()}`);
  try {
    Object.assign(report, await runMatrix(applications, browser, {
      onResult(result) {
        const flows = `${result.flows.filter(flow => flow.passed).length}/${result.flows.length} flows`;
        console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name} (${flows}, ${result.elapsedMs} ms)`);
        if (!result.passed) console.log('     ' + result.error);
      },
    }));
  } finally {
    await browser.close();
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(run, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('Report: ' + path.relative(root, path.join(run, 'result.json')));
  }
  if (!report.passed) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
