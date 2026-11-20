// Shared preparation/verification; application code uses ordinary scheduling.
const actions={counter:['mount','increment','unmount'],form:['mount','edit-one','edit-all','invalid','recover','unmount'],composition:['mount','relay','unmount'],localized:['mount','local-update','unmount']};
const check=(value,message)=>{if(!value)throw Error(message);};
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
async function settle(){await frame();await frame();}
export function attach(workload,start){
  const target=document.getElementById('app');let stop=null,expected,refs=[],pending=null;
  const initial=()=>workload==='form'?{fields:Array(6).fill('')}:workload==='localized'?{values:Array(24).fill(0)}:{value:0};
  function verify(){
    if(!stop){check(target.childNodes.length===0,'Unmount left nodes');return {mounted:false};}
    check(target.querySelector('section'),'Mount missing root');
    const current=workload==='localized'?[...target.querySelectorAll('.leaf')]:[target.firstElementChild];
    if(!refs.length)refs=current;
    check(current.length===refs.length&&current.every((node,i)=>node===refs[i]),'Unrelated component identity changed');
    if(workload==='form'){
      const values=[...target.querySelectorAll('input')].map(node=>node.value),outputs=target.querySelectorAll('strong');
      check(JSON.stringify(values)===JSON.stringify(expected.fields),'Form values differ');
      check(outputs[0].textContent===values.join('|'),'Derived form summary differs');
      check(outputs[1].textContent===(values[0].length>0&&values[1].includes('@')?'ready':'incomplete'),'Form validity differs');
      check(!!target.querySelector('p')===!!(values[1]&&!values[1].includes('@')),'Conditional error differs');
    }else if(workload==='localized'){
      check(JSON.stringify([...target.querySelectorAll('.leaf strong')].map(node=>Number(node.textContent)))===JSON.stringify(expected.values),'Localized state differs');
    }else{
      check(Number(target.querySelector('strong').textContent)===expected.value,'Counter/relay value differs');
      if(workload==='composition'){
        check(target.querySelectorAll('.layer').length===6,'Composition depth differs');
        check(target.querySelector('header').textContent==='CardActions','Named slot differs');
        check(Number(target.querySelector('.card > p').textContent)===expected.value,'Relayed event differs');
      }
    }
    return {mounted:true,identity:true};
  }
  async function mount(){
    check(!stop,'Already mounted');expected=initial();stop=await start();
    const deadline=performance.now()+5000;
    while(!target.firstElementChild){check(performance.now()<deadline,'Mount deadline exceeded');await frame();}
    await settle();
  }
  async function unmount(){
    const dispose=stop;stop=null;pending=null;refs=[];
    if(dispose)await dispose();await settle();check(target.childNodes.length===0,'Disposal left nodes');
  }
  const edit=(node,value)=>{node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));};
  async function prepare(action){
    check(actions[workload].includes(action),'Unknown action');
    await unmount();if(action!=='mount')await mount();
    if(action!=='mount')verify();
    if(action==='mount'||action==='unmount'){pending={action};return;}
    if(workload==='form'){
      const nodes=[...target.querySelectorAll('input')];let values=[...expected.fields],changes=[];
      if(action==='edit-one')changes=[[0,'Ada']];
      if(action==='edit-all')changes=['Ada','ada@example.test','Lima','Team','Engineer','Notes'].map((value,i)=>[i,value]);
      if(action==='invalid')changes=[[1,'wrong']];
      if(action==='recover'){
        edit(nodes[0],'Ada');edit(nodes[1],'wrong');expected.fields[0]='Ada';expected.fields[1]='wrong';await settle();verify();
        values=[...expected.fields];changes=[[1,'ada@example.test']];
      }
      for(const [i,value] of changes)values[i]=value;
      pending={fn:()=>{for(const [i,value] of changes)edit(nodes[i],value);},next:{fields:values}};
    }else{
      const index=workload==='localized'?12:0,node=target.querySelectorAll('button')[index];
      const next=workload==='localized'?{values:expected.values.map((value,i)=>value+(i===index?1:0))}:{value:expected.value+1};
      pending={fn:()=>node.click(),next};
    }
  }
  async function run(){
    check(pending,'Prepare first');const operation=pending;pending=null;const startTime=performance.now();
    if(operation.action==='mount')await mount();
    else if(operation.action==='unmount')await unmount();
    else{operation.fn();await settle();expected=operation.next;}
    const height=target.getBoundingClientRect().height;
    return {frameWindowMs:performance.now()-startTime,height};
  }
  function schema(){
    function node(value){
      if(value.nodeType===3)return value.textContent.trim()?value.textContent:null;
      if(value.nodeType!==1)return null;
      const attrs=[...value.attributes].filter(item=>!(value.tagName==='INPUT'&&item.name==='value')).map(item=>[item.name,item.value]).sort();
      // Controlled value serialization differs; compare the actual input value.
      return [value.tagName,attrs,value.tagName==='INPUT'?value.value:null,[...value.childNodes].map(node).filter(value=>value!==null)];
    }
    return JSON.stringify(node(target));
  }
  window.__matrix={workload,actions:actions[workload],prepare,run,verify,schema,unmount,mount,ready:mount()};
}
