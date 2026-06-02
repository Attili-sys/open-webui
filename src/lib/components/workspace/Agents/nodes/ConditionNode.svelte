<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';

	type $$Props = NodeProps;
	export let data: { label?: string; expression?: string } = {};
</script>

<div
	class="rounded-2xl border border-purple-300/60 dark:border-purple-700/60 bg-purple-50/80 dark:bg-purple-950/40 text-purple-900 dark:text-purple-100 px-3 py-2 shadow-sm min-w-[160px]"
>
	<Handle type="target" position={Position.Left} class="!bg-purple-500" />
	<div class="text-[10px] font-medium uppercase tracking-wide opacity-70">Condition</div>
	<div class="text-sm font-medium truncate">{data?.label ?? 'if/else'}</div>
	{#if data?.expression}
		<div class="text-[11px] opacity-70 font-mono truncate">{data.expression}</div>
	{/if}
	<div class="relative">
		<Handle
			id="true"
			type="source"
			position={Position.Right}
			style="top: 30%"
			class="!bg-emerald-500"
		/>
		<Handle
			id="false"
			type="source"
			position={Position.Right}
			style="top: 70%"
			class="!bg-rose-500"
		/>
	</div>
	<div class="text-[10px] flex justify-between mt-1 opacity-70">
		<span></span>
		<div class="flex flex-col items-end gap-2">
			<span class="text-emerald-700 dark:text-emerald-400">true</span>
			<span class="text-rose-700 dark:text-rose-400">false</span>
		</div>
	</div>
</div>
