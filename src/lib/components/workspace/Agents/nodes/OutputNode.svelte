<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';

	type $$Props = NodeProps;
	export let data: { label?: string } = {};
</script>

<div
	class="rounded-2xl border border-slate-300/70 dark:border-slate-700/70 bg-slate-50/80 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 px-3 py-2 shadow-sm min-w-[140px] text-center"
>
	<Handle type="target" position={Position.Left} class="!bg-slate-500" />
	<div class="text-[10px] font-medium uppercase tracking-wide opacity-70">Output</div>
	<div class="text-sm font-medium">{data?.label ?? 'Reply to user'}</div>
</div>
