import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('creating the async client leaves TypeScript in the worker boundary until configuration is explicitly inspected',()=>{
 const module=new URL('../src/async-language-service.mjs',import.meta.url).href,pkg=new URL('../package.json',import.meta.url).href;
 const source=`import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(pkg)}),file=require.resolve('typescript');const {createAsyncLanguageService}=await import(${JSON.stringify(module)});const service=createAsyncLanguageService();const before=!!require.cache[file];const configuration=service.configuration();const after=!!require.cache[file];service.dispose();console.log(JSON.stringify({before,after,configuration}));`;
 const child=spawnSync(process.execPath,['--max-old-space-size=192','--input-type=module','-e',source],{encoding:'utf8'});assert.equal(child.status,0,child.stderr);const result=JSON.parse(child.stdout);
 assert.equal(result.before,false,'Importing and creating the async client must not evaluate TypeScript on the caller');assert.equal(result.after,true);assert.equal(result.configuration.profile,'elnor-mvp-fixed');assert.equal(result.configuration.compilerOptions.target,'ES2022');assert.match(result.configuration.typeScriptVersion,/^\d+\.\d+\./);
});
