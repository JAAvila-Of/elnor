// Minimal fake DOM: tests only the documented surface used by the spike.
export class FakeNode {
  constructor(tag='fragment'){
    this.tagName=tag.toUpperCase();this.tag=tag;this.childNodes=[];
    this.parentNode=null;this._text='';this.listeners={};this.className='';this.value='';
  }
  get options(){return this.tag==='select'?this.childNodes.filter(n=>n.tag==='option'):undefined;}
  get selectedIndex(){return this._selectedIndex??(this.options?.length?0:-1);}
  set selectedIndex(index){this._selectedIndex=index>=0&&index<(this.options?.length??0)?index:-1;}
  get value(){return this.tag==='select'?(this.options[this.selectedIndex]?.value??''):(this._value??'');}
  set value(value){if(this.tag==='select'){this.selectedIndex=this.options.findIndex(n=>n.value===String(value));}else this._value=String(value);}
  getAttribute(name){return this.attributes?.get(name)??null;}
  setAttribute(name,value){(this.attributes??=new Map()).set(name,String(value));}
  removeAttribute(name){this.attributes?.delete(name);}
  get textContent(){return this._text + this.childNodes.map(x=>x.textContent).join('');}
  set textContent(text){for(const child of this.childNodes)child.parentNode=null;this.childNodes=[];this._text=String(text);}
  get nodeValue(){return this.tag==='#text'?this._text:null;}
  set nodeValue(value){if(this.tag==='#text')this._text=String(value??'');}
  get firstChild(){return this.childNodes[0]??null;}
  get nextSibling(){if(!this.parentNode)return null;const nodes=this.parentNode.childNodes;return nodes[nodes.indexOf(this)+1]??null;}
  get nodeType(){return this.tag==='#text'?3:this.tag==='#comment'?8:this.tag==='fragment'?11:1;}
  cloneNode(deep=false){
    const node=new FakeNode(this.tag);
    if(this.tag==='option')node.value=this.value;
    node._text=this._text;node.className=this.className;node.type=this.type;
    if(this.disabled!==undefined)node.disabled=this.disabled;
    if(this.attributes)node.attributes=new Map(this.attributes);
    node.ownerDocument=this.ownerDocument;
    if(deep)for(const child of this.childNodes)node.append(child.cloneNode(true));
    return node;
  }
  append(...items){
    for(const item of items){
      if(typeof item==='string'){const n=new FakeNode('#text');n.textContent=item;this.append(n);continue;}
      if(item.tag==='fragment'){
        for(const child of [...item.childNodes])this.append(child);
        continue;
      }
      item.remove();this.childNodes.push(item);item.parentNode=this;
    }
  }
  replaceChildren(...items){this.textContent='';this.append(...items);}
  insertBefore(item,reference){
    if(!this.childNodes.includes(reference))throw Error('NotFoundError');
    item.remove();
    this.childNodes.splice(this.childNodes.indexOf(reference),0,item);
    item.parentNode=this;
  }
  remove(){
    if(!this.parentNode)return;
    const i=this.parentNode.childNodes.indexOf(this);
    if(i>=0)this.parentNode.childNodes.splice(i,1);
    this.parentNode=null;
  }
  addEventListener(type,callback){(this.listeners[type]??=[]).push(callback);}
  removeEventListener(type,callback){this.listeners[type]=(this.listeners[type]??[]).filter(fn=>fn!==callback);}
  dispatch(type){for(const callback of this.listeners[type]??[])callback({type,target:this});}
  click(){this.dispatch('click');}
  descendants(tag){
    return [this,...this.childNodes.flatMap(x=>x.descendants(tag))].filter(x=>x.tag===tag);
  }
}
export function setupDOM(){
  const create=tag=>{const node=new FakeNode(tag);node.ownerDocument=dom;return node;};
  const dom={
    createElement(tag){return create(tag);},
    createDocumentFragment(){return create('fragment');},
    createComment(text){const node=create('#comment');node._text='';return node;},
    createTextNode(text){const node=create('#text');node.textContent=text;return node;}
  };
  globalThis.document=dom;
}
export function findInput(root,label){
  return root.descendants('label').find(x=>x.descendants('span')[0]?.textContent===label)?.descendants('input')[0];
}
export function findButton(root,label){
  return root.descendants('button').find(x=>x.textContent===label);
}
export async function tick(){for(let i=0;i<5;i++)await Promise.resolve();}
