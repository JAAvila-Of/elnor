// ELN-UNOWNED-WORK: an interval, listener, subscription, connection or
// observer that a component starts and that nothing releases keeps running
// after the component unmounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createSurfaceLanguageService} from '../src/language-service.mjs';

const component = body => `component Live(feed: { subscribe(id: string, listener: (event: string) => void): () => void; open(id: string): { close(): void }; peek(id: string, listener: (event: string) => void): number }) {
  state count = 0;
  state timer: ReturnType<typeof setInterval> | undefined = undefined;
  state stop: ReturnType<typeof feed.subscribe> | undefined = undefined;
  state socket: WebSocket | undefined = undefined;
  state controller = new AbortController();
${body}

  ui {
    section {
      p count
    }
  }
}
`;

function warnings(t, body) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-unowned-work-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const service = createSurfaceLanguageService({root: directory});
  t.after(() => service.dispose());
  const file = path.join(directory, 'Live.eln'), text = component(body);
  service.open(file, text);
  const diagnostics = service.diagnostics(file);
  assert.ok(diagnostics.every(item => item.severity === 'warning'), JSON.stringify(diagnostics));
  return diagnostics.filter(item => item.code === 'ELN-UNOWNED-WORK').map(item => ({
    text: text.slice(item.start, item.start + item.length), line: text.slice(0, item.start).split('\n').length, message: item.message
  }));
}

const tick = '  action tick() { count++; }';

test('a discarded interval warns at the call', t => {
  const found = warnings(t, `${tick}
  action start() { setInterval(tick, 1000); }`);
  assert.deepEqual(found.map(item => item.text), ['setInterval']);
  assert.match(found[0].message, /after the component unmounts/);
  assert.match(found[0].message, /on dispose/);
});

test('an interval kept in state warns until on dispose releases it', t => {
  const start = '  action start() { timer = setInterval(tick, 1000); }';
  const halt = '  action halt() { clearInterval(timer); timer = undefined; }';
  assert.deepEqual(warnings(t, `${tick}\n${start}\n${halt}`).map(item => item.text), ['setInterval'],
    'released only by another action');
  assert.match(warnings(t, `${tick}\n${start}`)[0].message, /'timer'/);
  assert.deepEqual(warnings(t, `${tick}\n${start}\n${halt}\n  on dispose() => halt()`), []);
  assert.deepEqual(warnings(t, `${tick}\n${start}\n  on dispose() => clearInterval(timer)`), []);
  const moved = '  action start() { const handle = setInterval(tick, 1000); timer = handle; }';
  assert.deepEqual(warnings(t, `${tick}\n${moved}`).map(item => item.text), ['setInterval'], 'a local moved into state');
  assert.deepEqual(warnings(t, `${tick}\n${moved}\n${halt}\n  on dispose() => halt()`), []);
  const nested = '  action shutdown() { halt(); }\n  on dispose() => shutdown()';
  assert.deepEqual(warnings(t, `${tick}\n${start}\n${halt}\n${nested}`), [], 'actions called from the hook are followed');
});

test('a state initializer that starts work needs a release in on dispose', t => {
  const body = '  state clock = setInterval(() => count++, 1000);';
  assert.deepEqual(warnings(t, body).map(item => item.text), ['setInterval']);
  assert.deepEqual(warnings(t, `${body}\n  on dispose() => clearInterval(clock)`), []);
});

test('a listener needs a signal or a matching removal in on dispose', t => {
  assert.deepEqual(warnings(t, `${tick}
  action listen() { window.addEventListener("resize", tick); }`).map(item => item.text), ['addEventListener']);
  assert.deepEqual(warnings(t, `${tick}
  action listen() { window.addEventListener("resize", tick, {signal: controller.signal}); }
  on dispose() => controller.abort()`), []);
  const unaborted = warnings(t, `${tick}
  action listen() { window.addEventListener("resize", tick, {signal: controller.signal}); }`);
  assert.deepEqual(unaborted.map(item => item.text), ['addEventListener'], 'a signal that nothing aborts');
  assert.match(unaborted[0].message, /controller\.abort\(\)/);
  assert.deepEqual(warnings(t, `${tick}
  action listen() { addEventListener("resize", tick); }
  on dispose() => window.removeEventListener("resize", tick)`), [], 'the global target is the window');
  assert.deepEqual(warnings(t, `${tick}
  action listen() { window.addEventListener("resize", tick); }
  action unlisten() { window.removeEventListener("resize", tick); }
  on dispose() => unlisten()`), []);
  assert.deepEqual(warnings(t, `${tick}
  action other() { count--; }
  action listen() { window.addEventListener("resize", tick); }
  on dispose() => window.removeEventListener("resize", other)`).map(item => item.text), ['addEventListener'],
  'a removal of another handler does not release this one');
  assert.deepEqual(warnings(t, `${tick}
  action listen() { window.addEventListener("resize", tick, {once: true}); }`).map(item => item.text), ['addEventListener'],
  'once still waits for an event that may never come');
});

test('a subscription that returns a stopper must keep and call it', t => {
  assert.deepEqual(warnings(t, `  action follow() { feed.subscribe("a", event => { count++; }); }`).map(item => item.text), ['subscribe']);
  assert.deepEqual(warnings(t, `  action follow() { stop = feed.subscribe("a", event => { count++; }); }
  on dispose() => stop?.()`), []);
  assert.deepEqual(warnings(t, `  action follow() { const local = feed.subscribe("a", event => { count++; }); }`).map(item => item.text), ['subscribe'],
  'a local that is never used is never released');
  assert.deepEqual(warnings(t, `  action async follow() { const local = feed.subscribe("a", event => { count++; }); try { await Promise.resolve(); } finally { local(); } }`), []);
  assert.deepEqual(warnings(t, `  action follow() { return feed.subscribe("a", event => { count++; }); }`), [], 'the caller owns a returned stopper');
  assert.deepEqual(warnings(t, `  action follow() { feed.peek("a", event => { count++; }); }`), [], 'a number result is not a stopper');
});

test('connections and observers need a close in on dispose', t => {
  assert.deepEqual(warnings(t, `  action connect() { socket = new WebSocket("wss://example.test"); }`).map(item => item.text), ['WebSocket']);
  assert.deepEqual(warnings(t, `  action connect() { socket = new WebSocket("wss://example.test"); }
  on dispose() => socket?.close()`), []);
  assert.deepEqual(warnings(t, `  action observe() { new ResizeObserver(() => { count++; }).observe(document.body); }`).map(item => item.text), ['ResizeObserver']);
  assert.deepEqual(warnings(t, `  action open() { feed.open("a"); }`), [], 'an object with close is not inferred from its shape alone');
});

test('an action group does not release work its members start', t => {
  const found = warnings(t, `${tick}
  action group ticking(count) single-flight
  action async start() in ticking { timer = setInterval(tick, 1000); await Promise.resolve(); }`);
  assert.deepEqual(found.map(item => item.text), ['setInterval']);
});

test('work that ends by itself and shadowed names do not warn', t => {
  assert.deepEqual(warnings(t, `${tick}
  action later() { setTimeout(tick, 1000); }
  action async pause() { await new Promise(resolve => setTimeout(resolve, 10)); count++; }
  action local() { const setInterval = (callback: () => void, ms: number) => 0; setInterval(tick, 1); }`), []);
});

test('a UI handler that starts work warns', t => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-unowned-work-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const service = createSurfaceLanguageService({root: directory});
  t.after(() => service.dispose());
  const file = path.join(directory, 'Clock.eln');
  const text = `component Clock() {
  state count = 0;

  ui {
    section {
      p count
      button "Start" => setInterval(() => count++, 1000)
    }
  }
}
`;
  service.open(file, text);
  const found = service.diagnostics(file).filter(item => item.code === 'ELN-UNOWNED-WORK');
  assert.deepEqual(found.map(item => text.slice(item.start, item.start + item.length)), ['setInterval']);
});

test('the repository examples produce no unowned work warnings', t => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../examples');
  const files = [];
  const walk = directory => { for (const entry of fs.readdirSync(directory, {withFileTypes: true})) { const file = path.join(directory, entry.name); if (entry.isDirectory()) walk(file); else if (entry.name.endsWith('.eln')) files.push(file); } };
  walk(root);
  const service = createSurfaceLanguageService({root});
  t.after(() => service.dispose());
  const found = [];
  for (const file of files) {
    service.open(file, fs.readFileSync(file, 'utf8'));
    for (const item of service.diagnostics(file)) if (item.code === 'ELN-UNOWNED-WORK') found.push(`${path.relative(root, file)}:${item.line}`);
  }
  assert.deepEqual(found, []);
});

test('the documented Clock example is clean and warns without its disposal hook', t => {
  const doc = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/mvp/COMPONENT-DISPOSAL.md'), 'utf8');
  const example = doc.match(/```surface\n(component Clock[\s\S]*?)```/)[1];
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-unowned-work-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const service = createSurfaceLanguageService({root: directory});
  t.after(() => service.dispose());
  const file = path.join(directory, 'Clock.eln');
  service.open(file, example);
  assert.deepEqual(service.diagnostics(file), []);
  const unowned = example.replace('  on dispose() => stop()\n', '');
  service.open(file, unowned);
  const found = service.diagnostics(file);
  assert.deepEqual(found.map(item => item.code), ['ELN-UNOWNED-WORK']);
  assert.equal(unowned.slice(found[0].start, found[0].start + found[0].length), 'setInterval');
});
