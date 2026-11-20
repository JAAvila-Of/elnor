import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'elnor-link-capability-'));
const target=path.join(root,'real.mjs'),link=path.join(root,'alias.mjs');
try{
  fs.writeFileSync(target,'export default 1;');
  fs.symlinkSync(target,link,'file');
  console.log(JSON.stringify({fileSymlink:true,realpathMatches:fs.realpathSync(link)===fs.realpathSync(target)}));
}catch(error){console.log(JSON.stringify({fileSymlink:false,code:error.code}));}
finally{
  if(fs.existsSync(link))fs.unlinkSync(link);
  if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unexpected temporary root');
  fs.rmSync(root,{recursive:true,force:true});
}
