// Read-only CLI: check layout or print one formatted source; never write inputs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatSurface,applyFormatEdits} from '../src/formatter.mjs';

export function main(args=process.argv.slice(2), {command='npm run format --'}={}){
  const check=args[0]==='--check';
  const files=check?args.slice(1):args;
  if(!files.length||files.some(file=>file.startsWith('--'))||(!check&&files.length!==1)){
    console.error(`Usage: ${command} [--check <files...> | <file>] (read-only)`);
    process.exitCode=2;
    return;
  }
  for(const file of files){
    try{
      const source=fs.readFileSync(file,'utf8');
      const result=formatSurface(source,{filename:file});
      if(result.diagnostics.length){
        for(const d of result.diagnostics)console.error(`${d.code} ${d.file}:${d.line}: ${d.message}`);
        process.exitCode=2;continue;
      }
      if(check){
        console.log(`${result.edits.length?'Needs formatting':'OK'}: ${file}`);
        if(result.edits.length&&process.exitCode!==2)process.exitCode=1;
      }else process.stdout.write(applyFormatEdits(source,result.edits));
    }catch(error){console.error(`${file}: ${error.message}`);process.exitCode=2;}
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
