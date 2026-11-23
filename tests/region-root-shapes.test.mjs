// Components whose ui root is not a single container. Each shape is rendered
// mounted directly and inlined in a parent, through updates and unmount, and a
// region must produce the same DOM as the general renderer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {FakeNode, setupDOM} from './fake-dom.mjs';

const badge = `component Badge(label: string) {
  ui {
    span label
  }
}
`;

const shapes = {
  empty: '',
  paragraph: 'p (count)',
  button: 'button "Add" => add()',
  input: 'input "Name" <-> name',
  select: 'select "Size" <-> size {\n      option "Small" => "s"\n      option "Large" => "l"\n    }',
  headingAndButton: 'h1 "Title"\n    button "Add" => add()',
  conditionalAndList: 'if open {\n      p "Open"\n    }\n    ul {\n      li {\n        span "Item"\n      }\n    }',
  component: 'Badge label=name',
  list: 'each item in items by item {\n      div {\n        span item\n      }\n    }',
  headingAndList: 'h2 "Items"\n    each item in items by item {\n      div {\n        span item\n      }\n    }',
  componentAndConditionals:'Badge label=name\n    if open {\n      p "Open"\n    }\n    if count > 0 {\n      p (count)\n    }',
};

const leaf = body => `import Badge from "./Badge.eln";

component Leaf() {
  state count = 0;
  state open = true;
  state name = "Ada";
  state size = "s";
  state items = ["a", "b"];
  action add() { count++; open = !open; name = name + "!"; size = size === "s" ? "l" : "s"; items = [...items, items.length % 2 ? "x" : "y"]; }

  ui {
    ${body}
  }
}
`;

const parent = `import Leaf from "./Leaf.eln";

component Parent() {
  state show = true;
  action toggle() { show = !show; }

  ui {
    section {
      button "Toggle" => toggle()
      if show {
        Leaf
      }
      p "After"
    }
  }
}
`;

function serialize(node) {
  if (node.tag === '#comment') return '';
  if (node.tag === '#text') return node.textContent;
  const inner = node.childNodes.map(serialize).join('');
  if (node.tag === 'fragment' || node.tag === 'root') return inner;
  const value = ['input', 'select'].includes(node.tag) ? ` value="${node.value}"` : '';
  return `<${node.tag}${node.className ? ` class="${node.className}"` : ''}${value}>${node._text ?? ''}${inner}</${node.tag}>`;
}


async function render(t, body, {region, inlined}) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elnor-region-roots-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.writeFileSync(path.join(directory, 'Badge.eln'), badge);
  fs.writeFileSync(path.join(directory, 'Leaf.eln'), leaf(body));
  fs.writeFileSync(path.join(directory, 'Parent.eln'), parent);
  const file = path.join(directory, inlined ? 'Parent.eln' : 'Leaf.eln');
  const outputDir = path.join(directory, 'build');
  // regionBackend: false builds the same components with the general renderer.
  const build = buildSurfaceProject(file, {outputDir, checkOutputDir: path.join(directory, 'check'), regionBackend: region});
  const output = fs.readFileSync(path.join(outputDir, build.entryOutput), 'utf8');
  const module = await import(pathToFileURL(path.join(outputDir, build.entryOutput)));
  setupDOM();
  const root = new FakeNode('root');
  const unmount = module.mount(root, {});
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const click = label => root.descendants('button').find(node => node.textContent === label)?.click();
  const views = [serialize(root)];
  for (const label of inlined ? ['Add', 'Toggle', 'Toggle', 'Add'] : ['Add', 'Add']) {
    click(label);
    await settle();
    views.push(serialize(root));
  }
  unmount();
  views.push(serialize(root));
  return {region: /region-runtime/.test(output), views};
}

for (const [name, body] of Object.entries(shapes)) {
  for (const inlined of [false, true]) {
    test(`a ${name} root ${inlined ? 'inlined in a parent' : 'mounted directly'} renders like the general renderer`, {timeout: 30000}, async t => {
      const oracle = await render(t, body, {region: false, inlined});
      assert.equal(oracle.region, false);
      assert.equal(oracle.views.at(-1), '');
      const candidate = await render(t, body, {region: true, inlined});
      assert.equal(candidate.region, true, 'the region backend is selected');
      assert.deepEqual(candidate.views, oracle.views);
    });
  }
}
