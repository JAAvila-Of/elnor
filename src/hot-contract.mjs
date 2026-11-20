import {createHash} from 'node:crypto';

export function componentHotContract(ir) {
  return {
    component: [ir.filename, ir.name, ir.header, ir.params.map(param => param.raw)],
    state: ir.states.map(state => [state.name, state.type, state.expr]),
    logic: [ir.calcs.map(calc => [calc.name, calc.expr]), ir.actions.map(action => action.functionSource)],
    events: ir.events.map(event => [event.name, event.params.map(param => param.raw)]),
  };
}

export function hotContract(components, lists = [], handlers = []) {
  const parts = {
    lists,
    components: components.map(component => component.component),
    state: components.map(component => component.state),
    events: [components.map(component => component.events), handlers],
    logic: components.map(component => component.logic),
  };
  return Object.fromEntries(Object.entries(parts).map(([name, value]) => [
    name, createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  ]));
}

const reasons = {
  'first-build': 'The preview opened with the first valid build.',
  'unknown-build': 'The previous build is unavailable in this development session.',
  dependency: 'A local module dependency changed.',
  unsupported: 'This version is outside the experimental replacement subset.',
  'previous-unsupported': 'The previous version used regular live reload.',
  props: 'The preview props changed.',
  state: 'A state declaration or initializer changed.',
  lists: 'A list binding, key or child placement changed.',
  events: 'A component event or its handler changed.',
  logic: 'A calculation or action changed.',
  components: 'A component entry, import or prop declaration changed.',
};

export function hotReloadReason(previous, next, mountedProps, nextProps, firstBuild) {
  if (!previous) return firstBuild ? 'first-build' : 'unknown-build';
  if (previous.moduleRevision !== next.moduleRevision) return 'dependency';
  if (!next.contract) return 'unsupported';
  if (!previous.contract) return 'previous-unsupported';
  const changed = Object.keys(next.contract).find(name => next.contract[name] !== previous.contract[name]);
  if (changed) return changed;
  if (mountedProps !== nextProps) return 'props';
}

export function hotReloadNotice(build, reason) {
  const message = reason === 'first-build' ? reasons[reason] : `Page reloaded. ${reasons[reason]} Component state restarted.`;
  return {build, reason, message};
}
