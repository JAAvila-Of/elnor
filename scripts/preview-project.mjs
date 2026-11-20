import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createProjectPreview} from '../src/project-preview.mjs';

export function main(args=process.argv.slice(2), {command='npm run preview:project --'}={}){
  const usage=`Usage: ${command} <build-directory> [--props <object.json>] [--css <file.css>] [--port <port>]`;
  if(!args[0]||args[0].startsWith('--'))throw Error(usage);
  const options={};
  for(let index=1;index<args.length;index+=2){
    const flag=args[index],value=args[index+1];
    if(!['--props','--css','--port'].includes(flag)||!value||value.startsWith('--')||flag in options)throw Error(usage);
    options[flag]=value;
  }
  const port=options['--port']??'4185';
  if(!/^\d+$/.test(port)||Number(port)>65535)throw Error(usage);
  const props=options['--props']?JSON.parse(fs.readFileSync(options['--props'],'utf8')):{};
  const server=createProjectPreview({outputDir:args[0],props,cssFile:options['--css']});
  server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  server.listen(Number(port),'127.0.0.1',()=>console.log(`Project preview: http://127.0.0.1:${server.address().port}\nReload after a successful build. Restart to change props or CSS.\nNo automatic build, browser or editor launch.`));
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch(error){console.error(error.message);process.exitCode=1;}
}
