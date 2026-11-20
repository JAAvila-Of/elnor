import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
import {buildSurfaceProject} from '../../src/project-build.mjs';
import {csp} from '../../src/server.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),internal=path.resolve(here,'../../.elnor/mvp/framework-comparison');
export async function buildComparison({runtimeSource=null}={}){
  const deps=path.join(internal,'deps-v1'),require=createRequire(path.join(deps,'package.json'));
  const {build}=require('esbuild'),{compile}=require('svelte/compiler');
  fs.mkdirSync(internal,{recursive:true});const directory=fs.mkdtempSync(path.join(internal,'run-')),output=path.join(directory,'site');fs.mkdirSync(output);
  const include=file=>path.basename(file)!=='__pycache__';
  function sourceFiles(directory){return fs.readdirSync(directory,{withFileTypes:true}).filter(item=>include(item.name)).flatMap(item=>item.isDirectory()?sourceFiles(path.join(directory,item.name)):[path.join(directory,item.name)]);}
  const sources=sourceFiles(here);fs.cpSync(here,path.join(directory,'sources'),{recursive:true,filter:include});
  const compilerFile=path.resolve(here,'../../src/compiler.mjs'),compilerBytes=fs.readFileSync(compilerFile);
  fs.writeFileSync(path.join(directory,'compiler-source.mjs'),compilerBytes,{flag:'wx'});
  fs.copyFileSync(path.join(deps,'package-lock.json'),path.join(directory,'dependency-lock.json'));
  const hashes=Object.fromEntries(sources.map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  const manifest={kind:'elnor-runtime-comparison-v1',builtAt:new Date().toISOString(),directory,
    versions:Object.fromEntries(['react','react-dom','svelte','esbuild'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(deps,'node_modules',name,'package.json'),'utf8')).version])),
    compiler:{source:compilerFile,sha256:createHash('sha256').update(compilerBytes).digest('hex')},
    sourceHashes:hashes,dependencyLockSha256:createHash('sha256').update(fs.readFileSync(path.join(deps,'package-lock.json'))).digest('hex'),files:[],methodology:{sizes:[100,1000],warmupRounds:2,measuredRounds:7,startupContexts:5,
      runtimeOrder:{100:['elnor','react','svelte'],1000:['svelte','react','elnor']},mode:'minified browser production, no HMR, normal event scheduling',
      outcome:'descriptive only; parity margins are not accepted'}};
  const options={bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,sourcemap:false,write:true,
    nodePaths:[path.join(deps,'node_modules')],conditions:['browser','production'],mainFields:['browser','module','main'],
    define:{'process.env.NODE_ENV':'"production"'},external:['/driver.mjs'],logLevel:'silent'};
  await build({...options,entryPoints:[path.join(here,'driver.mjs')],outfile:path.join(output,'driver.mjs')});
  const built=buildSurfaceProject(path.join(here,'elnor/App.eln'),{outputDir:path.join(directory,'elnor-output'),checkOutputDir:path.join(directory,'check')});
  const runtimeFile=runtimeSource??path.resolve(built.output,path.dirname(built.entryOutput),'../runtime.mjs');
  const runtimeBytes=fs.readFileSync(runtimeFile);
  fs.writeFileSync(path.join(directory,'runtime-source.mjs'),runtimeBytes,{flag:'wx'});
  manifest.runtime={source:runtimeFile,sha256:createHash('sha256').update(runtimeBytes).digest('hex')};
  if(runtimeBytes.includes('__elnorAllocationProbe'))manifest.runtime.instrumentation='reactive-allocations-v1';
  const runtimePlugin=instrumented=>({name:'comparison-runtime',setup(builder){builder.onLoad({filter:/[\\/]runtime\.mjs$/},()=>{
    let contents=runtimeBytes.toString('utf8');
    if(instrumented){
      const marker=contents.includes('disposed:false,run(){')?'disposed:false,run(){':'  run(){';
      if(contents.split(marker).length!==2)throw Error('Unsupported effect instrumentation marker');
      contents=contents.replace(marker,marker+'globalThis.__elnorEffectRuns=(globalThis.__elnorEffectRuns??0)+1;');
    }
    return {contents,loader:'js'};
  });}});
  const entry=path.join(directory,'elnor-entry.mjs');
  fs.writeFileSync(entry,`import {mount} from ${JSON.stringify(path.join(built.output,built.entryOutput))};\nimport {attach,size} from '/driver.mjs';\nattach(()=>mount(document.getElementById('app'),{size}));\n`,{flag:'wx'});
  await build({...options,plugins:[runtimePlugin(false)],entryPoints:[entry],outfile:path.join(output,'elnor.mjs')});
  await build({...options,plugins:[runtimePlugin(true)],entryPoints:[entry],outfile:path.join(output,'elnor-profile.mjs')});
  await build({...options,jsx:'automatic',entryPoints:[path.join(here,'react.jsx')],outfile:path.join(output,'react.mjs')});
  const sveltePlugin={name:'comparison-svelte',setup(builder){builder.onLoad({filter:/\.svelte$/},args=>{
    const compiled=compile(fs.readFileSync(args.path,'utf8'),{filename:args.path,generate:'client',dev:false});
    return {contents:compiled.js.code,loader:'js',resolveDir:path.dirname(args.path)};
  });}};
  await build({...options,plugins:[sveltePlugin],entryPoints:[path.join(here,'svelte/entry.mjs')],outfile:path.join(output,'svelte.mjs')});
  fs.copyFileSync(path.join(here,'style.css'),path.join(output,'style.css'));
  for(const framework of ['elnor','elnor-profile','react','svelte'])fs.writeFileSync(path.join(output,framework+'.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shared comparison</title><link rel="stylesheet" href="/style.css"></head><body><main id="app"></main><script type="module" src="/${framework}.mjs"></script></body></html>`);
  const routes=new Map();
  for(const name of fs.readdirSync(output)){
    const bytes=fs.readFileSync(path.join(output,name)),gzip=gzipSync(bytes,{level:9}),brotli=brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:11}});
    manifest.files.push({name,rawBytes:bytes.length,gzipBytes:gzip.length,brotliBytes:brotli.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    routes.set('/'+name,{bytes,gzip,type:name.endsWith('.mjs')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});
  }
  for(const [file,hash] of Object.entries(hashes))if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==hash)throw Error('Benchmark source changed during build');
  if(createHash('sha256').update(fs.readFileSync(compilerFile)).digest('hex')!==manifest.compiler.sha256)throw Error('Compiler changed during benchmark build');
  fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
  const server=http.createServer((req,res)=>{
    if(req.headers.host!=='127.0.0.1:'+req.socket.localPort){res.writeHead(403);res.end();return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const route=routes.get(new URL(req.url,'http://127.0.0.1').pathname);
    if(!route){res.writeHead(404);res.end();return;}
    const compressed=/\bgzip\b/.test(req.headers['accept-encoding']??''),bytes=compressed?route.gzip:route.bytes;
    res.writeHead(200,{'Content-Type':route.type,'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store',
      Vary:'Accept-Encoding','Content-Length':bytes.length,...(compressed?{'Content-Encoding':'gzip'}:{})});res.end(req.method==='HEAD'?undefined:bytes);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const baseURL='http://127.0.0.1:'+server.address().port;
  const collector=fs.readFileSync(path.join(here,'browser-run.js'),'utf8').replace('export async function','async function');
  const configs=[{mode:'preflight'},{mode:'startup'},{mode:'memory'},...[100,1000].flatMap(size=>manifest.methodology.runtimeOrder[size].map(framework=>({mode:'runtime',framework,size})))];
  for(const config of configs){
    const name=[config.mode,config.framework,config.size].filter(Boolean).join('-')+'.js';
    fs.writeFileSync(path.join(directory,name),'async page => { const collect = ('+collector+'); return collect(page,'+JSON.stringify({...config,baseURL})+'); }');
  }
  console.log(JSON.stringify({directory,url:baseURL,versions:manifest.versions}));
  return {server,directory,manifest};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);let runtimeSource=null,buildOnly=false;
    while(args.length){const arg=args.shift();if(arg==='--build-only')buildOnly=true;else if(arg==='--runtime-source'&&args.length)runtimeSource=path.resolve(args.shift());else throw Error('Invalid comparison build option');}
    const built=await buildComparison({runtimeSource});
    if(buildOnly)await new Promise(resolve=>built.server.close(resolve));
    else{process.stdin.setEncoding('utf8');process.stdin.on('data',text=>{if(text.trim()==='stop')built.server.close();});}
  }
  catch(error){console.error(error.diagnostics??error.stack);process.exitCode=1;}
}
