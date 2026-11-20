<script>
  import RowView from './RowView.svelte';
  import {initial,reduce} from '../model.mts';
  let {size}=$props();
  let model=$state.raw(initial());
  function dispatch(action,id=0){model=reduce(model,action,size,id);}
</script>
<section><h1>Shared keyed list</h1><div class="count"><span>{model.rows.length}</span></div>
  <div class="selection"><span>{model.selected}</span></div><div class="controls">
  {#each ['Create','Update','Append','Swap','Remove','Clear'] as label (label)}
    <button type="button" onclick={()=>dispatch(label.toLowerCase())}>{label}</button>
  {/each}
  </div><ul>{#each model.rows as row (row.id)}<RowView {row} onselected={id=>dispatch('select',id)}/>{/each}</ul>
</section>
