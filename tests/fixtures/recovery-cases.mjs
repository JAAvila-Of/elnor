export const childSource = 'component Badge(label: string) {\n  ui {\n    span label\n  }\n}\n';
export const consumerSource = 'import Badge from "./Badge.eln";\ncomponent Screen() {\n  ui {\n    Badge la\n  }\n}\n';
const insertUI = line => childSource.replace('    span label', line + '\n    span label');

export const recoveryCases = [
  {name: 'partial-prop', source: consumerSource, role: 'consumer', expected: 'recover'},
  {name: 'missing-final-brace', source: childSource.slice(0, childSource.lastIndexOf('}')), expected: 'recover'},
  {name: 'trailing-member', source: childSource.replace('span label', 'span label.'), expected: 'recover'},
  {name: 'unclosed-ui-string', source: insertUI('    p "unfinished 😀'), expected: 'recover'},
  {name: 'unclosed-prop-string', source: consumerSource.replace('    Badge la', '    Badge label="unfinished\n    Badge la'), role: 'consumer', expected: 'recover'},
  {name: 'unfinished-ui-statement', source: insertUI('    span'), expected: 'recover'},
  {name: 'unfinished-state', source: childSource.replace('  ui {', '  state draft =\n  ui {'), expected: 'recover'},
  {name: 'unfinished-action-expression', source: childSource.replace('  ui {', '  action inspect() {\n    const value = ;\n  }\n  ui {'), expected: 'recover'},
  {name: 'incomplete-header-type', source: childSource.replace('label: string', 'label:'), expected: 'refuse'},
  {name: 'unclosed-block-comment', source: insertUI('    /* unfinished'), expected: 'refuse'},
  {name: 'unclosed-parenthesized-prop', source: consumerSource.replace('Badge la', 'Badge label=(value'), role: 'consumer', expected: 'refuse'},
];
