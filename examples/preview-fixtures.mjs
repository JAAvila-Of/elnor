// Only test data. This file is excluded from application bundles and has no network calls.
const sampleUsers=[
  {id:'u1',name:'Ana Torres',email:'ana@example.test',role:'admin'},
  {id:'u2',name:'Luis Ramos',email:'luis@example.test',role:'member'},
  {id:'u3',name:'María Diaz',email:'maria@example.test',role:'member'}
];
const notice=status=>(message)=>{status.textContent=message;};
export const preview={
  UserList:{props:{users:sampleUsers},events:status=>({selected:user=>notice(status)(`Selected: ${user.name}`)})},
  ConfirmDialog:{props:{title:'Eliminar usuario',message:'Esta acción no se puede deshacer'},events:status=>({confirmed:()=>notice(status)('Confirmado'),cancelled:()=>notice(status)('Cancelado')})},
  Panel:{props:{title:'Panel independiente'},events:()=>({})},
  UserEditor:{props:{
    users:sampleUsers,
    persist:async(id,name)=>{await Promise.resolve();const found=sampleUsers.find(u=>u.id===id);if(found)found.name=name;},
    remove:async(id)=>{await Promise.resolve();const i=sampleUsers.findIndex(u=>u.id===id);if(i!==-1)sampleUsers.splice(i,1);}
  },events:status=>({saved:user=>notice(status)(`Guardado: ${user.name}`),deleted:id=>notice(status)(`Eliminado: ${id}`)})}
};
