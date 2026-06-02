<script lang="ts">
	import { toast } from 'svelte-sonner';
	import fileSaver from 'file-saver';
	const { saveAs } = fileSaver;

	import { onMount, getContext, tick, onDestroy } from 'svelte';
	const i18n = getContext('i18n');

	import { WEBUI_NAME, user, agents as _agents } from '$lib/stores';
	import { goto } from '$app/navigation';
	import {
		getAgents,
		getAgentById,
		getAgentItems,
		createNewAgent,
		deleteAgentById,
		toggleAgentById,
		runAgentById
	} from '$lib/apis/agents';
	import { capitalizeFirstLetter } from '$lib/utils';

	import Tooltip from '../common/Tooltip.svelte';
	import DeleteConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
	import EllipsisHorizontal from '../icons/EllipsisHorizontal.svelte';
	import GarbageBin from '../icons/GarbageBin.svelte';
	import Search from '../icons/Search.svelte';
	import Plus from '../icons/Plus.svelte';
	import XMark from '../icons/XMark.svelte';
	import Spinner from '../common/Spinner.svelte';
	import ViewSelector from './common/ViewSelector.svelte';
	import Badge from '$lib/components/common/Badge.svelte';
	import Switch from '../common/Switch.svelte';
	import AgentMenu from './Agents/AgentMenu.svelte';
	import Pagination from '../common/Pagination.svelte';

	let shiftKey = false;
	let loaded = false;

	let importFiles: FileList | null = null;
	let importInputElement: HTMLInputElement;

	let query = '';
	let searchDebounceTimer: ReturnType<typeof setTimeout>;

	let selectedAgent: any = null;
	let showDeleteConfirm = false;

	let filteredItems: any[] | null = null;
	let total: number | null = null;
	let loading = false;

	let viewOption = '';
	let page = 1;

	const loadAgentItems = async () => {
		if (!loaded) return;

		loading = true;
		try {
			const res = await getAgentItems(localStorage.token, query, viewOption, page).catch(
				(error) => {
					toast.error(`${error}`);
					return null;
				}
			);

			if (res) {
				filteredItems = res.items;
				total = res.total;
			}
		} catch (err) {
			console.error(err);
		} finally {
			loading = false;
		}
	};

	$: if (query !== undefined) {
		loading = true;
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			page = 1;
			loadAgentItems();
		}, 300);
	}

	$: if (page && viewOption !== undefined) {
		loadAgentItems();
	}

	const cloneHandler = async (agent: any) => {
		const fresh = await getAgentById(localStorage.token, agent.id).catch((error) => {
			toast.error(`${error}`);
			return null;
		});

		if (fresh) {
			sessionStorage.agent = JSON.stringify({
				...fresh,
				id: `${fresh.id}-clone`,
				name: `${fresh.name} (Clone)`
			});
			goto('/workspace/agents/create');
		}
	};

	const deleteHandler = async (agent: any) => {
		const res = await deleteAgentById(localStorage.token, agent.id).catch((error) => {
			toast.error(`${error}`);
			return null;
		});

		if (res) {
			toast.success($i18n.t('Agent deleted'));
		}

		page = 1;
		loadAgentItems();
		await _agents.set(await getAgents(localStorage.token));
	};

	const runHandler = async (agent: any) => {
		// Quick-launch: ask for a prompt and pipe straight into the agent.
		const prompt = window.prompt($i18n.t('Prompt for {{name}}', { name: agent.name }) ?? agent.name);
		if (!prompt) return;
		try {
			const res = await runAgentById(localStorage.token, agent.id, prompt);
			if (res?.chat_id) {
				goto(`/c/${res.chat_id}`);
			}
		} catch (error: any) {
			toast.error(`${error?.detail ?? error}`);
		}
	};

	onMount(async () => {
		viewOption = (localStorage?.workspaceViewOption as string) || '';
		loaded = true;

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Shift') shiftKey = true;
		};
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.key === 'Shift') shiftKey = false;
		};
		const onBlur = () => (shiftKey = false);

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('blur', onBlur);

		return () => {
			clearTimeout(searchDebounceTimer);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('blur', onBlur);
		};
	});

	onDestroy(() => {
		clearTimeout(searchDebounceTimer);
	});
</script>

<svelte:head>
	<title>{$i18n.t('Agents')} • {$WEBUI_NAME}</title>
</svelte:head>

<DeleteConfirmDialog
	bind:show={showDeleteConfirm}
	title={$i18n.t('Delete agent?')}
	on:confirm={() => {
		if (selectedAgent) deleteHandler(selectedAgent);
		selectedAgent = null;
	}}
>
	<div class="text-sm text-gray-500">
		{$i18n.t('This will delete')} <span>{selectedAgent?.name}</span>.
	</div>
</DeleteConfirmDialog>

{#if loaded}
	<div class="flex flex-col gap-1 px-1 mt-1.5 mb-3">
		<div class="flex justify-between items-center">
			<div class="flex items-center md:self-center text-xl font-medium px-0.5 gap-2 shrink-0">
				<div>{$i18n.t('Agents')}</div>
				<div class="text-lg font-medium text-gray-500 dark:text-gray-500">
					{total ?? ''}
				</div>
			</div>

			<div class="flex w-full justify-end gap-1.5">
				<input
					bind:this={importInputElement}
					bind:files={importFiles}
					type="file"
					accept=".json"
					hidden
					on:change={() => {
						if (importFiles && importFiles.length > 0) {
							const reader = new FileReader();
							reader.onload = async (event) => {
								try {
									const content = event.target?.result;
									if (typeof content !== 'string') return;
									const parsed = JSON.parse(content);
									const items = Array.isArray(parsed) ? parsed : [parsed];
									for (const item of items) {
										await createNewAgent(localStorage.token, item).catch((error) => {
											toast.error(`${error}`);
										});
									}
									toast.success($i18n.t('Agent imported'));
									page = 1;
									loadAgentItems();
									_agents.set(await getAgents(localStorage.token));
								} catch (e) {
									toast.error($i18n.t('Invalid JSON file'));
								}
							};
							reader.readAsText(importFiles[0]);
							importInputElement.value = '';
						}
					}}
				/>

				{#if $user?.role === 'admin' || $user?.permissions?.workspace?.agents}
					<button
						class="flex text-xs items-center space-x-1 px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 dark:bg-gray-850 dark:hover:bg-gray-800 dark:text-gray-200 transition"
						on:click={() => importInputElement.click()}
					>
						<div class="self-center font-medium line-clamp-1">{$i18n.t('Import')}</div>
					</button>
				{/if}

				{#if total && ($user?.role === 'admin' || $user?.permissions?.workspace?.agents)}
					<button
						class="flex text-xs items-center space-x-1 px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 dark:bg-gray-850 dark:hover:bg-gray-800 dark:text-gray-200 transition"
						on:click={async () => {
							const list = await getAgents(localStorage.token).catch((error) => {
								toast.error(`${error}`);
								return null;
							});
							if (list) {
								const blob = new Blob([JSON.stringify(list)], {
									type: 'application/json'
								});
								saveAs(blob, `agents-export-${Date.now()}.json`);
							}
						}}
					>
						<div class="self-center font-medium line-clamp-1">{$i18n.t('Export')}</div>
					</button>
				{/if}

				{#if $user?.role === 'admin' || $user?.permissions?.workspace?.agents}
					<a
						class="px-2 py-1.5 rounded-xl bg-black text-white dark:bg-white dark:text-black transition font-medium text-sm flex items-center"
						href="/workspace/agents/create"
					>
						<Plus className="size-3" strokeWidth="2.5" />
						<div class="hidden md:block md:ml-1 text-xs">{$i18n.t('New Agent')}</div>
					</a>
				{/if}
			</div>
		</div>
	</div>

	<div
		class="py-2 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100/30 dark:border-gray-850/30"
	>
		<div class="flex w-full space-x-2 py-0.5 px-3.5 pb-2">
			<div class="flex flex-1">
				<div class="self-center ml-1 mr-3">
					<Search className="size-3.5" />
				</div>
				<input
					class="w-full text-sm pr-4 py-1 rounded-r-xl outline-hidden bg-transparent"
					bind:value={query}
					aria-label={$i18n.t('Search Agents')}
					placeholder={$i18n.t('Search Agents')}
				/>
				{#if query}
					<div class="self-center pl-1.5 translate-y-[0.5px] rounded-l-xl bg-transparent">
						<button
							class="p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-900 transition"
							aria-label={$i18n.t('Clear search')}
							on:click={() => (query = '')}
						>
							<XMark className="size-3" strokeWidth="2" />
						</button>
					</div>
				{/if}
			</div>
		</div>

		<div class="px-3 flex w-full bg-transparent overflow-x-auto scrollbar-none -mx-1">
			<div
				class="flex gap-0.5 w-fit text-center text-sm rounded-full bg-transparent px-1.5 whitespace-nowrap"
			>
				<ViewSelector
					bind:value={viewOption}
					onChange={async (value) => {
						localStorage.workspaceViewOption = value;
						page = 1;
						await tick();
					}}
				/>
			</div>
		</div>

		{#if filteredItems === null || loading}
			<div class="w-full h-full flex justify-center items-center my-16 mb-24">
				<Spinner className="size-5" />
			</div>
		{:else if (filteredItems ?? []).length !== 0}
			<div class="my-2 gap-2 grid px-3 lg:grid-cols-2">
				{#each filteredItems as agent}
					<Tooltip content={agent?.description ?? agent?.id}>
						<div
							class="flex space-x-4 text-left w-full px-3 py-2.5 transition rounded-2xl {agent.write_access
								? 'cursor-pointer dark:hover:bg-gray-850/50 hover:bg-gray-50'
								: 'cursor-not-allowed opacity-60'}"
						>
							{#if agent.write_access}
								<a
									class="flex flex-1 space-x-3.5 cursor-pointer w-full"
									href={`/workspace/agents/edit?id=${encodeURIComponent(agent.id)}`}
								>
									<div class="flex items-center text-left">
										<div class="flex-1 self-center">
											<Tooltip content={agent.id} placement="top-start">
												<div class="flex items-center gap-2">
													<div class="line-clamp-1 text-sm">{agent.name}</div>
													{#if !agent.is_active}
														<Badge type="muted" content={$i18n.t('Inactive')} />
													{/if}
													{#if agent?.data?.graph?.nodes?.length}
														<Badge type="info" content={$i18n.t('Flow')} />
													{/if}
												</div>
											</Tooltip>
											<div class="px-0.5">
												<div class="text-xs text-gray-500 shrink-0">
													<Tooltip
														content={agent?.user?.email ?? $i18n.t('Deleted User')}
														className="flex shrink-0"
														placement="top-start"
													>
														{$i18n.t('By {{name}}', {
															name: capitalizeFirstLetter(
																agent?.user?.name ??
																	agent?.user?.email ??
																	$i18n.t('Deleted User')
															)
														})}
													</Tooltip>
												</div>
											</div>
										</div>
									</div>
								</a>
							{:else}
								<div class="flex flex-1 space-x-3.5 w-full">
									<div class="flex items-center text-left w-full">
										<div class="flex-1 self-center w-full">
											<div class="flex items-center justify-between w-full gap-2">
												<Tooltip content={agent.id} placement="top-start">
													<div class="flex items-center gap-2">
														<div class="line-clamp-1 text-sm">{agent.name}</div>
														{#if !agent.is_active}
															<Badge type="muted" content={$i18n.t('Inactive')} />
														{/if}
													</div>
												</Tooltip>
												<Badge type="muted" content={$i18n.t('Read Only')} />
											</div>
										</div>
									</div>
								</div>
							{/if}

							<div class="flex flex-row gap-0.5 self-center">
								<Tooltip content={$i18n.t('Run agent')}>
									<button
										class="self-center w-fit text-sm p-1.5 dark:text-gray-300 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-xl"
										type="button"
										aria-label={$i18n.t('Run agent')}
										on:click={() => runHandler(agent)}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="size-4"
										>
											<path
												d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z"
											/>
										</svg>
									</button>
								</Tooltip>

								{#if agent.write_access}
									{#if shiftKey}
										<Tooltip content={$i18n.t('Delete')}>
											<button
												class="self-center w-fit text-sm px-2 py-2 dark:text-gray-300 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-xl"
												type="button"
												aria-label={$i18n.t('Delete')}
												on:click={() => deleteHandler(agent)}
											>
												<GarbageBin />
											</button>
										</Tooltip>
									{:else}
										<AgentMenu
											editHandler={() =>
												goto(`/workspace/agents/edit?id=${encodeURIComponent(agent.id)}`)}
											cloneHandler={() => cloneHandler(agent)}
											deleteHandler={async () => {
												selectedAgent = agent;
												showDeleteConfirm = true;
											}}
											onClose={() => {}}
										>
											<button
												class="self-center w-fit text-sm p-1.5 dark:text-gray-300 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-xl"
												type="button"
											>
												<EllipsisHorizontal className="size-5" />
											</button>
										</AgentMenu>
									{/if}

									<button on:click|stopPropagation|preventDefault>
										<Tooltip content={agent.is_active ? $i18n.t('Enabled') : $i18n.t('Disabled')}>
											<Switch
												bind:state={agent.is_active}
												on:change={async () => {
													toggleAgentById(localStorage.token, agent.id);
												}}
											/>
										</Tooltip>
									</button>
								{/if}
							</div>
						</div>
					</Tooltip>
				{/each}
			</div>

			{#if total > 30}
				<div class="flex justify-center mt-4 mb-2">
					<Pagination bind:page count={total} perPage={30} />
				</div>
			{/if}
		{:else}
			<div class="w-full h-full flex flex-col justify-center items-center my-16 mb-24">
				<div class="max-w-md text-center">
					<div class="text-3xl mb-3">🤖</div>
					<div class="text-lg font-medium mb-1">{$i18n.t('No agents yet')}</div>
					<div class="text-gray-500 text-center text-xs">
						{$i18n.t('Build a visual, tool-using agent in the workspace.')}
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}
