// Editor-only projection. The strict compiler grammar remains unchanged.
import {parseSurface} from './parser.mjs';
import {recoverDomPrefix} from './dom-editor.mjs';
import {guardCallChecks, missingGuardClose} from './action-guards.mjs';
import {actionGroupType, managedActionNames, managedActionType, memberGroupType} from './action-groups.mjs';

export class SourceMap {
  constructor(source) {
    this.original = source;
    this.source = '';
    this.segments = [];
  }
  generated(text) { this.source += text; }
  copy(span) {
    if (!span) return;
    const length = Math.max(0, Math.min(span.length, this.original.length - span.start));
    if (!length) return;
    this.segments.push({originalStart: span.start, generatedStart: this.source.length, length});
    this.source += this.original.slice(span.start, span.start + length);
  }
  toGenerated(offset) {
    return this.segments.filter(s => offset >= s.originalStart && offset <= s.originalStart + s.length)
      .map(s => s.generatedStart + offset - s.originalStart);
  }
  toOriginal(start, length = 0) {
    const segment = this.segments.find(s => start >= s.generatedStart && start + length <= s.generatedStart + s.length);
    return segment ? {start: segment.originalStart + start - segment.generatedStart, length} : null;
  }
}

// State initializers are checked in order. Later reactive reads must see the
// declared type, since an action may already have assigned a different value.
// TypeScript checks the deferred read against the mutable binding's full type.
export function projectReactiveState(states, generated, binding) {
  for (const state of states) {
    if (!state.type) continue;
    binding(state);
    generated(' = {read: () => ');
    binding(state);
    generated('}.read();\n');
  }
}

// Bounded recovery: close delimiters at EOF, treating an unescaped newline as
// the end of a broken single/double-quoted string. Backticks stay multiline.
// Appended text never receives an original source position.
function closingSuffix(source) {
  const stack = [];
  let quote = '', escape = false, lineComment = false, blockComment = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (escape) { escape = false; if (c === '\r' && next === '\n') i++; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === quote || (quote !== '`' && (c === '\n' || c === '\r'))) quote = '';
      continue;
    }
    if (c === '/' && next === '/') { lineComment = true; i++; continue; }
    if (c === '/' && next === '*') { blockComment = true; i++; continue; }
    if ('"\'`'.includes(c)) { quote = c; continue; }
    if ('({['.includes(c)) stack.push(c);
    if (')}]'.includes(c)) {
      if (stack.at(-1) !== '({['[')}]'.indexOf(c)]) return '';
      stack.pop();
    }
  }
  if (quote || blockComment) return '';
  return stack.length ? '\n' + stack.reverse().map(c => ')}]'['({['.indexOf(c)]).join('\n') : '';
}

export function projectSurface(source, filename) {
  let ir;
  const errors = [];
  try { ir = parseSurface(source, filename); }
  catch (error) {
    const guardRecovery=missingGuardClose(source,error);
    if(guardRecovery){
      try { ir=parseSurface(source,filename,{tolerant:true,guardRecovery}); } catch {}
    }
    if(!ir){
      errors.push(error);
      try { ir = parseSurface(source + closingSuffix(source + '\n'), filename, {tolerant: true}); }
      catch { ir=recoverDomPrefix(source,filename);if(!ir)return {map: new SourceMap(source), ir: null, errors, propContexts: []}; }
    }
    errors.push(...ir.recoveryDiagnostics.filter(d => !errors.some(e => e.code === d.code && e.start === d.start)));
  }
  const map = new SourceMap(source);
  const g = text => map.generated(text);
  const c = span => map.copy(span);
  const property = span => {if(span?.length===0)map.segments.push({originalStart:span.start,generatedStart:map.source.length,length:0});c(span);};
  const propContexts = [], guardChecks = [], recoveryTails = [];
  if (ir.header) {
    let cursor = ir.headerSpan.start;
    for (const imp of ir.imports.filter(i => i.path.endsWith('.eln'))) {
      const end = imp.pathSpan.start + imp.pathSpan.length;
      c({start: cursor, length: end - cursor});
      g('.mjs');
      cursor = end;
    }
    c({start: cursor, length: ir.headerSpan.start + ir.headerSpan.length - cursor});
    g('\n');
  }
  g('function __validate(');
  ir.params.forEach((p, index) => { if (index) g(', '); c(p.rawSpan); });
  g(') {\n');
  for (const state of ir.states) {
    g('let '); c(state.nameSpan); c(state.typeSpan); g(' = ('); c(state.exprSpan); g(');\n');
  }
  projectReactiveState(ir.states, g, state => c(state.nameSpan));
  for (const calc of ir.calcs) {
    g('const '); c(calc.nameSpan); g(' = ('); c(calc.exprSpan); g(');\n');
  }
  const groups = new Set();
  if (ir.actionGroups.length) {
    const owners = new Set([...ir.params, ...ir.states, ...ir.calcs].map(binding => binding.name));
    const available = new Set([...owners, ...ir.actions.map(action => action.name)]);
    for (const group of ir.actionGroups) {
      if (available.has(group.name)) continue;
      available.add(group.name);
      groups.add(group.name);
      g('const '); c(group.nameSpan); g(` = {} as ${actionGroupType};\n`);
      // Unknown bare owners already have a Surface diagnostic. An owner list
      // that does not parse yet is still projected for completions.
      if (group.owners) {
        for (const owner of group.owners) {
          if (owner.name === null || owners.has(owner.name)) { g('void ('); c(owner.exprSpan); g(');\n'); }
        }
      } else if (group.owner) { g('void ['); c(group.ownerSpan); g('];\n'); }
    }
    for (const action of ir.actions) if (groups.has(action.group)) { g('void ('); c(action.groupSpan); g(');\n'); }
  }
  g('const emit = {} as {');
  for (const event of ir.events) {
    c(event.nameSpan); g(': (');
    event.params.forEach((p, i) => { if (i) g(', '); c(p.rawSpan); });
    g(') => void;');
  }
  g('};\n');
  const managed = managedActionNames(ir);
  for (const action of ir.actions) {
    const implementation = managed.get(action.name);
    if (implementation) {
      g('const '); c(action.nameSpan); g(` = {} as ${managedActionType(implementation)};\n`);
    }
    // A member sees its own group with the signal of its invocation.
    const shadowed = implementation && groups.has(action.group);
    if (shadowed) g(`const ${implementation} = (() => { const ${action.group} = {} as ${memberGroupType}; return `);
    g(action.async ? 'async function ' : 'function ');
    if (implementation) g(implementation); else c(action.nameSpan);
    g('('); c(action.paramsSpan); g(') {');
    if(action.bodySegments){
      guardChecks.push(...guardCallChecks(action,map.source.length));
      for(const {span,text,recoveryTail} of action.bodySegments){
        if(recoveryTail)recoveryTails.push({start:map.source.length,end:map.source.length+text.length});
        if(span)c(span);else g(text);
      }
    }else c(action.bodySpan);
    g(shadowed ? '}; })();\n' : '}\n');
  }
  if(ir.disposal){g('(() => { ((__elnor_result: void) => {})(');c(ir.disposal.exprSpan);g('); });\n');}
  function nodes(items) {
    for (const node of items) {
      for(const key of ['ariaPressed','ariaCurrent'])if(node[key+'Span']){g('((__elnor_aria: boolean) => {})((');property(node[key+'Span']);g('));\n');}
      if(node.disabledSpan){g('((__elnor_disabled: boolean) => {})((');property(node.disabledSpan);g('));\n');}
      if(node.errorSpan){g('((__elnor_error: string) => {})((');property(node.errorSpan);g('));\n');}
      if(node.focusInvalidSpan){g('((__elnor_focus_invalid: boolean) => {})((');property(node.focusInvalidSpan);g('));\n');}
      if(node.onInputSpan){g('((__elnor_on_input: (value: string) => void) => {})((');property(node.onInputSpan);g('));\n');}
      if(node.classSpan){g('((__elnor_class: string) => {})((');property(node.classSpan);g('));\n');}
      if(node.domPrefixRecovery)continue;
      if (node.kind === 'container' || node.kind === 'fill') { if(node.submitSpan){g('void (');c(node.submitSpan);g(');\n');}if(node.resetSpan){g('void (');c(node.resetSpan);g(');\n');} nodes(node.children); continue; }
      if (node.kind === 'slot') continue;
      if (node.kind === 'if') { g('if ('); c(node.exprSpan); g(') {\n'); nodes(node.children); g('}\n'); continue; }
      if (node.kind === 'each') {
        g('for (const '); c(node.variableSpan); g(' of ('); c(node.collectionSpan); g(')) { void ('); c(node.keySpan); g(');\n');
        nodes(node.children); g('}\n'); continue;
      }
      if (node.kind === 'component') {
        c(node.nameSpan); g('({');
        const objectStart = map.source.length;
        for (const prop of node.props) {
          c(prop.nameSpan); g(': (');
          // A broken quoted attribute would swallow the generated call syntax.
          // Use an explicitly unmapped placeholder, never a fabricated token.
          if (prop.exprSpan && !prop.incompleteQuoted) c(prop.exprSpan); else g('undefined');
          g('),');
        }
        propContexts.push({node, generatedPosition: objectStart});
        g('}, {');
        for (const listener of node.children.filter(n => n.kind === 'on')) {
          c(listener.nameSpan); g(': ('); c(listener.paramSpan); g(') => ('); c(listener.exprSpan); g('),');
        }
        g('}, {');
        const content = node.children.filter(n => n.kind !== 'on' && n.kind !== 'fill');
        if (content.length) { g('default: () => {\n'); nodes(content); g('},'); }
        for (const fill of node.children.filter(n => n.kind === 'fill')) {
          c(fill.nameSpan); g(': () => {\n'); nodes(fill.children); g('},');
        }
        g('});\n'); continue;
      }
      if(node.kind==='input'&&node.tag==='select'){const values=node.options.map(o=>JSON.stringify(o.value)).join('|')||'never';c(node.bindingSpan);g(' = ((__elnor_select: string): ('+values+') => __elnor_select as ('+values+'))(');c(node.bindingSpan);g(');\n');continue;}
      if(node.kind==='input'&&node.tag==='checkbox'){c(node.bindingSpan);g(' = ((__elnor_checked: boolean): boolean => __elnor_checked)(');c(node.bindingSpan);g(');\n');continue;}
      if(node.kind==='input'&&node.tag==='textarea'){c(node.bindingSpan);g(' = ((__elnor_text: string): string => __elnor_text)(');c(node.bindingSpan);g(');\n');continue;}
      if (node.kind === 'button') { g('void ('); c(node.labelSpan); g(');\n'); if(node.submit||node.reset)continue; }
      g('void ('); c(node.exprSpan ?? node.bindingSpan); g(');\n');
    }
  }
  nodes(ir.ui);
  g('}\nexport default function '); c(ir.nameSpan); g('(__props: {');
  for (const prop of ir.params) {
    g('readonly '); c(prop.nameSpan); g(prop.optional ? '?: ' : ': ');
    if (prop.typeSpan) c(prop.typeSpan); else g('unknown');
    g(';');
  }
  g('}, __events?: {');
  for (const event of ir.events) {
    c(event.nameSpan); g('?: (');
    event.params.forEach((p, i) => { if (i) g(', '); c(p.rawSpan); });
    g(') => void;');
  }
  g('}, __slots?: {');
  for (const slot of ir.slots) g(`${slot}?: () => void;`);
  g('}): void {}\n');
  return {ir, map, errors, propContexts, guardChecks, recoveryTails};
}
