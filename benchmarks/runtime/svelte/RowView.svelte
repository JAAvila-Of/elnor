<script>let {row,onselected}=$props();</script>
<li><button type="button" onclick={()=>onselected(row.id)}>{row.label}</button><small>{row.id}</small></li>
