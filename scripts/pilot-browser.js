// Run with playwright-cli run-code --filename=scripts/pilot-browser.js.
// Requires the local UserEditor preview and probe-viability.mjs preparation.
async page => {
  const checks=[],pageErrors=[],requests=[];
  const onError=error=>pageErrors.push(error.message);
  const onRequest=request=>requests.push(request.url());
  const ensure=(value,message)=>{if(!value)throw Error(message);};
  async function check(name,action){const start=Date.now();await action();checks.push({name,elapsedMs:Date.now()-start});}
  page.on('pageerror',onError);page.on('request',onRequest);
  try{
    const response=await page.goto('http://127.0.0.1:4183/');
    const csp=response.headers()['content-security-policy'];
    ensure(csp?.includes("connect-src 'none'")&&!/unsafe-inline|unsafe-eval/.test(csp),'Expected restrictive preview CSP');
    await page.getByRole('button',{name:'Ana Torres',exact:true}).waitFor();
    await check('filter and restore the composed user list',async()=>{
      await page.getByRole('textbox',{name:'Buscar usuarios',exact:true}).fill('Luis');
      await page.getByRole('button',{name:'Ana Torres',exact:true}).waitFor({state:'hidden'});
      ensure(await page.locator('#app li').count()===1,'Search should leave one row');
      await page.getByRole('button',{name:'Limpiar búsqueda',exact:true}).click();
      await page.getByRole('button',{name:'Ana Torres',exact:true}).waitFor();
      ensure(await page.locator('#app li').count()===3,'Clear should restore three rows');
    });
    await check('select a child event and reject an invalid name',async()=>{
      await page.getByRole('button',{name:'Ana Torres',exact:true}).click();
      await page.getByRole('textbox',{name:'Nombre',exact:true}).fill('A');
      await page.getByRole('button',{name:'Guardar',exact:true}).click();
      await page.getByText('El nombre debe tener 2 caracteres como mínimo',{exact:true}).waitFor();
      ensure(await page.getByRole('status').textContent()==='','Invalid name must not emit saved');
    });
    const payload='<img src=x onerror="window.__elnorXss=1">';
    await check('save asynchronously and render markup-looking text literally',async()=>{
      await page.getByRole('textbox',{name:'Nombre',exact:true}).fill(payload);
      await page.getByRole('button',{name:'Guardar',exact:true}).click();
      await page.getByRole('button',{name:payload,exact:true}).waitFor();
      await page.getByRole('status').filter({hasText:'Guardado: '+payload}).waitFor();
      ensure(await page.locator('#app img').count()===0,'Name must not become HTML');
      ensure(await page.evaluate(()=>globalThis.__elnorXss===undefined),'Name must not execute an event handler');
    });
    await check('cancel deletion then confirm and remove only the selected user',async()=>{
      await page.getByRole('button',{name:'Eliminar usuario...',exact:true}).click();
      await page.getByRole('button',{name:'Cancelar',exact:true}).click();
      ensure(await page.getByRole('button',{name:payload,exact:true}).count()===1,'Cancel must retain the row');
      await page.getByRole('button',{name:'Eliminar usuario...',exact:true}).click();
      await page.getByRole('button',{name:'Eliminar',exact:true}).click();
      await page.getByRole('button',{name:payload,exact:true}).waitFor({state:'hidden'});
      await page.getByRole('status').filter({hasText:'Eliminado: u1'}).waitFor();
      ensure(await page.locator('#app li').count()===2,'Delete must leave the other two rows');
      ensure(await page.getByRole('textbox',{name:'Nombre',exact:true}).count()===0,'Deleted selection should close its editor');
    });
    let security;
    await check('browser enforces inline, handler, eval, Function and fetch restrictions',async()=>{
      security=await page.evaluate(async()=>{
        const violations=[];
        const listener=event=>violations.push({directive:event.effectiveDirective,blocked:event.blockedURI});
        document.addEventListener('securitypolicyviolation',listener);
        const inline=document.createElement('script');inline.textContent='globalThis.__elnorInlineExecuted=true';document.body.append(inline);
        const button=document.createElement('button');button.setAttribute('onclick','globalThis.__elnorHandlerExecuted=true');document.body.append(button);button.click();
        let fetchBlocked=false;try{await fetch('/manifest.json');}catch(error){fetchBlocked=error instanceof TypeError;}
        const external=document.createElement('script');external.type='module';external.src='/viability-csp-probe.mjs';
        await new Promise((resolve,reject)=>{external.onload=resolve;external.onerror=()=>reject(Error('External same-origin probe did not load'));document.body.append(external);});
        await new Promise(resolve=>setTimeout(resolve,0));
        document.removeEventListener('securitypolicyviolation',listener);inline.remove();button.remove();external.remove();
        return {inlineBlocked:globalThis.__elnorInlineExecuted===undefined,handlerBlocked:globalThis.__elnorHandlerExecuted===undefined,
          fetchBlocked,...globalThis.__elnorCspProbe,evalExecuted:globalThis.__elnorEvalExecuted===true,functionExecuted:globalThis.__elnorFunctionExecuted===true,violations};
      });
      for(const name of ['inlineBlocked','handlerBlocked','fetchBlocked','evalBlocked','functionBlocked'])ensure(security[name]===true,`CSP probe failed: ${name}`);
      ensure(!security.evalExecuted&&!security.functionExecuted,'Unsafe dynamic code must not run');
      ensure(security.violations.some(item=>item.directive==='connect-src'),'Expected a connect-src violation event');
      ensure(security.violations.some(item=>item.blocked==='eval'),'Expected an unsafe-eval violation event');
    });
    ensure(pageErrors.length===0,'Unexpected runtime errors: '+pageErrors.join('; '));
    ensure(requests.every(url=>url.startsWith('http://127.0.0.1:4183/')),'Unexpected nonlocal request');
    const timing=await page.evaluate(()=>({navigation:performance.getEntriesByType('navigation')[0]?.toJSON(),paint:performance.getEntriesByType('paint').map(item=>({name:item.name,startTime:item.startTime}))}));
    return {passed:true,browser:await page.context().browser().version(),checks,csp,security,pageErrors,requests,timing,
      limits:'One automated Edge workflow with three local fixture rows. Not human DX validation, a security audit, scale or production latency evidence.'};
  }finally{page.off('pageerror',onError);page.off('request',onRequest);}
}
