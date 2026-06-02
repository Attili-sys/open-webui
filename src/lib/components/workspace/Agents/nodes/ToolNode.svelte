<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';

	type $$Props = NodeProps;
	export let data: { label?: string; tool_id?: string } = {};
</script>

<div
	class="rounded-2xl border border-amber-300/60 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 px-3 py-2 shadow-sm min-w-[150px] text-center"
>
	<Handle type="target" position={Position.Left} class="!bg-amber-500" />
	<div class="text-[10px] font-medium uppercase tracking-wide opacity-70">Tool</div>
	<div class="text-sm font-medium truncate">{data?.label ?? data?.tool_id ?? 'Pick a tool'}</div>
	<Handle type="source" position={Position.Right} class="!bg-amber-500" />
</div>
