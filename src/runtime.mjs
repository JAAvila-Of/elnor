// Intentionally tiny shared reactive DOM runtime for both syntax experiments.
let current = null;
const pending = new Set();
let scheduled = false;
const regionReactionKind=Symbol('regionReaction');
const nativeCleanup=Symbol('nativeCleanup'), bulkSafe=Symbol('bulkSafe');
let detachedByRegion=0;
function ownNative(owner,cleanup,safe){owner?.own(cleanup,nativeCleanup,safe);}
function detach(node){if(!detachedByRegion)node.remove();}
function cleanAll(callbacks){
  const errors=[];
  for(const callback of callbacks){try{callback();}catch(error){errors.push(error);}}
  if(errors.length===1)throw errors[0];
  if(errors.length>1)throw new AggregateError(errors,'Multiple resource cleanup failures');
}
function failWithCleanup(error,cleanup,message='Mount failed and resource cleanup also failed'){
  try{cleanup();}catch(cleanupError){
    throw new AggregateError([error,cleanupError],message,{cause:error});
  }
  throw error;
}
function flush() {
  const batch=[...pending]; pending.clear();
  let errors;
  // Keep the scheduler armed throughout this batch: writes only add pending
  // work, then one follow-up microtask is queued below. A failed reaction must
  // not discard unrelated effects from the already captured batch.
  for(const e of batch)if(!e.disposed){
    // This execution consumes earlier invalidations. Writes during or after
    // it must remain pending for the next batch.
    pending.delete(e);
    try{e.run();}catch(error){(errors??=[]).push(error);}
  }
  scheduled=false;
  if(pending.size){scheduled=true;queueMicrotask(flush);}
  if(errors?.length===1)throw errors[0];
  if(errors?.length>1)throw new AggregateError(errors,'Multiple reactive update failures');
}
function notify(subs){
  // Only enqueue here; subscribers cannot change until effects run in flush.
  for(const e of subs){if(e[regionReactionKind]){if(!e.disposed)e.invalidate();}else pending.add(e);}
  if(pending.size&&!scheduled){scheduled=true;queueMicrotask(flush);}
}
export function cell(initial){
  let val=initial;
  const subs=new Set();
  return {get value(){if(current&&!current.disposed){subs.add(current);current.deps.add(subs);}return val;},
    set value(next){if(Object.is(val,next))return;val=next;notify(subs);}};
}

// Direct state owners get a new identity on every change, including A → B → A.
export function actionOwnerCell(initial) {
  const tracked = cell(initial);
  let value = initial;
  let revision = {};
  return {
    get value() { return tracked.value; },
    set value(next) {
      if (Object.is(value, next)) return;
      value = next;
      revision = {};
      tracked.value = next;
    },
    get revision() { void tracked.value; return revision; }
  };
}

const idleAction = Object.freeze({status:'idle'});
const pendingAction = Object.freeze({status:'pending'});

// A managed body yields ordinary suspensions as plain values. Suspensions in
// cleanup yield a CleanupStep: retirement never interrupts them. A Checkpoint
// at the end of ordinary cleanup applies a retirement observed while the
// cleanup was running, and carries the error pending at that point.
class CleanupStep { constructor(value) { this.value = value; } }
class Checkpoint { constructor(failure) { this.failure = failure; } }
const noFailure = Object.freeze({});
const disposalMessage = 'An error was suppressed during disposal';
const isObject = value => value !== null && (typeof value === 'object' || typeof value === 'function');

function getMethod(value, key) {
  if (key === undefined) return undefined;
  const method = value[key];
  if (method == null) return undefined;
  if (typeof method !== 'function') throw new TypeError(`${String(key.description ?? key)} is not a function`);
  return method;
}

function suppressedError(error, suppressed) {
  if (typeof SuppressedError === 'function') return new SuppressedError(error, suppressed, disposalMessage);
  const hidden = value => ({value, writable:true, configurable:true});
  return Object.defineProperties(new Error(disposalMessage), {name:hidden('SuppressedError'), error:hidden(error), suppressed:hidden(suppressed)});
}

function reportActionFailure(error) {
  if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
  else queueMicrotask(() => { throw error; });
}

// Lowered form of the using and await using declarations of one block.
// Disposal follows DisposeResources: reverse order, awaited async disposers,
// and SuppressedError when disposal fails after an earlier failure.
function disposables() {
  const resources = [];
  let failed = false, failure;
  return {
    use(value, async) {
      if (value == null) {
        if (async) resources.push({async});
        return value;
      }
      if (!isObject(value)) throw new TypeError('A using declaration requires an object, null, or undefined');
      let method;
      if (async) {
        method = getMethod(value, Symbol.asyncDispose);
        const dispose = method ? undefined : getMethod(value, Symbol.dispose);
        if (dispose) method = function() { Reflect.apply(dispose, this, []); };
      } else {
        method = getMethod(value, Symbol.dispose);
      }
      if (!method) throw new TypeError(`The value of a ${async ? 'await using' : 'using'} declaration is not disposable`);
      resources.push({value, async, method});
      return value;
    },
    fail(error) { failed = true; failure = error; },
    *dispose() {
      let needsAwait = false, hasAwaited = false;
      while (resources.length) {
        const {value, async, method} = resources.pop();
        if (!async && needsAwait && !hasAwaited) {
          yield new CleanupStep(undefined);
          needsAwait = false;
        }
        if (!method) { needsAwait = true; continue; }
        try {
          const result = Reflect.apply(method, value, []);
          if (async) {
            hasAwaited = true;
            yield new CleanupStep(result);
          }
        } catch (error) {
          failure = failed ? suppressedError(error, failure) : error;
          failed = true;
        }
      }
      if (needsAwait && !hasAwaited) yield new CleanupStep(undefined);
      if (failed) throw failure;
    }
  };
}

// Lowered form of for await. `next` resolves to true once the iterator is
// done and otherwise stores the value. `close` follows AsyncIteratorClose
// and skips iterators that finished or failed on their own.
function asyncIteration(iterable) {
  let iterator, sync = false;
  const asyncMethod = getMethod(iterable, Symbol.asyncIterator);
  if (asyncMethod) {
    iterator = Reflect.apply(asyncMethod, iterable, []);
  } else {
    const syncMethod = getMethod(iterable, Symbol.iterator);
    if (!syncMethod) throw new TypeError('The value of for await is not async iterable');
    iterator = Reflect.apply(syncMethod, iterable, []);
    sync = true;
  }
  if (!isObject(iterator)) throw new TypeError('The iterator is not an object');
  const nextMethod = iterator.next;
  const record = {open:true, failed:false, value:undefined};
  const finish = () => { record.open = false; };
  // Returns true when the iterator is done and otherwise stores the value.
  const read = step => {
    if (!isObject(step)) throw new TypeError('The iterator result is not an object');
    if (step.done) { finish(); return true; }
    record.value = step.value;
    return false;
  };
  const closeSync = () => {
    try { const method = iterator.return; if (method != null) Reflect.apply(method, iterator, []); } catch {}
  };
  // Sync iterables follow CreateAsyncFromSyncIterator: each value is awaited,
  // a rejected value closes the sync iterator, and closing awaits once.
  const nextSync = step => {
    if (!isObject(step)) throw new TypeError('The iterator result is not an object');
    const done = !!step.done, value = step.value;
    let wrapper;
    try { wrapper = Promise.resolve(value); }
    catch (error) { if (!done) closeSync(); throw error; }
    if (done) { finish(); return wrapper.then(() => true); }
    return wrapper.then(
      resolved => { record.value = resolved; return false; },
      error => { finish(); closeSync(); throw error; });
  };
  record.next = () => {
    try {
      const step = Reflect.apply(nextMethod, iterator, []);
      if (sync) return nextSync(step);
      return Promise.resolve(step).then(result => {
        try { return read(result); }
        catch (error) { finish(); throw error; }
      }, error => { finish(); throw error; });
    } catch (error) {
      finish();
      throw error;
    }
  };
  record.fail = () => { record.failed = true; };
  // After a throw completion, failures while closing are ignored and the
  // original error is kept.
  record.close = function* () {
    if (!record.open) return;
    finish();
    const failed = record.failed;
    let result;
    try {
      const method = getMethod(iterator, 'return');
      if (sync) {
        if (!method) { yield new CleanupStep(undefined); return; }
        result = Reflect.apply(method, iterator, []);
        if (!isObject(result)) throw new TypeError('The iterator return result is not an object');
        void result.done;
        yield new CleanupStep(result.value);
        return;
      }
      if (!method) return;
      result = yield new CleanupStep(Reflect.apply(method, iterator, []));
    } catch (error) {
      if (failed) return;
      throw error;
    }
    if (!failed && !isObject(result)) throw new TypeError('The iterator return result is not an object');
  };
  return record;
}

const managedHelpers = Object.freeze({
  cleanup: value => new CleanupStep(value),
  checkpoint: failure => new Checkpoint(failure),
  none: noFailure,
  disposables,
  asyncIteration
});

export function createActionGroup(policy, readOwner, ownerScope) {
  const active = cell(null);
  let disposed = false;
  let owner;
  const records = new Set();

  function dispose() {
    disposed = true;
    active.value = null;
    for (const record of records) record.value = null;
  }
  ownerScope.own(dispose);

  function action(createBody) {
    const record = cell(null);
    records.add(record);
    const visible = () => {
      const entry = record.value;
      return entry && Object.is(entry.owner, readOwner()) ? entry.outcome : idleAction;
    };

    async function run(...args) {
      if (disposed || ownerScope.disposed) return;
      const currentOwner = readOwner();
      const previous = active.value;
      if (policy === 'single-flight' && previous && Object.is(owner, currentOwner)) return;
      if (!Object.is(owner, currentOwner)) {
        owner = currentOwner;
        for (const other of records) other.value = null;
      } else if (previous && previous.record !== record) {
        previous.record.value = null;
      }
      const invocation = {record};
      active.value = invocation;
      record.value = {owner:currentOwner,outcome:pendingAction};
      const isCurrent = () => !disposed && !ownerScope.disposed && active.value === invocation && Object.is(currentOwner, readOwner());
      const cells = new WeakMap();
      const actions = new WeakMap();
      const lease = Object.assign(Object.create(managedHelpers), {
        bindCell(target) {
          if (!cells.has(target)) cells.set(target, {
            get value() { return target.value; },
            set value(value) { if (isCurrent()) target.value = value; }
          });
          return cells.get(target);
        },
        bindHelper(factory) {
          if (!actions.has(factory)) actions.set(factory, factory(lease));
          return actions.get(factory);
        },
        bindAction(target) {
          if (!actions.has(target)) actions.set(target, new Proxy(target, {
            apply(action, receiver, args) { if (isCurrent()) return Reflect.apply(action, receiver, args); }
          }));
          return actions.get(target);
        }
      });
      const fail = error => { record.value = {owner:currentOwner,outcome:{status:'error',error}}; };
      // Rejections delivered at ordinary suspensions belong to awaited work.
      // Anything else escaping a retired invocation is a cleanup failure.
      let awaitedFailures;
      try {
        let step;
        try {
          const iterator = createBody(lease).apply(this, args);
          let retired = false;
          step = iterator.next();
          while (!step.done) {
            const yielded = step.value;
            if (yielded instanceof Checkpoint) {
              if (retired || isCurrent()) step = iterator.next();
              else {
                retired = true;
                const {failure} = yielded;
                if (failure !== noFailure && !awaitedFailures?.has(failure)) reportActionFailure(failure);
                step = iterator.return();
              }
              continue;
            }
            const cleanup = yielded instanceof CleanupStep;
            let value, failed = false;
            try { value = await (cleanup ? yielded.value : yielded); }
            catch (error) { value = error; failed = true; }
            if (!cleanup && !retired && !isCurrent()) {
              retired = true;
              step = iterator.return();
              continue;
            }
            if (failed && !cleanup) (awaitedFailures ??= new Set()).add(value);
            step = failed ? iterator.throw(value) : iterator.next(value);
          }
        } catch (error) {
          if (isCurrent()) fail(error);
          else if (!awaitedFailures?.has(error)) reportActionFailure(error);
          return;
        }
        let result;
        try { result = await step.value; }
        catch (error) {
          if (isCurrent()) fail(error);
          return;
        }
        if (isCurrent()) {
          record.value = {owner:currentOwner,outcome:{status:'success',result}};
          return result;
        }
      } finally {
        if (active.value === invocation) active.value = null;
      }
    }

    return Object.defineProperties(run, {
      status:{get:()=>visible().status},
      pending:{get:()=>visible().status === 'pending'},
      result:{get:()=>visible().result},
      error:{get:()=>visible().error}
    });
  }

  return {action, get pending() { return !!active.value && Object.is(owner, readOwner()); }};
}
// Generated components install these sentinels before running initializers.
// A deferred closure sees the real cell once initialization replaces it.
export function uninitializedBinding(binding){
  const fail=()=>{throw Object.assign(new ReferenceError(
    `ELN-INIT: Cannot access ${binding.kind} '${binding.binding}' before initialization (${binding.file})`
  ),binding,{code:'ELN-INIT'});};
  return {get value(){return fail();},set value(_next){fail();},get revision(){return fail();}};
}
export function scope(){
  const disposers=[];
  let disposed=false,safe=true,checks=null;
  return {get disposed(){return disposed;},get [bulkSafe](){return safe&&(!checks||checks.every(check=>check()));},
    own(fn,kind,check){
      if(disposed){fn();return fn;}
      if(kind!==nativeCleanup)safe=false;
      if(check)(checks??=[]).push(check);
      disposers.push(fn);return fn;
    },dispose(){
    if(disposed)return;disposed=true;
    checks=null;
    try{cleanAll(disposers.reverse());}finally{disposers.length=0;}
  }};
}
export function effect(fn, owner){
  const e={deps:new Set(),disposed:false,run(){
    for(const dep of this.deps)dep.delete(this);
    this.deps.clear();const prev=current;current=this;
    try{fn();}finally{current=prev;}
    if(this.deps.size===0)fn=null;
  }};
  const dispose=()=>{e.disposed=true;pending.delete(e);for(const dep of e.deps)dep.delete(e);e.deps.clear();fn=null;};
  ownNative(owner,dispose);
  try{if(!e.disposed)e.run();}catch(error){dispose();throw error;}
  return dispose;
}
export function computed(fn,owner){
  const output=cell(undefined);
  effect(()=>{output.value=fn();},owner);
  return output;
}
export function setAriaBoolean(node,name,value){if(name!=='aria-pressed'&&name!=='aria-current')throw new TypeError('ELN-ARIA-NAME: unsupported ARIA name');if(typeof value!=='boolean')throw new TypeError('ELN-ARIA-TYPE: ARIA state must be a boolean');const token=String(value);if(node.getAttribute(name)!==token)node.setAttribute(name,token);}
export function ariaBooleanBinding(node,name,read,owner){return effect(()=>setAriaBoolean(node,name,read()),owner);}
export function setDisabled(node,value){if(typeof value!=='boolean')throw new TypeError('ELN-DISABLED-TYPE: disabled must be a boolean');if(node.disabled!==value)node.disabled=value;}
export function disabledBinding(node,read,owner){return effect(()=>setDisabled(node,read()),owner);}
export function setClass(node,value){if(typeof value!=='string')throw new TypeError('ELN-CLASS-TYPE: DOM class must be a string');if(node.className!==value)node.className=value;}
export function classBinding(node,read,owner){return effect(()=>setClass(node,read()),owner);}
export function element(parent,tag,className=null){
  const node=document.createElement(tag);
  if(className)node.className=className;
  parent.append(node);
  return node;
}
// Only generated, statically simple single-root views use a nullable parent.
// Ordinary element() and public mounting keep their existing parent contract.
export function rootElement(parent,tag,className=null){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(parent)parent.append(node);
  return node;
}
// Keep this cleanup in a separate activation context: retained callbacks must
// not capture a caption's Text node, value or read function.
function captionActive(owner){
  let active=true;
  ownNative(owner,()=>{active=false;});
  return active;
}
// Only the compiler's closed primitive path calls these helpers.
function literalCaption(content,value,owner){
  if(owner!=null&&!captionActive(owner))return;
  const normalized=String(value??'');if(content.nodeValue!==normalized)content.nodeValue=normalized;
}
export function literalText(parent,tag,value,owner){
  const node=element(parent,tag);
  const content=document.createTextNode('');node.append(content);
  literalCaption(content,value,owner);
  return node;
}
export function literalButton(parent,value,run,owner){
  const node=element(parent,'button'); node.type='button';
  const content=document.createTextNode('');node.append(content);
  literalCaption(content,value,owner);
  node.addEventListener('click',run);
  ownNative(owner,()=>node.removeEventListener('click',run));
  return node;
}
export function text(parent,tag,read,owner){
  const node=element(parent,tag);
  const content=document.createTextNode('');node.append(content);
  effect(()=>{const value=String(read() ?? '');if(content.nodeValue!==value)content.nodeValue=value;},owner);
  return node;
}
export function button(parent,read,run,owner){
  const node=element(parent,'button'); node.type='button';
  const content=document.createTextNode('');node.append(content);
  effect(()=>{const value=String(read() ?? '');if(content.nodeValue!==value)content.nodeValue=value;},owner);
  node.addEventListener('click',run);
  ownNative(owner,()=>node.removeEventListener('click',run));
  return node;
}
export function formBinding(node,run,owner,reset,readFocusInvalid){
  let active=true,submission=0;
  function focusWhenSettled(attempt) {
    if (!active || attempt !== submission || !node.isConnected) return;
    // A validation calc may schedule its field binding in a later batch.
    if (scheduled) {
      queueMicrotask(() => focusWhenSettled(attempt));
      return;
    }
    for (const field of node.elements) {
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(field.tagName) ||
          field.getAttribute('aria-invalid') !== 'true' || field.matches(':disabled')) continue;
      field.focus();
      if (field.getRootNode().activeElement === field) break;
    }
  }
  const listener=event=>{
    if(!active)return;
    event.preventDefault();
    if(!readFocusInvalid)return run();
    const attempt=++submission;
    const focus=readFocusInvalid();
    if(typeof focus!=='boolean')throw new TypeError('ELN-FOCUS-INVALID-TYPE: expected a boolean');
    const result=run();
    if(focus)queueMicrotask(()=>focusWhenSettled(attempt));
    return result;
  };
  const onReset=reset||readFocusInvalid?event=>{
    if(!active||event.defaultPrevented)return;
    submission++;
    if(reset){event.preventDefault();return reset();}
  }:null;
  node.addEventListener('submit',listener);if(onReset)node.addEventListener('reset',onReset);
  ownNative(owner,()=>{active=false;cleanAll([()=>node.removeEventListener('submit',listener),...(onReset?[()=>node.removeEventListener('reset',onReset)]:[])]);});
}
export function input(parent,label,read,write,owner){
  const wrap=element(parent,'label');
  const caption=document.createElement('span');caption.textContent=label;
  const node=document.createElement('input');node.type='text';
  wrap.append(caption,node);
  let active=true;
  const onInput=()=>{if(active)write(node.value);};
  node.addEventListener('input',onInput);
  ownNative(owner,()=>{active=false;node.removeEventListener('input',onInput);});
  effect(()=>{const v=String(read() ?? '');if(node.value!==v)node.value=v;},owner);
  return node;
}

let fieldErrorId = 0;
export function fieldErrorBinding(parent, field, read, owner) {
  const message = element(parent, 'span');
  const doc = field.ownerDocument;
  let id;
  do { id = 'elnor-field-error-' + ++fieldErrorId; } while (doc.getElementById?.(id));
  message.setAttribute('id', id);
  message.setAttribute('class', 'elnor-field-error');
  message.setAttribute('aria-live', 'polite');
  effect(() => {
    const value = read();
    if (typeof value !== 'string') throw new TypeError('ELN-FIELD-ERROR-TYPE: expected a string');
    if (value) {
      if (field.getAttribute('aria-invalid') !== 'true') field.setAttribute('aria-invalid', 'true');
      if (field.getAttribute('aria-describedby') !== id) field.setAttribute('aria-describedby', id);
    } else {
      if (field.getAttribute('aria-invalid') !== null) field.removeAttribute('aria-invalid');
      if (field.getAttribute('aria-describedby') !== null) field.removeAttribute('aria-describedby');
    }
    if(message.textContent!==value)message.textContent = value;
  }, owner);
}
// Kept separate so existing input construction and its hot path stay intact.
export function setChecked(node,value){if(typeof value!=='boolean')throw new TypeError('ELN-CHECKED-TYPE: checkbox binding must be a boolean');if(node.checked!==value)node.checked=value;}
export function checkbox(parent,label,read,write,owner){
  const wrap=element(parent,'label');
  const node=document.createElement('input');node.type='checkbox';
  const caption=document.createElement('span');caption.textContent=label;wrap.append(node,caption);
  let active=true;
  const onChange=()=>{if(active)write(node.checked);};
  node.addEventListener('change',onChange);
  ownNative(owner,()=>{active=false;node.removeEventListener('change',onChange);});
  effect(()=>{setChecked(node,read());},owner);
  return node;
}
export function setSelectValue(node,value){
  if(typeof value!=='string')throw new TypeError('ELN-SELECT-TYPE: select binding must be a string');
  let index=-1;for(let i=0;i<node.options.length;i++)if(node.options[i].value===value){index=i;break;}
  if(node.selectedIndex!==index)node.selectedIndex=index;
}
export function select(parent,label,options,read,write,owner){
  const wrap=element(parent,'label'),caption=document.createElement('span');caption.textContent=label;
  const node=document.createElement('select');wrap.append(caption,node);
  for(const option of options){const child=document.createElement('option');child.value=option.value;child.textContent=option.label;node.append(child);}
  let active=true;const onChange=()=>{if(active&&node.selectedIndex>=0)write(node.value);};
  node.addEventListener('change',onChange);ownNative(owner,()=>{active=false;node.removeEventListener('change',onChange);});
  effect(()=>setSelectValue(node,read()),owner);return node;
}
export function textarea(parent,label,read,write,owner){
  const wrap=element(parent,'label');
  const caption=document.createElement('span');caption.textContent=label;
  const node=document.createElement('textarea');wrap.append(caption,node);
  let active=true;
  const onInput=()=>{if(active)write(node.value);};
  node.addEventListener('input',onInput);
  ownNative(owner,()=>{active=false;node.removeEventListener('input',onInput);});
  effect(()=>{const value=String(read()??'');if(node.value!==value)node.value=value;},owner);
  return node;
}
function createPart(build,stage,trackRange=false){
  const fragment=document.createDocumentFragment();
  const owner=scope();
  const part={nodes:[],owner};stage?.(part);
  try{build(fragment,owner);}catch(error){
    failWithCleanup(error,()=>cleanAll([()=>owner.dispose(),()=>{
      for(const node of [...fragment.childNodes])node.remove();
    }]));
  }
  part.nodes=[...fragment.childNodes];
  if(trackRange&&part.nodes.some(node=>node.nodeType===8)){
    const start=document.createComment('elnor:row'),end=document.createComment('/elnor:row');part.moving=null;
    if(fragment.firstChild)fragment.insertBefore(start,fragment.firstChild);else fragment.append(start);fragment.append(end);
    Object.defineProperty(part,'nodes',{get(){if(part.moving)return part.moving;const nodes=regionRangeNodes(start,end);return nodes.length?nodes:[start,end];}});
  }
  return part;
}
function failedRoot(error,owner){failWithCleanup(error,()=>owner.dispose());}
function createRootPart(build,item,stage){
  const owner=scope();
  const part={nodes:[],owner};stage?.(part);
  try{
    const node=build(item,null,owner);
    if(node?.nodeType!==1||node.parentNode!==null)throw Error('ELN-RUNTIME-003: detached each expects a detached element');
    part.nodes=[node];return part;
  }catch(error){failedRoot(error,owner);}
}
function clearPart(part){if(!part)return;cleanAll([()=>part.owner.dispose(),()=>{for(const n of part.nodes)detach(n);}]);}
export function when(parent,read,build,owner){
  const end=document.createComment('elnor:if');parent.append(end);
  let shown=false,part=null,active=true;
  const reset=()=>{
    const previous=part;part=null;shown=false;
    clearPart(previous);
  };
  const cleanup=()=>{active=false;cleanAll([reset,()=>detach(end)]);};
  ownNative(owner,cleanup,()=>!part||part.owner[bulkSafe]);
  try{effect(()=>{
    try{
      const next=!!read();
      if(!active)return;
      if(next===shown)return;
      reset();
      if(!active)return;
      if(next){
        part=createPart(build,created=>{part=created;});
        if(!active){const cancelled=part;part=null;clearPart(cancelled);return;}
        for(const n of part.nodes)end.parentNode.insertBefore(n,end);
      }
      shown=next;
    }catch(error){failWithCleanup(error,reset,'Conditional update failed and resource cleanup also failed');}
  },owner);}catch(error){failWithCleanup(error,cleanup);}
}
// Indices in the longest increasing subsequence already have the right relative
// order. Keep their DOM groups attached; only new/displaced groups need moving.
function orderedRows(rows){
  const tails=[],previous=new Int32Array(rows.length);previous.fill(-1);
  for(let i=0;i<rows.length;i++){
    if(rows[i].index<0)continue;
    let low=0,high=tails.length;
    while(low<high){const middle=(low+high)>>>1;if(rows[tails[middle]].index<rows[i].index)low=middle+1;else high=middle;}
    if(low>0)previous[i]=tails[low-1];tails[low]=i;
  }
  const stable=new Set();
  for(let i=tails.at(-1)??-1;i>=0;i=previous[i])stable.add(i);
  return stable;
}
// The compiler supplies exclusivity only for an each that occupies a fresh
// container by itself. Verify actual roots and native-only cleanup as well:
// arbitrary user disposers must still observe ordinary per-row teardown.
function canClearRegion(parent,end,rows){
  if(end.parentNode!==parent)return false;
  let count=1;
  for(const row of rows.values()){
    if(!row.owner[bulkSafe])return false;
    for(const node of row.nodes){if(node.parentNode!==parent)return false;count++;}
  }
  return parent.childNodes.length===count;
}
function clearRegion(parent,end,rows,suppressDescendants=true){
  if(suppressDescendants)detachedByRegion++;
  let cleanupFailed=false,cleanupError;
  try{
    // Eligibility already proves that every cleanup is runtime-owned. Release
    // all owners directly; per-row DOM callbacks would only be suppressed here.
    const errors=[];
    for(const row of rows.values()){try{row.owner.dispose();}catch(error){errors.push(error);}}
    if(errors.length===1)throw errors[0];
    if(errors.length>1)throw new AggregateError(errors,'Multiple resource cleanup failures');
  }
  catch(error){cleanupFailed=true;cleanupError=error;}
  finally{if(suppressDescendants)detachedByRegion--;}
  if(cleanupFailed)failWithCleanup(cleanupError,()=>parent.replaceChildren(end),'Region cleanup and DOM removal failed');
  parent.replaceChildren(end);
}
export function repeat(parent,read,key,build,owner,exclusive=false,detached=false){
  const end=document.createComment('elnor:each');parent.append(end);
  let rows=new Map(),active=true;
  const staged=new Set();
  const stage=part=>staged.add(part);
  const reset=(bulk=false)=>{
    if(bulk&&exclusive&&rows.size&&staged.size===0&&!detachedByRegion&&canClearRegion(parent,end,rows)){
      // Dispose nested regions normally so retained row subtrees keep their
      // existing cleanup semantics. Only the outer roots are removed together.
      try{clearRegion(parent,end,rows,false);rows=new Map();return;}
      catch(error){failWithCleanup(error,reset,'Region disposal failed and resource cleanup also failed');}
    }
    const owned=new Set([...rows.values(),...staged]);rows=new Map();staged.clear();
    cleanAll([...owned].map(row=>()=>clearPart(row)));
  };
  const cleanup=()=>{active=false;cleanAll([()=>reset(true),()=>detach(end)]);};
  ownNative(owner,cleanup,()=>[...rows.values(),...staged].every(row=>row.owner[bulkSafe]));
  try{effect(()=>{
    try{
      const values=read();
      if(!active)return;
      if(!Array.isArray(values))throw Error('ELN-RUNTIME-001: each expects an array');
      if(exclusive&&values.length===0&&rows.size&&staged.size===0&&!detachedByRegion&&canClearRegion(parent,end,rows)){
        clearRegion(parent,end,rows);rows=new Map();return;
      }
      const next=new Map(),order=[];let increasing=true,last=-1;
      for(const value of values){
        const id=key(value);
        if(!active)return;
        if(next.has(id))throw Error('ELN-RUNTIME-002: duplicate each key: '+String(id));
        let row=rows.get(id);
        if(!row){
          const item=cell(value);
          // Own the in-flight scope before user reads can dispose this region.
          const part=detached?createRootPart(build,item,stage):createPart((fragment,childOwner)=>build(item,fragment,childOwner),stage,true);
          staged.delete(part);
          if(!active){clearPart(part);return;}
          row={item,owner:part.owner,index:-1};Object.defineProperty(row,'nodes',{get:()=>part.nodes});Object.defineProperty(row,'moving',{get:()=>part.moving,set:value=>{part.moving=value;}});
          staged.add(row);
        }else{
          if(row.index<last)increasing=false;last=row.index;
          row.item.value=value;
        }
        next.set(id,row);
        order.push(row);
      }
      for(const [id,row] of rows)if(!next.has(id)){clearPart(row);if(!active)return;}
      const stable=increasing?null:orderedRows(order);
      let anchor=end;
      for(let i=order.length-1;i>=0;i--){
        const row=order[i];
        if(row.index<0||(stable&&!stable.has(i))){
          const moving=row.nodes;row.moving=moving;for(let j=moving.length-1;j>=0;j--){const node=moving[j];end.parentNode.insertBefore(node,anchor);anchor=node;}row.moving=null;
        }else if(row.nodes.length)anchor=row.nodes[0];
      }
      for(let i=0;i<order.length;i++)order[i].index=i;
      rows=next;
      staged.clear();
    }catch(error){failWithCleanup(error,reset,'List update failed and resource cleanup also failed');}
  },owner);}catch(error){failWithCleanup(error,cleanup);}
}
function rollbackMount(error,root,target,prior){
  failWithCleanup(error,()=>cleanAll([()=>root.dispose(),()=>{
    for(const node of [...target.childNodes])if(!prior||!prior.has(node))node.remove();
  }]));
}
function mountDisposer(owner,nodes){
  return ()=>{
    if(nodes===null)return;
    const previous=nodes,root=owner;
    nodes=null;owner=null;
    cleanAll([()=>root.dispose(),()=>{for(const node of previous)node.remove();}]);
  };
}
export function mountBoundary(target,render){
  const root=scope();
  const prior=target.childNodes.length?new Set(target.childNodes):null;
  // Keep error-only closures outside the successful disposer's environment;
  // otherwise that shared environment retains the emptied staging fragment.
  try{render(target,root);}catch(error){rollbackMount(error,root,target,prior);}
  const created=prior?[...target.childNodes].filter(n=>!prior.has(n)):[...target.childNodes];
  return mountDisposer(root,created);
}

// Child components get live, read-only getters for props. No parent re-render is
// needed: reading a getter inside a child effect tracks the parent signal.
export function mountComponent(parent, mountChild, propReaders, handlers, slots, owner){
  const props={};
  for(const [name,reader] of Object.entries(propReaders)){
    Object.defineProperty(props,name,{enumerable:true,get:reader});
  }
  const cleanup=mountChild(parent,props,handlers,slots);
  owner?.own(cleanup);
}
// Generated children render into an existing rollback/lifetime boundary.
// Public mounts retain their own boundary; no DOM snapshot or nested disposer
// is needed for a child whose caller already owns the region.
export function renderComponent(parent,renderChild,propReaders,handlers,slots,owner){
  const props={};
  for(const [name,reader] of Object.entries(propReaders)){
    Object.defineProperty(props,name,{enumerable:true,get:reader});
  }
  renderChild(parent,props,handlers,slots,owner);
}
export function createComponentRoot(renderChild,propReaders,handlers,slots,owner){
  const props={};
  for(const [name,reader] of Object.entries(propReaders)){
    Object.defineProperty(props,name,{enumerable:true,get:reader});
  }
  return renderChild(null,props,handlers,slots,owner);
}
export function renderSlot(parent,renderer,owner){
  if(typeof renderer==='function')renderer(parent,owner);
}

// Internal region jobs share the existing batch scheduler.
export function enqueueRegionJob(job){if(job.disposed)return;pending.add(job);if(!scheduled){scheduled=true;queueMicrotask(flush);}}
export function cancelRegionJob(job){pending.delete(job);}

export function regionContextClear(){return current===null;}

export function regionOrderedRows(rows){return orderedRows(rows);}
export function regionRangeNodes(start,end){
 if(!start?.parentNode||start.parentNode!==end?.parentNode)return [];
 const nodes=[];for(let node=start;node;node=node.nextSibling){nodes.push(node);if(node===end)return nodes;}return [];
}
// Internal bridge: dynamic region tasks use the ordinary cell collector but
// enqueue their owning frame, never a second independently scheduled effect.
export function createRegionReaction(invalidate){
 const reaction={deps:new Set(),disposed:false,[regionReactionKind]:true,invalidate};
 function clear(){for(const dep of reaction.deps)dep.delete(reaction);reaction.deps.clear();}
 return {
  isCurrent(){return current===reaction&&!reaction.disposed;},
  track(fn){if(reaction.disposed)return;clear();const previous=current;current=reaction;try{return fn();}finally{current=previous;}},
  dispose(){if(reaction.disposed)return;reaction.disposed=true;clear();reaction.invalidate=null;pending.delete(reaction);}
 };
}
// A native task is both the scheduled job and the cell subscriber. Keeping one
// identity also lets all instances share lifecycle methods on the prototype.
class RegionTaskTicket {
 constructor(frame,id,group,execute){this.frame=frame;this.id=id;this.group=group;this.execute=execute;this.deps=new Set();this.token=null;this.stopped=false;this[regionReactionKind]=true;}
 get disposed(){return this.stopped||this.frame.disposed;}
 isCurrent(){return current===this&&!this.disposed;}
 clear(){for(const dep of this.deps)dep.delete(this);this.deps.clear();}
 track(fn){if(this.disposed)return;this.clear();this.token=this.frame.parts[this.group];const previous=current;current=this;try{return fn();}finally{current=previous;}}
 invalidate(){if(this.disposed)return;const frame=this.frame,token=this.token;if(token?.active&&frame.parts[this.group]===token){frame.pending.set(this.id,token);enqueueRegionJob(this);}}
 run(){if(this.disposed)return;const frame=this.frame,token=frame.pending.get(this.id);frame.pending.delete(this.id);if(token?.active&&frame.parts[this.group]===token)this.execute(this.id);}
 dispose(){if(this.stopped)return;this.stopped=true;this.clear();pending.delete(this);this.frame=null;this.token=null;this.execute=null;}
}
export function createRegionTaskTicket(frame,id,group,execute){return new RegionTaskTicket(frame,id,group,execute);}
export function runRegionUntracked(fn){const previous=current;current=null;try{return fn();}finally{current=previous;}}
export function regionHasReader(){return current!==null&&!current.disposed;}
