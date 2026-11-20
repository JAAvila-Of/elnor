export interface Row { id: number; label: string }
export interface Model { rows: Row[]; selected: number }
export function initial(): Model { return {rows:[],selected:0}; }
export function reduce(model: Model, action: string, size: number, id=0): Model {
  const make=(count:number,start=1)=>Array.from({length:count},(_,index)=>({id:start+index,label:'Row '+(start+index)}));
  if(action==='create')return {rows:make(size),selected:0};
  if(action==='update')return {...model,rows:model.rows.map((row,index)=>index%10===0?{...row,label:row.label+'!'}:row)};
  if(action==='append')return {...model,rows:[...model.rows,...make(Math.max(1,Math.floor(size/10)),Math.max(0,...model.rows.map(row=>row.id))+1)]};
  if(action==='swap'){
    const rows=[...model.rows];if(rows.length>1)[rows[0],rows[rows.length-1]]=[rows[rows.length-1],rows[0]];
    return {...model,rows};
  }
  if(action==='remove'){
    const removed=model.rows[Math.floor(model.rows.length/2)]?.id;
    return {rows:model.rows.filter(row=>row.id!==removed),selected:model.selected===removed?0:model.selected};
  }
  if(action==='select')return {...model,selected:id};
  if(action==='clear')return initial();
  throw Error('Unknown comparison action: '+action);
}
