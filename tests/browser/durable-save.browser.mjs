// The durable save example from examples/durable-save, with the host page
// its README describes: one journal for the signed-in account, kept in
// IndexedDB, and a same-origin proxy to the SQLite reference provider.
import fs from 'node:fs';
import path from 'node:path';
import {launchLocalProcess} from '../../examples/persistent-task-desk/local-process.mjs';
import {buildSurfaceProject} from '../../src/project-build.mjs';
import {getTs} from '../../src/typescript.mjs';
import {close, createSite, ensure, examples, hostCsp, listen, root, temporaryDirectory} from './harness.mjs';

const home = path.join(examples, 'durable-save');
const python = process.env.ELNOR_TEST_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const csp = hostCsp({connect: "'self'"});

function buildSite(work) {
  const site = path.join(work, 'site');
  const built = buildSurfaceProject(path.join(home, 'DurableSave.eln'),
    {outputDir: path.join(site, 'build'), checkOutputDir: path.join(work, 'check')});
  const host = getTs().transpileModule(fs.readFileSync(path.join(home, 'host.ts'), 'utf8'),
    {compilerOptions: {module: 99, target: 99}}).outputText;
  ensure(host.includes('"../../src/intents.mjs"'), 'host.ts should import the intents module');
  fs.writeFileSync(path.join(site, 'host.mjs'), host.replace('"../../src/intents.mjs"', '"/intents.mjs"'));
  fs.copyFileSync(path.join(root, 'src/intents.mjs'), path.join(site, 'intents.mjs'));
  fs.writeFileSync(path.join(site, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8">'
    + '<title>Durable save</title><main></main><script type="module" src="/boot.mjs"></script></html>\n');
  fs.writeFileSync(path.join(site, 'boot.mjs'), `import {createNotes} from '/host.mjs';
import {mount} from ${JSON.stringify('/build/' + built.entryOutput.replaceAll('\\', '/'))};
const {notes} = createNotes({account: 'alice', baseUrl: '/api'});
mount(document.querySelector('main'), {notes});
`);
  return site;
}

async function startProvider(db) {
  const run = launchLocalProcess(python, ['-u', path.join(home, 'provider_fixture.py'), '--db', db, '--faults'],
    {label: 'Durable provider'});
  const ready = await run.ready();
  return {...ready, url: 'http://127.0.0.1:' + ready.port, stop: run.stop};
}

// Forwards /api/<operation>/<key> to the provider. A fault set by a flow
// applies to the next intent request only.
function forwardIntents(state) {
  return async (request, response, pathname, headers) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const forwarded = {};
    for (const name of ['content-type', 'intent-scope', 'intent-epoch', 'x-fixture-account']) {
      if (request.headers[name] !== undefined) forwarded[name] = request.headers[name];
    }
    if (state.fault) { forwarded['x-fixture-fault'] = state.fault; state.fault = null; }
    let answer;
    try {
      answer = await fetch(state.provider.url + pathname.slice('/api'.length),
        {method: request.method, headers: forwarded, body: request.method === 'PUT' ? Buffer.concat(chunks) : undefined});
    } catch {
      // The provider dropped the connection or is stopped: the page sees a lost reply.
      response.destroy();
      return;
    }
    response.writeHead(answer.status, {...headers, 'Content-Type': 'application/json'});
    response.end(Buffer.from(await answer.arrayBuffer()));
  };
}

const text = page => page.getByRole('textbox', {name: 'Text', exact: true});
const saveButton = page => page.getByRole('button', {name: 'Save', exact: true});
const label = (page, value) => page.locator('section small').filter({hasText: new RegExp('^' + value + '$')}).waitFor();
const effects = async app => (await (await fetch(app.state.provider.url + '/stats')).json()).effects;

// Waits for the provider to reach the expected count of effects, then checks
// that it stays there, so that a duplicate sent late is still caught.
async function expectEffects(app, expected, message) {
  const deadline = Date.now() + 15000;
  let count = await effects(app);
  while (count < expected && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
    count = await effects(app);
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  count = await effects(app);
  ensure(count === expected, `${message}: expected ${expected} effects, found ${count}`);
}

async function save(page, value) {
  await text(page).fill(value);
  await saveButton(page).click();
}

export const application = {
  name: 'durable-save',
  async start() {
    const work = temporaryDirectory('durable-save');
    const db = path.join(work, 'ledger.sqlite');
    const state = {db, provider: await startProvider(db), fault: null};
    const server = createSite(buildSite(work), {csp, api: forwardIntents(state)});
    const url = await listen(server);
    return {
      url, state,
      async close() {
        await close(server);
        await state.provider.stop();
        fs.rmSync(work, {recursive: true, force: true});
      },
    };
  },
  flows: [
    {name: 'a save is applied once', async run({page, app}) {
      const response = await page.goto(app.url);
      ensure(response.headers()['content-security-policy'] === csp, 'The host should send its CSP');
      await label(page, 'Ready');
      await save(page, 'First note');
      await expectEffects(app, 1, 'The provider should apply one effect');
      await label(page, 'Saved');
    }},
    {name: 'a reply lost after the commit is not applied twice', async run({page, app}) {
      app.state.fault = 'after';
      await save(page, 'Second note');
      await expectEffects(app, 2, 'The resent intent should apply once');
      await label(page, 'Saved');
    }},
    {name: 'a pending intent resumes after a reload', async run({page, app}) {
      // With the provider stopped the intent stays in the journal.
      await app.state.provider.stop();
      await save(page, 'Third note');
      await label(page, 'Saving');
      await page.reload();
      await label(page, 'Saving');
      app.state.provider = await startProvider(app.state.db);
      await expectEffects(app, 3, 'The resumed intent should apply once');
      await label(page, 'Saved');
    }},
    {name: 'a conflict keeps the draft for review', async run({page, app}) {
      const {epoch, url} = app.state.provider;
      const other = await fetch(url + '/notes.save/' + crypto.randomUUID(), {method: 'PUT',
        headers: {'Content-Type': 'application/json', 'Intent-Scope': 'alice', 'Intent-Epoch': epoch, 'X-Fixture-Account': 'alice'},
        body: JSON.stringify({input: {text: 'Their note', revision: 3}})});
      ensure(other.status === 200, 'The other writer should apply, got ' + other.status);
      await save(page, 'My note');
      await page.getByText('Their text: Their note', {exact: true}).waitFor();
      ensure(await text(page).inputValue() === 'My note', 'A conflict must keep the draft');
      ensure(await saveButton(page).isDisabled(), 'Save waits for the review');
      await page.getByRole('button', {name: 'Keep my text', exact: true}).click();
      await saveButton(page).click();
      await expectEffects(app, 5, 'The reviewed save should apply with a new key');
      await label(page, 'Saved');
    }},
    {name: 'an intent admitted in a closed tab is sent by another tab', async run({page, context, app}) {
      await app.state.provider.stop();
      await save(page, 'Note from a closed tab');
      await label(page, 'Saving');
      const other = await context.newPage();
      await page.close();
      await other.goto(app.url);
      await label(other, 'Saving');
      app.state.provider = await startProvider(app.state.db);
      await expectEffects(app, 6, 'The other tab should send the intent once');
      await label(other, 'Saved');
    }},
  ],
};
