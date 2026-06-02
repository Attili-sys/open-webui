import { WEBUI_API_BASE_URL } from '$lib/constants';

export type AgentGraphNode = {
	id: string;
	type: string;
	position?: { x: number; y: number };
	data?: Record<string, any>;
	[key: string]: any;
};

export type AgentGraphEdge = {
	id: string;
	source: string;
	target: string;
	sourceHandle?: string | null;
	targetHandle?: string | null;
	label?: string;
	[key: string]: any;
};

export type AgentGraph = {
	nodes: AgentGraphNode[];
	edges: AgentGraphEdge[];
};

export type AgentLoopConfig = {
	max_iterations?: number;
	tool_choice?: 'auto' | 'required' | 'none';
	parallel_tool_calls?: boolean;
	[key: string]: any;
};

export type AgentData = {
	model_id: string;
	system_prompt?: string;
	tool_ids?: string[];
	skill_ids?: string[];
	knowledge?: any[];
	params?: Record<string, any>;
	agent_loop?: AgentLoopConfig;
	suggestion_prompts?: { content: string }[];
	graph?: AgentGraph | null;
};

export type AgentForm = {
	id: string;
	name: string;
	description?: string;
	data: AgentData;
	meta?: {
		profile_image_url?: string;
		tags?: { name: string }[];
		[key: string]: any;
	};
	is_active?: boolean;
	access_grants?: any[];
};

export type AgentResponse = AgentForm & {
	user_id: string;
	created_at: number;
	updated_at: number;
	write_access?: boolean;
	user?: any;
};

type ListResponse = {
	items: AgentResponse[];
	total: number;
};

const headers = (token: string) => ({
	Accept: 'application/json',
	'Content-Type': 'application/json',
	authorization: `Bearer ${token}`
});

const handle = async (res: Response) => {
	if (!res.ok) {
		throw await res.json();
	}
	return res.json();
};

export const getAgents = async (token: string = ''): Promise<AgentResponse[]> => {
	const res = await fetch(`${WEBUI_API_BASE_URL}/agents/`, {
		method: 'GET',
		headers: headers(token)
	})
		.then(handle)
		.catch((err) => {
			console.error(err);
			throw err?.detail ?? err;
		});
	return res ?? [];
};

export const getAgentItems = async (
	token: string,
	query: string | null = null,
	viewOption: string | null = null,
	page: number | null = null
): Promise<ListResponse> => {
	const params = new URLSearchParams();
	if (query) params.append('query', query);
	if (viewOption) params.append('view_option', viewOption);
	if (page) params.append('page', String(page));

	return fetch(`${WEBUI_API_BASE_URL}/agents/list?${params.toString()}`, {
		method: 'GET',
		headers: headers(token)
	})
		.then(handle)
		.catch((err) => {
			console.error(err);
			throw err?.detail ?? err;
		});
};

export const createNewAgent = async (token: string, agent: AgentForm): Promise<AgentResponse> => {
	return fetch(`${WEBUI_API_BASE_URL}/agents/create`, {
		method: 'POST',
		headers: headers(token),
		body: JSON.stringify(agent)
	})
		.then(handle)
		.catch((err) => {
			console.error(err);
			throw err?.detail ?? err;
		});
};

export const getAgentById = async (token: string, id: string): Promise<AgentResponse> => {
	return fetch(`${WEBUI_API_BASE_URL}/agents/id/${id}`, {
		method: 'GET',
		headers: headers(token)
	})
		.then(handle)
		.catch((err) => {
			console.error(err);
			throw err?.detail ?? err;
		});
};

export const updateAgentById = async (
	token: string,
	id: string,
	agent: AgentForm
): Promise<AgentResponse> => {
	return fetch(`${WEBUI_API_BASE_URL}/agents/id/${id}/update`, {
		method: 'POST',
		headers: headers(token),
		body: JSON.stringify(agent)
	})
		.then(handle)
		.catch((err) => {
			console.error(err);
			throw err?.detail ?? err;
		});
};

export const updateAgentAccessGrants = async (
	token: string,
	id: string,
	accessGrants: any[]
) => {
	return fetch(`${WEBUI_API_BASE_URL}/agents/id/${id}/access/update`, {
		method: 'POST',
		headers: headers(token),
		body: JSON.stringify({ access_grants: accessGrants })
	})
		.then(handle)
		.catch((err) => {
			console.error(err);
			throw err?.detail ?? err;
		});
};

export const toggleAgentById = async (token: string, id: string): Promise<AgentResponse> => {
	return fetch(`${WEBUI_API_BASE_URL}/agents/id/${id}/toggle`, {
		method: 'POST',
		headers: headers(token)
	})
		.then(handle)
		.catch((err) => {
			console.error(err);
			throw err?.detail ?? err;
		});
};

export const deleteAgentById = async (token: string, id: string): Promise<boolean> => {
	return fetch(`${WEBUI_API_BASE_URL}/agents/id/${id}/delete`, {
		method: 'DELETE',
		headers: headers(token)
	})
		.then(handle)
		.catch((err) => {
			console.error(err);
			throw err?.detail ?? err;
		});
};

export const runAgentById = async (
	token: string,
	id: string,
	prompt: string,
	chatTitle?: string
): Promise<{ chat_id: string; agent_id: string }> => {
	return fetch(`${WEBUI_API_BASE_URL}/agents/id/${id}/run`, {
		method: 'POST',
		headers: headers(token),
		body: JSON.stringify({ prompt, chat_title: chatTitle })
	})
		.then(handle)
		.catch((err) => {
			console.error(err);
			throw err?.detail ?? err;
		});
};
