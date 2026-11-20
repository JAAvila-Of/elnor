import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {DIST} from './compiler.mjs';
const port=Number(process.env.PORT||4183);
export const csp="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
export function createServer({dist=DIST,renderIndex}={}){
  const root=path.resolve(dist);
  return http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    if(!fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.writeHead(404);res.end('Not found');return;}
    const headers={'Content-Security-Policy':csp,'Content-Type':types[path.extname(filename)]??'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
    // Optional local authoring status is rendered on navigation, without browser
    // polling, inline scripts or changes to the generated index on disk.
    if(renderIndex&&filename===path.join(root,'index.html')){
      try{const html=renderIndex(fs.readFileSync(filename,'utf8'));res.writeHead(200,headers);res.end(html);}
      catch{res.writeHead(500,headers);res.end('Preview unavailable');}
      return;
    }
    res.writeHead(200,headers);
    fs.createReadStream(filename).pipe(res);
  });
}
export function startServer(){
  const server=createServer();server.listen(port,'127.0.0.1',()=>console.log(`Elnor Studio: http://127.0.0.1:${port}`));return server;
}
