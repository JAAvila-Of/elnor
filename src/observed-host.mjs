import path from 'node:path';

// Mutate only caller-owned hosts, preserving their original resolution behavior.
export function observeFileHost(host,onDependency){
  if(!onDependency)return host;
  for(const [method,kind] of [['readFile','file'],['fileExists','file'],['directoryExists','directory']]){
    if(!host[method])continue;
    const original=host[method];
    host[method]=function(file,...args){onDependency({file:path.resolve(file),kind});return original.call(this,file,...args);};
  }
  return host;
}
