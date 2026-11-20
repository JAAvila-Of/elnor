import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseSurface} from '../src/parser.mjs';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {checkSurfaceProject} from '../src/project-check.mjs';
import {createSurfaceLanguageService} from '../src/language-service.mjs';
import {formatSurface,applyFormatEdits} from '../src/formatter.mjs';
import {findButton,FakeNode,setupDOM,tick} from './fake-dom.mjs';

const fixture = [
  'component App(check: () => boolean, publish: (value: string) => void) {',
  '  action async run(blocked: boolean) {',
  '    guard (blocked);',
  '    guard (',
  '      check()',
  '    ) then {',
  '      await Promise.resolve();',
  '      publish("stopped");',
  '    }',
  '    publish("continued");',
  '  }',
  '  ui {',
  '    button "Blocked" => run(true)',
  '    button "Try" => run(false)',
  '  }',
  '}',
].join('\n');

function project(t,source) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-guard-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const entry=path.join(root,'App.eln');
  fs.writeFileSync(entry,source);
  return {root,entry,outputDir:path.join(root,'check')};
}

test('guard exits an async action after its block and evaluates each condition once', async t => {
  const compact=fixture.replace('guard (blocked);','guard (blocked)').replace(
    'guard (\n      check()\n    ) then {',
    'guard (check() && "A deliberately long condition that exercises the formatter before mounting the Surface component".length > 0) then {'
  );
  const formatting=formatSurface(compact);
  assert.deepEqual(formatting.diagnostics,[]);
  const source=applyFormatEdits(compact,formatting.edits);
  assert.match(source,/guard \(\n +check\(\)\n +&& .*\n +\) then/);
  const f=project(t,source);
  const built=buildSurfaceProject(f.entry,{outputDir:path.join(f.root,'build'),checkOutputDir:f.outputDir});
  const {mount}=await import(pathToFileURL(path.join(built.output,built.entryOutput)));
  setupDOM();
  const root=new FakeNode('root'),events=[];
  let calls=0,shouldStop=true;
  const stop=mount(root,{check:()=>{calls++;return shouldStop;},publish:value=>events.push(value)});
  t.after(stop);
  findButton(root,'Blocked').click();
  await tick();
  assert.equal(calls,0);
  assert.deepEqual(events,[]);
  findButton(root,'Try').click();
  await tick();
  assert.equal(calls,1);
  assert.deepEqual(events,['stopped']);
  shouldStop=false;
  findButton(root,'Try').click();
  await tick();
  assert.equal(calls,2);
  assert.deepEqual(events,['stopped','continued']);
});

test('checker and editor narrow after a guard and report original lines around it', t => {
  const source=[
    'component App(task: {title: string} | undefined) {',
    '  action run() {',
    '    guard (',
    '      !task || missingCondition',
    '    ) then {',
    '      missingBlock;',
    '    }',
    '    task.title;',
    '    missingAfter;',
    '  }',
    '  ui { button "Run" => run() }',
    '}',
  ].join('\r\n');
  const f=project(t,source);
  const service=createSurfaceLanguageService({root:f.root});
  t.after(()=>service.dispose());
  service.open(f.entry,source);
  const cli=checkSurfaceProject(f.entry,{outputDir:f.outputDir}).diagnostics;
  assert.deepEqual(cli.map(({code,line})=>({code,line})),[4,6,9].map(line=>({code:'TS2304',line})));
  const editor=service.diagnostics(f.entry);
  assert.deepEqual(editor.map(({code,line})=>({code,line})),[4,6,9].map(line=>({code:'TS2304',line})));
  assert.deepEqual(editor.map(d=>source.slice(d.start,d.start+d.length)),['missingCondition','missingBlock','missingAfter']);
});

test('guard keeps unambiguous calls and rejects then without a block', () => {
  const source='component App(guard: (value: boolean) => void) { action run() { guard(true); } ui { button "Run" => run() } }';
  const member=source.replace('guard(true)','policy.guard(true)');
  assert.match(parseSurface(member).actions[0].functionSource,/policy\.guard\(true\)/);
  assert.match(parseSurface(source.replace('guard(true);','guard(true)\n')).actions[0].functionSource,/if\(true\) \{ return; \}/);
  assert.match(parseSurface(source.replace('guard(true);','guard(true)')).actions[0].functionSource,/if\(true\) \{ return; \}/);
  assert.match(parseSurface(source.replace('guard(true);','guard(true, false);')).actions[0].functionSource,/guard\(true, false\)/);
  assert.throws(()=>parseSurface(source.replace('guard(true);','guard(true) guard(false);')),
    error=>error.code==='ELN-TS-PARSE');
  assert.throws(()=>parseSurface(fixture.replace('guard (blocked);','guard (blocked) then;')),
    error=>error.code==='ELN-GUARD-BODY' && error.line===3);
  assert.throws(()=>parseSurface(fixture.replace('publish("continued");','return 1;')),
    error=>error.code==='ELN-GUARD-RETURN' && error.line===10);
});

test('legacy standalone calls are diagnosed by checker and editor before build', t => {
  const source = [
    'component App(guard: (value: boolean) => void) {',
    '  action run() {',
    '    guard(true);',
    '  }',
    '  ui { button "Run" => run() }',
    '}',
  ].join('\n');
  const f=project(t,source);
  const service=createSurfaceLanguageService({root:f.root});
  t.after(()=>service.dispose());
  service.open(f.entry,source);
  for(const errors of [checkSurfaceProject(f.entry,{outputDir:f.outputDir}).diagnostics,service.diagnostics(f.entry)]){
    assert.deepEqual(errors.map(({code,line})=>({code,line})),[{code:'ELN-GUARD-CALL',line:3}]);
    assert.equal(source.slice(errors[0].start,errors[0].start+errors[0].length),'guard');
  }
  const outputDir=path.join(f.root,'build');
  assert.throws(()=>buildSurfaceProject(f.entry,{outputDir,checkOutputDir:f.outputDir}),
    error=>error.diagnostics?.some(d=>d.code==='ELN-GUARD-CALL'));
  assert.equal(fs.existsSync(path.join(outputDir,'manifest.json')),false);
});

test('an imported guard binding is reported while explicit member calls remain valid', t => {
  const source = [
    'import {guard, policy} from "./policy.mjs";',
    'component App() {',
    '  action run() {',
    '    guard(true);',
    '  }',
    '  ui { button "Run" => run() }',
    '}',
  ].join('\n');
  const f=project(t,source);
  fs.writeFileSync(path.join(f.root,'policy.mts'),
    'export function guard(value: boolean) { return value; }\nexport const policy = {guard};');
  assert.deepEqual(checkSurfaceProject(f.entry,{outputDir:f.outputDir}).diagnostics.map(d=>d.code),['ELN-GUARD-CALL']);
  fs.writeFileSync(f.entry,source.replace('    guard(true);','    policy.guard(true);'));
  assert.deepEqual(checkSurfaceProject(f.entry,{outputDir:f.outputDir}).diagnostics,[]);
});

test('a short multiline guard needs no semicolon and reports an ambiguous TypeScript binding', t => {
  const source=fixture.replace('    guard (blocked);','    guard (\n      blocked\n    )');
  const f=project(t,source);
  const service=createSurfaceLanguageService({root:f.root});
  t.after(()=>service.dispose());
  service.open(f.entry,source);
  assert.deepEqual(checkSurfaceProject(f.entry,{outputDir:f.outputDir}).diagnostics,[]);
  assert.deepEqual(service.diagnostics(f.entry),[]);

  const legacy=fixture.replace('component App(','component App(guard: (value: boolean) => void, ')
    .replace('    guard (blocked);','    guard (blocked)');
  fs.writeFileSync(f.entry,legacy);
  service.open(f.entry,legacy);
  assert.deepEqual(checkSurfaceProject(f.entry,{outputDir:f.outputDir}).diagnostics.map(d=>d.code),['ELN-GUARD-CALL']);
  assert.deepEqual(service.diagnostics(f.entry).map(d=>d.code),['ELN-GUARD-CALL']);
});

test('the editor keeps completion and later diagnostics when a guard block is missing', t => {
  const source = [
    'component App(task: {title: string; priority: string} | undefined) {',
    '  action run() {',
    '    guard (!task || task.title.length === 0) then',
    '    task.ti;',
    '    task.title;',
    '    checkLater;',
    '  }',
    '  ui { button "Run" => run() }',
    '}',
  ].join('\r\n');
  const f=project(t,source);
  const service=createSurfaceLanguageService({root:f.root});
  t.after(()=>service.dispose());
  for (const incomplete of [source,source.replace(' then\r\n',' then;\r\n')]) {
    service.open(f.entry,incomplete);
    const diagnostics=service.diagnostics(f.entry);
    const guard=diagnostics.filter(d=>d.code==='ELN-GUARD-BODY');
    assert.equal(guard.length,1);
    assert.equal(incomplete.slice(guard[0].start,guard[0].start+guard[0].length),'then');
    assert.ok(diagnostics.some(d=>d.code==='TS18048' && d.line===5));
    assert.ok(diagnostics.some(d=>d.code==='TS2304' && d.line===6 &&
      incomplete.slice(d.start,d.start+d.length)==='checkLater'));
    assert.ok(service.completions(f.entry,incomplete.indexOf('task.ti;')+'task.ti'.length)
      .some(result=>result.name==='title'));
  }
  assert.throws(()=>parseSurface(source),error=>error.code==='ELN-GUARD-BODY');
  const outputDir=path.join(f.root,'build');
  assert.throws(()=>buildSurfaceProject(f.entry,{outputDir,checkOutputDir:f.outputDir}),
    error=>error.diagnostics?.some(d=>d.code==='ELN-GUARD-BODY'));
  assert.equal(fs.existsSync(path.join(outputDir,'manifest.json')),false);

  const repaired=source.replace(' then\r\n',' then { }\r\n').replace('task.ti;','task.title;').replace('checkLater;','');
  service.open(f.entry,repaired);
  assert.deepEqual(service.diagnostics(f.entry),[]);
});

test('formatter preserves guard syntax and reaches a stable layout', () => {
  for (const expected of [fixture,fixture.replace('guard (blocked);','guard (blocked)')]) {
    const source=expected.replace(/^[ \t]+/gm,'');
    const result=formatSurface(source);
    assert.deepEqual(result.diagnostics,[]);
    assert.equal(applyFormatEdits(source,result.edits),expected);
    assert.deepEqual(formatSurface(expected),{edits:[],diagnostics:[]});
  }
});

test('the editor recovers an unclosed guard condition on its own line', t => {
  const source = [
    'component App(task: {title: string} | undefined) {',
    '  action run() {',
    '    guard (task?.',
    '    task.title;',
    '    checkLater;',
    '  }',
    '  ui { button "Run" => run() }',
    '}',
  ].join('\r\n');
  const f=project(t,source);
  const service=createSurfaceLanguageService({root:f.root});
  t.after(()=>service.dispose());
  service.open(f.entry,source);
  const diagnostics=service.diagnostics(f.entry);
  assert.deepEqual(diagnostics.map(d=>d.code),['ELN-GUARD-CLOSE','TS18048','TS2304']);
  const guard=diagnostics.find(d=>d.code==='ELN-GUARD-CLOSE');
  assert.equal(source.slice(guard?.start,guard?.start+guard?.length),'(');
  assert.ok(diagnostics.some(d=>d.code==='TS18048'&&d.line===4));
  assert.ok(diagnostics.some(d=>d.code==='TS2304'&&d.line===5));
  assert.ok(service.completions(f.entry,source.indexOf('task?.')+'task?.'.length)
    .some(item=>item.name==='title'));
  assert.ok(checkSurfaceProject(f.entry,{outputDir:f.outputDir}).diagnostics.length);

  const nested=source.replace('    guard (task?.\r\n','    if (true) {\r\n      guard (task?.\r\n    }\r\n');
  service.open(f.entry,nested);
  assert.ok(service.diagnostics(f.entry).some(d=>d.code==='ELN-PARSE-002'));
  assert.ok(!service.diagnostics(f.entry).some(d=>d.code==='ELN-GUARD-CLOSE'));

  const repaired=source.replace('guard (task?.','guard (!task);').replace('checkLater;','');
  service.open(f.entry,repaired);
  assert.deepEqual(service.diagnostics(f.entry),[]);
});

test('the editor recovers an indented multiline guard without consuming the next statement', t => {
  const source = [
    'component App(task: {title: string} | undefined) {',
    '  action run() {',
    '    guard (',
    '      !task ||',
    '      task?.',
    '',
    '    task.title;',
    '    checkLater;',
    '  }',
    '  ui { button "Run" => run() }',
    '}',
  ].join('\r\n');
  const f=project(t,source);
  const service=createSurfaceLanguageService({root:f.root});
  t.after(()=>service.dispose());
  service.open(f.entry,source);
  const diagnostics=service.diagnostics(f.entry);
  assert.deepEqual(diagnostics.map(({code,line})=>({code,line})),[
    {code:'ELN-GUARD-CLOSE',line:3},
    {code:'TS18048',line:7},
    {code:'TS2304',line:8},
  ]);
  assert.ok(service.completions(f.entry,source.indexOf('task?.')+'task?.'.length)
    .some(item=>item.name==='title'));
  assert.throws(()=>parseSurface(source),error=>error.code==='ELN-PARSE-002');

  const ambiguous=source.replace('    task.title;','      const later = 1;');
  service.open(f.entry,ambiguous);
  assert.ok(service.diagnostics(f.entry).some(d=>d.code==='ELN-PARSE-002'));
  assert.ok(!service.diagnostics(f.entry).some(d=>d.code==='ELN-GUARD-CLOSE'));

  const repaired=source.replace('task?.','task.title.length === 0\r\n    );').replace('checkLater;','');
  service.open(f.entry,repaired);
  assert.deepEqual(service.diagnostics(f.entry),[]);
});
