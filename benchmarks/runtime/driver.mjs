// Shared test instrumentation. Its reducer/verification runs outside CPU windows.
import {initial,reduce} from './model.mts';
export const size=Number(new URL(location.href).searchParams.get('n')??100);
if(![100,1000].includes(size))throw Error('Unsupported comparison size');
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
async function frames(){await frame();await frame();}
let expected=initial(),references=new Map(),pending,start,dispose;
const target=()=>document.getElementById('app');
function verify(){
  if(Number(target().querySelector('.count span')?.textContent)!==expected.rows.length)throw Error('Count mismatch');
  if(Number(target().querySelector('.selection span')?.textContent)!==expected.selected)throw Error('Child event/selection mismatch');
  const nodes=[...target().querySelectorAll('ul > li')];
  if(nodes.length!==expected.rows.length)throw Error('List length mismatch');
  const next=new Map();nodes.forEach((node,index)=>{
    const row=expected.rows[index];
    if(node.querySelector('button')?.textContent!==row.label||Number(node.querySelector('small')?.textContent)!==row.id)throw Error('Row mismatch at '+index);
    if(references.has(row.id)&&references.get(row.id)!==node)throw Error('Keyed node identity lost for '+row.id);
    next.set(row.id,node);
  });references=next;return {rows:nodes.length,selected:expected.selected,keyedIdentity:true};
}
function prepare(action){
  let button,id=0;
  if(action==='select'){
    const index=Math.floor(expected.rows.length/2);id=expected.rows[index].id;button=target().querySelectorAll('ul > li button')[index];
  }else button=[...target().querySelectorAll('.controls button')].find(node=>node.textContent.toLowerCase()===action);
  if(!button)throw Error('Action button missing: '+action);
  pending={button,expected:reduce(expected,action,size,id)};
}
async function run(){
  if(!pending)throw Error('Prepare an action first');
  const operation=pending;pending=undefined;const began=performance.now();operation.button.click();
  // Normal framework scheduling, no forced synchronous flush. Two callbacks are
  // an observable frame window, not a guarantee of pixels presented to a user.
  await frames();const layoutHeight=target().getBoundingClientRect().height;
  const frameWindowMs=performance.now()-began;expected=operation.expected;
  return {frameWindowMs,layoutHeight};
}
async function mount(){
  expected=initial();references.clear();pending=undefined;dispose=await start();
  const deadline=performance.now()+5000;
  while(!target().querySelector('section')){if(performance.now()>deadline)throw Error('Initial mount timeout');await frame();}
  await frames();verify();return {readyMs:performance.now()};
}
async function unmount(){
  const stop=dispose;dispose=undefined;pending=undefined;expected=initial();references.clear();await stop();await frames();
  if(target().childNodes.length!==0)throw Error('Unmount left app nodes');return {empty:true};
}
export function attach(create){
  start=create;window.__bench={size,prepare,run,verify,unmount,mount,ready:mount(),
    schema(){
      function node(value){
        if(value.nodeType===3)return value.textContent.trim()?value.textContent:null;
        if(value.nodeType!==1)return null;
        return [value.tagName,[...value.attributes].map(item=>[item.name,item.value]).sort(),[...value.childNodes].map(node).filter(item=>item!==null)];
      }
      return JSON.stringify(node(target()));
    }};
}
