// Shared pieces of the browser regression matrix: serving an application,
// watching every page of its context, and running applications in isolation.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatSourceDiagnostics} from '../../scripts/authoring-diagnostics.mjs';
import {buildSurfaceProject} from '../../src/project-build.mjs';
import {createProjectPreview} from '../../src/project-preview.mjs';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const examples = path.join(root, 'examples');

export function ensure(value, message) {
  if (!value) throw Error(message);
}

export function browserChannel(env = process.env, platform = process.platform) {
  const channel = env.ELNOR_BROWSER || (platform === 'win32' ? 'msedge' : 'chrome');
  if (!['chrome', 'msedge'].includes(channel)) throw Error('ELNOR_BROWSER must be chrome or msedge');
  return channel;
}

export function temporaryDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'elnor-browser-' + prefix + '-'));
}

export function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve('http://127.0.0.1:' + server.address().port);
    });
  });
}

export function close(server) {
  return new Promise(resolve => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

// Builds an Elnor project into a temporary directory and serves it with the
// project preview, which sends the restrictive CSP of every preview.
export async function serveProject(entry, {props = {}, cssFile} = {}) {
  const work = temporaryDirectory(path.basename(path.dirname(entry)));
  const outputDir = path.join(work, 'site');
  buildSurfaceProject(entry, {outputDir, checkOutputDir: path.join(work, 'check')});
  const server = createProjectPreview({outputDir, props, cssFile, expectedEntry: entry});
  const url = await listen(server);
  return {
    url,
    async close() {
      await close(server);
      fs.rmSync(work, {recursive: true, force: true});
    },
  };
}

export const hostCsp = ({connect = "'none'"} = {}) => "default-src 'none'; script-src 'self'; style-src 'self'; "
  + `connect-src ${connect}; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
const siteTypes = {'.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json'};

// Serves a directory the way a host page that is not Elnor's would be served,
// with its own CSP. `api` handles the routes under /api/.
export function createSite(site, {csp, api}) {
  const base = path.resolve(site);
  return http.createServer(async (request, response) => {
    const headers = {'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store'};
    const {pathname} = new URL(request.url, 'http://127.0.0.1');
    if (api && pathname.startsWith('/api/')) {
      try {
        await api(request, response, pathname, headers);
      } catch {
        if (!response.headersSent) response.writeHead(500, headers);
        response.end();
      }
      return;
    }
    let file;
    try {
      file = path.resolve(base, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
    } catch {
      file = undefined;
    }
    const type = file && siteTypes[path.extname(file)];
    if (request.method !== 'GET' || !type || !file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404, headers);
      response.end();
      return;
    }
    response.writeHead(200, {...headers, 'Content-Type': type});
    response.end(fs.readFileSync(file));
  });
}

export function expectRestrictiveCsp(response) {
  const policy = response?.headers()['content-security-policy'] ?? '';
  ensure(policy.includes("script-src 'self'"), 'Expected script-src self in the CSP, got: ' + policy);
  ensure(!/unsafe-inline|unsafe-eval/.test(policy), 'The CSP must not allow unsafe code: ' + policy);
  return policy;
}

// Runs before any page script and reports each violation to Node at once, so
// that a reload or a closed tab cannot lose one.
function reportViolations() {
  document.addEventListener('securitypolicyviolation', event => {
    globalThis.__elnorReportViolation({directive: event.effectiveDirective, blocked: event.blockedURI, url: location.href});
  });
}

async function watchContext(context, origin) {
  const observed = {pageErrors: [], foreignRequests: [], violations: []};
  await context.exposeBinding('__elnorReportViolation', (_source, violation) => observed.violations.push(violation));
  await context.addInitScript(reportViolations);
  context.on('page', page => page.on('pageerror', error => observed.pageErrors.push(error.message)));
  context.on('request', request => {
    const url = request.url();
    if (!url.startsWith(origin + '/') && !url.startsWith('data:')) observed.foreignRequests.push(url);
  });
  return observed;
}

function withTimeout(promise, ms, name) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error(`Flow "${name}" exceeded ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Each application gets its own browser context and its own servers. A
// failure stops the remaining flows of that application only.
export async function runApplication(application, browser, {flowTimeout = 60000} = {}) {
  const result = {name: application.name, passed: false, flows: [], startedAt: new Date().toISOString()};
  const started = Date.now();
  let app, context;
  try {
    app = await application.start();
    context = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
    context.setDefaultTimeout(10000);
    const observed = await watchContext(context, new URL(app.url).origin);
    // Lets a flow that provokes violations on purpose take them, after the
    // browser has delivered the pending reports.
    const takeViolations = async () => {
      await page.waitForTimeout(100);
      return observed.violations.splice(0);
    };
    const page = await context.newPage();
    for (const flow of application.flows) {
      const flowStarted = Date.now();
      try {
        const detail = await withTimeout(flow.run({page, context, app, takeViolations}), flowTimeout, flow.name);
        result.flows.push({name: flow.name, passed: true, elapsedMs: Date.now() - flowStarted, ...(detail ? {detail} : {})});
      } catch (error) {
        result.flows.push({name: flow.name, passed: false, elapsedMs: Date.now() - flowStarted, error: error.message});
        throw Object.assign(Error(`${flow.name}: ${error.message}`), {reported: true});
      }
    }
    ensure(observed.pageErrors.length === 0, 'Page errors: ' + observed.pageErrors.join('; '));
    ensure(observed.violations.length === 0, 'Unexpected CSP violations: ' + JSON.stringify(observed.violations));
    ensure(observed.foreignRequests.length === 0, 'Requests to other origins: ' + observed.foreignRequests.join(', '));
    result.passed = true;
  } catch (error) {
    result.error = error.diagnostics
      ? error.message + '\n' + formatSourceDiagnostics(error.diagnostics, error.sources)
      : error.message;
  } finally {
    try {
      await context?.close();
    } catch (error) {
      result.passed = false;
      result.error ??= 'Closing the browser context failed: ' + error.message;
    }
    try {
      await app?.close?.();
    } catch (error) {
      result.passed = false;
      result.error ??= 'Stopping the application failed: ' + error.message;
    }
    result.elapsedMs = Date.now() - started;
  }
  return result;
}

export async function runMatrix(applications, browser, options = {}) {
  const results = [];
  for (const application of applications) {
    const result = await runApplication(application, browser, options);
    options.onResult?.(result);
    results.push(result);
  }
  return {passed: results.every(result => result.passed), applications: results};
}
