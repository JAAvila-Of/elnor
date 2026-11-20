import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {checkSurfaceProject} from '../src/project-check.mjs';import {buildSurfaceProject} from '../src/project-build.mjs';
import {createSurfaceLanguageService} from '../src/language-service.mjs';

test('CLI checker and editor distinguish a string value from its target type', t => {
  const source = [
    'import type {TaskPriority} from "./priority.js";',
    'component App() {',
    '  action create() {',
    '    const priority: TaskPriority = "urgent";',
    '  }',
    '  ui { p "Ready" }',
    '}',
  ].join('\n');
  const f = fixture(t, source);
  fs.writeFileSync(path.join(f.dir, 'priority.ts'), 'export type TaskPriority = "normal" | "high";');
  const service = createSurfaceLanguageService({root: f.dir});
  t.after(() => service.dispose());
  service.open(f.entry, source);

  for (const diagnostics of [f.check(), service.diagnostics(f.entry)]) {
    const diagnostic = diagnostics.find(d => d.code === 'TS2322');
    assert.equal(diagnostic?.line, 4);
    assert.equal(diagnostic.message, 'The string value "urgent" is not assignable to type \'TaskPriority\'. Allowed values: "normal", "high".');
  }
});
function fixture(t,source){const dir=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'elnor-action-lines-')),entry=path.join(dir,'App.eln');fs.writeFileSync(entry,source);t.after(()=>{assert.equal(path.dirname(dir),fs.realpathSync.native(os.tmpdir()));assert.ok(path.basename(dir).startsWith('elnor-action-lines-'));fs.rmSync(dir,{recursive:true,force:true});});return {dir,entry,source,check(){return checkSurfaceProject(entry,{outputDir:path.join(dir,'check')}).diagnostics;}};}
const lineOf=(source,needle)=>source.slice(0,source.indexOf(needle)).split('\n').length;
function exact(diagnostics,source,needle,code='TS2322'){assert.ok(diagnostics.some(d=>d.code===code&&d.line===lineOf(source,needle)),JSON.stringify(diagnostics));}
test('CLI maps separate multiline action statements to their original lines',t=>{const source='component App() {\n action change() {\n  const first: string = 1;\n\n  const second: number = "bad";\n }\n ui { p "Ready" }\n}',f=fixture(t,source),d=f.check();exact(d,source,'const first');exact(d,source,'const second');assert.ok(d.every(v=>v.file===f.entry));});
test('async body maps past await, comments and blank CRLF lines',t=>{const source=['component App() {',' action async change() {','  await Promise.resolve();','  // Unicode text: \u03bb\u{1F680}','','  const wrong: boolean = 4;',' }',' ui { p "Ready" }','}'].join('\r\n'),f=fixture(t,source);exact(f.check(),source,'const wrong');});
test('collapsed header whitespace keeps parameter and same-generated-line body errors distinct',t=>{const source='component App() {\n action change(\n  first: MissingType\n )\n\n { const wrong: string = 2; }\n ui { p "Ready" }\n}',f=fixture(t,source),d=f.check();exact(d,source,'first: MissingType','TS2304');exact(d,source,'{ const wrong');});
test('multiline parameter types retain their own original line',t=>{const source='component App() {\n action change(\n   first: string,\n   second: MissingType\n ) {\n   void first;\n }\n ui { p "Ready" }\n}',f=fixture(t,source);exact(f.check(),source,'second: MissingType','TS2304');});
test('single-line body and parameter errors stay on the action line',t=>{const source='component App() {\n action change(value: MissingType) { const wrong: string = 3; }\n ui { p "Ready" }\n}',f=fixture(t,source),d=f.check();exact(d,source,'action change','TS2304');exact(d,source,'action change');});
test('multiple actions map independently, including source gaps before a body',t=>{const source='component App() {\n action one() {\n  const first: string = 1;\n }\n\n action async two()\n\n {\n  const second: number = "bad";\n }\n ui { p "Ready" }\n}',f=fixture(t,source),d=f.check();exact(d,source,'const first');exact(d,source,'const second');});
test('ordinary TS dependency, state and UI diagnostic locations remain original',t=>{const source='import {value} from "./logic.js";\ncomponent App() {\n state label: string = 1;\n action change() {\n  const wrong: string = 2;\n }\n ui {\n  p missingName\n }\n}',f=fixture(t,source);fs.writeFileSync(path.join(f.dir,'logic.ts'),'export const value: string = 3;\n');const d=f.check();exact(d,source,'state label');exact(d,source,'const wrong');exact(d,source,'p missingName','TS2304');assert.ok(d.some(v=>v.file.endsWith('logic.ts')&&v.line===1&&v.code==='TS2322'));});
test('body diagnostic refuses build while preserving the last valid manifest',t=>{const source='component App() {\n state value: string = "ready";\n action change() {\n  value = "valid";\n }\n ui { p value }\n}',f=fixture(t,source),options={outputDir:path.join(f.dir,'build'),checkOutputDir:path.join(f.dir,'cache')};buildSurfaceProject(f.entry,options);const manifest=fs.readFileSync(path.join(options.outputDir,'manifest.json'));const invalid=source.replace('value = "valid"','value = 2');fs.writeFileSync(f.entry,invalid);let diagnostics;assert.throws(()=>buildSurfaceProject(f.entry,options),error=>{diagnostics=error.diagnostics;return true;});exact(diagnostics,invalid,'value = 2');assert.deepEqual(fs.readFileSync(path.join(options.outputDir,'manifest.json')),manifest);});
