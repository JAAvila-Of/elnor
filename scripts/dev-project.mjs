import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createProjectDev} from '../src/project-dev.mjs';
import {formatSourceDiagnostics,terminalText} from './authoring-diagnostics.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export function main(args=process.argv.slice(2), {runDirectory, command='npm run dev:project --'}={}){
  const usage=`Usage: ${command} <entry.eln> --out <directory> [--watch-dir <directory>] [--props <object.json>] [--css <file.css>] [--port <port>] [--experimental-hot]`;
  if(!args[0]?.endsWith('.eln'))throw Error(usage);
  const options={};
  for(let index=1;index<args.length;){
    const flag=args[index++];
    if(flag==='--experimental-hot'&&!(flag in options)){options[flag]=true;continue;}
    const value=args[index++];
    if(!['--out','--watch-dir','--props','--css','--port'].includes(flag)||!value||value.startsWith('--')||flag in options)throw Error(usage);
    options[flag]=value;
  }
  const port=options['--port']??'4185';
  if(!options['--out']||!/^\d+$/.test(port)||Number(port)>65535)throw Error(usage);
  const runs=runDirectory??path.resolve(root,'.elnor/mvp/project-dev-runs');fs.mkdirSync(runs,{recursive:true});
  const checkOutputDir=fs.mkdtempSync(path.join(runs,'run-'));
  const dev=createProjectDev({entry:args[0],outputDir:options['--out'],watchDir:options['--watch-dir'],propsFile:options['--props'],cssFile:options['--css'],checkOutputDir,
    hot:options['--experimental-hot'],
    onStatus(status){
      console.log(status.message);
      console.log(`Observed local dependency paths: ${status.dependencies.length}. Source scope: ${status.watchDir}`);
      if(status.previewInputs.state==='error')console.error(terminalText(status.previewInputs.message));
      else console.log(terminalText(status.previewInputs.message));
      if(status.error)console.error(formatSourceDiagnostics(status.error.diagnostics??[{code:'ELN-PROJECT-DEV',message:status.error.message}],status.error.sources));
    }});
  dev.server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  dev.server.listen(Number(port),'127.0.0.1',()=>{
    console.log(`Project development: http://127.0.0.1:${dev.server.address().port}\nWatch scope: ${dev.status().watchDir}\nSave sources to rebuild and reload the browser automatically. CSS-only edits update the page in place. Reload to apply changed props.\nNo automatic browser or editor launch.`);dev.start();
  });
  return dev;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch(error){console.error(error.message);process.exitCode=1;}
}
