// The persistent task desk from examples/persistent-task-desk: its own local
// host serves the application and forwards to a SQLite provider, which the
// flows stop, restart and replace to exercise lost replies and epochs.
import fs from 'node:fs';
import path from 'node:path';
import {startPilot} from '../../examples/persistent-task-desk/serve.mjs';
import {ensure, temporaryDirectory} from './harness.mjs';

const slot = 'elnor-task-edit-alice';
const button = (page, name) => page.getByRole('button', {name, exact: true});
const title = page => page.getByRole('textbox', {name: 'Edit title', exact: true});
const task = (page, text) => page.getByRole('button', {name: new RegExp('^TASK-1 .* ' + text + '$')});
const phase = (page, value) =>
  page.waitForFunction(expected => document.querySelector('small')?.textContent === expected, value);
const journal = page => page.evaluate(key => localStorage.getItem(key), slot);

export const application = {
  name: 'persistent-task-desk',
  async start() {
    const work = temporaryDirectory('persistent-task-desk');
    const pilot = await startPilot({database: path.join(work, 'ledger.sqlite'), seed: true, faults: true});
    return {
      url: pilot.url, pilot, work, held: {},
      async close() {
        await pilot.close();
        fs.rmSync(work, {recursive: true, force: true});
      },
    };
  },
  flows: [
    {name: 'an unknown save outcome survives a reload', async run({page, app}) {
      await page.goto(app.url);
      await button(page, 'Refresh tasks').click();
      await task(page, 'Review persistence').click();
      await title(page).fill('First persistent edit');
      await page.evaluate(() => { window.nextFault = 'after'; });
      await button(page, 'Save changes').click();
      await phase(page, 'unknown');
      ensure(await button(page, 'Save changes').isDisabled(), 'An unknown outcome must not admit a new save');
      await title(page).fill('Later draft');
      await page.reload();
      await phase(page, 'unknown');
      ensure(await title(page).inputValue() === 'First persistent edit', 'The attempt should be restored after reload');
      ensure(await button(page, 'Save changes').isDisabled(), 'A restored unknown outcome must not admit a new save');
    }},
    {name: 'after a provider restart the attempt resolves as applied', async run({page, app}) {
      await app.pilot.stopProvider();
      await app.pilot.startProvider();
      ensure(app.pilot.provider.epoch === app.pilot.identity.epoch, 'A restart keeps the epoch');
      await button(page, 'Check result').click();
      await phase(page, 'applied');
      await button(page, 'Refresh tasks').click();
      await task(page, 'First persistent edit').waitFor();
      await button(page, 'Finish attempt').click();
      ensure(await journal(page) === null, 'Finishing clears the journal');
      await task(page, 'First persistent edit').click();
      await title(page).fill('My conflict draft');
    }},
    {name: 'a remote edit produces a conflict that keeps the draft', async run({page, app}) {
      const headers = {'Content-Type': 'application/json', 'X-Provider-Epoch': app.pilot.identity.epoch};
      const base = app.pilot.provider.url + '/scopes/alice';
      const {tasks: [current]} = await (await fetch(base + '/tasks', {headers})).json();
      const {revision, ...data} = current;
      const remote = await (await fetch(base + '/commands/other-writer', {method: 'PUT', headers,
        body: JSON.stringify({kind: 'replace', taskId: data.id, expectedRevision: revision, task: {...data, title: 'Remote edit'}})})).json();
      ensure(remote.status === 'applied', 'The remote edit should apply');
      await button(page, 'Save changes').click();
      await phase(page, 'conflict');
      ensure(await title(page).inputValue() === 'My conflict draft', 'A conflict must keep the draft');
      await button(page, 'Finish attempt').click();
      await button(page, 'Refresh tasks').click();
      await task(page, 'Remote edit').waitFor();
      await button(page, 'Use current revision').click();
    }},
    {name: 'a reply lost before the provider is retryable', async run({page, app}) {
      await page.evaluate(() => { window.nextFault = 'before'; });
      await button(page, 'Save changes').click();
      await phase(page, 'unknown');
      await page.reload();
      await button(page, 'Check result').click();
      await phase(page, 'retryable');
      app.held.retry = await journal(page);
    }},
    {name: 'an outage neither replays nor changes the intent', async run({page, app}) {
      await app.pilot.stopProvider();
      await button(page, 'Check result').click();
      await phase(page, 'unknown');
      ensure(await button(page, 'Retry saved edit').isDisabled(), 'An outage must not authorize a replay');
      ensure(await journal(page) === app.held.retry, 'An outage must not change the intent');
    }},
    {name: 'a retry after the outage applies the original intent', async run({page, app}) {
      await app.pilot.startProvider();
      await button(page, 'Check result').click();
      await phase(page, 'retryable');
      await button(page, 'Retry saved edit').click();
      await phase(page, 'applied');
      await button(page, 'Refresh tasks').click();
      await task(page, 'My conflict draft').waitFor();
      await button(page, 'Finish attempt').click();
      const {tasks: [saved]} = await (await fetch(app.pilot.provider.url + '/scopes/alice/tasks',
        {headers: {'X-Provider-Epoch': app.pilot.identity.epoch}})).json();
      ensure(saved.revision === 4 && saved.title === 'My conflict draft', 'The provider should hold the retried edit once');
    }},
    {name: 'a replaced database blocks acknowledgement', async run({page, app}) {
      await task(page, 'My conflict draft').click();
      await title(page).fill('Epoch pending draft');
      await page.evaluate(() => { window.nextFault = 'before'; });
      await button(page, 'Save changes').click();
      await phase(page, 'unknown');
      const held = await journal(page);
      await app.pilot.stopProvider();
      await app.pilot.startProvider({db: path.join(app.work, 'replacement.sqlite'), initialize: true});
      ensure(app.pilot.provider.epoch !== app.pilot.identity.epoch, 'A replaced database has another epoch');
      await button(page, 'Check result').click();
      await phase(page, 'blocked');
      ensure(await button(page, 'Finish attempt').isDisabled(), 'A foreign epoch must not allow acknowledgement');
      ensure(await journal(page) === held, 'A foreign epoch must not change the journal');
      ensure(await title(page).inputValue() === 'Epoch pending draft', 'A foreign epoch must keep the draft');
    }},
  ],
};
