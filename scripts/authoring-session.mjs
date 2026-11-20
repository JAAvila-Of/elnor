// A fixed local authoring exercise, not general project discovery or scaffolding.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readSurfaceGraph} from '../src/project-check.mjs';
import {typecheckGraph} from '../src/checker.mjs';
import {emitGraph} from '../src/compiler.mjs';
import {sourceKey} from '../src/source-identity.mjs';
import {createServer} from '../src/server.mjs';
import {formatAuthoringDiagnostics,authoringRecovery} from './authoring-diagnostics.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export const defaultWorkspace=path.resolve(root,'.elnor/mvp/authoring-workspace');
export const defaultPort=4184;
const marker='elnor-authoring-exercise-v1';
const templates=fileURLToPath(new URL('../examples/authoring/',import.meta.url));
const hash=source=>createHash('sha256').update(source).digest('hex');
const escapeHtml=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

export function createAuthoringSession(workspace=defaultWorkspace){
  workspace=path.resolve(workspace);
  const output=path.join(workspace,'.elnor-authoring-output');
  function requireSession(){
    const file=path.join(workspace,'.authoring-session.json');
    if(!fs.existsSync(file)||JSON.parse(fs.readFileSync(file,'utf8')).kind!==marker)
      throw Error('Run authoring setup for this workspace first');
  }
  function ownedOutput(){
    requireSession();
    const ownership=path.join(output,'.owner');
    if(fs.existsSync(output)){
      if(!fs.existsSync(ownership)||fs.readFileSync(ownership,'utf8')!==marker)
        throw Error('Refusing to replace an output directory not owned by this exercise');
    }else{
      fs.mkdirSync(output);fs.writeFileSync(ownership,marker,{flag:'wx'});
    }
    if(sourceKey(output)!==sourceKey(workspace)+'/.elnor-authoring-output')
      throw Error('Generated output must remain directly inside the authoring workspace');
    return output;
  }
  function setup(){
    fs.mkdirSync(workspace,{recursive:true});
    if(fs.existsSync(path.join(workspace,'.authoring-session.json')))requireSession();
    const created=[],preserved=[];
    const files={'.authoring-session.json':JSON.stringify({kind:marker},null,2)+'\n'};
    for(const name of ['Counter.eln','App.eln','style.css'])files[name]=fs.readFileSync(path.join(templates,name),'utf8');
    for(const [name,source] of Object.entries(files)){
      try{fs.writeFileSync(path.join(workspace,name),source,{flag:'wx'});created.push(name);}
      catch(error){if(error.code!=='EEXIST')throw error;preserved.push(name);}
    }
    requireSession();return {workspace,commandDirectory:root,previewCommand:'npm run authoring -- preview',created,preserved};
  }
  function check(){
    requireSession();
    const {graph,sources,diagnostics}=readSurfaceGraph(path.join(workspace,'App.eln'));
    if(!diagnostics.length)diagnostics.push(...typecheckGraph(graph,path.join(ownedOutput(),'check')));
    return {workspace,graph,sources,diagnostics};
  }
  function build(){
    const checked=check();
    if(checked.diagnostics.length)throw Object.assign(Error('Authoring source has diagnostics; preview was not updated'),{
      diagnostics:checked.diagnostics,sources:checked.sources,previewAvailable:fs.existsSync(path.join(output,'index.html')),
    });
    const emitted=emitGraph(checked.graph,ownedOutput());
    const entry=emitted.components.find(component=>sourceKey(component.source)===sourceKey(path.join(workspace,'App.eln')));
    if(!entry)throw Error('Authoring entry is missing from the emitted graph');
    const style=fs.readFileSync(path.join(workspace,'style.css'),'utf8'),builtAt=new Date().toISOString();
    fs.writeFileSync(path.join(output,'style.css'),style);
    fs.writeFileSync(path.join(output,'entry.mjs'),`import {mount} from ${JSON.stringify('./'+entry.file)};\nmount(document.getElementById('app'),{});\ndocument.getElementById('authoring-info').textContent=${JSON.stringify('Edit sources in: '+workspace+'\nLast successful build: '+builtAt)};\n`);
    fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Surface authoring exercise</title><link rel="stylesheet" href="/style.css"></head><body><main id="app"></main><pre id="authoring-info"></pre><script type="module" src="/entry.mjs"></script></body></html>\n');
    const inputs=[...checked.graph.values()].map(ir=>({file:ir.filename,hash:hash(ir.source)}));
    inputs.push({file:path.join(workspace,'style.css'),hash:hash(style)});
    fs.writeFileSync(path.join(output,'build-state.json'),JSON.stringify({kind:marker,builtAt,inputs},null,2));
    return {workspace,output,entry:entry.file,components:checked.graph.size};
  }
  function status(){
    requireSession();
    const result={workspace,commandDirectory:root,editableFiles:['Counter.eln','App.eln','style.css'].map(name=>path.join(workspace,name)),state:'no-build-record',changedFiles:[]};
    const stateFile=path.join(output,'build-state.json');if(!fs.existsSync(stateFile))return result;
    const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
    if(state.kind!==marker)throw Error('Unrecognized authoring build state');
    result.builtAt=state.builtAt;
    result.changedFiles=state.inputs.filter(input=>!fs.existsSync(input.file)||hash(fs.readFileSync(input.file))!==input.hash).map(input=>input.file);
    result.state=result.changedFiles.length?'saved-files-changed':'matches-last-successful-build';
    return result;
  }
  function renderPreview(html){
    let current;
    try{current=status();}catch{current={state:'unverified'};}
    let message,files='';
    if(current.state==='matches-last-successful-build')message='This preview matches the saved Surface/CSS files from the last successful build.';
    else{
      message=current.state==='saved-files-changed'?'Saved changes are not in this preview.':'The saved build status could not be verified.';
      message+=' Run <code>npm run authoring -- build</code> from the elnor command directory, then reload. Fix any reported source errors first.';
      if(current.changedFiles?.length)files='<ul>'+current.changedFiles.map(file=>'<li>'+escapeHtml(path.relative(workspace,file))+'</li>').join('')+'</ul>';
    }
    const notice='<aside id="authoring-build-status" role="status" aria-label="Preview build status"><p>'+message+'</p>'+files
      +'<p>Status checks saved Surface/CSS files when this page loads. It does not inspect unsaved editor text or all TypeScript dependencies.</p></aside>';
    return html.replace('<main id="app">',()=>notice+'<main id="app">');
  }
  function preview(){const built=build();return {built,server:createServer({dist:output,renderIndex:renderPreview})};}
  return {workspace,output,setup,check,build,status,preview};
}

export async function main(args=process.argv.slice(2)){
  const [command,...rest]=args;
  if(!['setup','check','build','preview','status'].includes(command)||
     (rest.length!==0&&(rest.length!==2||rest[0]!=='--workspace'||!rest[1])))
    throw Error('Usage: npm run authoring -- [setup|check|build|preview|status] [--workspace <directory>]');
  const session=createAuthoringSession(rest[1]??defaultWorkspace);
  if(command==='setup'){console.log(JSON.stringify(session.setup(),null,2));return;}
  if(command==='status'){console.log(JSON.stringify(session.status(),null,2));return;}
  if(command==='check'){
    const result=session.check();
    if(result.diagnostics.length){
      console.error(formatAuthoringDiagnostics(result.diagnostics,result.sources));
      console.error(authoringRecovery('check'));process.exitCode=1;
    }
    else console.log(`OK: ${result.graph.size} components checked in ${session.workspace}`);
    return;
  }
  if(command==='build'){console.log(JSON.stringify(session.build(),null,2));return;}
  const {built,server}=session.preview(),port=Number(process.env.PORT??defaultPort);
  server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`Authoring preview: http://127.0.0.1:${server.address().port}\nEdit sources in: ${built.workspace}\nKeep this terminal open. In another terminal, run commands from: ${root}\nAfter saving: npm run authoring -- build, then reload the browser.\nNo HMR or automatic browser/editor launch.`));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await main();}catch(error){
    if(error.diagnostics){
      console.error(formatAuthoringDiagnostics(error.diagnostics,error.sources));
      console.error(authoringRecovery('build',error.previewAvailable));
    }
    else console.error(error.message);
    process.exitCode=1;
  }
}
