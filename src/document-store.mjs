import path from 'node:path';
import {logicalKey,sourceKey,sourcePath} from './source-identity.mjs';

// One in-memory buffer per physical origin, with independently owned logical
// views. Discovery must never replace text owned by an editor view.
export function createDocumentStore(root){
  const documents=new Map(),aliases=new Map();
  const absolute=file=>path.resolve(root,file);
  function identity(file){
    file=absolute(file);
    const id=sourceKey(file),alias=aliases.get(logicalKey(file));
    if(alias&&alias.id!==id)throw Error(`ELN-ALIAS-RETARGET: '${file}' now refers to a different physical source; close the view before reopening it`);
    return id;
  }
  function owned(id){return [...aliases.values()].filter(alias=>alias.id===id&&alias.explicit);}
  function open(file,source,{explicit=true}={}){
    file=absolute(file);
    const id=identity(file),name=logicalKey(file),previous=documents.get(id),known=aliases.get(name);
    const owners=owned(id);
    if(explicit&&previous&&previous.source!==source&&
       (known?.explicit?known.observed!==previous.source:owners.length>0))
      throw Error(`ELN-SOURCE-CONFLICT: A different buffer is already owned for '${file}'; acknowledge its current text before editing this view`);
    aliases.set(name,{id,file,explicit:explicit||!!known?.explicit,observed:explicit?source:known?.observed});
    if(!explicit&&previous)return previous;
    const primary=previous&&owners.length?previous.file:file;
    const doc={...previous,file:primary,origin:sourcePath(file),source};
    documents.set(id,doc);return doc;
  }
  return {
    documents,open,
    get(file){return documents.get(identity(file));},
    isAcknowledged(file){
      const alias=aliases.get(logicalKey(absolute(file)));
      return !!alias?.explicit&&alias.observed===documents.get(alias.id)?.source;
    },
    assertCurrent({synchronized=false,operation='rename'}={}){
      for(const alias of aliases.values()){
        identity(alias.file);
        if(synchronized&&alias.explicit&&alias.observed!==documents.get(alias.id)?.source)
          throw Error(`ELN-SOURCE-CONFLICT: Alias view '${alias.file}' must acknowledge the current buffer before ${operation}`);
      }
    },
    snapshots(){return [...aliases.values()].filter(alias=>alias.explicit).map(alias=>({file:alias.file,source:documents.get(alias.id).source}));},
    close(file){
      const name=logicalKey(absolute(file)),alias=aliases.get(name);
      if(!alias)return;
      aliases.delete(name);
      const remaining=owned(alias.id),doc=documents.get(alias.id);
      if(!remaining.length){
        documents.delete(alias.id);
        for(const [key,value] of aliases)if(value.id===alias.id)aliases.delete(key);
      }else if(doc&&!remaining.some(view=>logicalKey(view.file)===logicalKey(doc.file)))doc.file=remaining[0].file;
    },
    clear(){documents.clear();aliases.clear();},
  };
}
