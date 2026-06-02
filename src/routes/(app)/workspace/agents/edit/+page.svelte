<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { agents } from '$lib/stores';
	import { onMount, getContext } from 'svelte';
	import { page } from '$app/stores';

	import {
		getAgentById,
		getAgents,
		updateAgentById,
		deleteAgentById
	} from '$lib/apis/agents';
	import AgentEditor from '$lib/components/workspace/Agents/AgentEditor.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';

	const i18n = getContext<any>('i18n');

	let agent: any = null;
	let loaded = false;

	const onSubmit = async (form: any) => {
		const res = await updateAgentById(localStorage.token, agent.id, form);
		if (res) {
			toast.success($i18n.t('Agent saved'));
			await agents.set(await getAgents(localStorage.token));
		}
	};

	const onDelete = async () => {
		const ok = await deleteAgentById(localStorage.token, agent.id).catch((err) => {
			toast.error(`${err?.detail ?? err}`);
			return false;
		});
		if (ok) {
			toast.success($i18n.t('Agent deleted'));
			await agents.set(await getAgents(localStorage.token));
			await goto('/workspace/agents');
		}
	};

	onMount(async () => {
		const id = $page.url.searchParams.get('id');
		if (!id) {
			toast.error($i18n.t('Missing agent id.'));
			goto('/workspace/agents');
			return;
		}
		try {
			agent = await getAgentById(localStorage.token, id);
		} catch (err: any) {
			toast.error(`${err?.detail ?? err}`);
			goto('/workspace/agents');
			return;
		}
		loaded = true;
	});
</script>

{#if loaded && agent}
	<AgentEditor {agent} edit {onSubmit} {onDelete} />
{:else}
	<div class="flex justify-center py-20">
		<Spinner className="size-5" />
	</div>
{/if}
