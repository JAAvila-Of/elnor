import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {initial,reduce} from './model.mts';
import {attach,size} from '/driver.mjs';
function RowView({row,onSelected}){
  return <li><button type="button" onClick={()=>onSelected(row.id)}>{row.label}</button><small>{row.id}</small></li>;
}
function App(){
  const [model,setModel]=useState(initial);
  const dispatch=(action,id=0)=>setModel(previous=>reduce(previous,action,size,id));
  return <section><h1>Shared keyed list</h1><div className="count"><span>{model.rows.length}</span></div>
    <div className="selection"><span>{model.selected}</span></div><div className="controls">
    {['Create','Update','Append','Swap','Remove','Clear'].map(label=><button type="button" key={label} onClick={()=>dispatch(label.toLowerCase())}>{label}</button>)}
    </div><ul>{model.rows.map(row=><RowView key={row.id} row={row} onSelected={id=>dispatch('select',id)}/>)}</ul></section>;
}
attach(()=>{const root=createRoot(document.getElementById('app'));root.render(<App/>);return ()=>root.unmount();});
