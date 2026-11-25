// The authoring exercise from examples/authoring: a parent that listens to a
// child component's event.
import path from 'node:path';
import {examples, expectRestrictiveCsp, serveProject} from './harness.mjs';

const home = path.join(examples, 'authoring');

export const application = {
  name: 'authoring',
  start: () => serveProject(path.join(home, 'App.eln'), {cssFile: path.join(home, 'style.css')}),
  flows: [
    {name: 'a child event updates the parent', async run({page, app}) {
      expectRestrictiveCsp(await page.goto(app.url));
      await page.getByRole('heading', {name: 'Clicks: 0', exact: true}).waitFor();
      await page.getByText('Last event: 0', {exact: true}).waitFor();
      const increment = page.getByRole('button', {name: 'Increment', exact: true});
      await increment.click();
      await increment.click();
      await page.getByRole('heading', {name: 'Clicks: 2', exact: true}).waitFor();
      await page.getByText('Last event: 2', {exact: true}).waitFor();
    }},
  ],
};
