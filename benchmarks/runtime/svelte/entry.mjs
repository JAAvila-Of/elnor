import {mount,unmount} from 'svelte';
import App from './App.svelte';
import {attach,size} from '/driver.mjs';
attach(()=>{const app=mount(App,{target:document.getElementById('app'),props:{size}});return ()=>unmount(app);});
