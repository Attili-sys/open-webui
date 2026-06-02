<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';

	type $$Props = NodeProps;
	export let data: { label?: string } = {};
</script>

<div
	class="rounded-2xl border border-emerald-300/60 dark:border-emerald-700/60 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 px-3 py-2 shadow-sm min-w-[140px] text-center"
>
	<div class="text-[10px] font-medium uppercase tracking-wide opacity-70">Trigger</div>
	<div class="text-sm font-medium">{data?.label ?? 'User prompt'}</div>
	<Handle type="source" position={Position.Right} class="!bg-emerald-500" />
</div>
