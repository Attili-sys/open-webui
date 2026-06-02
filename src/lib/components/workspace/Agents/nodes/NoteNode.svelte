<script lang="ts">
	import type { NodeProps } from '@xyflow/svelte';

	type $$Props = NodeProps;
	export let data: { label?: string; note?: string } = {};
</script>

<div
	class="rounded-2xl border border-yellow-300/60 dark:border-yellow-700/60 bg-yellow-50/80 dark:bg-yellow-950/40 text-yellow-900 dark:text-yellow-100 px-3 py-2 shadow-sm min-w-[160px] max-w-[260px]"
>
	<div class="text-[10px] font-medium uppercase tracking-wide opacity-70">Note</div>
	<div class="text-xs whitespace-pre-wrap">{data?.note ?? data?.label ?? 'Add a note'}</div>
</div>
