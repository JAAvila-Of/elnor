// Separate diagnostic protocol: alternate isolated pages for every action.
import assert from 'node:assert/strict';

export async function collectInterleaved(browser,baseURLs,config,observe,progress){
  const actions=['create','update','select','append','swap','remove','clear'];
  const names=['TaskDuration','ThreadTime','ScriptDuration','LayoutDuration','RecalcStyleDuration'];
  const handles={},variants={};
  const metrics=async cdp=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(v=>[v.name,v.value]));
  async function act(tab,action){
    await tab.evaluate(action=>window.__bench.prepare(action),action);
    await tab.evaluate(()=>window.__bench.run());return tab.evaluate(()=>window.__bench.verify());
  }
  try{
    for(const label of config.order){
      progress({stage:'open-interleaved',label});
      const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});
      handles[label]={context};const tab=await context.newPage(),errors=[];
      tab.on('pageerror',error=>errors.push(error.message));tab.setDefaultTimeout(5000);tab.setDefaultNavigationTimeout(5000);
      await tab.goto(baseURLs[label]+'/'+config[label].framework+'.html?n='+config.size);
      await tab.waitForFunction(()=>!!window.__bench,{timeout:10000});await tab.evaluate(()=>window.__bench.ready);
      const cdp=await context.newCDPSession(tab);await cdp.send('Performance.enable',{timeDomain:'threadTicks'});
      handles[label]={context,tab,cdp,errors};
      variants[label]={label,began:new Date().toISOString(),observation:{
        kind:'elnor-runtime-browser-observations-v1',mode:'runtime',protocol:'action-interleaved-v1',
        framework:config[label].framework,size:config.size,browser:browser.version(),metricTimeDomain:'threadTicks',samples:[],passed:false}};
    }
    for(let round=-2;round<7;round++)for(let index=0;index<actions.length;index++){
      const action=actions[index],order=(round+index)&1?[...config.order].reverse():config.order;
      for(let position=0;position<order.length;position++){
        const label=order[position],{tab,cdp}=handles[label];
        progress({stage:'interleaved-action',round,action,label,position});await tab.bringToFront();
        const visibility=await tab.evaluate(()=>document.visibilityState);assert.equal(visibility,'visible');
        await act(tab,action==='create'?'clear':'create');
        await tab.evaluate(action=>window.__bench.prepare(action),action);
        const began=new Date().toISOString(),before=await metrics(cdp);
        const timing=await tab.evaluate(()=>window.__bench.run()),after=await metrics(cdp);
        const finished=new Date().toISOString(),cpu={};
        for(const name of names){
          assert.ok(Number.isFinite(before[name])&&Number.isFinite(after[name])&&after[name]>=before[name]);
          cpu[name+'Ms']=(after[name]-before[name])*1000;
        }
        const checked=await tab.evaluate(()=>window.__bench.verify());
        if(round>=0)variants[label].observation.samples.push({round,action,position,visibility,began,finished,...timing,...cpu,...checked});
      }
    }
    for(const label of config.order){
      const handle=handles[label],variant=variants[label];await handle.tab.bringToFront();
      variant.observation.afterTiming=await observe(handle,config[label].framework);
      await handle.tab.evaluate(()=>window.__bench.unmount());assert.deepEqual(handle.errors,[]);
      variant.observation.passed=true;variant.finished=new Date().toISOString();
    }
    return config.order.map(label=>variants[label]);
  }finally{for(const handle of Object.values(handles))await handle.context.close();}
}
