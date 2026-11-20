import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSurfaceProject} from '../src/project-build.mjs';
import {formatSourceDiagnostics} from './authoring-diagnostics.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export function main(args=process.argv.slice(2), {runDirectory, command='npm run build:project --'}={}){
  if(args.length!==3||!args[0].endsWith('.eln')||args[1]!=='--out'||!args[2]||args[2].startsWith('--'))
    throw Error(`Usage: ${command} <entry.eln> --out <directory>`);
  const runs=runDirectory??path.resolve(root,'.elnor/mvp/project-build-runs');fs.mkdirSync(runs,{recursive:true});
  const cache=fs.mkdtempSync(path.join(runs,'run-'));
  console.log(JSON.stringify(buildSurfaceProject(path.resolve(args[0]),{outputDir:args[2],checkOutputDir:cache}),null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch(error){
    if(error.diagnostics)console.error(formatSourceDiagnostics(error.diagnostics,error.sources));else console.error(error.message);
    console.error('Build failed. No new build was published.');process.exitCode=1;
  }
}
