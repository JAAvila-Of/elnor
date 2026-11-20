// Diagnostic instrumentation only. It never ships in application bundles.
export function installStartupDiagnostics(){
  const mark=name=>performance.mark('elnor:startup-diag:'+name);
  const data=window.__startupDiagnostic={initialAt:performance.now(),initialVisibility:document.visibilityState,
    visibilityEvents:[],frames:[],installedAt:null,rootObservedAt:null,readyResolvedAt:null,readyObservedAt:null,
    domContentLoadedAt:null,loadAt:null};
  mark('init');
  document.addEventListener('visibilitychange',()=>data.visibilityEvents.push({state:document.visibilityState,at:performance.now()}));
  document.addEventListener('DOMContentLoaded',()=>{data.domContentLoadedAt=performance.now();mark('dom-content-loaded');},{once:true});
  window.addEventListener('load',()=>{data.loadAt=performance.now();mark('load');},{once:true});
  const observer=new MutationObserver(()=>{
    if(data.rootObservedAt===null&&document.querySelector('#app > section')){
      data.rootObservedAt=performance.now();mark('root-observed');observer.disconnect();
    }
  });
  observer.observe(document,{childList:true,subtree:true});
  const request=window.requestAnimationFrame,cancel=window.cancelAnimationFrame;
  window.requestAnimationFrame=function(callback){
    if(typeof callback!=='function')return Reflect.apply(request,window,[callback]);
    if(data.frames.length>=128)throw Error('Startup diagnostic frame budget exceeded');
    const entry={requestedAt:performance.now(),rootPresent:!!document.querySelector('#app > section'),
      source:(new Error().stack??'').slice(0,2048),firedAt:null,finishedAt:null,cancelledAt:null};
    entry.id=Reflect.apply(request,window,[function(timestamp){
      entry.firedAt=performance.now();entry.frameTimestamp=timestamp;
      try{return Reflect.apply(callback,this,[timestamp]);}finally{entry.finishedAt=performance.now();}
    }]);
    data.frames.push(entry);return entry.id;
  };
  window.cancelAnimationFrame=function(id){
    const entry=data.frames.find(frame=>frame.id===id&&frame.firedAt===null);
    if(entry)entry.cancelledAt=performance.now();return Reflect.apply(cancel,window,[id]);
  };
  let matrix;
  Object.defineProperty(window,'__matrix',{configurable:true,enumerable:true,get(){return matrix;},set(value){
    matrix=value;data.installedAt=performance.now();mark('installed');
    value.ready.then(()=>{data.readyResolvedAt=performance.now();mark('ready-resolved');});
  }});
  window.__collectStartupDiagnostics=()=>{
    data.readyObservedAt=performance.now();data.readyVisibility=document.visibilityState;mark('ready-observed');
    return {...data,frames:data.frames.map(frame=>({...frame})),visibilityEvents:[...data.visibilityEvents],
      navigation:performance.getEntriesByType('navigation').map(entry=>entry.toJSON()),
      resources:performance.getEntriesByType('resource').map(entry=>entry.toJSON()),
      paints:performance.getEntriesByType('paint').map(entry=>entry.toJSON())};
  };
}
