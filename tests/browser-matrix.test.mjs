import test from 'node:test';
import assert from 'node:assert/strict';
import {loadApplications} from '../scripts/browser-matrix.mjs';
import {browserChannel, runMatrix} from './browser/harness.mjs';

// A stand-in for a Playwright browser: enough of a context to run flows, and a
// way for a test to raise a page error or a CSP report from a page.
function fakeBrowser() {
  const contexts = [];
  return {
    contexts,
    async newContext() {
      const listeners = {page: [], request: []};
      const context = {
        closed: false, bindings: {},
        setDefaultTimeout() {},
        async exposeBinding(name, callback) { context.bindings[name] = callback; },
        async addInitScript() {},
        on(event, listener) { listeners[event].push(listener); },
        async newPage() {
          const pageListeners = {pageerror: []};
          const page = {
            on(event, listener) { pageListeners[event]?.push(listener); },
            async waitForTimeout() {},
            raise(message) { for (const listener of pageListeners.pageerror) listener(Error(message)); },
            violate(directive) { context.bindings.__elnorReportViolation({}, {directive, blocked: 'inline'}); },
            request(url) { for (const listener of listeners.request) listener({url: () => url}); },
          };
          for (const listener of listeners.page) listener(page);
          return page;
        },
        async close() { context.closed = true; },
      };
      contexts.push(context);
      return context;
    },
  };
}

function application(name, flows, closed) {
  return {
    name,
    async start() { return {url: 'http://127.0.0.1:4000', close: async () => closed.push(name)}; },
    flows: flows.map((run, index) => ({name: name + ' flow ' + (index + 1), run})),
  };
}

test('a failing flow fails only its application and stops its later flows', async () => {
  const closed = [], ran = [];
  const browser = fakeBrowser();
  const report = await runMatrix([
    application('first', [async () => { ran.push('first'); }], closed),
    application('broken', [async () => { throw Error('regressed'); }, async () => { ran.push('after broken'); }], closed),
    application('last', [async () => { ran.push('last'); }], closed),
  ], browser);
  assert.equal(report.passed, false);
  assert.deepEqual(report.applications.map(result => [result.name, result.passed]),
    [['first', true], ['broken', false], ['last', true]]);
  assert.match(report.applications[1].error, /broken flow 1: regressed/);
  assert.deepEqual(report.applications[1].flows.map(flow => flow.passed), [false]);
  assert.deepEqual(ran, ['first', 'last']);
  assert.deepEqual(closed, ['first', 'broken', 'last']);
  assert.ok(browser.contexts.every(context => context.closed));
});

test('page errors, unexpected CSP reports and requests to other origins fail the application', async () => {
  const closed = [];
  const report = await runMatrix([
    application('error', [async ({page}) => page.raise('boom')], closed),
    application('csp', [async ({page}) => page.violate('script-src-elem')], closed),
    application('foreign', [async ({page}) => page.request('https://cdn.example.test/lib.js')], closed),
    application('taken', [async ({page, takeViolations}) => {
      page.violate('connect-src');
      assert.equal((await takeViolations()).length, 1);
    }], closed),
  ], fakeBrowser());
  assert.deepEqual(report.applications.map(result => [result.name, result.passed]),
    [['error', false], ['csp', false], ['foreign', false], ['taken', true]]);
  assert.match(report.applications[0].error, /Page errors: boom/);
  assert.match(report.applications[1].error, /Unexpected CSP violations/);
  assert.match(report.applications[2].error, /cdn\.example\.test/);
});

test('an application that cannot start is reported and the others still run', async () => {
  const closed = [];
  const report = await runMatrix([
    {name: 'unstartable', flows: [], async start() { throw Error('port in use'); }},
    application('next', [async () => {}], closed),
  ], fakeBrowser());
  assert.deepEqual(report.applications.map(result => [result.name, result.passed]), [['unstartable', false], ['next', true]]);
  assert.equal(report.applications[0].error, 'port in use');
});

test('the matrix loads one application per description file', async () => {
  const names = (await loadApplications()).map(item => item.name);
  assert.deepEqual(names, ['authoring', 'components', 'durable-save', 'embedded-widget', 'persistent-task-desk', 'task-desk']);
  await assert.rejects(loadApplications(['missing']), /Unknown application: missing/);
});

test('the browser channel defaults by platform and refuses others', () => {
  assert.equal(browserChannel({}, 'win32'), 'msedge');
  assert.equal(browserChannel({}, 'linux'), 'chrome');
  assert.equal(browserChannel({ELNOR_BROWSER: 'msedge'}, 'darwin'), 'msedge');
  assert.throws(() => browserChannel({ELNOR_BROWSER: 'firefox'}, 'linux'), /chrome or msedge/);
});
