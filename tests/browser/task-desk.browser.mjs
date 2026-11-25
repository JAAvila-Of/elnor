// The in-memory task desk from examples/task-desk, served by the project
// preview with its seed tasks.
import fs from 'node:fs';
import path from 'node:path';
import {ensure, examples, expectRestrictiveCsp, serveProject} from './harness.mjs';

const home = path.join(examples, 'task-desk');
const button = (page, name) => page.getByRole('button', {name, exact: true});
const label = (page, name) => page.getByLabel(name, {exact: true});
const task = (page, id) => page.getByRole('button', {name: new RegExp('^' + id + ' · ')});
const rows = page => page.locator('.task-row').count();

export const application = {
  name: 'task-desk',
  start: () => serveProject(path.join(home, 'App.eln'), {
    props: JSON.parse(fs.readFileSync(path.join(home, 'preview-props.json'), 'utf8')),
    cssFile: path.join(home, 'style.css'),
  }),
  flows: [
    {name: 'load the seed tasks', async run({page, app}) {
      expectRestrictiveCsp(await page.goto(app.url));
      await page.getByRole('heading', {name: 'Task desk', exact: true}).waitFor();
      ensure(await rows(page) === 4, 'Expected four seed tasks');
      ensure(await page.getByRole('main').count() === 1, 'Expected one main landmark');
    }},
    {name: 'search and filter', async run({page}) {
      await label(page, 'Search tasks').fill('PARSER');
      ensure(await rows(page) === 1, 'Search should narrow the list to one task');
      await button(page, 'Clear filters').click();
      await button(page, 'Completed').click();
      ensure(await rows(page) === 1, 'The status filter should leave one task');
      await button(page, 'Clear filters').click();
    }},
    {name: 'protect an unsaved draft when switching tasks', async run({page}) {
      await task(page, 'TASK-1').click();
      await button(page, 'Edit task').click();
      await label(page, 'Edit title').fill('An unsaved parser draft');
      await task(page, 'TASK-2').click();
      await button(page, 'Keep editing').click();
      ensure(await label(page, 'Edit title').inputValue() === 'An unsaved parser draft', 'Keeping must preserve the draft');
      await task(page, 'TASK-2').click();
      await button(page, 'Discard draft and switch').click();
      ensure(await label(page, 'Edit title').count() === 0, 'A new selection starts outside edit mode');
      await task(page, 'TASK-1').click();
      await button(page, 'Edit task').click();
      ensure(await label(page, 'Edit title').inputValue() === 'Improve parser recovery', 'Discarding must not save');
    }},
    {name: 'validate and save an edit', async run({page}) {
      await label(page, 'Edit title').fill(' ');
      await button(page, 'Save changes').click();
      await page.getByText('Use at least 3 characters for the title.', {exact: true}).waitFor();
      await label(page, 'Edit title').fill('Improve scoped parser recovery');
      await label(page, 'Edit assignee').fill('Taylor');
      // The wrapping label also names the select with its current option.
      await page.getByRole('combobox', {name: /^Edit priority/}).selectOption('high');
      await button(page, 'Save changes').click();
      ensure((await task(page, 'TASK-1').textContent()).includes('Improve scoped parser recovery'), 'The title should be saved');
      await button(page, 'Complete task').click();
      await button(page, 'Completed').click();
      ensure(await rows(page) === 2, 'Completing should update the filter');
      await button(page, 'Clear filters').click();
    }},
    {name: 'create and delete tasks', async run({page}) {
      await button(page, 'Create task').click();
      await page.getByText('Use at least 3 characters for the title.', {exact: true}).waitFor();
      await label(page, 'New task title').fill('Triage import resolution');
      await label(page, 'New task assignee').fill('Alex');
      await label(page, 'New task description').fill('Follow the local module resolution path.');
      await button(page, 'Create task').click();
      ensure(await rows(page) === 5, 'The new task should be listed');
      ensure(await task(page, 'TASK-5').count() === 1, 'Expected the next local ID');
      ensure(await label(page, 'New task title').inputValue() === '', 'The composer should reset');
      await button(page, 'Delete task').click();
      await button(page, 'Keep task').click();
      ensure(await task(page, 'TASK-5').count() === 1, 'Keeping must not delete');
      await button(page, 'Delete task').click();
      await button(page, 'Delete permanently').click();
      ensure(await task(page, 'TASK-5').count() === 0, 'Confirming must delete');
      await label(page, 'New task title').fill('Keep local task numbers monotonic');
      await button(page, 'Create task').click();
      ensure(await task(page, 'TASK-6').count() === 1, 'A deleted ID must not be reused');
    }},
    {name: 'reload restores the seed and the layout fits a phone', async run({page}) {
      await page.reload();
      await page.getByRole('heading', {name: 'Task desk', exact: true}).waitFor();
      ensure(await rows(page) === 4, 'Reload should restore the seed tasks');
      await page.setViewportSize({width: 390, height: 844});
      ensure(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'No horizontal overflow on a phone');
      await task(page, 'TASK-1').click();
      await button(page, 'Edit task').click();
      await label(page, 'Edit title').press('Tab');
      ensure(await page.evaluate(() => document.activeElement?.tagName) === 'INPUT', 'Tab should reach the next field');
    }},
  ],
};
