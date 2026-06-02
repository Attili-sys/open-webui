<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { writable, type Writable } from 'svelte/store';
	import {
		Background,
		BackgroundVariant,
		Controls,
		MiniMap,
		Panel,
		SvelteFlow,
		type Node,
		type Edge
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	import { theme } from '$lib/stores';
	import type { AgentGraph } from '$lib/apis/agents';

	import TriggerNode from './nodes/TriggerNode.svelte';
	import AgentNode from './nodes/AgentNode.svelte';
	import ToolNode from './nodes/ToolNode.svelte';
	import ConditionNode from './nodes/ConditionNode.svelte';
	import OutputNode from './nodes/OutputNode.svelte';
	import NoteNode from './nodes/NoteNode.svelte';

	const i18n = getContext<any>('i18n');

	export let graph: AgentGraph | null = null;
	export let onChange: (g: AgentGraph) => void = () => {};
	export let height: string = '60vh';

	// xyflow uses writables for live updates.
	const nodes: Writable<Node[]> = writable([]);
	const edges: Writable<Edge[]> = writable([]);

	const nodeTypes = {
		trigger: TriggerNode,
		agent: AgentNode,
		tool: ToolNode,
		condition: ConditionNode,
		output: OutputNode,
		note: NoteNode
	};

	let selectedNodeId: string | null = null;

	$: selectedNode = $nodes.find((n) => n.id === selectedNodeId) ?? null;

	const seed = (): { nodes: Node[]; edges: Edge[] } => ({
		nodes: [
			{
				id: 'trigger-1',
				type: 'trigger',
				position: { x: 0, y: 80 },
				data: { label: 'User prompt' }
			},
			{
				id: 'agent-1',
				type: 'agent',
				position: { x: 240, y: 60 },
				data: {
					label: 'Main agent',
					model_id: '',
					tool_ids: [],
					skill_ids: []
				}
			},
			{
				id: 'output-1',
				type: 'output',
				position: { x: 520, y: 80 },
				data: { label: 'Reply to user' }
			}
		],
		edges: [
			{ id: 'e1', source: 'trigger-1', target: 'agent-1' },
			{ id: 'e2', source: 'agent-1', target: 'output-1' }
		]
	});

	const loadGraph = (g: AgentGraph | null) => {
		if (g && g.nodes && g.nodes.length > 0) {
			nodes.set(g.nodes as unknown as Node[]);
			edges.set((g.edges ?? []) as unknown as Edge[]);
		} else {
			const fresh = seed();
			nodes.set(fresh.nodes);
			edges.set(fresh.edges);
		}
	};

	// Push graph changes upstream whenever the user moves nodes / adds
	// edges. We debounce by relying on the store subscription cadence;
	// the parent already debounces its persistence.
	let isInternalUpdate = false;
	nodes.subscribe(($n) => {
		if (!isInternalUpdate) emit();
	});
	edges.subscribe(($e) => {
		if (!isInternalUpdate) emit();
	});

	function emit() {
		onChange({
			nodes: $nodes as unknown as AgentGraph['nodes'],
			edges: $edges as unknown as AgentGraph['edges']
		});
	}

	function uid(prefix: string) {
		return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
	}

	function addNode(type: keyof typeof nodeTypes) {
		const base: Node = {
			id: uid(type),
			type,
			position: {
				x: 120 + Math.random() * 240,
				y: 120 + Math.random() * 200
			},
			data: defaultDataFor(type)
		};
		nodes.update((arr) => [...arr, base]);
	}

	function defaultDataFor(type: string): Record<string, any> {
		switch (type) {
			case 'trigger':
				return { label: 'User prompt' };
			case 'agent':
				return { label: 'Agent step', model_id: '', tool_ids: [], skill_ids: [] };
			case 'tool':
				return { label: 'Tool', tool_id: '' };
			case 'condition':
				return { label: 'if/else', expression: '' };
			case 'output':
				return { label: 'Reply to user' };
			case 'note':
				return { note: 'Describe this branch…' };
			default:
				return {};
		}
	}

	function deleteSelected() {
		if (!selectedNodeId) return;
		const id = selectedNodeId;
		nodes.update((arr) => arr.filter((n) => n.id !== id));
		edges.update((arr) => arr.filter((e) => e.source !== id && e.target !== id));
		selectedNodeId = null;
	}

	function updateSelectedData(patch: Record<string, any>) {
		if (!selectedNodeId) return;
		nodes.update((arr) =>
			arr.map((n) =>
				n.id === selectedNodeId
					? { ...n, data: { ...(n.data as any), ...patch } }
					: n
			)
		);
	}

	function exportGraph() {
		const data = JSON.stringify(
			{
				nodes: $nodes,
				edges: $edges
			},
			null,
			2
		);
		const blob = new Blob([data], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `agent-graph-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	onMount(() => {
		isInternalUpdate = true;
		loadGraph(graph);
		isInternalUpdate = false;
	});

	$: if (graph && $nodes.length === 0) {
		// Reset when parent swaps the underlying graph (e.g. cloning).
		isInternalUpdate = true;
		loadGraph(graph);
		isInternalUpdate = false;
	}
</script>

<div class="flex w-full gap-2" style="height: {height}">
	<div
		class="flex-1 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950"
	>
		<SvelteFlow
			{nodes}
			{edges}
			{nodeTypes}
			fitView
			minZoom={0.2}
			maxZoom={2}
			colorMode={$theme.includes('dark')
				? 'dark'
				: $theme === 'system'
					? typeof window !== 'undefined' &&
						window.matchMedia('(prefers-color-scheme: dark)').matches
						? 'dark'
						: 'light'
					: 'light'}
			on:nodeclick={(e) => {
				selectedNodeId = (e.detail.node as any).id;
			}}
			on:paneclick={() => (selectedNodeId = null)}
		>
			<Background variant={BackgroundVariant.Dots} gap={16} size={1} />
			<Controls />
			<MiniMap />
			<Panel position="top-left">
				<div
					class="flex gap-1 p-1 rounded-xl bg-white/85 dark:bg-gray-900/85 border border-gray-100 dark:border-gray-800 shadow-sm backdrop-blur"
				>
					{#each [['trigger', '⚡ Trigger'], ['agent', '🤖 Agent'], ['tool', '🛠 Tool'], ['condition', '⤴ If/else'], ['output', '⬛ Output'], ['note', '📝 Note']] as [type, label]}
						<button
							type="button"
							class="text-xs px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
							on:click={() => addNode(type as keyof typeof nodeTypes)}
						>
							{label}
						</button>
					{/each}
					<div class="w-px bg-gray-200 dark:bg-gray-800 mx-1"></div>
					<button
						type="button"
						class="text-xs px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
						on:click={exportGraph}
					>
						{$i18n.t('Export JSON')}
					</button>
				</div>
			</Panel>
		</SvelteFlow>
	</div>

	{#if selectedNode}
		<div
			class="w-64 shrink-0 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 p-3 overflow-y-auto"
		>
			<div class="flex items-center justify-between mb-2">
				<div class="text-xs uppercase tracking-wide text-gray-500">
					{selectedNode.type}
				</div>
				<button
					type="button"
					class="text-xs text-rose-600 hover:underline"
					on:click={deleteSelected}
				>
					{$i18n.t('Delete')}
				</button>
			</div>

			<label class="block text-[11px] text-gray-500 mb-1">{$i18n.t('Label')}</label>
			<input
				class="w-full text-sm bg-transparent border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-1 mb-2"
				value={(selectedNode.data as any)?.label ?? ''}
				on:input={(e) => updateSelectedData({ label: (e.target as HTMLInputElement).value })}
			/>

			{#if selectedNode.type === 'agent'}
				<label class="block text-[11px] text-gray-500 mb-1">{$i18n.t('Model ID')}</label>
				<input
					class="w-full text-sm bg-transparent border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-1 mb-2"
					value={(selectedNode.data as any)?.model_id ?? ''}
					on:input={(e) =>
						updateSelectedData({ model_id: (e.target as HTMLInputElement).value })}
				/>

				<label class="block text-[11px] text-gray-500 mb-1">{$i18n.t('System prompt')}</label>
				<textarea
					class="w-full text-sm bg-transparent border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-1 mb-2 min-h-[80px]"
					value={(selectedNode.data as any)?.system_prompt ?? ''}
					on:input={(e) =>
						updateSelectedData({
							system_prompt: (e.target as HTMLTextAreaElement).value
						})}
				/>
			{/if}

			{#if selectedNode.type === 'tool'}
				<label class="block text-[11px] text-gray-500 mb-1">{$i18n.t('Tool ID')}</label>
				<input
					class="w-full text-sm bg-transparent border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-1 mb-2"
					value={(selectedNode.data as any)?.tool_id ?? ''}
					on:input={(e) =>
						updateSelectedData({ tool_id: (e.target as HTMLInputElement).value })}
				/>
			{/if}

			{#if selectedNode.type === 'condition'}
				<label class="block text-[11px] text-gray-500 mb-1">{$i18n.t('Expression')}</label>
				<input
					class="w-full text-sm font-mono bg-transparent border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-1 mb-2"
					placeholder="output.contains('done')"
					value={(selectedNode.data as any)?.expression ?? ''}
					on:input={(e) =>
						updateSelectedData({ expression: (e.target as HTMLInputElement).value })}
				/>
			{/if}

			{#if selectedNode.type === 'note'}
				<label class="block text-[11px] text-gray-500 mb-1">{$i18n.t('Note')}</label>
				<textarea
					class="w-full text-sm bg-transparent border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-1 min-h-[100px]"
					value={(selectedNode.data as any)?.note ?? ''}
					on:input={(e) =>
						updateSelectedData({ note: (e.target as HTMLTextAreaElement).value })}
				/>
			{/if}
		</div>
	{/if}
</div>
