import {sourceKey,sourceImport} from './source-identity.mjs';

// Follow rendered component/slot placement. Slot content keeps its caller's
// lexical imports and slot bindings while inheriting the callee's DOM ancestry.
export function validateFormTopology(indexed){
  const errors=[],seenErrors=new Set(),relevant=new Set(),forms=new Set(),edges=new Map();
  function childOf(owner,node){const imp=owner.imports.find(i=>i.local===node.name&&i.path.endsWith('.eln'));return imp&&indexed.get(sourceKey(sourceImport(owner.filename,imp.path)));}
  function inspect(nodes,owner,children){for(const node of nodes){if(node.tag==='form')forms.add(owner);if(node.tag==='form'||node.reset)relevant.add(owner);if(node.kind==='component'){const child=childOf(owner,node);if(child)children.add(child);}if(node.children)inspect(node.children,owner,children);}}
  for(const ir of indexed.values()){const children=new Set();inspect(ir.ui,ir,children);edges.set(ir,children);}
  if(!forms.size)return errors;
  let changed=true;while(changed){changed=false;for(const [ir,children] of edges)for(const set of [relevant,forms])if(!set.has(ir)&&[...children].some(child=>set.has(child))){set.add(ir);changed=true;}}
  function report(code,message,owner,node,origin){const location=origin??{owner,node,span:node.tagSpan??node.nameSpan},span=location.span??{start:0,length:0},key=[code,sourceKey(location.owner.filename),span.start,span.length].join(':');if(seenErrors.has(key))return;seenErrors.add(key);errors.push({code,message,file:location.owner.filename,line:location.node.line,...span});}
  for(const root of forms){
    let visited=0,exhausted=false;
    function walk(nodes,owner,inForm,slots,origin,depth){
      for(const node of nodes){
        if(exhausted)return;
        if(++visited>12000||depth>64){report('ELN-FORM-TOPOLOGY','Form placement exceeds the bounded component/slot analysis',owner,node,origin);exhausted=true;return;}
        if(node.kind==='on'||node.kind==='fill')continue;
        if(node.kind==='slot'){
          const binding=slots.get(node.name);if(binding)walk(binding.nodes,binding.owner,inForm,binding.slots,origin,depth+1);continue;
        }
        if(node.kind==='component'){
          const child=childOf(owner,node);if(!child||(!relevant.has(child)&&child.slots.length===0)||(!forms.has(child)&&child.slots.length===0&&(!inForm||inForm.hasReset)))continue;
          const supplied=new Map(),content=node.children.filter(n=>n.kind!=='on'&&n.kind!=='fill');
          if(content.length)supplied.set('default',{nodes:content,owner,slots});
          for(const fill of node.children.filter(n=>n.kind==='fill'))supplied.set(fill.name,{nodes:fill.children,owner,slots});
          const nextOrigin=inForm?(origin??{owner,node,span:node.nameSpan}):null;
          walk(child.ui,child,inForm,supplied,nextOrigin,depth+1);continue;
        }
        if(node.reset&&inForm&&!inForm.hasReset)report('ELN-FORM-RESET','A reset button requires on reset() on its containing form',owner,node,origin);
        if(node.tag==='form'&&inForm){report('ELN-FORM-NESTING','Rendered forms cannot be nested',owner,node,origin);continue;}
        if(node.children)walk(node.children,owner,node.tag==='form'?{hasReset:node.resetExpr!==undefined}:inForm,slots,origin,depth);
      }
    }
    walk(root.ui,root,false,new Map(),null,0);
  }
  return errors;
}
