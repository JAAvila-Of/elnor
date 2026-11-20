import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describeTypeScriptConfiguration} from '../src/typescript-configuration.mjs';

export function inspectTypeScriptConfiguration(root=process.cwd()){
  root=path.resolve(root);
  if(!fs.statSync(root).isDirectory())throw Error('Configuration inspection requires a directory');
  const file=path.join(root,'tsconfig.json');
  // Presence only: do not parse configs, traverse parents or load extensions.
  return {...describeTypeScriptConfiguration(),root,
    rootConfig:{file,present:fs.existsSync(file),applied:false},
    inspectionScope:'Only the named root tsconfig.json is checked for presence; no config content is read',
  };
}

export function main(args=process.argv.slice(2)){
  if(args.length&&!(args.length===2&&args[0]==='--root'&&args[1]&&!args[1].startsWith('--')))
    throw Error('Usage: npm run config -- [--root <directory>]');
  console.log(JSON.stringify(inspectTypeScriptConfiguration(args[1]),null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch(error){console.error(error.message);process.exitCode=1;}
}
