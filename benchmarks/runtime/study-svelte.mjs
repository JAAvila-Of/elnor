// Read the exact installed benchmark version; retain outputs for source study.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url));
const internal=path.resolve(here,'../../.elnor/mvp/framework-comparison');
const deps=path.join(internal,'deps-v1'),require=createRequire(path.join(deps,'package.json'));
const {compile}=require('svelte/compiler'),packageRoot=path.join(deps,'node_modules/svelte');
const directory=fs.mkdtempSync(path.join(internal,'svelte-study-'));
const manifest={kind:'elnor-svelte-source-study-v1',version:JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'),'utf8')).version,files:[]};
function retain(name,bytes,source){
  fs.writeFileSync(path.join(directory,name),bytes,{flag:'wx'});
  manifest.files.push({name,source,sha256:createHash('sha256').update(bytes).digest('hex')});
}
retain('producer.mjs',fs.readFileSync(fileURLToPath(import.meta.url)),fileURLToPath(import.meta.url));
for(const name of ['App','RowView']){
  const file=path.join(here,'svelte',name+'.svelte'),source=fs.readFileSync(file,'utf8');
  retain(name+'.svelte',source,file);
  retain(name+'.compiled.mjs',compile(source,{filename:file,generate:'client',dev:false}).js.code,file);
}
for(const [name,relative] of Object.entries({template:'src/internal/client/dom/template.js',text:'src/internal/client/render.js',events:'src/internal/client/dom/elements/events.js',each:'src/internal/client/dom/blocks/each.js',constants:'src/constants.js'})){
  const file=path.join(packageRoot,relative);retain(name+'.source.js',fs.readFileSync(file),file);
}
retain('elnor-runtime.mjs',fs.readFileSync(path.resolve(here,'../../src/runtime.mjs')),path.resolve(here,'../../src/runtime.mjs'));
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
console.log(JSON.stringify({directory,version:manifest.version}));
