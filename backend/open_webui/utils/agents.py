"""Agent runtime utilities.

This module is intentionally thin: an Agent is just a saved bundle of
(model_id, system_prompt, tool_ids, skill_ids, knowledge, params,
agent_loop). Execution is delegated to the existing chat completion
pipeline (`app.state.CHAT_COMPLETION_HANDLER`), which already implements
the canonical tool-calling / ReAct loop — every iteration the model can
emit `tool_calls`, the middleware executes them and feeds the
observations back in, until the model returns a final assistant message
or the iteration ceiling is hit.

The flow here mirrors `utils/automations.execute_automation` so behaviour
is consistent across "things that run a chat for you" (automations,
agents): create a real Chat with the right metadata, emit a refresh
event to the user's socket room, then call the chat completion handler
with the same shape the frontend would have sent.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional
from uuid import uuid4

from fastapi import Request
from open_webui.models.agents import AgentModel
from open_webui.models.chats import ChatForm, Chats
from open_webui.models.users import UserModel
from starlette.datastructures import Headers

log = logging.getLogger(__name__)


def _build_request(app) -> Request:
    """Build a minimal in-process ASGI Request for chat_completion.

    Mirrors the helper used in utils/automations.execute_automation —
    we need a real Request because the chat pipeline reads from
    request.state and request.app.
    """
    scope = {
        'type': 'http',
        'asgi': {'version': '3.0', 'spec_version': '2.0'},
        'method': 'POST',
        'path': '/api/v1/agents/internal',
        'query_string': b'',
        'headers': Headers({}).raw,
        'client': ('127.0.0.1', 0),
        'server': ('127.0.0.1', 80),
        'scheme': 'http',
        'app': app,
    }
    request = Request(scope)
    request.state.token = None
    request.state.enable_api_keys = False
    return request


def build_agent_form_data(
    agent: AgentModel,
    prompt: str,
    chat_id: str,
    assistant_msg_id: str,
    user_msg_id: str,
) -> dict[str, Any]:
    """Translate an Agent + user prompt into the chat completion payload.

    The chat completion pipeline expects the same shape the frontend
    sends to /api/chat/completions. We hoist the agent's bound
    tools/skills/knowledge/system prompt/params onto that payload so the
    pipeline's existing tool-calling loop drives the agent.
    """
    data = agent.data or {}
    params = dict(data.get('params') or {})
    if data.get('system_prompt'):
        # System prompt lives on params (same convention as workspace
        # models — see ModelEditor.svelte → params.system).
        params.setdefault('system', data['system_prompt'])

    agent_loop = dict(data.get('agent_loop') or {})

    form_data: dict[str, Any] = {
        'model': data.get('model_id'),
        'messages': [{'role': 'user', 'content': prompt}],
        'stream': True,
        'chat_id': chat_id,
        'id': assistant_msg_id,
        'parent_id': None,
        'user_message': {
            'id': user_msg_id,
            'parentId': None,
            'role': 'user',
            'content': prompt,
        },
        'session_id': f'agent:{agent.id}',
        'background_tasks': {},
        'metadata': {
            'agent_id': agent.id,
            'agent_loop': agent_loop,
        },
    }

    if params:
        form_data['params'] = params

    tool_ids = list(data.get('tool_ids') or [])
    if tool_ids:
        form_data['tool_ids'] = tool_ids

    skill_ids = list(data.get('skill_ids') or [])
    if skill_ids:
        form_data['skill_ids'] = skill_ids

    knowledge = data.get('knowledge') or []
    files: list[dict] = []
    for entry in knowledge:
        # Knowledge entries are stored in the same shape as Models do
        # (cf. ModelEditor.svelte's Knowledge component). Each entry
        # has either `type: 'collection'` or `type: 'file'` plus id.
        if isinstance(entry, dict) and entry.get('id'):
            files.append(entry)
    if files:
        form_data['files'] = files

    return form_data


async def start_agent_chat(
    agent: AgentModel,
    user: UserModel,
    prompt: str,
    chat_title: Optional[str] = None,
) -> Optional[tuple[str, str, str]]:
    """Create the chat row for an agent run.

    Returns (chat_id, user_msg_id, assistant_msg_id) on success or None
    if no model is bound. Splitting this from the actual streaming call
    lets the HTTP endpoint return a chat_id to the client immediately
    while the LLM streams in the background.
    """
    data = agent.data or {}
    model_id = data.get('model_id')
    if not model_id:
        log.warning(f'Agent {agent.id} has no model_id, skipping execution')
        return None

    user_msg_id = str(uuid4())
    assistant_msg_id = str(uuid4())
    chat_id = str(uuid4())

    chat = await Chats.insert_new_chat(
        chat_id,
        user.id,
        ChatForm(
            chat={
                'title': chat_title or agent.name,
                'models': [model_id],
                'history': {
                    'currentId': assistant_msg_id,
                    'messages': {
                        user_msg_id: {
                            'id': user_msg_id,
                            'parentId': None,
                            'role': 'user',
                            'content': prompt,
                            'childrenIds': [assistant_msg_id],
                            'timestamp': int(time.time()),
                            'models': [model_id],
                        },
                        assistant_msg_id: {
                            'id': assistant_msg_id,
                            'parentId': user_msg_id,
                            'role': 'assistant',
                            'content': '',
                            'done': False,
                            'model': model_id,
                            'childrenIds': [],
                            'timestamp': int(time.time()),
                        },
                    },
                },
                'messages': [{'role': 'user', 'content': prompt}],
                'meta': {'agent_id': agent.id},
            }
        ),
    )

    if not chat:
        log.error(f'Agent {agent.id}: failed to insert chat row')
        return None

    try:
        from open_webui.socket.main import sio

        await sio.emit(
            'events',
            {
                'chat_id': chat.id,
                'message_id': user_msg_id,
                'data': {'type': 'chat:list'},
            },
            room=f'user:{user.id}',
        )
    except Exception:
        log.debug('Agent socket emit failed (non-fatal)', exc_info=True)

    return chat.id, user_msg_id, assistant_msg_id


async def run_agent_completion(
    app,
    agent: AgentModel,
    user: UserModel,
    prompt: str,
    chat_id: str,
    user_msg_id: str,
    assistant_msg_id: str,
) -> None:
    """Drive the chat completion pipeline for an in-flight agent chat.

    Assumes start_agent_chat has already created the chat row. This is
    the bit that can be safely scheduled as a background task so the
    /run HTTP request can return immediately with the chat_id.
    """
    if app.state.CHAT_COMPLETION_HANDLER is None:
        log.error('Agent execution: CHAT_COMPLETION_HANDLER not configured')
        return

    form_data = build_agent_form_data(agent, prompt, chat_id, assistant_msg_id, user_msg_id)
    request = _build_request(app)
    try:
        await app.state.CHAT_COMPLETION_HANDLER(request, form_data, user=user)
    except Exception:
        log.exception(f'Agent {agent.id} execution failed')


async def execute_agent(
    app,
    agent: AgentModel,
    user: UserModel,
    prompt: str,
    chat_title: Optional[str] = None,
) -> Optional[str]:
    """End-to-end agent run: create the chat AND drive completion to finish.

    Convenience wrapper used by callers that don't need to interleave
    chat creation and streaming (e.g. server-side automations chaining
    an agent step). Returns the new chat id.
    """
    started = await start_agent_chat(agent, user, prompt, chat_title)
    if started is None:
        return None
    chat_id, user_msg_id, assistant_msg_id = started
    await run_agent_completion(app, agent, user, prompt, chat_id, user_msg_id, assistant_msg_id)
    return chat_id
