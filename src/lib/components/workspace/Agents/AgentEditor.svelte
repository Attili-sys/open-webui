<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { getContext, onMount, tick } from 'svelte';

	import { WEBUI_BASE_URL } from '$lib/constants';
	import { models as _models, tools as _tools, user } from '$lib/stores';

	import { getTools } from '$lib/apis/tools';
	import { getSkills } from '$lib/apis/skills';
	import { runAgentById, type AgentForm, type AgentGraph } from '$lib/apis/agents';

	import Spinner from '$lib/components/common/Spinner.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
	import ChevronLeft from '$lib/components/icons/ChevronLeft.svelte';
	import GarbageBin from '$lib/components/icons/GarbageBin.svelte';
	import ToolsSelector from '$lib/components/workspace/Models/ToolsSelector.svelte';
	import SkillsSelector from '$lib/components/workspace/Models/SkillsSelector.svelte';
	import Knowledge from '$lib/components/workspace/Models/Knowledge.svelte';

	import AgentGraphEditor from './AgentGraphEditor.svelte';

	const i18n = getContext<any>('i18n');

	export let agent: any = null; // Existing AgentResponse when editing
	export let edit = false;
	export let onSubmit: (form: AgentForm) => Promise<any>;
	export let onDelete: null | (() => Promise<any>) = null;
	export let clone = false;

	let loaded = false;
	let saving = false;
	let running = false;

	let id = '';
	let name = '';
	let description = '';
	let modelId = '';
	let systemPrompt = '';
	let isActive = true;
	let profileImageUrl = `${WEBUI_BASE_URL}/static/favicon.png`;

	let toolIds: string[] = [];
	let skillIds: string[] = [];
	let knowledge: any[] = [];

	let maxIterations = 6;
	let toolChoice: 'auto' | 'required' | 'none' = 'auto';
	let parallelToolCalls = true;

	let graph: AgentGraph | null = null;

	let skillsList: any[] = [];
	let availableModels: any[] = [];
	let mode: 'form' | 'graph' = 'form';

	let showDeleteConfirm = false;

	let runPrompt = '';
	let showRunBox = false;

	// Auto-derive ID from name when creating.
	$: if (!edit && name) {
		id = name
			.toLowerCase()
			.trim()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '');
	}

	function buildForm(): AgentForm {
		return {
			id,
			name: name.trim(),
			description: description.trim() || undefined,
			data: {
				model_id: modelId,
				system_prompt: systemPrompt,
				tool_ids: toolIds,
				skill_ids: skillIds,
				knowledge: knowledge.filter((k) => !k?.status || k.status !== 'uploading'),
				params: {},
				agent_loop: {
					max_iterations: maxIterations,
					tool_choice: toolChoice,
					parallel_tool_calls: parallelToolCalls
				},
				graph: graph ?? undefined
			},
			meta: {
				profile_image_url: profileImageUrl,
				tags: []
			},
			is_active: isActive,
			access_grants: agent?.access_grants ?? []
		};
	}

	async function handleSave() {
		if (!name.trim()) {
			toast.error($i18n.t('Name is required.'));
			return;
		}
		if (!id) {
			toast.error($i18n.t('ID is required.'));
			return;
		}
		if (!modelId) {
			toast.error($i18n.t('Pick a model for the agent.'));
			return;
		}
		if (knowledge.some((k) => k.status === 'uploading')) {
			toast.error($i18n.t('Please wait until all files are uploaded.'));
			return;
		}

		saving = true;
		try {
			await onSubmit(buildForm());
		} catch (err: any) {
			toast.error(`${err?.detail ?? err}`);
		} finally {
			saving = false;
		}
	}

	async function handleRun() {
		if (!edit || !agent?.id) {
			toast.info($i18n.t('Save the agent first to run it.'));
			return;
		}
		if (!runPrompt.trim()) {
			toast.error($i18n.t('Enter a prompt to run the agent with.'));
			return;
		}
		running = true;
		try {
			const res = await runAgentById(localStorage.token, agent.id, runPrompt);
			if (res?.chat_id) {
				goto(`/c/${res.chat_id}`);
			}
		} catch (err: any) {
			toast.error(`${err?.detail ?? err}`);
		} finally {
			running = false;
		}
	}

	onMount(async () => {
		await _tools.set(await getTools(localStorage.token));
		skillsList = (await getSkills(localStorage.token).catch(() => null)) ?? [];
		availableModels = ($_models ?? []).filter((m: any) => !m?.arena);

		if (agent) {
			id = agent.id ?? '';
			name = agent.name ?? '';
			description = agent.description ?? '';
			isActive = agent.is_active ?? true;
			profileImageUrl = agent?.meta?.profile_image_url ?? profileImageUrl;

			const d = agent.data ?? {};
			modelId = d.model_id ?? '';
			systemPrompt = d.system_prompt ?? '';
			toolIds = d.tool_ids ?? [];
			skillIds = d.skill_ids ?? [];
			knowledge = d.knowledge ?? [];

			const loop = d.agent_loop ?? {};
			maxIterations = Number(loop.max_iterations ?? 6);
			toolChoice = (loop.tool_choice as any) ?? 'auto';
			parallelToolCalls = loop.parallel_tool_calls !== false;

			graph = d.graph ?? null;
		}

		loaded = true;
	});
</script>

<svelte:head>
	<title>{name || $i18n.t('Agent')}</title>
</svelte:head>

{#if onDelete}
	<ConfirmDialog
		bind:show={showDeleteConfirm}
		title={$i18n.t('Delete agent?')}
		on:confirm={async () => {
			if (onDelete) await onDelete();
		}}
	>
		<div class="text-sm text-gray-500">
			{$i18n.t('This will permanently delete')} <span>{name}</span>.
		</div>
	</ConfirmDialog>
{/if}

{#if !loaded}
	<div class="flex justify-center py-20">
		<Spinner className="size-5" />
	</div>
{:else}
	<div class="flex items-start justify-between gap-3 mb-4">
		<div class="flex items-center gap-2 min-w-0 flex-1">
			<Tooltip content={$i18n.t('Back')}>
				<button
					class="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg"
					on:click={() => goto('/workspace/agents')}
					type="button"
					aria-label={$i18n.t('Back')}
				>
					<ChevronLeft strokeWidth="2.5" />
				</button>
			</Tooltip>
			<input
				class="text-2xl bg-transparent outline-none w-full min-w-0"
				placeholder={$i18n.t('Agent name')}
				bind:value={name}
			/>
		</div>

		<div class="flex items-center gap-1.5 shrink-0">
			<div
				class="flex p-0.5 bg-gray-100 dark:bg-gray-850 rounded-full text-xs font-medium select-none"
			>
				<button
					class="px-3 py-1 rounded-full transition {mode === 'form'
						? 'bg-white dark:bg-gray-900 shadow-sm'
						: 'text-gray-500'}"
					on:click={() => (mode = 'form')}
					type="button"
				>
					{$i18n.t('Form')}
				</button>
				<button
					class="px-3 py-1 rounded-full transition {mode === 'graph'
						? 'bg-white dark:bg-gray-900 shadow-sm'
						: 'text-gray-500'}"
					on:click={() => (mode = 'graph')}
					type="button"
				>
					{$i18n.t('Builder')}
				</button>
			</div>

			{#if edit}
				<button
					class="px-2.5 py-1 text-sm border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-850 transition rounded-full flex items-center gap-1.5"
					on:click={() => (showRunBox = !showRunBox)}
					type="button"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						class="size-3.5"
					>
						<path
							d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z"
						/>
					</svg>
					<span class="hidden md:inline">{$i18n.t('Run')}</span>
				</button>
			{/if}

			{#if onDelete && edit}
				<Tooltip content={$i18n.t('Delete')}>
					<button
						class="p-2 rounded-full hover:bg-gray-50 dark:hover:bg-gray-850 text-gray-500"
						on:click={() => (showDeleteConfirm = true)}
						type="button"
					>
						<GarbageBin />
					</button>
				</Tooltip>
			{/if}

			<button
				class="px-3 py-1 text-sm bg-black text-white dark:bg-white dark:text-black rounded-full hover:opacity-90 transition flex items-center gap-1.5"
				on:click={handleSave}
				disabled={saving}
				type="button"
			>
				{edit ? $i18n.t('Save') : $i18n.t('Create')}
				{#if saving}
					<Spinner className="size-3" />
				{/if}
			</button>
		</div>
	</div>

	{#if showRunBox && edit}
		<div
			class="mb-4 p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center gap-2"
		>
			<textarea
				class="flex-1 text-sm bg-transparent outline-none resize-none min-h-[42px]"
				placeholder={$i18n.t('Prompt for {{name}}', { name })}
				bind:value={runPrompt}
				on:keydown={(e) => {
					if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRun();
				}}
			/>
			<button
				class="px-3 py-1.5 text-sm bg-black text-white dark:bg-white dark:text-black rounded-full hover:opacity-90 transition flex items-center gap-1.5"
				on:click={handleRun}
				disabled={running}
				type="button"
			>
				{$i18n.t('Send')}
				{#if running}
					<Spinner className="size-3" />
				{/if}
			</button>
		</div>
	{/if}

	{#if mode === 'form'}
		<div class="flex flex-col md:flex-row gap-6">
			<div class="flex-1 min-w-0 space-y-4">
				<div>
					<label class="text-xs font-medium text-gray-500"
						>{$i18n.t('Description')}</label
					>
					<input
						class="w-full mt-1 text-sm bg-transparent outline-none border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2"
						bind:value={description}
						placeholder={$i18n.t('What does this agent do?')}
					/>
				</div>

				<div>
					<label class="text-xs font-medium text-gray-500"
						>{$i18n.t('System prompt')}</label
					>
					<textarea
						class="w-full mt-1 text-sm bg-transparent outline-none border border-gray-200 dark:border-gray-800 rounded-2xl px-3 py-2 min-h-[160px]"
						placeholder={$i18n.t(
							'Define the agent\'s role, goals, and constraints. The chat pipeline\'s tool-calling loop will let it use the tools you select below.'
						)}
						bind:value={systemPrompt}
					/>
				</div>

				<div class="border-t border-gray-100 dark:border-gray-850 pt-4">
					<ToolsSelector
						tools={$_tools ?? []}
						bind:selectedToolIds={toolIds}
					/>
				</div>

				<div class="border-t border-gray-100 dark:border-gray-850 pt-4">
					<SkillsSelector skills={skillsList} bind:selectedSkillIds={skillIds} />
				</div>

				<div class="border-t border-gray-100 dark:border-gray-850 pt-4">
					<label class="text-xs font-medium text-gray-500 block mb-2"
						>{$i18n.t('Knowledge')}</label
					>
					<Knowledge bind:selectedItems={knowledge} />
				</div>
			</div>

			<div class="w-full md:w-72 shrink-0 space-y-4">
				<div>
					<label class="text-xs font-medium text-gray-500">{$i18n.t('ID')}</label>
					<input
						class="w-full mt-1 text-sm font-mono bg-transparent outline-none border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 disabled:opacity-60"
						bind:value={id}
						disabled={edit && !clone}
					/>
				</div>

				<div>
					<label class="text-xs font-medium text-gray-500">{$i18n.t('Model')}</label>
					<select
						class="w-full mt-1 text-sm bg-transparent outline-none border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2"
						bind:value={modelId}
					>
						<option value="" disabled>{$i18n.t('Select a model')}</option>
						{#each availableModels as m}
							<option value={m.id}>{m.name ?? m.id}</option>
						{/each}
					</select>
				</div>

				<div class="space-y-2">
					<label class="text-xs font-medium text-gray-500"
						>{$i18n.t('Agent loop')}</label
					>
					<div class="flex items-center justify-between text-xs">
						<span class="text-gray-600 dark:text-gray-400"
							>{$i18n.t('Max iterations')}</span
						>
						<input
							class="w-16 text-right text-sm bg-transparent outline-none border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-0.5"
							type="number"
							min="1"
							max="50"
							bind:value={maxIterations}
						/>
					</div>
					<div class="flex items-center justify-between text-xs">
						<span class="text-gray-600 dark:text-gray-400">{$i18n.t('Tool choice')}</span>
						<select
							class="text-sm bg-transparent outline-none border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-0.5"
							bind:value={toolChoice}
						>
							<option value="auto">auto</option>
							<option value="required">required</option>
							<option value="none">none</option>
						</select>
					</div>
					<div class="flex items-center justify-between text-xs">
						<span class="text-gray-600 dark:text-gray-400"
							>{$i18n.t('Parallel tool calls')}</span
						>
						<input type="checkbox" bind:checked={parallelToolCalls} />
					</div>
				</div>

				<div class="space-y-2">
					<label class="text-xs font-medium text-gray-500">{$i18n.t('Status')}</label>
					<div class="flex items-center justify-between text-xs">
						<span class="text-gray-600 dark:text-gray-400">{$i18n.t('Active')}</span>
						<input type="checkbox" bind:checked={isActive} />
					</div>
				</div>

				<div class="text-[11px] text-gray-400 leading-relaxed">
					{$i18n.t(
						'Runs use the chat completion tool-calling loop. The agent emits tool_calls, the platform executes them, and feeds observations back until a final answer or max_iterations is hit.'
					)}
				</div>
			</div>
		</div>
	{:else}
		<AgentGraphEditor
			{graph}
			onChange={(g) => (graph = g)}
			height="calc(100vh - 220px)"
		/>
	{/if}
{/if}
