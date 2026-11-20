// Expanded synthetic coverage. Run through run-windows.py under existing limits.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gzipSync,brotliCompressSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {buildSurfaceProject} from '../../src/project-build.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const internal=path.join(root,'elnor/.elnor/mvp/framework-comparison');
const directory=fs.mkdtempSync(path.join(internal,'matrix-')),site=path.join(directory,'site'),sources=path.join(directory,'sources');
fs.mkdirSync(site);fs.mkdirSync(sources);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest={kind:'elnor-expanded-matrix-v1',directory,workloads:['counter','form','composition','localized'],
  actions:{counter:['mount','increment','unmount'],form:['mount','edit-one','edit-all','invalid','recover','unmount'],
    composition:['mount','relay','unmount'],localized:['mount','local-update','unmount']},
  methodology:{warmups:2,rounds:7,localPanels:24,compositionDepth:6,formFields:6,cycles:8,
    conditions:'CPU capped, sandboxed headless Edge, GPU disabled; descriptive synthetic coverage, no accepted margin'},
  compiler:{sha256:sha(fs.readFileSync(path.join(root,'elnor/src/compiler.mjs')))},
  runtime:{sha256:sha(fs.readFileSync(path.join(root,'elnor/src/runtime.mjs')))},tooling:[],files:[],sourceHashes:{}};
fs.writeFileSync(path.join(directory,'runtime-source.mjs'),fs.readFileSync(path.join(root,'elnor/src/runtime.mjs')));
fs.writeFileSync(path.join(directory,'compiler-source.mjs'),fs.readFileSync(path.join(root,'elnor/src/compiler.mjs')));
for(const name of ['build.mjs','driver.mjs','worker.mjs','run-windows.py'])fs.copyFileSync(path.join(here,name),path.join(sources,name));
const deps=path.join(internal,'deps-v1'),require=createRequire(path.join(deps,'package.json'));
const {build}=require('esbuild'),{compile}=require('svelte/compiler');
manifest.versions=Object.fromEntries(['react','react-dom','svelte','esbuild'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(deps,'node_modules',name,'package.json'))).version]));
fs.copyFileSync(path.join(deps,'package-lock.json'),path.join(directory,'dependency-lock.json'));
const write=(dir,name,text)=>{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name),text);};
const options={bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,sourcemap:false,
  nodePaths:[path.join(deps,'node_modules')],conditions:['browser','production'],mainFields:['browser','module','main'],
  define:{'process.env.NODE_ENV':'"production"'},external:['/driver.mjs'],logLevel:'silent'};
const labels=['Name','Email','City','Company','Role','Notes'];
for(const workload of manifest.workloads){
  const dir=path.join(sources,workload),elnor=path.join(dir,'elnor'),svelte=path.join(dir,'svelte');
  let e,r,s;
  if(workload==='counter'){
    e='component App() {\n state value = 0;\n action increment() { value++; }\n ui {\n section .small {\n h1 "Small counter"\n strong value\n button "Increment" => increment()\n }\n }\n}\n';
    r='function App(){const [value,setValue]=useState(0);return <section className="small"><h1>Small counter</h1><strong>{value}</strong><button type="button" onClick={()=>setValue(v=>v+1)}>Increment</button></section>;}';
    s='<script>let value=$state(0);</script><section class="small"><h1>Small counter</h1><strong>{value}</strong><button type="button" onclick={()=>value++}>Increment</button></section>';
  }else if(workload==='form'){
    const fields=labels.map((_,i)=>'f'+i),summary='['+fields.join(',')+'].join("|")',valid='f0.length>0 && f1.includes("@")';
    e='component App() {\n'+fields.map(f=>` state ${f} = "";`).join('\n')+`\n calc summary = ${summary};\n calc valid = ${valid};\n ui {\n section .form {\n h1 "Profile form"\n`+
      labels.map((label,i)=>` input "${label}" <-> f${i}`).join('\n')+'\n strong summary\n strong (valid ? "ready" : "incomplete")\n if f1 && !f1.includes("@") {\n p "Invalid email"\n }\n }\n }\n}\n';
    r='function App(){'+fields.map((f,i)=>`const [${f},set${i}]=useState("");`).join('')+`const summary=${summary},valid=${valid};return <section className="form"><h1>Profile form</h1>`+
      labels.map((label,i)=>`<label><span>${label}</span><input type="text" value={f${i}} onInput={e=>set${i}(e.currentTarget.value)}/></label>`).join('')+'<strong>{summary}</strong><strong>{valid?"ready":"incomplete"}</strong>{f1&&!f1.includes("@")?<p>Invalid email</p>:null}</section>;}';
    s='<script>'+fields.map(f=>`let ${f}=$state("");`).join('')+`let summary=$derived(${summary}),valid=$derived(${valid});</script><section class="form"><h1>Profile form</h1>`+
      labels.map((label,i)=>`<label><span>${label}</span><input type="text" bind:value={f${i}}/></label>`).join('')+'<strong>{summary}</strong><strong>{valid?"ready":"incomplete"}</strong>{#if f1&&!f1.includes("@")}<p>Invalid email</p>{/if}</section>';
  }else if(workload==='composition'){
    write(elnor,'Card.eln','component Card(title: string) {\n ui {\n section .card {\n header {\n h2 title\n slot actions\n }\n slot\n }\n }\n}\n');
    write(svelte,'Card.svelte','<script>let {title,children,actions}=$props();</script><section class="card"><header><h2>{title}</h2>{@render actions()}</header>{@render children()}</section>');
    let reactLayers='function Card({title,actions,children}){return <section className="card"><header><h2>{title}</h2>{actions}</header>{children}</section>;}';
    for(let i=5;i>=0;i--){
      const child=i===5?'':'import Next from "./Layer'+(i+1)+'.eln";\n';
      write(elnor,`Layer${i}.eln`,child+`component Layer${i}(value: number) {\n event changed(value: number)\n ui {\n div .layer {\n span "Layer ${i}"\n`+
        (i===5?' strong value\n button "Increment" => emit.changed(value+1)\n':` Next value=value {\n on changed(next) => emit.changed(next)\n }\n`)+' }\n }\n}\n');
      write(svelte,`Layer${i}.svelte`,(i===5?'':`<script>import Next from './Layer${i+1}.svelte';`)+
        (i===5?'<script>':'')+'let {value,onchanged}=$props();</script>'+`<div class="layer"><span>Layer ${i}</span>`+
        (i===5?'<strong>{value}</strong><button type="button" onclick={()=>onchanged(value+1)}>Increment</button>':'<Next {value} onchanged={next=>onchanged(next)}/>')+'</div>');
      reactLayers+=`function Layer${i}({value,onChanged}){return <div className="layer"><span>Layer ${i}</span>`+
        (i===5?'<strong>{value}</strong><button type="button" onClick={()=>onChanged(value+1)}>Increment</button>':`<Layer${i+1} value={value} onChanged={next=>onChanged(next)}/>` )+'</div>;}';
    }
    e='import Card from "./Card.eln";\nimport Layer0 from "./Layer0.eln";\ncomponent App() {\n state value = 0;\n action record(next: number) { value=next; }\n ui {\n section {\n h1 "Composition"\n Card title="Card" {\n fill actions {\n span "Actions"\n }\n Layer0 value=value {\n on changed(next) => record(next)\n }\n p value\n }\n }\n }\n}\n';
    r=reactLayers+'function App(){const [value,setValue]=useState(0);return <section><h1>Composition</h1><Card title="Card" actions={<span>Actions</span>}><Layer0 value={value} onChanged={setValue}/><p>{value}</p></Card></section>;}';
    s='<script>import Card from "./Card.svelte";import Layer0 from "./Layer0.svelte";let value=$state(0);</script><section><h1>Composition</h1><Card title="Card">{#snippet actions()}<span>Actions</span>{/snippet}<Layer0 {value} onchanged={next=>value=next}/><p>{value}</p></Card></section>';
  }else{
    write(elnor,'Leaf.eln','component Leaf(label: string) {\n state value = 0;\n action increment() { value++; }\n ui {\n section .leaf {\n h2 label\n strong value\n button "Increment" => increment()\n }\n }\n}\n');
    write(svelte,'Leaf.svelte','<script>let {label}=$props();let value=$state(0);</script><section class="leaf"><h2>{label}</h2><strong>{value}</strong><button type="button" onclick={()=>value++}>Increment</button></section>');
    e='import Leaf from "./Leaf.eln";\ncomponent App() {\n ui {\n section {\n h1 "Localized panels"\n'+Array.from({length:24},(_,i)=>` Leaf label="Unit ${i}"`).join('\n')+'\n }\n }\n}\n';
    r='function Leaf({label}){const [value,setValue]=useState(0);return <section className="leaf"><h2>{label}</h2><strong>{value}</strong><button type="button" onClick={()=>setValue(v=>v+1)}>Increment</button></section>;}function App(){return <section><h1>Localized panels</h1>{Array.from({length:24},(_,i)=><Leaf key={i} label={"Unit "+i}/>)}</section>;}';
    s='<script>import Leaf from "./Leaf.svelte";</script><section><h1>Localized panels</h1>'+Array.from({length:24},(_,i)=>`<Leaf label="Unit ${i}"/>`).join('')+'</section>';
  }
  write(elnor,'App.eln',e);write(svelte,'App.svelte',s);
  write(dir,'react.jsx',"import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {attach} from '/driver.mjs';\n"+r+`\nattach('${workload}',()=>{const root=createRoot(document.getElementById('app'));root.render(<App/>);return ()=>root.unmount();});`);
  write(svelte,'entry.mjs',`import {mount,unmount} from 'svelte';import App from './App.svelte';import {attach} from '/driver.mjs';attach('${workload}',()=>{const app=mount(App,{target:document.getElementById('app')});return ()=>unmount(app);});`);
  let built;
  for(let repetition=0;repetition<3;repetition++){
    const start=performance.now(),cpu=process.cpuUsage();
    built=buildSurfaceProject(path.join(elnor,'App.eln'),{outputDir:path.join(directory,workload+'-output'),checkOutputDir:path.join(directory,workload+'-check')});
    const elapsed=process.cpuUsage(cpu);manifest.tooling.push({workload,repetition,wallMs:performance.now()-start,cpuMs:(elapsed.user+elapsed.system)/1000,
      boundary:'checked project build + owned publication, sequential shared process; not cold startup or save-to-feedback'});
  }
  const entry=path.join(dir,'elnor-entry.mjs');
  write(dir,'elnor-entry.mjs',`import {mount} from ${JSON.stringify(path.join(built.output,built.entryOutput))};import {attach} from '/driver.mjs';attach('${workload}',()=>mount(document.getElementById('app'),{}));`);
  await build({...options,entryPoints:[entry],outfile:path.join(site,workload+'-elnor.mjs')});
  await build({...options,jsx:'automatic',entryPoints:[path.join(dir,'react.jsx')],outfile:path.join(site,workload+'-react.mjs')});
  const plugin={name:'svelte',setup(builder){builder.onLoad({filter:/\.svelte$/},args=>({contents:compile(fs.readFileSync(args.path,'utf8'),{filename:args.path,generate:'client',dev:false}).js.code,loader:'js',resolveDir:path.dirname(args.path)}));}};
  await build({...options,plugins:[plugin],entryPoints:[path.join(svelte,'entry.mjs')],outfile:path.join(site,workload+'-svelte.mjs')});
  for(const framework of ['elnor','react','svelte'])write(site,workload+'-'+framework+'.html',`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body><main id="app"></main><script type="module" src="/${workload}-${framework}.mjs"></script></body></html>`);
}
await build({...options,external:[],entryPoints:[path.join(here,'driver.mjs')],outfile:path.join(site,'driver.mjs')});
write(site,'style.css','body{font:14px system-ui;margin:20px}button,input{font:inherit}section{margin:4px;padding:4px}label{display:block}label span{display:inline-block;width:90px}.leaf{display:inline-block;width:140px}.layer{padding-left:8px}strong{display:block}');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(path.join(dir,item.name)):[path.join(dir,item.name)]);
for(const file of walk(sources))manifest.sourceHashes[path.relative(sources,file)]=sha(fs.readFileSync(file));
for(const name of fs.readdirSync(site)){
  const bytes=fs.readFileSync(path.join(site,name));manifest.files.push({name,sha256:sha(bytes),rawBytes:bytes.length,gzipBytes:gzipSync(bytes,{level:9}).length,brotliBytes:brotliCompressSync(bytes).length});
}
if(manifest.runtime.sha256!==sha(fs.readFileSync(path.join(root,'elnor/src/runtime.mjs')))||manifest.compiler.sha256!==sha(fs.readFileSync(path.join(root,'elnor/src/compiler.mjs'))))throw Error('Core changed during matrix build');
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
console.log(JSON.stringify({directory,workloads:manifest.workloads}));
