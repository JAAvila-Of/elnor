import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {languageServiceProbe} from '../src/editor.mjs';

test('the original TS probe works in a clean output directory without legacy named projections',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-clean-probe-'));
  t.after(()=>{
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(directory).startsWith('elnor-clean-probe-'));
    fs.rmSync(directory,{recursive:true,force:true});
  });
  const result=languageServiceProbe('UserEditor',{outputDir:directory});
  assert.ok(path.resolve(result.generatedModule).startsWith(path.resolve(directory)+path.sep));
  assert.equal(fs.existsSync(path.join(directory,'examples/components/UserEditor.eln.mts')),false);
  assert.ok(result.definitionOriginalFile.endsWith('UserList.eln'));assert.equal(result.renamePossible,true);
  assert.ok(result.propSuggestions.includes('users'));
});
