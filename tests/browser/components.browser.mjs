// The composed user editor from examples/components, served by the
// standalone preview with its restrictive CSP.
import fs from 'node:fs';
import path from 'node:path';
import {build} from '../../src/compiler.mjs';
import {createServer} from '../../src/server.mjs';
import {close, ensure, expectRestrictiveCsp, listen, temporaryDirectory} from './harness.mjs';

// A same-origin module lets the browser enforce unsafe-eval on a normal
// script; code run through the automation protocol would not prove it.
const cspProbe = `const result={evalBlocked:false,functionBlocked:false};
try{(0,eval)('globalThis.__elnorEvalExecuted=true');}catch(error){result.evalBlocked=error instanceof EvalError;}
try{new Function('globalThis.__elnorFunctionExecuted=true')();}catch(error){result.functionBlocked=error instanceof EvalError;}
globalThis.__elnorCspProbe=result;
`;

const button = (page, name) => page.getByRole('button', {name, exact: true});
const textbox = (page, name) => page.getByRole('textbox', {name, exact: true});
const payload = '<img src=x onerror="window.__elnorXss=1">';

export const application = {
  name: 'components',
  async start() {
    const dist = temporaryDirectory('components');
    fs.cpSync(build('UserEditor').dist, dist, {recursive: true});
    fs.writeFileSync(path.join(dist, 'csp-probe.mjs'), cspProbe);
    const server = createServer({dist});
    const url = await listen(server);
    return {url, async close() { await close(server); fs.rmSync(dist, {recursive: true, force: true}); }};
  },
  flows: [
    {name: 'load under the restrictive CSP', async run({page, app}) {
      const policy = expectRestrictiveCsp(await page.goto(app.url));
      ensure(policy.includes("connect-src 'none'"), 'The preview must not allow connections');
      await button(page, 'Ana Torres').waitFor();
    }},
    {name: 'filter and restore the composed list', async run({page}) {
      await textbox(page, 'Buscar usuarios').fill('Luis');
      await button(page, 'Ana Torres').waitFor({state: 'hidden'});
      ensure(await page.locator('#app li').count() === 1, 'Search should leave one row');
      await button(page, 'Limpiar búsqueda').click();
      await button(page, 'Ana Torres').waitFor();
      ensure(await page.locator('#app li').count() === 3, 'Clearing should restore three rows');
    }},
    {name: 'reject an invalid name from a child editor', async run({page}) {
      await button(page, 'Ana Torres').click();
      await textbox(page, 'Nombre').fill('A');
      await button(page, 'Guardar').click();
      await page.getByText('El nombre debe tener 2 caracteres como mínimo', {exact: true}).waitFor();
      ensure(await page.getByRole('status').textContent() === '', 'An invalid name must not emit saved');
    }},
    {name: 'save text that looks like markup as text', async run({page}) {
      await textbox(page, 'Nombre').fill(payload);
      await button(page, 'Guardar').click();
      await button(page, payload).waitFor();
      await page.getByRole('status').filter({hasText: 'Guardado: ' + payload}).waitFor();
      ensure(await page.locator('#app img').count() === 0, 'The name must not become HTML');
      ensure(await page.evaluate(() => globalThis.__elnorXss === undefined), 'The name must not run a handler');
    }},
    {name: 'cancel then confirm a deletion', async run({page}) {
      await button(page, 'Eliminar usuario...').click();
      await button(page, 'Cancelar').click();
      ensure(await button(page, payload).count() === 1, 'Cancelling must keep the row');
      await button(page, 'Eliminar usuario...').click();
      await button(page, 'Eliminar').click();
      await button(page, payload).waitFor({state: 'hidden'});
      await page.getByRole('status').filter({hasText: 'Eliminado: u1'}).waitFor();
      ensure(await page.locator('#app li').count() === 2, 'Deletion must keep the other two rows');
      ensure(await textbox(page, 'Nombre').count() === 0, 'Deleting the selection closes its editor');
    }},
    {name: 'the browser blocks inline code, handlers, eval and fetch', async run({page, takeViolations}) {
      const security = await page.evaluate(async () => {
        const inline = document.createElement('script');
        inline.textContent = 'globalThis.__elnorInlineExecuted=true';
        document.body.append(inline);
        const handler = document.createElement('button');
        handler.setAttribute('onclick', 'globalThis.__elnorHandlerExecuted=true');
        document.body.append(handler);
        handler.click();
        let fetchBlocked = false;
        try { await fetch('/manifest.json'); } catch (error) { fetchBlocked = error instanceof TypeError; }
        const probe = document.createElement('script');
        probe.type = 'module';
        probe.src = '/csp-probe.mjs';
        await new Promise((resolve, reject) => {
          probe.onload = resolve;
          probe.onerror = () => reject(Error('The same-origin probe did not load'));
          document.body.append(probe);
        });
        inline.remove(); handler.remove(); probe.remove();
        return {inlineBlocked: globalThis.__elnorInlineExecuted === undefined,
          handlerBlocked: globalThis.__elnorHandlerExecuted === undefined, fetchBlocked, ...globalThis.__elnorCspProbe,
          evalExecuted: globalThis.__elnorEvalExecuted === true, functionExecuted: globalThis.__elnorFunctionExecuted === true};
      });
      for (const name of ['inlineBlocked', 'handlerBlocked', 'fetchBlocked', 'evalBlocked', 'functionBlocked'])
        ensure(security[name] === true, 'CSP check failed: ' + name);
      ensure(!security.evalExecuted && !security.functionExecuted, 'Dynamic code must not run');
      const violations = await takeViolations();
      ensure(violations.some(item => item.directive === 'connect-src'), 'Expected a connect-src violation');
      ensure(violations.some(item => item.blocked === 'eval'), 'Expected an eval violation');
      ensure(violations.some(item => item.directive.startsWith('script-src')), 'Expected a script-src violation');
      return {violations: violations.length};
    }},
  ],
};
