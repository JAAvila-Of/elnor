export {regionContextClear as canMountRegion} from './runtime.mjs';
import {enqueueRegionJob,cancelRegionJob,regionOrderedRows,regionRangeNodes,createRegionReaction,createRegionTaskTicket,runRegionUntracked,regionHasReader,cell,mountBoundary,setClass,setDisabled,setAriaBoolean,setChecked,setSelectValue} from './runtime.mjs';
const runtimeLists=true,runtimeComponents=true,runtimeBlueprint=true,runtimeEmits=true,runtimeClasses=true,runtimeDisabled=true,runtimeAria=true,runtimeChecked=true,runtimeSelect=true,runtimeForms=true;
let currentRegionCollector=null;
const preserveRowRoot=runtimeLists?Symbol('preserveRowRoot'):null;
function trackGeneralRead(frame,slot){const bridges=frame.bridges??=[];const source=bridges[slot]??=cell(frame.values[slot]);source.value;}
function errors(list,message){if(list.length===1)throw list[0];if(list.length)throw new AggregateError(list,message);}
function updateBinding(region,binding){
 if(runtimeSelect&&binding.kind==='select'){const value=binding.read(region);if(region.disposed)return;const node=region.refs[binding.node];if(node)setSelectValue(node,value);return;}
 if(runtimeChecked&&binding.kind==='checked'){const value=binding.read(region);if(region.disposed)return;const node=region.refs[binding.node];if(node)setChecked(node,value);return;}
 if(runtimeAria&&binding.kind==='ariaBoolean'){const value=binding.read(region);if(region.disposed)return;const node=region.refs[binding.node];if(node)setAriaBoolean(node,binding.name,value);return;}
 if(runtimeDisabled&&binding.kind==='disabled'){const value=binding.read(region);if(region.disposed)return;const node=region.refs[binding.node];if(node)setDisabled(node,value);return;}
 if(runtimeClasses&&binding.kind==='class'){const value=binding.read(region);if(region.disposed)return;const node=region.refs[binding.node];if(node)setClass(node,value);return;}
 const value=String(binding.read(region)??'');if(region.disposed)return;const node=region.refs[binding.node];if(!node)return;
 if(binding.kind==='input'){if(node.value!==value)node.value=value;}else if(node.nodeValue!==value)node.nodeValue=value;
}
export function defineRegion(data){
 if(!runtimeBlueprint)return data;
 const prototypes=new WeakMap();
 return {...data,instantiate(doc,group=0){
  let cache=prototypes.get(doc);if(!cache){cache=new Map();prototypes.set(doc,cache);}
  const indices=data.groups?.[group].nodes??data.nodes.map((_,i)=>i);let prototype=cache.get(group);
  if(!prototype){prototype=doc.createDocumentFragment();const refs=[];for(const id of indices){const spec=data.nodes[id];let node;if(spec.kind==='text')node=doc.createTextNode(String(spec.value??''));else if(spec.kind==='comment')node=doc.createComment(spec.value);else{node=doc.createElement(spec.tag);if(spec.className)node.className=spec.className;if(spec.type)node.type=spec.type;if(runtimeSelect&&spec.optionValue!==undefined)node.value=spec.optionValue;if(runtimeDisabled&&spec.disabled!==undefined)node.disabled=spec.disabled;if(runtimeAria&&spec.ariaBooleans)for(const [name,value] of Object.entries(spec.ariaBooleans))setAriaBoolean(node,name,value);}refs[id]=node;if(spec.parent>=0)refs[spec.parent].append(node);else prototype.append(node);}cache.set(group,prototype);}
  const fragment=prototype.cloneNode(true),roots=[...fragment.childNodes],refs=[];let i=0;
  function walk(node){refs[indices[i++]]=node;for(const child of node.childNodes)walk(child);}for(const node of roots)walk(node);
  if(i!==indices.length)throw Error('ELN-REGION: blueprint shape changed');return {root:roots[0],roots,fragment,refs};
 }};
}
export function renderRegionOwned(target,plan,props,stage,handlers=void 0){return mountTaskRegion(target,plan,{props,stage,handlers});}
/** @elnorCapability components */
export function renderNativeRegionOwned(target,plan,build,props,stage,handlers=void 0){
 // No local state, structural groups or child frames: the compiler owns native
 // construction. Tickets still obey the shared scheduler/collector protocol.
 const doc=document;let part=null;
 const region={disposed:false,plan,props,emit:runtimeEmits?(plan.emitFactory?.(handlers===undefined?{}:handlers)??null):null,refs:[],parts:[null],pending:new Map(),handles:[],taskDeps:[]};
 props=null;handlers=null;
 for(let id=0;id<plan.tasks.length;id++)region.handles[id]=createRegionTaskTicket(region,id,0,runTask);
 function unsubscribe(id){for(const {owner,slot} of region.taskDeps[id]??[])owner.subscribers?.[slot]?.delete(region.handles[id]);region.taskDeps[id]=[];}
 function runTask(id){
  const token=part,previous=currentRegionCollector;unsubscribe(id);
  const reaction=region.handles[id];
  currentRegionCollector={reaction,add(owner,slot){if(region.disposed||!token.active)return;const subscribers=owner.subscribers[slot]??=new Set(),handle=region.handles[id];if(!subscribers.has(handle)){region.taskDeps[id].push({owner,slot});subscribers.add(handle);}}};
  try{return reaction.track(()=>updateBinding(region,plan.bindings[plan.tasks[id].index]));}finally{currentRegionCollector=previous;}
 }
 function task(id){part.cleanups.push({task:id});runTask(id);}
 function event(index){const e=plan.events[index],resource={node:region.refs[e.node],type:e.type,listener:null};resource.listener=()=>{if(region.disposed||!part.active)return;region.emit[e.emit](...(e.args??[]).map(read=>read(region)));};if(runtimeForms)formListener(resource);part.cleanups.push({resource});resource.node.addEventListener(e.type,resource.listener);}
 function dispose(){
  if(region.disposed)return;region.disposed=true;if(part)part.active=false;
  const failures=[];for(const handle of region.handles)cancelRegionJob(handle);
  try{if(part)for(let i=part.cleanups.length-1;i>=0;i--)try{const c=part.cleanups[i];if(c.task!==undefined){unsubscribe(c.task);region.handles[c.task].dispose();}else try{c.resource.node.removeEventListener(c.resource.type,c.resource.listener);}finally{c.resource.node=null;}}catch(error){failures.push(error);}}
  finally{for(const handle of region.handles)handle.dispose();if(part){part.cleanups.length=0;part.roots.length=0;}target=null;region.pending.clear();region.pending=null;region.plan=null;region.props=null;region.emit=null;region.refs=null;region.parts=null;region.handles=null;region.taskDeps=null;}
  errors(failures,'Multiple branch disposal failures');
 }
 stage?.(region,dispose);stage=null;if(region.disposed)return dispose;
 part={active:true,roots:[],cleanups:[]};region.parts[0]=part;
 try{build(region,target,task,event,doc);target=null;return dispose;}
 catch(error){try{dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'Region mount and cleanup failed',{cause:error});}throw error;}
}
export function mountRegion(target,plan,props,handlers=void 0){
 if(plan.mode==='sequential')return mountBoundary(target,(host,owner)=>{mountTaskRegion(host,plan,{props,handlers,stage(_frame,dispose){owner.own(dispose);}});});
 if(runtimeBlueprint){if(plan.tasks)return mountTaskRegion(target,plan);return mountScalarRegion(target,plan);}
}
// General actions read and write state through these accessors. Each one
// belongs to the part of the slot's group that was open when the action
// started. When that part closes, the runtime freezes the accessor before it
// clears or reuses the slot, so a closure that outlives its instance keeps
// its own value, as a cell of the general renderer does, and never reaches a
// later instance that reuses the slot. One accessor exists per slot and part.
export function regionCell(context,slot,group){
 const owner=context.owner?context.owner(slot):context,part=owner.parts[group],cells=part.cells??=new Map();
 let cell=cells.get(slot);
 if(!cell){
  let frozen=false,last;
  cell={get value(){return frozen?last:owner.read(slot);},set value(next){if(frozen)last=next;else owner.write(slot,next);},
   freeze(){last=owner.values[slot];frozen=true;}};
  cells.set(slot,cell);
 }
 return cell;
}
export function mountScalarRegion(target,plan){
 const doc=target.ownerDocument??document,{root,roots=[root],refs}=plan.instantiate(doc),size=plan.initializers?plan.initializers.length:plan.initial.length,words=Math.ceil(plan.bindings.length/32),resources=[];
 const region={disposed:false,initial:true,roots,refs,bridges:null,values:plan.initializers?Array(size):plan.initial.slice(),dirty:new Uint32Array(words),spare:new Uint32Array(words),
  read(slot){if(this.disposed)return;if(regionHasReader())trackGeneralRead(this,slot);return this.values[slot];},
  write(slot,next){if(this.disposed)return next;if(Object.is(this.values[slot],next))return next;this.values[slot]=next;
   const invalidations=plan.invalidations[slot];if(invalidations.length){for(const [word,mask] of invalidations)this.dirty[word]|=mask;enqueueRegionJob(this);}if(this.bridges?.[slot])this.bridges[slot].value=next;return next;},
  run(){
   if(this.disposed)return;const initial=this.initial;this.initial=false;const changed=this.dirty;this.dirty=this.spare;this.spare=changed;this.dirty.fill(0);const failures=[];
   if(initial){for(let id=0;id<plan.bindings.length&&!this.disposed;id++){
    try{updateBinding(this,plan.bindings[id]);}catch(error){failures.push(error);}
   }}else for(let word=0;word<changed.length&&!this.disposed;word++){
    let bits=changed[word];while(bits&&!this.disposed){const id=(word<<5)+31-Math.clz32(bits&-bits);bits&=bits-1;
     try{updateBinding(this,plan.bindings[id]);}catch(error){failures.push(error);}
    }
   }changed.fill(0);errors(failures,'Multiple region update failures');
  }};
 function dispose(){
  if(region.disposed)return;region.disposed=true;cancelRegionJob(region);const failures=[];
  for(let i=resources.length-1;i>=0;i--){const {node,type,listener}=resources[i];try{node.removeEventListener(type,listener);}catch(error){failures.push(error);}}
  resources.length=0;for(const node of region.roots)try{node.remove();}catch(error){failures.push(error);}region.roots=null;region.refs=null;region.values=null;region.bridges=null;region.dirty=null;region.spare=null;
  errors(failures,'Multiple region disposal failures');
 }
 try{
  if(plan.initializers)for(let i=0;i<plan.initializers.length;i++)region.values[i]=plan.initializers[i](region);
  for(const event of plan.events){const node=refs[event.node],listener=runtimeSelect&&event.selectValue?()=>{if(node.selectedIndex>=0)region.write(event.slot,node.value);}:runtimeChecked&&event.type==='change'?()=>region.write(event.slot,node.checked):event.type==='input'?()=>region.write(event.slot,node.value):()=>(event.args?plan.actions[event.action](region,...event.args.map(read=>read(region))):plan.actions[event.action](region));if(runtimeForms&&(event.type==='submit'||event.type==='reset')){const resource={node,type:event.type,listener:e=>{if(region.disposed||(event.type==='reset'&&e.defaultPrevented))return;e.preventDefault();return listener();}};resources.push(resource);node.addEventListener(event.type,resource.listener);}else{resources.push({node,type:event.type,listener});node.addEventListener(event.type,listener);}}
  region.run();target.append(...roots);return dispose;
 }catch(error){try{dispose();}catch(cleanupError){throw new AggregateError([error,cleanupError],'Region mount and cleanup failed',{cause:error});}throw error;}
}

// Fixed dependency tasks and structural lifetimes share one frame and one job.
// A part token identifies an activation, not merely its reusable compiled group.
/** @elnorCapability lists */
function mountForwardRow(parentFrame,plan,spec,value,doc,stage){
 const itemSlot=spec.itemSlot,child=plan.components[spec.forward],part={active:true,roots:[],domNodes:null};
 let target=spec.detached?null:doc.createDocumentFragment(),childFrame=null,childDispose=null;
 const context={disposed:false,parent:parentFrame,props:parentFrame.props,emit:parentFrame.emit,values:[],subscribers:[],bridges:null,parts:[],
  owner(slot){return slot===itemSlot?this:this.parent.owner(slot);},
  read(slot){if(this.disposed)return;const owner=this.owner(slot);if(currentRegionCollector?.reaction.isCurrent())currentRegionCollector.add(owner,slot);else if(regionHasReader())trackGeneralRead(owner,slot);return owner.values[slot];},
  write(slot,next){if(this.disposed)return next;const owner=this.owner(slot);if(owner!==this)return owner.write(slot,next);if(Object.is(this.values[slot],next))return next;this.values[slot]=next;for(const handle of this.subscribers[slot]??[]){const frame=handle.frame,token=frame.parts[handle.group];if(token?.active){frame.pending.set(handle.id,token);enqueueRegionJob(handle);}}if(this.bridges?.[slot])this.bridges[slot].value=next;return next;}
 };
 context.values[itemSlot]=value;context.parts[spec.child]=part;parentFrame=null;value=null;
 function dispose(policy){if(context.disposed)return;context.disposed=true;part.active=false;const stop=childDispose;childDispose=null;const failures=[];try{stop?.();}catch(error){failures.push(error);}if(policy!==preserveRowRoot)for(const node of part.domNodes??part.roots)try{node.remove();}catch(error){failures.push(error);}part.roots.length=0;part.domNodes=null;context.parent=null;context.props=null;context.emit=null;context.values=null;context.subscribers=null;context.bridges=null;context.parts=null;target=null;childFrame=null;errors(failures,'Forward row disposal failed');}
 stage(context,dispose);stage=null;if(context.disposed)return dispose;
 const props={};for(const p of child.props)Object.defineProperty(props,p.name,{enumerable:true,get:()=>p.read(context)});
 const handlers=runtimeEmits&&child.handlerFactory?child.handlerFactory(context,()=>!context.disposed):undefined;
 const childStage=(frame,stop)=>{childFrame=frame;childDispose=stop;if(context.disposed){childDispose=null;stop();}};
 try{if(runtimeEmits&&child.handlerFactory)child.render(target,props,childStage,handlers);else child.render(target,props,childStage);if(!context.disposed){part.roots.push(...(childFrame?.parts?.[0]?.roots??[]));if(spec.detached&&(part.roots.length!==1||part.roots[0].nodeType!==1||part.roots[0].parentNode!==null))throw Error('ELN-RUNTIME-003: detached each expects a detached element');if(!spec.detached)part.domNodes=[...target.childNodes];}childFrame=null;target=null;return dispose;}
 catch(error){try{dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'Forward row mount and cleanup failed',{cause:error});}throw error;}
}

/** @elnorCapability forms */
function formListener(resource){if(runtimeForms&&(resource.type==='submit'||resource.type==='reset')){const run=resource.listener;resource.listener=event=>{if(resource.node===null||(resource.type==='reset'&&event.defaultPrevented))return;event.preventDefault();return run();};}}
function mountTaskRegion(target,plan,config={}){
 const doc=runtimeBlueprint&&plan.mode!=='sequential'?(target.ownerDocument??document):document;
 const entry=config.entry??0,localSlots=new Set(),localTasks=[];
 for(let i=0;i<plan.groups.length;i++){let g=i;while(g!==entry&&g!==null&&plan.groups[g].kind!=='row')g=plan.groups[g].parent;if(g===entry){for(const slot of plan.groups[i].slots)localSlots.add(slot);localTasks.push(...plan.groups[i].tasks);}}
 let keepEntryRoot=false,bulkDepth=0;
 const region={disposed:false,values:Array(plan.initializers.length),refs:[],parts:Array(plan.groups.length).fill(null),
  parent:config.parent??null,localSlots,lists:runtimeLists?new Map():null,handles:null,bridges:null,reactions:plan.mode==='sequential'?null:Array(plan.tasks.length),props:config.props,state:null,calc:null,emit:null,locals:null,
  subscribers:Array(plan.initializers.length),taskDeps:Array(plan.tasks.length),pending:new Map(),
  owner(slot){return this.localSlots.has(slot)?this:this.parent.owner(slot);},
  read(slot){if(this.disposed)return;const owner=this.owner(slot);if(currentRegionCollector?.reaction.isCurrent())currentRegionCollector.add(owner,slot);else if(regionHasReader())trackGeneralRead(owner,slot);return owner.values[slot];},
  write(slot,next){if(this.disposed)return next;const owner=this.owner(slot);if(owner!==this)return owner.write(slot,next);if(Object.is(this.values[slot],next))return next;this.values[slot]=next;
   for(const handle of this.subscribers[slot]??[]){const frame=handle.frame,part=frame.parts[handle.group];if(part?.active){frame.pending.set(handle.id,part);enqueueRegionJob(plan.mode==='sequential'?handle:frame);}}
   if(this.bridges?.[slot])this.bridges[slot].value=next;return next;
  },
  run(){if(this.disposed)return;const batch=[...this.pending];this.pending.clear();const failures=[];
   for(const [id,token] of batch){if(this.disposed)break;if(!token.active||this.parts[plan.tasks[id].group]!==token)continue;
    if(this.pending.get(id)===token)this.pending.delete(id);
    try{runTask(id);}catch(error){failures.push(error);}
   }
   if(!this.disposed&&!this.pending.size)cancelRegionJob(this);errors(failures,'Multiple region update failures');
  }};
 // Opaque component frames share task tickets; closed plans keep bare handles.
 if(runtimeEmits){region.emit=config.emit??plan.emitFactory?.(config.handlers===undefined?{}:config.handlers)??null;config.emit=null;config.handlers=null;}
 config.props=null;region.handles=Array(plan.tasks.length);for(const id of localTasks){const task=plan.tasks[id];region.handles[id]=plan.mode==='sequential'?(task.dynamic?null:{frame:region,id,group:task.group,get disposed(){return region.disposed;},run(){if(region.disposed)return;const token=region.pending.get(id);region.pending.delete(id);if(token?.active&&region.parts[task.group]===token)runTask(id);}}):{frame:region,id,group:task.group};}
 function unsubscribe(id){
  for(const {owner,slot} of region.taskDeps[id]??[])owner.subscribers?.[slot]?.delete(region.handles[id]);
  region.taskDeps[id]=[];
 }
 function extend(id,deps,context=region){for(const slot of deps)addDependency(id,context.owner(slot),slot);}
 function subscribe(id,deps){unsubscribe(id);extend(id,deps);}
 function addDependency(id,owner,slot){const subscribers=owner.subscribers[slot]??=new Set(),handle=region.handles[id];if(!subscribers.has(handle)){(region.taskDeps[id]??=[]).push({owner,slot});subscribers.add(handle);}}
 function runTask(id){const task=plan.tasks[id],token=region.parts[task.group],previous=currentRegionCollector;
  if(!task.dynamic){subscribe(id,task.dependencies);currentRegionCollector=null;try{return runRegionUntracked(()=>execute(id));}finally{currentRegionCollector=previous;}}
  unsubscribe(id);
  const reaction=plan.mode==='sequential'?region.handles[id]:(region.reactions[id]??=createRegionReaction(()=>{if(!region.disposed&&token.active&&region.parts[task.group]===token){region.pending.set(id,token);enqueueRegionJob(region);}}));
  currentRegionCollector={reaction,add(owner,slot){if(!region.disposed&&token.active)addDependency(id,owner,slot);}};
  try{return reaction.track(()=>execute(id));}finally{currentRegionCollector=previous;}
 }
 function disposeGroup(group){
  const part=region.parts?.[group];if(!part)return;part.active=false;region.parts[group]=null;const failures=[];
  if(!part.cleanups)for(let i=plan.groups.length-1;i>0;i--)if(plan.groups[i].parent===group)try{disposeGroup(i);}catch(error){failures.push(error);}
  if(runtimeLists&&!part.cleanups)for(const id of plan.groups[group].tasks)if(plan.tasks[id].kind==='list')try{resetList(plan.tasks[id].index);}catch(error){failures.push(error);}
  const clearTask=id=>{if(plan.mode==='sequential')cancelRegionJob(region.handles[id]);unsubscribe(id);if(plan.mode==='sequential'){if(plan.tasks[id].dynamic)region.handles[id]?.dispose();}else{region.reactions[id]?.dispose();region.reactions[id]=null;}if(region.pending.get(id)===part)region.pending.delete(id);};
  const clearEvent=resource=>{try{resource.node.removeEventListener(resource.type,resource.listener);}finally{resource.node=null;}};
  const clearBranch=c=>{const errorsFound=[];try{disposeGroup(c.child);}catch(error){errorsFound.push(error);}try{if(!runtimeLists||!bulkDepth)region.refs[c.node]?.remove();}catch(error){errorsFound.push(error);}errors(errorsFound,'Multiple conditional cleanup failures');};
  if(part.cleanups){for(let i=part.cleanups.length-1;i>=0;i--)try{const c=part.cleanups[i];if(runtimeComponents&&c.component){const dispose=c.component.dispose;if(runtimeEmits)c.component.active=false;c.component.dispose=null;dispose?.();}else if(runtimeLists&&c.list!==undefined){const found=[];try{resetList(c.list,true);}catch(e){found.push(e);}try{if(!runtimeLists||!bulkDepth)region.refs[c.node]?.remove();}catch(e){found.push(e);}errors(found,'Multiple list cleanup failures');}else if(c.child!==undefined)clearBranch(c);else if(c.task!==undefined)clearTask(c.task);else clearEvent(c.resource);}catch(error){failures.push(error);}part.cleanups.length=0;}
  else{for(const id of plan.groups[group].tasks)clearTask(id);for(let i=part.resources.length-1;i>=0;i--)try{clearEvent(part.resources[i]);}catch(error){failures.push(error);}}
  if(runtimeBlueprint&&plan.mode!=='sequential')for(const node of part.roots)try{node.remove();}catch(error){failures.push(error);}
  else if((!runtimeLists||!bulkDepth)&&!(runtimeLists&&group===entry&&keepEntryRoot)&&(group!==entry||config.detached||config.rowFragment)){const owned=part.domNodes??(config.detached?part.roots:null)??[...(part.fragment?.childNodes??[])];for(const node of owned)try{node.remove();}catch(error){failures.push(error);}}
  if(part.cells){for(const cell of part.cells.values())cell.freeze();part.cells=null;}
  for(const slot of plan.groups[group].slots){region.values[slot]=undefined;if(region.bridges)region.bridges[slot]=undefined;}
  for(const node of plan.groups[group].nodes)region.refs[node]=undefined;
  part.resources.length=0;part.roots.length=0;part.fragment=null;if(part.domNodes)part.domNodes.length=0;part.domNodes=null;errors(failures,'Multiple branch disposal failures');
 }
 function cleanupFailure(error,group,message){try{disposeGroup(group);}catch(cleanup){throw new AggregateError([error,cleanup],message,{cause:error});}throw error;}
 function refreshBranch(id,branch){
  try{
   const next=!!branch.read(region);if(region.disposed)return;
   if(next===!!region.parts[branch.child])return;
   disposeGroup(branch.child);if(!next||region.disposed)return;
   const part=runtimeBlueprint&&plan.mode!=='sequential'?activate(branch.child):activateSequential(branch.child,doc.createDocumentFragment());if(!part?.active||region.disposed)return;
   // State initialization runs within the current when effect in the general
   // renderer. Preserve those temporary dependencies until its next execution.
   extend(id,plan.groups[branch.child].initialDependencies);
   const anchor=region.refs[branch.node];
   for(const node of part.domNodes??[...part.fragment.childNodes]){if(!part.active||region.disposed)break;anchor.parentNode.insertBefore(node,anchor);}
   part.fragment=null;
  }catch(error){cleanupFailure(error,branch.child,'Conditional update and cleanup failed');}
 }
 function execute(id){const task=plan.tasks[id];
  if(task.kind==='calc'){const d=plan.derived[task.index];region.write(d.slot,d.read(region));}
  else if(task.kind==='binding')updateBinding(region,plan.bindings[task.index]);
  else if(task.kind==='branch')refreshBranch(id,plan.branches[task.index]);
  else if(runtimeLists)refreshList(id,task.index);
 }
 /** @elnorCapability blueprint */
 function activate(group){
  const instance=plan.instantiate(doc,group);if(region.disposed)return null;
  const part={active:true,roots:instance.roots,fragment:instance.fragment,resources:[]};region.parts[group]=part;
  for(const id of plan.groups[group].nodes)region.refs[id]=instance.refs[id];
  try{
   for(const slot of plan.groups[group].slots){if(!part.active||region.disposed)return part;if(plan.derived.some(d=>d.slot===slot)){const previous=currentRegionCollector;currentRegionCollector=null;try{region.values[slot]=runRegionUntracked(()=>plan.initializers[slot](region));}finally{currentRegionCollector=previous;}}else region.values[slot]=slot===config.itemSlot?config.item:plan.initializers[slot](region);}
   for(const index of plan.groups[group].events){if(!part.active||region.disposed)return part;const event=plan.events[index],resource={node:region.refs[event.node],type:event.type,listener:null};
    resource.listener=()=>{if(!part.active||region.disposed)return;if(runtimeSelect&&event.selectValue){if(resource.node.selectedIndex>=0)region.write(event.slot,resource.node.value);}else if(runtimeChecked&&event.type==='change')region.write(event.slot,resource.node.checked);else if(event.type==='input')region.write(event.slot,resource.node.value);else (event.args?plan.actions[event.action](region,...event.args.map(read=>read(region))):plan.actions[event.action](region));};
    if(runtimeForms)formListener(resource);part.resources.push(resource);resource.node.addEventListener(resource.type,resource.listener);
   }
   for(const id of plan.groups[group].tasks){if(!part.active||region.disposed)return part;if(plan.tasks[id].kind==='calc')subscribe(id,plan.tasks[id].dependencies);else runTask(id);}
   return part;
  }catch(error){cleanupFailure(error,group,'Branch activation and cleanup failed');}
 }
 function activateSequential(group=entry,parent=target){
  const part={active:true,roots:[],fragment:group===entry&&!config.rowFragment?null:parent,domNodes:null,resources:[],cleanups:[]};region.parts[group]=part;
  // One identity owns tracking and scheduling for this activation. A retired
  // group never lends its tickets to the next instance of the compiled group.
  for(const id of plan.groups[group].tasks)if(plan.tasks[id].dynamic){region.handles[id]?.dispose();region.handles[id]=createRegionTaskTicket(region,id,group,runTask);}
  if(group===entry&&!plan.indexedReads){region.state={};region.calc={};region.emit??={};region.locals={};for(let slot=0;slot<plan.names.length;slot++){const name=plan.names[slot];if(name.kind==='item'){Object.defineProperty(region.locals,'s'+slot,{value:{get value(){return region.read(slot);}}});continue;}const map=name.kind==='calc'?region.calc:region.state;Object.defineProperty(map,name.name,{value:{get value(){return region.read(slot);}}});}}
  for(const slot of plan.groups[group].slots){if(!part.active||region.disposed)return part;const initialTask=plan.initialTasks?.[slot];if(initialTask!=null){part.cleanups.push({task:initialTask});runTask(initialTask);if(!part.active||region.disposed)return part;}else if(plan.derived.some(d=>d.slot===slot)){const previous=currentRegionCollector;currentRegionCollector=null;try{region.values[slot]=runRegionUntracked(()=>plan.initializers[slot](region));}finally{currentRegionCollector=previous;}}else{const value=slot===config.itemSlot?config.item:plan.initializers[slot](region);if(!part.active||region.disposed)return part;region.values[slot]=value;}}if(group===entry)config.item=null;
  for(const id of plan.groups[group].tasks)if(plan.tasks[id].kind==='calc'&&!plan.tasks[id].dynamic){subscribe(id,plan.tasks[id].dependencies);part.cleanups.push({task:id});}
  const event=index=>{const e=plan.events[index],resource={node:region.refs[e.node],type:e.type,listener:null};resource.listener=()=>{if(!part.active||region.disposed)return;if(runtimeSelect&&e.selectValue){if(resource.node.selectedIndex>=0)region.write(e.slot,resource.node.value);}else if(runtimeChecked&&e.type==='change')region.write(e.slot,resource.node.checked);else if(e.type==='input')region.write(e.slot,resource.node.value);else if(runtimeEmits&&e.emit!==undefined)region.emit[e.emit](...(e.args??[]).map(read=>read(region)));else if(e.args){const values=e.args.map(read=>read(region));if(part.active&&!region.disposed)plan.actions[e.action](region,...values);}else plan.actions[e.action](region);};if(runtimeForms)formListener(resource);part.resources.push(resource);part.cleanups.push({resource});resource.node.addEventListener(e.type,resource.listener);};
  const task=id=>{part.cleanups.push({task:id});runTask(id);};
  for(const index of plan.groups[group].ops){if(region.disposed||!part.active)break;const op=plan.ops[index];
   if(op.kind==='node'){const spec=plan.nodes[op.node],node=spec.kind==='text'?doc.createTextNode(''):spec.kind==='comment'?doc.createComment(spec.value):doc.createElement(spec.tag);region.refs[op.node]=node;if(spec.className)node.className=spec.className;const host=spec.parent<0?parent:region.refs[spec.parent];if(host)host.append(node);if(spec.type)node.type=spec.type;if(runtimeSelect&&spec.optionValue!==undefined)node.value=spec.optionValue;if(runtimeDisabled&&spec.disabled!==undefined)node.disabled=spec.disabled;if(runtimeAria&&spec.ariaBooleans)for(const [name,value] of Object.entries(spec.ariaBooleans))setAriaBoolean(node,name,value);if(spec.parent<0)part.roots.push(node);}
   else if(op.kind==='literal'){const node=region.refs[op.node],value=String(plan.nodes[op.node].value??'');if(node.nodeValue!==value)node.nodeValue=value;}
   else if(op.kind==='task')task(op.task);
   else if(op.kind==='event')event(op.event);
   else if(runtimeLists&&op.kind==='list'){part.cleanups.push({list:op.index,node:op.node});task(op.task);}
   else if(op.kind==='branch'){part.cleanups.push({child:op.child,node:op.node});task(op.task);}
   else if(runtimeComponents&&op.kind==='component'){const spec=plan.components[op.index],props={};for(const p of spec.props)Object.defineProperty(props,p.name,{enumerable:true,get:()=>p.read(region)});const resource={dispose:null};if(runtimeEmits)resource.active=true;const handlers=runtimeEmits&&spec.handlerFactory?spec.handlerFactory(region,()=>resource.active&&part.active&&!region.disposed):undefined;let childFrame=null;part.cleanups.push({component:resource});const childStage=(frame,dispose)=>{childFrame=frame;resource.dispose=dispose;if(region.disposed||!part.active){if(runtimeEmits)resource.active=false;resource.dispose=null;dispose();}};const host=spec.parent<0?parent:region.refs[spec.parent];if(runtimeEmits&&spec.handlerFactory)spec.render(host,props,childStage,handlers);else spec.render(host,props,childStage);if(spec.parent<0&&part.active&&!region.disposed)part.roots.push(...(childFrame?.parts?.[0]?.roots??[]));childFrame=null;}
   else if(op.kind==='input'){const label=doc.createElement('label');region.refs[op.label]=label;(op.parent<0?parent:region.refs[op.parent]).append(label);const span=doc.createElement('span');span.textContent=op.text;const node=doc.createElement('input');node.type='text';if(runtimeDisabled&&plan.nodes[op.node].disabled!==undefined)node.disabled=plan.nodes[op.node].disabled;if(runtimeClasses&&plan.nodes[op.node].className)node.className=plan.nodes[op.node].className;label.append(span,node);region.refs[op.span]=span;region.refs[op.caption]=span.firstChild;region.refs[op.node]=node;event(op.event);task(op.task);}
  }
  if((group!==entry||config.rowFragment)&&part.active)part.domNodes=[...parent.childNodes];
  return part;
 }
 function dispose(policy){if(region.disposed)return;keepEntryRoot=runtimeLists&&policy===preserveRowRoot;region.disposed=true;cancelRegionJob(region);if(plan.mode==='sequential')for(const id of localTasks)cancelRegionJob(region.handles[id]);
  try{disposeGroup(entry);}finally{target=null;region.pending.clear();region.pending=null;region.values=null;region.refs=null;region.parts=null;region.taskDeps=null;region.subscribers=null;region.parent=null;region.localSlots=null;region.handles=null;region.reactions=null;region.bridges=null;region.props=null;region.state=null;region.calc=null;region.emit=null;region.locals=null;if(runtimeLists)region.lists.clear();region.lists=null;}
 }
 /** @elnorCapability lists */
 function bulkBounds(spec,state){
  if(plan.mode!=='sequential'||!spec.exclusive||!spec.nativeRows||bulkDepth||!state.rows.size||state.staged.size)return null;
  const parent=region.refs?.[spec.parent],end=region.refs?.[spec.node];if(!parent||end?.parentNode!==parent)return null;let count=1;
  for(const row of state.rows.values()){if(!row.frame||row.frame.disposed)return null;const nodes=row.nodes;if(nodes.length!==1||nodes[0].parentNode!==parent)return null;count+=nodes.length;}
  return parent.childNodes.length===count?{parent,end}:null;
 }
 /** @elnorCapability lists */
 function clearRows(state,{parent,end}){
  const rows=[...state.rows.values()],failures=[];for(const row of rows)row.bulkNodes=[...row.nodes];bulkDepth++;
  try{for(const row of rows)try{row.stop(preserveRowRoot);}catch(error){failures.push(error);}}finally{bulkDepth--;}
  let failure;try{errors(failures,'Multiple resource cleanup failures');}catch(error){failure=error;}
  try{parent.replaceChildren(end);}catch(error){if(failure)throw new AggregateError([failure,error],'Region cleanup and DOM removal failed',{cause:failure});throw error;}
  if(failure)throw failure;
  for(const row of rows)row.bulkNodes=null;state.rows.clear();state.staged.clear();
 }
 /** @elnorCapability lists */
 function resetList(index,bulk=false){const state=region.lists?.get(index);if(!state)return;if(bulk){const bounds=bulkBounds(plan.lists[index],state);if(bounds){try{clearRows(state,bounds);}catch(error){try{resetList(index);}catch(cleanup){throw new AggregateError([error,cleanup],'Region disposal failed and resource cleanup also failed',{cause:error});}throw error;}region.lists?.delete(index);return;}}region.lists?.delete(index);const failures=[];
  for(const row of new Set([...state.rows.values(),...state.staged]))try{row.stop(bulkDepth?preserveRowRoot:undefined);}catch(error){failures.push(error);}state.rows.clear();state.staged.clear();errors(failures,'Multiple list disposal failures');
 }
 /** @elnorCapability lists */
 function createRow(spec,value,state,key){
  if(plan.mode==='sequential'){
   const row={key,index:-1,frame:null,dispose:null,bulkNodes:null,get nodes(){if(this.bulkNodes)return this.bulkNodes;const part=this.frame?.parts?.[spec.child];return part?.domNodes??part?.roots??[];},stop(policy){const stop=this.dispose;this.dispose=null;this.frame=null;this.key=null;const failures=[];try{stop?.(policy);}catch(error){failures.push(error);}if(policy!==preserveRowRoot&&this.bulkNodes){const nodes=this.bulkNodes;this.bulkNodes=null;for(const node of nodes)try{node.remove();}catch(error){failures.push(error);}}errors(failures,'Row disposal failed');}};state.staged.add(row);
   try{if(runtimeComponents&&spec.forward!==undefined){mountForwardRow(region,plan,spec,value,doc,(frame,dispose)=>{row.frame=frame;row.dispose=dispose;});return row;}mountTaskRegion(spec.detached?null:doc.createDocumentFragment(),plan,{entry:spec.child,parent:region,props:region.props,emit:region.emit,itemSlot:spec.itemSlot,item:value,detached:spec.detached,rowFragment:!spec.detached,stage(frame,dispose){row.frame=frame;row.dispose=dispose;}});return row;}catch(error){try{row.stop();}catch(cleanup){throw new AggregateError([error,cleanup],'Row mount and cleanup failed',{cause:error});}throw error;}
  }
  const fragment=doc.createDocumentFragment(),start=doc.createComment('elnor:row'),end=doc.createComment('/elnor:row');fragment.append(start);let frame;
  const row={index:-1,frame:null,start,end,stop:null,get nodes(){return regionRangeNodes(this.start,this.end);}};
  row.stop=()=>{if(!row.start)return;const failures=[];try{row.dispose?.();}catch(error){failures.push(error);}for(const node of [row.start,row.end])try{node.remove();}catch(error){failures.push(error);}row.start=null;row.end=null;row.frame=null;row.dispose=null;errors(failures,'Row disposal failed');};state.staged.add(row);
  try{const stop=mountTaskRegion(fragment,plan,{entry:spec.child,parent:region,itemSlot:spec.itemSlot,item:value,stage:(f,dispose)=>{frame=f;row.frame=f;row.dispose=dispose;}});if(row.start){row.dispose=stop;row.frame=frame;fragment.append(end);}return row;}
  catch(error){try{row.stop();}catch(cleanup){throw new AggregateError([error,cleanup],'Row mount and cleanup failed',{cause:error});}throw error;}
 }
 /** @elnorCapability lists */
 function materializeRows(rows,count){const next=new Map(),order=[];for(const row of rows.values()){if(order.length===count)break;next.set(row.key,row);order.push(row);}return {next,order};}
 /** @elnorCapability lists */
 function refreshList(id,index){const spec=plan.lists[index];let state=region.lists.get(index);if(!state){state={rows:new Map(),staged:new Set()};region.lists.set(index,state);}
  try{const keyProps=region.props,values=spec.read(region);if(region.disposed)return;if(!Array.isArray(values))throw Error('ELN-RUNTIME-001: each expects an array');if(spec.exclusive&&values.length===0){const bounds=bulkBounds(spec,state);if(bounds){clearRows(state,bounds);return;}}const defer=plan.mode==='sequential'&&!state.staged.size;let next=defer?null:new Map(),order=defer?null:[],cursor=defer?state.rows.values():null,expected=cursor?.next(),matched=0,increasing=true,last=-1;
   let keyItem;const keyContext={props:keyProps,read:slot=>slot===spec.itemSlot?keyItem:region.read(slot)};
   for(const value of values){keyItem=value;const key=spec.key(keyContext);if(region.disposed)return;if(!next&&!expected.done&&(key===expected.value.key||(key!==key&&expected.value.key!==expected.value.key))){const row=expected.value;if(row.index<last)increasing=false;last=row.index;row.frame.write(spec.itemSlot,value);matched++;expected=cursor.next();continue;}if(!next){({next,order}=materializeRows(state.rows,matched));cursor=null;expected=null;}if(next.has(key))throw Error('ELN-RUNTIME-002: duplicate each key: '+String(key));let row=state.rows.get(key);
    if(!row){row=createRow(spec,value,state,key);if(region.disposed){row.stop();return;}extend(id,plan.groups[spec.child].initialDependencies,row.frame);}
    else{if(row.index<last)increasing=false;last=row.index;row.frame.write(spec.itemSlot,value);}
    next.set(key,row);order.push(row);
   }
   if(region.disposed)return;
   if(!next){if(expected.done)return;({next,order}=materializeRows(state.rows,matched));}
   for(const [key,row] of state.rows)if(!next.has(key))row.stop();
   if(region.disposed)return;
   const stable=increasing?null:regionOrderedRows(order);let anchor=region.refs[spec.node];
   for(let i=order.length-1;i>=0;i--){const row=order[i];if(row.index<0||(stable&&!stable.has(i))){const nodes=row.nodes;for(let j=nodes.length-1;j>=0;j--){if(region.disposed)return;anchor.parentNode.insertBefore(nodes[j],anchor);anchor=nodes[j];}}else anchor=row.nodes[0];}
   for(let i=0;i<order.length;i++)order[i].index=i;state.rows=next;state.staged.clear();
  }catch(error){try{resetList(index);}catch(cleanup){throw new AggregateError([error,cleanup],'List update and cleanup failed',{cause:error});}throw error;}
 }
 const stage=config.stage;config.stage=null;stage?.(region,dispose);
 if(region.disposed)return dispose;
 try{const part=runtimeBlueprint&&plan.mode!=='sequential'?activate(entry):activateSequential();if(runtimeLists&&config.detached&&!region.disposed&&(part.roots.length!==1||part.roots[0].nodeType!==1||part.roots[0].parentNode!==null))throw Error('ELN-RUNTIME-003: detached each expects a detached element');if(runtimeBlueprint&&plan.mode!=='sequential'&&!region.disposed)for(const node of [...part.fragment.childNodes])target.append(node);if(part)part.fragment=null;target=null;return dispose;}
 catch(error){try{dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'Region mount and cleanup failed',{cause:error});}throw error;}
}
