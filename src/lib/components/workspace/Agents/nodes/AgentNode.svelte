<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';

	type $$Props = NodeProps;
	export let data: {
		label?: string;
		model_id?: string;
		system_prompt?: string;
		tool_ids?: string[];
		skill_ids?: string[];
	} = {};
</script>

<div
	class="rounded-2xl border border-indigo-300/60 dark:border-indigo-700/60 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-100 px-3 py-2 shadow-sm min-w-[180px]"
>
	<Handle type="target" position={Position.Left} class="!bg-indigo-500" />

	<div class="text-[10px] font-medium uppercase tracking-wide opacity-70">Agent</div>
	<div class="text-sm font-medium truncate">{data?.label ?? 'Untitled agent step'}</div>
	{#if data?.model_id}
		<div class="text-[11px] opacity-70 truncate">model: {data.model_id}</div>
	{/if}
	{#if (data?.tool_ids?.length ?? 0) + (data?.skill_ids?.length ?? 0) > 0}
		<div class="text-[10px] mt-1 flex gap-1 flex-wrap">
			{#if data?.tool_ids?.length}
				<span class="rounded-full bg-indigo-200/60 dark:bg-indigo-800/50 px-1.5 py-[1px]"
					>{data.tool_ids.length} tools</span
				>
			{/if}
			{#if data?.skill_ids?.length}
				<span class="rounded-full bg-indigo-200/60 dark:bg-indigo-800/50 px-1.5 py-[1px]"
					>{data.skill_ids.length} skills</span
				>
			{/if}
		</div>
	{/if}

	<Handle type="source" position={Position.Right} class="!bg-indigo-500" />
</div>
