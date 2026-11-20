import {validateFormTopology} from './form-validation.mjs';
import {validateComponent} from './component-validation.mjs';
import {sourceKey as canonical,sourceImport} from './source-identity.mjs';

// Pure validation: callers own source loading, recovery and persistence.
export function validateGraph(graph, {knownFiles = [...graph.keys()],moduleHost} = {}){
  const errors=[];
  const indexed=new Map([...graph].map(([file,ir])=>[canonical(file),ir]));
  const known=new Set(knownFiles.map(canonical));
  for(const ir of graph.values()){
    errors.push(...validateComponent(ir,{moduleHost}));
    const imported=new Map();
    for(const imp of ir.imports.filter(i=>i.path.endsWith('.eln'))){
      const other=sourceImport(ir.filename,imp.path);
      const child=indexed.get(canonical(other));
      if(child)imported.set(imp.local,child);
      else if(known.has(canonical(other)))imported.set(imp.local,null);
      else errors.push({code:'ELN-IMPORT',file:ir.filename,line:1,...imp.pathSpan,message:`missing component import ${imp.path}`});
    }
    function walk(nodes,context='root'){
      for(const node of nodes){
        if(node.kind==='on' && context!=='component') errors.push({code:'ELN-EVENT-CONTEXT',file:ir.filename,line:node.line,...node.nameSpan,message:'on event must belong to a custom component'});
        if(node.kind==='fill' && context!=='component') errors.push({code:'ELN-SLOT-CONTEXT',file:ir.filename,line:node.line,...node.nameSpan,message:'fill must belong to a component'});
        if(node.kind==='component'){
          const child=imported.get(node.name);
          if(!imported.has(node.name))errors.push({code:'ELN-COMPONENT-IMPORT',file:ir.filename,line:node.line,...node.nameSpan,message:`${node.name} must be imported from a .eln file`});
          else if(child) {
            const on=node.children.filter(n=>n.kind==='on');
            const fills=node.children.filter(n=>n.kind==='fill');
            const content=node.children.filter(n=>n.kind!=='on'&&n.kind!=='fill');
            if(content.length&&!child.slots.includes('default'))errors.push({code:'ELN-SLOT-MISSING',file:ir.filename,line:node.line,...node.nameSpan,message:`${node.name} has no default slot`});
            for(const fill of fills)if(!child.slots.includes(fill.name))errors.push({code:'ELN-SLOT-UNKNOWN',file:ir.filename,line:fill.line,...fill.nameSpan,message:`${node.name} has no slot ${fill.name}`});
            if(new Set(fills.map(f=>f.name)).size!==fills.length)errors.push({code:'ELN-SLOT-DUP',file:ir.filename,line:node.line,...node.nameSpan,message:`duplicate fill on ${node.name}`});
            if(new Set(on.map(f=>f.name)).size!==on.length)errors.push({code:'ELN-EVENT-DUP',file:ir.filename,line:node.line,...node.nameSpan,message:`duplicate handler on ${node.name}`});
            for(const event of on){
              const contract=child.events.find(e=>e.name===event.name);
              if(contract){
                if(!!event.param !== (contract.params.length===1))errors.push({code:'ELN-EVENT-ARITY',file:ir.filename,line:event.line,...event.nameSpan,message:`handler of ${event.name} has incorrect argument arity`});
              }
            }
          }
          for(const item of node.children){
            if(item.kind==='component')walk([item],'other');
            else if(item.children)walk(item.children,'other');
          }
        } else if(node.children)walk(node.children,context);
      }
    }
    walk(ir.ui);
  }
  errors.push(...validateFormTopology(indexed));
  return errors;
}
