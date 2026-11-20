import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {createInterface} from 'node:readline';import {fileURLToPath,pathToFileURL} from 'node:url';
import {launchLocalProcess} from './local-process.mjs';
import {buildSurfaceProject} from '../../src/project-build.mjs';import {createModulePlanner} from '../../src/module-plan.mjs';
const home=path.dirname(fileURLToPath(import.meta.url));
const maxReceiptIntervalSeconds = 2_147_483;
const maxRequestBytes = 131_072;
const commandRoute = /^\/api\/scopes\/[^/?]+\/commands\/[^/?]+(?:\?.*)?$/;
function validateReceiptInterval(seconds) {
 if(!Number.isSafeInteger(seconds)||seconds<1||seconds>maxReceiptIntervalSeconds) {
  throw TypeError(`Receipt maintenance interval must be from 1 to ${maxReceiptIntervalSeconds} seconds`);
 }
 return seconds;
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({destroyOnReturn:false})) {
    size += chunk.length;
    if (size > maxRequestBytes) return undefined;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function invalidTaskFields(body, validate) {
  let command;
  try { command = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(body)); }
  catch { return undefined; }
  if (command?.kind !== 'create' && command?.kind !== 'replace') return undefined;
  return validate(command.task).issues?.map(issue => ({
    path: ['task', ...(issue.path ?? [])], message: issue.message,
  }));
}
export async function startPilot({database,seed=false,faults=false,port=0,receiptIntervalSeconds}){
 if(!Number.isInteger(port)||port<0||port>65535)throw TypeError('Port must be an integer from 0 to 65535');
 if(receiptIntervalSeconds!==undefined)validateReceiptInterval(receiptIntervalSeconds);
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-persistent-task-pilot-'));let provider,server,dispatch,closed=false;
 async function startProvider({db=database,initialize=false}={}){
  if(provider)throw Error('Provider already running');
  const maintenanceArgs = receiptIntervalSeconds === undefined
   ? []
   : ['--receipt-maintenance-seconds', String(receiptIntervalSeconds)];
  const providerProcess = launchLocalProcess(process.env.ELNOR_TEST_PYTHON??(process.platform==='win32'?'python':'python3'),
   ['-B','-u',path.join(home,'provider_fixture.py'),'--db',path.resolve(db),...(initialize?['--seed']:[]),...(faults?['--faults']:[]),...maintenanceArgs], {
    label: 'Task desk provider',
    onStderr: receiptIntervalSeconds === undefined ? undefined : chunk => process.stderr.write(chunk)
   });
  provider = providerProcess;
  try {
   const ready = await providerProcess.ready();
   Object.assign(providerProcess, ready, {url: 'http://127.0.0.1:' + ready.port});
   return ready;
  } catch (error) {
   if (provider === providerProcess) provider = null;
   throw error;
  }
 }
 async function stopProvider(){const held=provider;provider=null;await held?.stop();}
 async function close(){
  if(closed)return;
  closed=true;
  try {
   if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
   await stopProvider();
  } finally {
   if(path.dirname(output)!==os.tmpdir()||!path.basename(output).startsWith('elnor-persistent-task-pilot-'))throw Error('Invalid owned output');
   fs.rmSync(output,{recursive:true,force:true});
  }
 }
 try{
  server=http.createServer((req,res)=>{if(dispatch)return dispatch(req,res);res.writeHead(503);res.end();});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const built=buildSurfaceProject(path.join(home,'App.eln'),{outputDir:path.join(output,'build'),checkOutputDir:path.join(output,'check')});
  const ready=await startProvider({initialize:seed}),identity={id:'local-task-fixture',scope:'alice',epoch:ready.epoch};
  const modules = createModulePlanner();
  const client = modules.include('./client.js', path.join(home, 'serve.mjs'));
  if (client.errors.length) throw Error(client.errors.map(error => error.message).join('\n'));
  const schema = modules.include('../task-desk/task-input-schema.js', path.join(home, 'serve.mjs'));
  if (schema.errors.length) throw Error(schema.errors.map(error => error.message).join('\n'));
  const schemaFile = path.join(output, 'build', 'builds', built.buildId, schema.path);
  const {validateTaskWireFields} = await import(pathToFileURL(schemaFile).href);
  const host=`import {mount} from ${JSON.stringify('/build/'+built.entryOutput.replaceAll('\\','/'))};import {createDeskClient} from ${JSON.stringify(client.path.slice(1))};const transport=${faults?`(url,o)=>{const fault=o.method==='PUT'?window.nextFault:null;window.nextFault=null;return fetch(url,{...o,headers:{...o.headers,...(fault?{'X-Fixture-Fault':fault}:{})}});}`:'fetch'};const client=createDeskClient({storage:localStorage,slot:'elnor-task-edit-alice',identity:${JSON.stringify(identity)},baseUrl:'/api',fetch:transport,createKey:()=>crypto.randomUUID()});window.stopView=mount(document.querySelector('div'),{client});`;
  const files=new Map([['/',{type:'text/html',data:Buffer.from('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Persistent Task desk</title><link rel="stylesheet" href="/style.css"><div></div><script type="module" src="/host.mjs"></script></html>')}],['/host.mjs',{type:'text/javascript',data:Buffer.from(host)}],['/style.css',{type:'text/css',data:fs.readFileSync(path.join(home,'style.css'))}]]);
  for (const [file, code] of modules.files()) {
    files.set('/' + file, {type: 'text/javascript', data: Buffer.from(code)});
  }
  function collect(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())collect(file);else if(item.name.endsWith('.mjs'))files.set('/build/'+path.relative(path.join(output,'build'),file).replaceAll('\\','/'),{type:'text/javascript',data:fs.readFileSync(file)});}}collect(path.join(output,'build'));
  dispatch=async(req,res)=>{res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
   if(req.url.startsWith('/api/')){
    if(!['GET','PUT'].includes(req.method)){res.writeHead(405);res.end();return;}
    try{
      const target=provider;
      if(!target?.url)throw Error('Provider unavailable');
      const body=await readBody(req);
      if(!body){res.writeHead(413);res.end();return;}
      const response=await fetch(target.url+req.url.slice(4),{
        method:req.method,
        headers:{'Content-Type':'application/json','X-Provider-Epoch':String(req.headers['x-provider-epoch']??''),
          ...(faults&&req.headers['x-fixture-fault']?{'X-Fixture-Fault':String(req.headers['x-fixture-fault'])}:{})},
        ...(req.method==='PUT'?{body}:{}),
      });
      const data=await response.text();
      // Preserve the provider's admission, epoch checks and durable outcomes.
      const issues=response.status===400&&req.method==='PUT'&&commandRoute.test(req.url)
        ?invalidTaskFields(body,validateTaskWireFields):undefined;
      res.writeHead(response.status,{'Content-Type':'application/json'});
      res.end(issues?JSON.stringify({error:'Invalid request',issues}):data);
    }catch{
      res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"Provider unavailable"}');
    }
    return;
   }
   const file=files.get(req.url);if(!file||req.method!=='GET'){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':file.type});res.end(file.data);
  };
  return {url:'http://127.0.0.1:'+server.address().port,identity,get provider(){return provider;},output,close,startProvider,stopProvider};
 }catch(error){await close();throw error;}
}
export function parsePilotArgs(args){
 const values=new Map();
 for(let i=0;i<args.length;i++){
  const key=args[i];
  if(!['--db','--port','--seed','--receipt-maintenance-seconds'].includes(key)||values.has(key))throw Error('Unknown or repeated option: '+key);
  if(key==='--seed'){values.set(key,true);continue;}
  const value=args[++i];if(typeof value!=='string'||!value||value.startsWith('--'))throw Error('Missing value for '+key);
  values.set(key,value);
 }
 if(!values.has('--db'))throw Error('Required: --db <file>');
 const text=values.get('--port')??'4337';
 if(!/^[0-9]+$/.test(text)||Number(text)>65535)throw Error('Port must be an integer from 0 to 65535');
 const options = {database:values.get('--db'),seed:values.has('--seed'),port:Number(text)};
 if (values.has('--receipt-maintenance-seconds')) {
  const interval = values.get('--receipt-maintenance-seconds');
  options.receiptIntervalSeconds = validateReceiptInterval(/^[0-9]+$/.test(interval) ? Number(interval) : NaN);
 }
 return options;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--help')console.log('Usage: node examples/persistent-task-desk/serve.mjs --db <file> [--seed] [--port <0..65535>] [--receipt-maintenance-seconds <seconds>]\nDefault: 127.0.0.1:4337; --port 0 opts into an ephemeral browser origin.\nReceipt maintenance is opt-in and reports each batch on stderr.');
 else{
  const options=parsePilotArgs(args),pilot=await startPilot(options);
  console.log(JSON.stringify({url:pilot.url,identity:pilot.identity,ephemeralOrigin:options.port===0}));
  try {
   for await (const line of createInterface({input:process.stdin, crlfDelay:Infinity})) {
    const command = line.trim();
    if (command === 'stop') break;
    if (options.receiptIntervalSeconds !== undefined && /^receipt-clock(?: |$)/.test(command)) {
     pilot.provider.child.stdin.write(command + '\n');
    }
   }
  }
  finally{await pilot.close();process.stdin.destroy();}
 }
}
