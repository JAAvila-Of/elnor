// The feedback widget from examples/embedded-widget, mounted twice by a page
// written by hand, which keeps its own markup, styles and CSP.
import fs from 'node:fs';
import path from 'node:path';
import {buildSurfaceProject} from '../../src/project-build.mjs';
import {close, createSite, ensure, examples, hostCsp, listen, temporaryDirectory} from './harness.mjs';

const home = path.join(examples, 'embedded-widget');
const csp = hostCsp();

// Everything the page wrote itself, with the widget placeholders emptied.
const hostMarkup = page => page.evaluate(() => {
  const copy = document.body.cloneNode(true);
  for (const element of copy.querySelectorAll('.widget')) element.replaceChildren();
  copy.querySelector('#answers').textContent = '';
  return copy.innerHTML;
});
const widget = (page, index) => page.locator('.widget').nth(index);

export const application = {
  name: 'embedded-widget',
  async start() {
    const work = temporaryDirectory('embedded-widget');
    const site = path.join(work, 'site');
    const built = buildSurfaceProject(path.join(home, 'FeedbackWidget.eln'),
      {outputDir: path.join(site, 'build'), checkOutputDir: path.join(work, 'check')});
    fs.copyFileSync(path.join(home, 'page.html'), path.join(site, 'index.html'));
    for (const file of ['page.css', 'page.mjs']) fs.copyFileSync(path.join(home, file), path.join(site, file));
    fs.writeFileSync(path.join(site, 'widget.mjs'),
      `export {mount} from ${JSON.stringify('/build/' + built.entryOutput.replaceAll('\\', '/'))};\n`);
    const server = createSite(site, {csp});
    const url = await listen(server);
    return {url, async close() { await close(server); fs.rmSync(work, {recursive: true, force: true}); }};
  },
  flows: [
    {name: 'two widgets mount without changing the page', async run({page, app, context}) {
      const blank = await context.newPage();
      await blank.route('**/page.mjs', route => route.fulfill({contentType: 'text/javascript', body: ''}));
      await blank.goto(app.url);
      const before = await hostMarkup(blank);
      const heading = await blank.locator('h1').evaluate(element => getComputedStyle(element).color);
      await blank.close();
      const response = await page.goto(app.url);
      ensure(response.headers()['content-security-policy'] === csp, 'The page should keep its own CSP');
      await widget(page, 1).getByText('Was this summary clear?', {exact: true}).waitFor();
      ensure(await widget(page, 0).getByText('Did the install steps work?', {exact: true}).count() === 1, 'Each widget gets its own props');
      ensure(await hostMarkup(page) === before, 'Mounting must not change the markup around the widgets');
      ensure(await page.locator('h1').evaluate(element => getComputedStyle(element).color) === heading, 'The page keeps its heading style');
      ensure(await page.locator('.feedback').count() === 2, 'Expected one widget per placeholder');
    }},
    {name: 'each widget keeps its own state and reports to the page', async run({page}) {
      await widget(page, 0).getByRole('button', {name: 'Yes', exact: true}).click();
      await widget(page, 0).getByText('Thanks, glad it helped.', {exact: true}).waitFor();
      ensure(await widget(page, 1).getByText('No answer yet', {exact: true}).count() === 1, 'The other widget is untouched');
      await widget(page, 1).getByRole('button', {name: 'No', exact: true}).click();
      await widget(page, 1).getByText('Thanks, we will improve this page.', {exact: true}).waitFor();
      await page.getByRole('status').filter({hasText: 'Answers: yes, no'}).waitFor();
    }},
    {name: 'disposing removes only the widgets', async run({page}) {
      await page.getByRole('button', {name: 'Remove feedback', exact: true}).click();
      await page.getByRole('status').filter({hasText: 'Feedback removed'}).waitFor();
      ensure(await page.locator('.feedback').count() === 0, 'Disposing should remove the widgets');
      ensure(await page.locator('.widget').count() === 2, 'The placeholders belong to the page and stay');
      ensure(await page.locator('.widget').evaluateAll(elements => elements.every(element => element.childNodes.length === 0)),
        'Disposing should leave the placeholders empty');
      ensure(await page.getByRole('heading', {name: 'Changes', exact: true}).count() === 1, 'The page content stays');
    }},
  ],
};
