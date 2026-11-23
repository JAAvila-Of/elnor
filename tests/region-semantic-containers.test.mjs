// Semantic containers behave as plain containers. A region must render and
// update them exactly as the general renderer does.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';
import {analyzeRegion} from '../src/region-compiler.mjs';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {FakeNode, findButton, setupDOM} from './fake-dom.mjs';

const page = `component Page(title: string) {
  state count = 0;
  state open = true;
  action add() { count++; }
  action toggle() { open = !open; }

  ui {
    main .page {
      header .top {
        h1 title
        nav {
          button "Add" => add()
          button "Toggle" => toggle()
        }
      }
      article .body {
        p count
        if open {
          footer .note {
            span "Open"
          }
        }
      }
    }
  }
}
`;

// Markers and empty text nodes are renderer details, not application DOM.
function serialize(node) {
  if (node.tag === '#comment') return '';
  if (node.tag === '#text') return node.textContent;
  const inner = node.childNodes.map(serialize).join('');
  if (node.tag === 'fragment' || node.tag === 'root') return inner;
  return `<${node.tag}${node.className ? ` class="${node.className}"` : ''}>${node._text ?? ''}${inner}</${node.tag}>`;
}

async function render(t, region) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-semantic-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'Page.eln');
  // A disposal hook keeps the same component on the general renderer.
  fs.writeFileSync(file, region ? page : page.replace('  state count', '  on dispose() => void 0\n  state count'));
  const outputDir = path.join(directory, 'build');
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check')});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  assert.equal(/region-runtime/.test(output), region);
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const root = new FakeNode('root');
  const unmount = module.mount(root, {title: 'Desk'});
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const views = [serialize(root)];
  for (const label of ['Add', 'Toggle', 'Add', 'Toggle']) {
    findButton(root, label).click();
    await settle();
    views.push(serialize(root));
  }
  unmount();
  views.push(serialize(root));
  return views;
}

test('semantic containers keep the sequential region backend', () => {
  const plan = analyzeRegion(parseSurface(page, 'Page.eln'));
  assert.equal(plan.eligible, true, JSON.stringify(plan.sequentialFailures ?? plan.failures));
});

test('a region renders and updates semantic containers like the general renderer', {timeout: 30000}, async t => {
  const general = await render(t, false);
  assert.match(general[0], /^<main class="page"><header class="top"><h1>Desk<\/h1><nav>/);
  assert.match(general[0], /<article class="body"><p>0<\/p><footer class="note"><span>Open<\/span><\/footer><\/article><\/main>$/);
  assert.equal(general.at(-1), '');
  assert.deepEqual(await render(t, true), general);
});
