const script = document.getElementById('project-dev-reload');
const app = document.getElementById('app');
const status = document.querySelector('#project-dev-status pre');
const reloadResult = document.getElementById('project-dev-reload-result');
const reloadStorageKey = 'elnor:dev:reload-result';
const query = new URLSearchParams({build: script.dataset.build});
if (script.dataset.props) query.set('props', script.dataset.props);
if (script.dataset.hotRevision) query.set('hot', script.dataset.hotRevision);
let style = document.getElementById('project-dev-style');
let pendingStyle;
let hotMount, hotProps;
let composition;

if (app && script.dataset.hotRevision) {
  app.addEventListener('compositionstart', event => { composition = {target: event.target}; });
  app.addEventListener('compositionend', event => {
    const ending = composition;
    if (ending?.target === event.target) {
      // Give the browser a turn to dispatch the associated committed input.
      setTimeout(() => { if (composition === ending) composition = undefined; }, 0);
    }
  });
  app.addEventListener('focusout', event => {
    if (composition?.target === event.target) composition = undefined;
  });
}

if (reloadResult) {
  try {
    const saved = sessionStorage.getItem(reloadStorageKey);
    sessionStorage.removeItem(reloadStorageKey);
    const notice = JSON.parse(saved);
    if (notice?.build === script.dataset.build && typeof notice.message === 'string') {
      reloadResult.textContent = notice.message;
      reloadResult.hidden = false;
    }
  } catch {
    // Preview also works in browsers that restrict storage.
  }
}

function tryReloadPage(notice) {
  if (isComposing()) return false;
  if (notice) {
    try { sessionStorage.setItem(reloadStorageKey, JSON.stringify(notice)); }
    catch { /* Reload even when storage is restricted. */ }
  }
  location.reload();
  return true;
}

export function startHotMount(mount, props) {
  try {
    hotMount = mount(app, props);
    hotProps = props;
  } catch (error) {
    document.getElementById('preview-status').textContent = 'Preview failed: ' + error.message;
    throw error;
  }
}

const scalar = value => value === null || ['string', 'number', 'boolean'].includes(typeof value);
function transferable(value) {
  return scalar(value) || (Array.isArray(value) && value.every(item => scalar(item) ||
    (item && Object.getPrototypeOf(item) === Object.prototype && Object.values(item).every(scalar))));
}

const fieldAttribute = 'data-elnor-hot-field';
function uniqueField(binding) {
  const fields = [...app.querySelectorAll(`[${fieldAttribute}]`)].filter(node => node.getAttribute(fieldAttribute) === binding);
  return fields.length === 1 ? fields[0] : undefined;
}

function captureFocus() {
  const field = document.activeElement;
  const binding = field?.getAttribute(fieldAttribute);
  if (!binding || uniqueField(binding) !== field) return undefined;
  return {binding, tag: field.tagName, value: field.value,
    start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection};
}

function restoreFocus(saved) {
  if (!saved || document.activeElement !== document.body) return;
  const field = uniqueField(saved.binding);
  if (!field || field.disabled || field.tagName !== saved.tag || field.value !== saved.value) return;
  field.focus({preventScroll: true});
  if (document.activeElement === field && saved.start !== null && saved.end !== null) {
    field.setSelectionRange(saved.start, saved.end, saved.direction ?? 'none');
  }
}

const isComposing = () => composition?.target === document.activeElement;

async function replaceMount({entry, build}) {
  if (!hotMount) throw Error('The current preview has no hot mount');
  if (isComposing()) return false;
  const {mountHot} = await import(entry);
  if (isComposing()) return false;
  const focus = captureFocus();
  const seed = hotMount.snapshot();
  if (!seed.state.every(transferable) || !seed.rows.every(([,rows]) => rows.every(([key, values]) => scalar(key) && values.every(scalar)))) {
    throw Error('The current state cannot be carried across a replacement');
  }
  const stage = document.createDocumentFragment();
  const next = mountHot(stage, hotProps, structuredClone(seed));
  try {
    hotMount.dispose();
    app.append(stage);
  } catch (error) {
    next.dispose();
    throw error;
  }
  hotMount = next;
  composition = undefined;
  query.set('build', build);
  restoreFocus(focus);
  if (reloadResult) reloadResult.hidden = true;
  document.getElementById('preview-status').textContent = 'Build ' + build + '. Replaced the view and preserved component state.';
  return true;
}

function updateStyle(href) {
  if (!style || pendingStyle?.getAttribute('href') === href) return;
  pendingStyle?.remove();
  pendingStyle = undefined;
  if (!href || style.getAttribute('href') === href) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.media = 'not all';
  link.href = href;
  link.addEventListener('load', () => {
    if (pendingStyle !== link) return;
    link.removeAttribute('media');
    style.remove();
    link.id = 'project-dev-style';
    style = link;
    pendingStyle = undefined;
  }, {once: true});
  link.addEventListener('error', () => {
    if (pendingStyle !== link) return;
    link.remove();
    pendingStyle = undefined;
  }, {once: true});
  pendingStyle = link;
  style.after(link);
}

async function poll() {
  try {
    const response = await fetch('/.elnor/dev/status?' + query, {cache:'no-store'});
    if (response.ok) {
      const update = await response.json();
      let waiting = false;
      if (update.reload) {
        if (tryReloadPage(update.reloadNotice)) return;
        waiting = true;
      } else if (update.replacement) {
        try {
          waiting = !(await replaceMount(update.replacement));
        }
        catch {
          const reloading = tryReloadPage({build: update.replacement.build,
            message: 'Page reloaded. The replacement could not finish. Component state restarted.'});
          if (reloading) return;
          waiting = true;
        }
      }
      const message = update.message + (waiting ? '\nWaiting for text composition to finish.' : '');
      if (status && status.textContent !== message) status.textContent = message;
      updateStyle(update.css);
    }
  } catch {
    // The preview may be temporarily unreachable while development restarts.
  }
  setTimeout(poll, 500);
}

setTimeout(poll, 500);
