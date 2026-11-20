import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkSurfaceProject} from '../src/project-check.mjs';
import {formatSourceDiagnostics} from './authoring-diagnostics.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export function main(args=process.argv.slice(2), {runDirectory, command='npm run check:project --'}={}){
  if(args.length!==1||!args[0].endsWith('.eln'))throw Error(`Usage: ${command} <entry.eln>`);
  const runs=runDirectory??path.resolve(root,'.elnor/mvp/project-check-runs');fs.mkdirSync(runs,{recursive:true});
  const outputDir=fs.mkdtempSync(path.join(runs,'run-'));
  const result=checkSurfaceProject(path.resolve(args[0]),{outputDir});
  console.log(`TypeScript profile: ${result.configuration.profile}; tsconfig.json is not loaded.`);
  if(result.diagnostics.length){
    console.error(formatSourceDiagnostics(result.diagnostics,result.sources));
    console.error('Project check failed. No executable build was produced.');process.exitCode=1;
  }else console.log(`OK: ${result.graph.size} Surface component(s) checked from ${result.entry}`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch(error){console.error(error.message);process.exitCode=1;}
}
