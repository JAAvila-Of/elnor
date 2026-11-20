export async function collectComparison(page,config,progress=()=>{}){
  const browser=page.context().browser(),actions=['create','update','select','append','swap','remove','clear'];
  const result={kind:'elnor-runtime-browser-observations-v1',mode:config.mode,framework:config.framework,size:config.size,
    browser:browser.version(),metricTimeDomain:config.timeDomain??'timeTicks',samples:[],passed:false};
  const metricNames=['ScriptDuration','LayoutDuration','RecalcStyleDuration','TaskDuration','ThreadTime'];
  if(['calibration','trace'].includes(config.mode))metricNames.push('DevToolsCommandDuration','TaskOtherDuration','V8CompileDuration');
  const check=(value,message)=>{if(!value)throw Error(message);};
  async function open(framework,size){
    progress({stage:'open',framework,size});
    const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'}),tab=await context.newPage(),errors=[];
    tab.on('pageerror',error=>errors.push(error.message));
    tab.setDefaultTimeout(5000);tab.setDefaultNavigationTimeout(5000);
    try{
      const asset=config.mode==='mutations'&&framework==='elnor'?'elnor-profile':framework;
      await tab.goto(config.baseURL+'/'+asset+'.html?n='+size);await tab.waitForFunction(()=>!!window.__bench,{timeout:10000});
      await tab.evaluate(()=>window.__bench.ready);await tab.bringToFront();
      const cdp=await context.newCDPSession(tab);await cdp.send('Performance.enable',{timeDomain:result.metricTimeDomain});
      return {context,tab,cdp,errors};
    }catch(error){await context.close();throw error;}
  }
  async function act(tab,action){
    progress({stage:'reset',action});
    await tab.evaluate(action=>window.__bench.prepare(action),action);
    await tab.evaluate(()=>window.__bench.run());return tab.evaluate(()=>window.__bench.verify());
  }
  async function metrics(cdp){return Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));}
  function durations(before,after){
    const values={};
    for(const name of metricNames){
      check(Number.isFinite(before[name])&&Number.isFinite(after[name])&&
        (name==='TaskOtherDuration'||after[name]>=before[name]),name+' invalid');
      values[name+'Ms']=(after[name]-before[name])*1000;
    }
    return values;
  }
  async function memory(cdp){
    await cdp.send('HeapProfiler.collectGarbage');
    const values=await metrics(cdp),dom=await cdp.send('Memory.getDOMCounters');
    check(Number.isFinite(values.JSHeapUsedSize),'JS heap metric absent');
    return {jsHeapUsedBytes:values.JSHeapUsedSize,domNodes:dom.nodes,documents:dom.documents,listeners:dom.jsEventListeners};
  }
  if(config.mode==='preflight'){
    const schemas={};
    for(const size of [100,1000])for(const framework of ['elnor','react','svelte']){
      const {context,tab,errors}=await open(framework,size);
      try{
        for(const action of actions){
          const checked=await act(tab,action);
          if(action==='create'){
            const hash=await tab.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(window.__bench.schema())))).map(byte=>byte.toString(16).padStart(2,'0')).join(''));
            if(schemas[size])check(schemas[size]===hash,'Unequal element/attribute/text schema');else schemas[size]=hash;
          }
          result.samples.push({framework,size,action,...checked});
        }
        await tab.evaluate(()=>window.__bench.unmount());check(errors.length===0,errors.join('\n'));
      }finally{await context.close();}
    }
    result.schemas=schemas;
  }else if(config.mode==='domallocations'){
    const {context,tab,cdp,errors}=await open(config.framework,config.size);
    try{
      await tab.evaluate(()=>{
        let counts;
        for(const [name,key] of [['createDocumentFragment','fragments'],['createElement','elements'],['createTextNode','textNodes']]){
          const original=document[name];
          document[name]=function(...args){counts[key]++;return Reflect.apply(original,this,args);};
        }
        const append=DocumentFragment.prototype.append;
        DocumentFragment.prototype.append=function(...args){counts.fragmentAppends++;return Reflect.apply(append,this,args);};
        globalThis.__domAllocationProbe={reset(){counts={fragments:0,elements:0,textNodes:0,fragmentAppends:0};},snapshot(){return {...counts};}};
        globalThis.__domAllocationProbe.reset();
      });
      for(const action of actions){
        progress({stage:'dom-allocation-profile',action});await act(tab,action==='create'?'clear':'create');
        await tab.evaluate(action=>window.__bench.prepare(action),action);
        await tab.evaluate(()=>globalThis.__domAllocationProbe.reset());
        await cdp.send('HeapProfiler.startSampling',{samplingInterval:4096});
        await tab.evaluate(()=>window.__bench.run());
        const {profile}=await cdp.send('HeapProfiler.stopSampling');
        const counters=await tab.evaluate(()=>globalThis.__domAllocationProbe.snapshot());
        const checked=await tab.evaluate(()=>window.__bench.verify());
        result.samples.push({action,counters,profile,...checked});
      }
      check(errors.length===0,errors.join('\n'));await tab.evaluate(()=>window.__bench.unmount());
    }finally{await context.close();}
  }else if(config.mode==='allocations'){
    check(config.framework==='elnor','Reactive allocation probe requires Elnor');
    const {context,tab,cdp,errors}=await open(config.framework,config.size);
    try{
      check(await tab.evaluate(()=>!!globalThis.__elnorAllocationProbe),'Allocation probe runtime absent');
      for(const action of actions){
        progress({stage:'allocation-profile',action});await act(tab,action==='create'?'clear':'create');
        await tab.evaluate(action=>window.__bench.prepare(action),action);
        await tab.evaluate(()=>globalThis.__elnorAllocationProbe.reset());
        await cdp.send('HeapProfiler.startSampling',{samplingInterval:4096});
        await tab.evaluate(()=>window.__bench.run());
        const {profile}=await cdp.send('HeapProfiler.stopSampling');
        const counters=await tab.evaluate(()=>globalThis.__elnorAllocationProbe.snapshot());
        const checked=await tab.evaluate(()=>window.__bench.verify());
        result.samples.push({action,counters,profile,...checked});
      }
      check(errors.length===0,errors.join('\n'));await tab.evaluate(()=>window.__bench.unmount());
    }finally{await context.close();}
  }else if(config.mode==='profile'){
    const {context,tab,cdp,errors}=await open(config.framework,config.size);
    try{
      await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:100});
      for(let round=-config.warmupRounds;round<config.measuredRounds;round++)for(const action of actions){
        progress({stage:'cpu-profile',action,round});await act(tab,action==='create'?'clear':'create');
        await tab.evaluate(action=>window.__bench.prepare(action),action);
        if(round<0){await tab.evaluate(()=>window.__bench.run());await tab.evaluate(()=>window.__bench.verify());continue;}
        await cdp.send('Profiler.start');await tab.evaluate(()=>window.__bench.run());
        const {profile}=await cdp.send('Profiler.stop'),checked=await tab.evaluate(()=>window.__bench.verify());
        result.samples.push({action,round,profile,...checked});
      }
      check(errors.length===0,errors.join('\n'));await tab.evaluate(()=>window.__bench.unmount());
    }finally{await context.close();}
  }else if(config.mode==='mutations'){
    const {context,tab,errors}=await open(config.framework,config.size);
    try{
      await tab.evaluate(()=>{
        let records=[];const observer=new MutationObserver(batch=>records.push(...batch));
        observer.observe(document.getElementById('app'),{subtree:true,childList:true,characterData:true});
        window.__mutationProbe={reset(){records=[];observer.takeRecords();globalThis.__elnorEffectRuns=0;},read(){
          records.push(...observer.takeRecords());const added=new Set(),removed=new Set();let additions=0,removals=0;
          for(const record of records){for(const n of record.addedNodes){additions++;if(n.nodeName==='LI')added.add(n);}for(const n of record.removedNodes){removals++;if(n.nodeName==='LI')removed.add(n);}}
          return {childListRecords:records.filter(r=>r.type==='childList').length,textRecords:records.filter(r=>r.type==='characterData').length,
            addedNodes:additions,removedNodes:removals,movedRows:[...added].filter(n=>removed.has(n)).length,effectRuns:globalThis.__elnorEffectRuns};
        }};
      });
      for(const action of actions){
        progress({stage:'mutations',action});await act(tab,action==='create'?'clear':'create');
        await tab.evaluate(action=>window.__bench.prepare(action),action);await tab.evaluate(()=>window.__mutationProbe.reset());
        await tab.evaluate(()=>window.__bench.run());const counters=await tab.evaluate(()=>window.__mutationProbe.read());
        const checked=await tab.evaluate(()=>window.__bench.verify());
        result.samples.push({action,...counters,effectRuns:config.framework==='elnor'?counters.effectRuns:null,...checked});
      }
      check(errors.length===0,errors.join('\n'));await tab.evaluate(()=>window.__bench.unmount());
    }finally{await context.close();}
  }else if(config.mode==='trace'){
    const {context,tab,cdp,errors}=await open(config.framework,config.size);
    try{
      for(let round=0;round<2;round++){await act(tab,'create');await act(tab,'clear');}
      for(const action of ['create','clear']){
        progress({stage:'trace',action});await act(tab,action==='create'?'clear':'create');
        await tab.evaluate(action=>window.__bench.prepare(action),action);
        await cdp.send('Tracing.start',{categories:'toplevel,accessibility,blink,devtools.timeline,v8',transferMode:'ReturnAsStream'});
        const before=await metrics(cdp);
        await tab.evaluate(()=>window.__bench.run());
        const after=await metrics(cdp);
        const finished=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
        await cdp.send('Tracing.end');const completed=await finished;
        check(!!completed.stream&&!completed.dataLossOccurred,'Incomplete trace');
        let source='',bytes=0;
        try{
          while(true){
            const chunk=await cdp.send('IO.read',{handle:completed.stream,size:65536});
            check(!chunk.base64Encoded,'Unexpected binary trace');
            bytes+=Buffer.byteLength(chunk.data);check(bytes<=8*1024*1024,'Trace exceeds 8 MiB limit');
            source+=chunk.data;progress({stage:'trace-read',action,bytes});if(chunk.eof)break;
          }
        }finally{await cdp.send('IO.close',{handle:completed.stream});}
        const trace=JSON.parse(source);check(Array.isArray(trace.traceEvents),'Trace events absent');
        result.samples.push({action,...durations(before,after),traceBytes:bytes,trace,...await tab.evaluate(()=>window.__bench.verify())});
      }
      check(errors.length===0,errors.join('\n'));await tab.evaluate(()=>window.__bench.unmount());
    }finally{await context.close();}
  }else if(config.mode==='runtime'||config.mode==='calibration'){
    const {context,tab,cdp,errors}=await open(config.framework,config.size);
    try{
      const warmup=config.warmupRounds??2,rounds=config.measuredRounds??7;
      if(!Number.isInteger(warmup)||warmup<0||warmup>2||!Number.isInteger(rounds)||rounds<1||rounds>7)throw Error('Invalid round counts');
      for(let round=-warmup;round<rounds;round++)for(const action of actions){
        progress({stage:'prepare',round,action});
        await act(tab,action==='create'?'clear':'create');
        await tab.evaluate(action=>window.__bench.prepare(action),action);
        let control;
        if(config.mode==='calibration'){
          progress({stage:'empty-window',round,action});
          const start=await metrics(cdp),timing=await tab.evaluate(async()=>{
            const began=performance.now();
            await new Promise(resolve=>requestAnimationFrame(resolve));
            await new Promise(resolve=>requestAnimationFrame(resolve));
            const layoutHeight=document.getElementById('app').getBoundingClientRect().height;
            return {frameWindowMs:performance.now()-began,layoutHeight};
          }),end=await metrics(cdp);
          control={...timing,...durations(start,end),...await tab.evaluate(()=>window.__bench.verify())};
        }
        progress({stage:'run',round,action});
        const before=await metrics(cdp),windowTiming=await tab.evaluate(()=>window.__bench.run()),after=await metrics(cdp);
        const cpu=durations(before,after);
        const checked=await tab.evaluate(()=>window.__bench.verify());
        progress({stage:'verified',round,action,...checked});
        if(round>=0)result.samples.push({round,action,...windowTiming,...cpu,...checked,...(control?{control}:{})});
      }
      // Optional paired-study observation runs after every timing sample and
      // before closing this same context. Ordinary collection has no hook.
      if(config.afterTiming)result.afterTiming=await config.afterTiming({tab,cdp});
      check(errors.length===0,errors.join('\n'));await tab.evaluate(()=>window.__bench.unmount());
    }finally{await context.close();}
  }else if(config.mode==='startup'){
    for(let round=0;round<5;round++){
      const order=['elnor','react','svelte'];for(let index=0;index<3;index++){
        const framework=order[(index+round)%3],{context,tab,errors}=await open(framework,100);
        try{
          const timing=await tab.evaluate(async()=>({ready:await window.__bench.ready,navigation:performance.getEntriesByType('navigation')[0].toJSON(),
            resources:performance.getEntriesByType('resource').filter(item=>/\.(mjs|css)$/.test(new URL(item.name).pathname)).map(item=>({name:new URL(item.name).pathname,encodedBodySize:item.encodedBodySize,decodedBodySize:item.decodedBodySize,transferSize:item.transferSize}))}));
          check(errors.length===0,errors.join('\n'));result.samples.push({framework,round,...timing});
        }finally{await context.close();}
      }
    }
  }else if(config.mode==='memory'){
    for(const framework of ['elnor','react','svelte']){
      const {context,tab,cdp,errors}=await open(framework,1000);
      try{
        result.samples.push({framework,phase:'empty',...await memory(cdp)});
        await act(tab,'create');result.samples.push({framework,phase:'1000-rows',...await memory(cdp)});
        await act(tab,'clear');result.samples.push({framework,phase:'cleared',...await memory(cdp)});
        await tab.evaluate(()=>window.__bench.unmount());result.samples.push({framework,phase:'unmounted',...await memory(cdp)});
        for(let round=0;round<3;round++){await tab.evaluate(()=>window.__bench.mount());await act(tab,'create');await tab.evaluate(()=>window.__bench.unmount());}
        result.samples.push({framework,phase:'after-3-mount-dispose-cycles',...await memory(cdp)});check(errors.length===0,errors.join('\n'));
      }finally{await context.close();}
    }
  }else throw Error('Unsupported collection mode');
  result.passed=true;return result;
}
