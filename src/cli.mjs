import {build,check} from './compiler.mjs';
import {startServer} from './server.mjs';
const [cmd='check',entry='UserEditor']=process.argv.slice(2);
if(!['check','build','preview'].includes(cmd))throw Error('Usage: node src/cli.mjs [check|build|preview] [Component]');
if(cmd==='check'){
  const {graph,diagnostics}=check(entry);
  if(diagnostics.length){for(const d of diagnostics)console.error(`${d.code} ${d.file}:${d.line} ${d.message}`);process.exitCode=1;}
  else console.log(`OK: ${graph.size} component(s) parsed and typechecked for ${entry}`);
}else{
  const output=build(entry);
  console.log(`Built ${output.graph.size} component(s) for ${entry}`);
  if(cmd==='preview')startServer();
}
