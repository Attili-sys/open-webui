<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { agents } from '$lib/stores';
	import { onMount, getContext } from 'svelte';

	import { createNewAgent, getAgents } from '$lib/apis/agents';
	import AgentEditor from '$lib/components/workspace/Agents/AgentEditor.svelte';

	const i18n = getContext<any>('i18n');

	let agent: any = null;
	let clone = false;

	const onSubmit = async (form: any) => {
		const res = await createNewAgent(localStorage.token, form);
		if (res) {
			toast.success($i18n.t('Agent created'));
			await agents.set(await getAgents(localStorage.token));
			await goto('/workspace/agents');
		}
	};

	onMount(() => {
		if (typeof sessionStorage !== 'undefined' && sessionStorage.agent) {
			try {
				agent = JSON.parse(sessionStorage.agent);
				clone = true;
			} catch (e) {
				agent = null;
			}
			sessionStorage.removeItem('agent');
		}
	});
</script>

{#key agent}
	<AgentEditor {agent} {onSubmit} {clone} />
{/key}
