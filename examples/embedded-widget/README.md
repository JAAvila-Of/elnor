# Embedded widget example

`FeedbackWidget.eln` asks one question and reports the answer. `page.html` is
a page that Elnor did not generate: it has its own markup, styles and script,
and it mounts the widget into two placeholders with different questions.

```js
import {mount} from './widget.mjs';

const dispose = mount(element, {question: element.dataset.question}, {
  answered(helpful) { /* the page decides what to do */ },
});
```

`mount(target, props, events)` renders into `target` only and returns a
function that removes what it rendered. The page keeps its placeholders, and
each widget keeps its own state.

## Building it

```sh
npm run build:project -- examples/embedded-widget/FeedbackWidget.eln --out .elnor/embedded-widget/build
```

The build writes its modules under a directory named after the build, and
`manifest.json` gives the entry as `entryOutput`. The page imports a stable
`widget.mjs` that re-exports `mount` from that entry:

```js
export {mount} from '/build/<entryOutput from manifest.json>';
```

The browser test writes this file after each build. Elnor does not generate
a stable entry for a host page yet. The manifest contains absolute source paths,
so serve the build directory's modules but not the manifest.

## Test

The [browser matrix](../../tests/browser/embedded-widget.browser.mjs) serves
the page with its own CSP and checks three things:

- Mounting leaves the markup around the placeholders and the page's heading
  style unchanged.
- Each widget answers on its own, and its event reaches the page.
- Disposing removes the widgets and leaves the placeholders empty.
