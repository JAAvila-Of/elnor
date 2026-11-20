import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {csp} from './server.mjs';
import {sourceKey} from './source-identity.mjs';
import {localModuleDirectory,localModuleFile,moduleGraphRevision,sharedModuleUrl} from './module-revision.mjs';
import {hotReloadNotice,hotReloadReason} from './hot-contract.mjs';

const uuid=/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const digest=/^[a-f0-9]{64}$/;
const propsRevision=serialized=>createHash('sha256').update(serialized).digest('hex');
const stylePath=revision=>'/preview/inputs/'+revision+'/style.css';
const fail=message=>{throw Error('ELN-PROJECT-PREVIEW: '+message);};
function readPlain(file){
  for(let current=path.resolve(file);;current=path.dirname(current)){
    if(fs.lstatSync(current).isSymbolicLink())fail('Paths must not traverse symlinks or junctions');
    if(path.dirname(current)===current)break;
  }
  if(!fs.lstatSync(file).isFile())fail('Expected a regular file');
  return fs.readFileSync(file);
}
function json(file){return JSON.parse(readPlain(file).toString('utf8'));}
function loadBuild(root,entryKey){
  try{
    const owner=json(path.join(root,'.elnor-project-output.json')),manifest=json(path.join(root,'manifest.json'));
    if(owner?.kind!=='elnor-project-output-v1'||!uuid.test(owner.id)||typeof owner.entryKey!=='string'||(entryKey!==undefined&&owner.entryKey!==entryKey)
      ||manifest?.kind!=='elnor-project-build-v1'||manifest.ownerId!==owner.id||!uuid.test(manifest.buildId)
      ||manifest.profile!=='elnor-mvp-fixed'||typeof manifest.entrySource!=='string'||sourceKey(manifest.entrySource)!==owner.entryKey
      ||!Array.isArray(manifest.files)||!manifest.files.length)fail('Invalid owned build manifest');
    const prefix='builds/'+manifest.buildId+'/',files=new Map(),localModules=[];
    for(const record of manifest.files){
      const name=record?.file;
      if(typeof name!=='string'||!name.startsWith(prefix)||!name.endsWith('.mjs')
        ||!name.split('/').every(part=>/^[A-Za-z0-9_.-]+$/.test(part)&&part!=='.'&&part!=='..')
        ||files.has('/'+name)||!(/^[a-f0-9]{64}$/.test(record.sha256)))fail('Invalid module allowlist');
      const bytes=readPlain(path.join(root,...name.split('/')));
      if(createHash('sha256').update(bytes).digest('hex')!==record.sha256)fail('Module checksum mismatch');
      files.set('/'+name,bytes);
      const localFile=name.slice(prefix.length);
      if(manifest.moduleRevision!==undefined&&localFile.startsWith(localModuleDirectory)){
        if(!localModuleFile.test(localFile))fail('Invalid shared module path');
        localModules.push([localFile,record.sha256]);
      }
    }
    if(!files.has('/'+manifest.entryOutput))fail('Entry is not an allowed module');
    if(manifest.moduleRevision!==undefined){
      if(!localModules.length||moduleGraphRevision(localModules)!==manifest.moduleRevision)fail('Module graph revision mismatch');
      for(const [file] of localModules)files.set(sharedModuleUrl(manifest.moduleRevision,file),files.get('/'+prefix+file));
    }
    return {manifest,files};
  }catch(error){if(error.message.startsWith('ELN-PROJECT-PREVIEW:'))throw error;fail('Cannot load verified build: '+error.message);}
}
function propsJSON(props){
  const visit=value=>{
    if(value===null||typeof value==='string'||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))return;
    if(typeof value!=='object'||(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype))fail('Props must contain only JSON values');
    for(const item of Object.values(value))visit(item);
  };
  if(!props||Array.isArray(props)||typeof props!=='object')fail('Props must be a JSON object');
  try{visit(props);return JSON.stringify(props);}catch(error){fail('Invalid props: '+error.message);}
}

// A development-only input pair. A rejected candidate never replaces active bytes.
export function createPreviewInputs({props={},propsFile,cssFile,validateProps}={}){
  const fallback=propsJSON(props);let active,error,usable=false,checked=false;
  function validate(serializedProps){
    const diagnostics=validateProps?.(serializedProps,propsFile??'<preview props>')??[];
    if(diagnostics.length)throw Object.assign(Error('Props do not match the current component contract. '+diagnostics.map(d=>d.code+' '+d.path+': '+d.message).join('\n')),{diagnostics});
  }
  function read(){
    checked=true;
    try{
      const serializedProps=propsFile===undefined?fallback:propsJSON(json(path.resolve(propsFile)));
      const style=cssFile===undefined?undefined:readPlain(path.resolve(cssFile));
      validate(serializedProps);
      const hash=createHash('sha256').update(JSON.stringify([serializedProps,style===undefined?'absent':'css']));
      if(style)hash.update(style);
      active={revision:hash.digest('hex'),serializedProps,style};error=undefined;usable=true;
    }catch(next){
      error=next;usable=false;
      if(active){try{validate(active.serializedProps);usable=true;}catch{}}
      if(!usable)throw next;
    }
    return active;
  }
  function status(){
    const message=error?'Preview inputs failed. '+(usable?'Using the last valid props/CSS revision.':'No valid props/CSS revision for the current contract.')+' Fix the input files and reload. '+error.message:
      checked?'Props/CSS are valid. Reload to apply changed props.':'Props/CSS will be validated on navigation.';
    return {state:error?'error':checked?'ready':'unread',revision:usable?active?.revision:undefined,error:error?.message,diagnostics:error?.diagnostics?.map(d=>({...d}))??[],message};
  }
  function invalidate(){checked=false;usable=false;error=undefined;}
  return {read,status,invalidate};
}

// Read-only local preview. Application code executes only in the consuming browser.
export function createProjectPreview({outputDir,props={},cssFile,expectedEntry,expectedBuildId,statusText,allowUnbuilt=false,readInputs,autoReload,liveStyles=false,hotContract}={}){
  if(typeof outputDir!=='string'||!outputDir)fail('An explicit build output directory is required');
  const root=path.resolve(outputDir),serializedProps=propsJSON(props),routes=new Map(),entries=new Map();
  const styleUpdates=new Map(),hotEntries=new Map();
  const entryKey=expectedEntry===undefined?undefined:sourceKey(expectedEntry);
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const notice=()=>statusText?'<aside id="project-dev-status" role="status"><pre>'+escape(statusText())+'</pre></aside>':'';
  const reloadPath='/.elnor/dev/reload.mjs';
  const reloadTag=(build='',propsId,hotRevision)=>autoReload?'<script type="module" id="project-dev-reload" data-build="'+build+'"'+(propsId?' data-props="'+propsId+'"':'')+(hotRevision?' data-hot-revision="'+hotRevision+'"':'')+' src="'+reloadPath+'"></script>':'';
  const policy=autoReload?csp.replace("connect-src 'none'","connect-src 'self'"):csp;
  if(autoReload){
    const bytes=fs.readFileSync(new URL('./project-dev-client.mjs',import.meta.url));
    routes.set(reloadPath,{bytes,type:'text/javascript; charset=utf-8'});
  }
  let style;
  try{if(cssFile!==undefined)style=readPlain(path.resolve(cssFile));}catch(error){fail('Cannot read explicit CSS: '+error.message);}
  if(style)routes.set('/preview/style.css',{bytes:style,type:'text/css; charset=utf-8'});
  function navigation(){
    const inputs=readInputs?readInputs():{serializedProps,style};
    const {manifest,files}=loadBuild(root,entryKey);
    if(expectedBuildId&&manifest.buildId!==expectedBuildId())fail('Another build writer changed this output. Restart development or save a source change to rebuild with this session.');
    const boot='/preview/'+manifest.buildId+(readInputs?'/'+inputs.revision:'')+'/entry.mjs';
    const css=readInputs?stylePath(inputs.revision):'/preview/style.css';
    const contract=hotContract?.();
    const hotBuild=hotContract?{contract,moduleRevision:manifest.moduleRevision}:undefined;
    if(entries.has(manifest.buildId)&&entries.get(manifest.buildId)!==manifest.entryOutput)fail('A published entry changed; restart the preview');
    // Never replace bytes already referenced by an open page, even if disk changes.
    for(const [url,bytes] of files){
      if(routes.has(url)&&!routes.get(url).bytes.equals(bytes))fail('A published generation changed; restart the preview');
    }
    const entry='/'+manifest.entryOutput;
    const script=contract
      ?`import {mountHot} from ${JSON.stringify(entry)};\nimport {startHotMount} from ${JSON.stringify(reloadPath)};\nstartHotMount(mountHot, JSON.parse(${JSON.stringify(inputs.serializedProps)}));\n`
      :`import {mount} from ${JSON.stringify(entry)};\ntry {\n  mount(document.getElementById('app'),JSON.parse(${JSON.stringify(inputs.serializedProps)}));\n} catch (error) {\n  document.getElementById('preview-status').textContent='Preview failed: '+error.message;\n  throw error;\n}\n`;
    if(routes.has(boot)&&routes.get(boot).bytes.toString('utf8')!==script)fail('A published entry changed; restart the preview');
    for(const [url,bytes] of files)routes.set(url,{bytes,type:'text/javascript; charset=utf-8'});
    entries.set(manifest.buildId,manifest.entryOutput);
    if(hotBuild)hotEntries.set(manifest.buildId,hotBuild);
    if(inputs.style){
      routes.set(css,{bytes:inputs.style,type:'text/css; charset=utf-8'});
      styleUpdates.delete(css);
    }
    routes.set(boot,{bytes:Buffer.from(script),type:'text/javascript; charset=utf-8'});
    const liveStyle=liveStyles&&inputs.style?css:undefined;
    const mountedProps=liveStyle||contract?propsRevision(inputs.serializedProps):undefined;
    const reloadResult=hotContract?'<p id="project-dev-reload-result" role="status" hidden></p>':'';
    const html=Buffer.from('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Elnor project preview</title>'
      +(inputs.style?'<link rel="stylesheet"'+(liveStyle?' id="project-dev-style"':'')+' href="'+css+'">':'')+'</head><body>'+notice()+reloadResult+'<main id="app"></main><p id="preview-status" role="status">Build '+manifest.buildId+'. '+(contract?'Compatible presentation edits preserve component state. ':autoReload?'Source rebuilds reload this page. ':'Reload after a successful build. ')+(readInputs?'Props/CSS are validated on navigation.':'Props and CSS are loaded when the server starts.')+'</p><script type="module" src="'+boot+'"></script>'+reloadTag(manifest.buildId,liveStyle?mountedProps:undefined,contract?mountedProps:undefined)+'</body></html>');
    return {html,entry,hotBuild,mountedProps,liveStyle};
  }
  // The dev controller can remain reachable before its first successful build.
  if(!allowUnbuilt)navigation();
  return http.createServer((req,res)=>{
    const headers={'Content-Security-Policy':policy,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
    const send=(status,bytes,type='text/plain; charset=utf-8')=>{
      res.writeHead(status,{...headers,'Content-Type':type});res.end(req.method==='HEAD'?undefined:bytes);
    };
    if(req.headers.host!=='127.0.0.1:'+req.socket.localPort){send(403,'Local preview host required');return;}
    if(req.method!=='GET'&&req.method!=='HEAD'){send(405,'Only GET and HEAD are supported');return;}
    let url;try{url=new URL(req.url,'http://127.0.0.1');}catch{send(400,'Invalid URL');return;}
    if(autoReload&&url.pathname==='/.elnor/dev/status'){
      const build=url.searchParams.get('build');
      if(build!==''&&!uuid.test(build??'')){send(400,'Expected the current build ID');return;}
      const propsId=url.searchParams.get('props');
      if(propsId!==null&&!digest.test(propsId)){send(400,'Expected a props revision');return;}
      const hotRevision=url.searchParams.get('hot');
      if(hotRevision!==null&&!digest.test(hotRevision)){send(400,'Expected hot preview props revision');return;}
      let reload=false, blocked, css, replacement, reloadNotice;
      const published=expectedBuildId();
      if(autoReload()&&published&&build!==published){
        try{
          const next=navigation();
          if(next.hotBuild){
            const reason=hotReloadReason(hotEntries.get(build),next.hotBuild,hotRevision,next.mountedProps,build==='');
            if(reason){reload=true;reloadNotice=hotReloadNotice(published,reason);}
            else {replacement={build:published,entry:next.entry};css=next.liveStyle;}
          }else reload=true;
        }
        catch(error){blocked='Automatic reload is waiting. '+error.message;}
      }else if(liveStyles&&propsId!==null&&published&&build===published){
        try{
          const inputs=readInputs({validOnly:true});
          if(inputs?.style&&propsRevision(inputs.serializedProps)===propsId){
            css=stylePath(inputs.revision);
            if(!routes.has(css)&&!styleUpdates.has(css)){
              // Navigation keeps its own immutable styles. Bound the revisions published by polling.
              if(styleUpdates.size>=8)styleUpdates.delete(styleUpdates.keys().next().value);
              styleUpdates.set(css,{bytes:inputs.style,type:'text/css; charset=utf-8'});
            }
          }
        }catch(error){blocked='Live stylesheet update is waiting. '+error.message;}
      }
      const message=[statusText(),blocked].filter(Boolean).join('\n');
      send(200,JSON.stringify({reload,message,css,replacement,reloadNotice}),'application/json; charset=utf-8');
      return;
    }
    if(url.pathname==='/'){
      try{send(200,navigation().html,'text/html; charset=utf-8');}
      catch(error){
        if(statusText)send(503,'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Elnor project development</title></head><body>'+notice()+'<p>Preview unavailable: '+escape(error?.message??error)+'. Fix the reported errors and save.</p>'+reloadTag()+'</body></html>','text/html; charset=utf-8');
        else send(503,'Preview unavailable: the current build could not be verified. Fix the build and reload.');
      }
      return;
    }
    const route=routes.get(url.pathname)??styleUpdates.get(url.pathname);
    if(!route){send(404,'Not found');return;}
    send(200,route.bytes,route.type);
  });
}
