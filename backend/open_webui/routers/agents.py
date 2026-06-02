"""HTTP API for workspace Agents.

The shape of every endpoint mirrors `routers/skills.py` so admins and
front-end developers don't have to learn two different conventions.
The /run endpoint is the only thing that is agent-specific: it kicks
off the chat completion pipeline with the agent's bound tools, and
returns the new chat_id so the UI can navigate the user into a live
streaming conversation.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from open_webui.config import BYPASS_ADMIN_ACCESS_CONTROL
from open_webui.constants import ERROR_MESSAGES
from open_webui.internal.db import get_async_session
from open_webui.models.access_grants import AccessGrants
from open_webui.models.agents import (
    AgentAccessListResponse,
    AgentAccessResponse,
    AgentForm,
    AgentModel,
    AgentResponse,
    Agents,
    AgentUserResponse,
)
from open_webui.models.groups import Groups
from open_webui.models.users import Users
from open_webui.utils.access_control import filter_allowed_access_grants, has_permission
from open_webui.utils.agents import run_agent_completion, start_agent_chat
from open_webui.utils.auth import get_verified_user
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

PAGE_ITEM_COUNT = 30

router = APIRouter()


############################
# Helpers
############################


async def _check_agents_permission(request: Request, user) -> None:
    """Gate /list /create on the workspace.agents permission (admins bypass)."""
    if user.role == 'admin':
        return
    if not await has_permission(
        user.id, 'workspace.agents', request.app.state.config.USER_PERMISSIONS
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ERROR_MESSAGES.UNAUTHORIZED,
        )


async def _check_write(agent: AgentModel, user, db) -> None:
    if (
        agent.user_id != user.id
        and user.role != 'admin'
        and not await AccessGrants.has_access(
            user_id=user.id,
            resource_type='agent',
            resource_id=agent.id,
            permission='write',
            db=db,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ERROR_MESSAGES.UNAUTHORIZED,
        )


############################
# GetAgents (full list, used to populate stores)
############################


@router.get('/', response_model=list[AgentUserResponse])
async def get_agents(
    request: Request,
    user=Depends(get_verified_user),
    db: AsyncSession = Depends(get_async_session),
):
    if user.role == 'admin' and BYPASS_ADMIN_ACCESS_CONTROL:
        return await Agents.get_agents(db=db)

    user_group_ids = {g.id for g in await Groups.get_groups_by_member_id(user.id, db=db)}
    all_agents = await Agents.get_agents(db=db)
    return [
        a
        for a in all_agents
        if a.user_id == user.id
        or await AccessGrants.has_access(
            user_id=user.id,
            resource_type='agent',
            resource_id=a.id,
            permission='read',
            user_group_ids=user_group_ids,
            db=db,
        )
    ]


############################
# GetAgentList (paginated, with write_access)
############################


@router.get('/list', response_model=AgentAccessListResponse)
async def get_agent_list(
    query: Optional[str] = None,
    view_option: Optional[str] = None,
    page: Optional[int] = 1,
    user=Depends(get_verified_user),
    db: AsyncSession = Depends(get_async_session),
):
    limit = PAGE_ITEM_COUNT
    page = max(1, page or 1)
    skip = (page - 1) * limit

    filter: dict = {}
    if query:
        filter['query'] = query
    if view_option:
        filter['view_option'] = view_option

    if not (user.role == 'admin' and BYPASS_ADMIN_ACCESS_CONTROL):
        groups = await Groups.get_groups_by_member_id(user.id, db=db)
        if groups:
            filter['group_ids'] = [g.id for g in groups]
        filter['user_id'] = user.id

    result = await Agents.search_agents(user.id, filter=filter, skip=skip, limit=limit, db=db)

    items = []
    for agent in result.items:
        write_access = (
            (user.role == 'admin' and BYPASS_ADMIN_ACCESS_CONTROL)
            or user.id == agent.user_id
            or await AccessGrants.has_access(
                user_id=user.id,
                resource_type='agent',
                resource_id=agent.id,
                permission='write',
                db=db,
            )
        )
        items.append(AgentAccessResponse(**agent.model_dump(), write_access=write_access))

    return AgentAccessListResponse(items=items, total=result.total)


############################
# CreateAgent
############################


@router.post('/create', response_model=Optional[AgentResponse])
async def create_new_agent(
    request: Request,
    form_data: AgentForm,
    user=Depends(get_verified_user),
    db: AsyncSession = Depends(get_async_session),
):
    await _check_agents_permission(request, user)

    form_data.id = (form_data.id or '').strip().lower().replace(' ', '-')
    if not form_data.id:
        from uuid import uuid4

        form_data.id = str(uuid4())

    existing = await Agents.get_agent_by_id(form_data.id, db=db)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ERROR_MESSAGES.ID_TAKEN,
        )

    form_data.access_grants = await filter_allowed_access_grants(
        request.app.state.config.USER_PERMISSIONS,
        user.id,
        user.role,
        form_data.access_grants,
        'sharing.public_agents',
    )

    agent = await Agents.insert_new_agent(user.id, form_data, db=db)
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ERROR_MESSAGES.DEFAULT('Error creating agent'),
        )
    return agent


############################
# GetAgentById
############################


@router.get('/id/{id}', response_model=Optional[AgentAccessResponse])
async def get_agent_by_id(
    id: str,
    user=Depends(get_verified_user),
    db: AsyncSession = Depends(get_async_session),
):
    agent = await Agents.get_agent_by_id(id, db=db)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    if not (
        user.role == 'admin'
        or agent.user_id == user.id
        or await AccessGrants.has_access(
            user_id=user.id,
            resource_type='agent',
            resource_id=agent.id,
            permission='read',
            db=db,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ERROR_MESSAGES.ACCESS_PROHIBITED,
        )

    write_access = (
        (user.role == 'admin' and BYPASS_ADMIN_ACCESS_CONTROL)
        or user.id == agent.user_id
        or await AccessGrants.has_access(
            user_id=user.id,
            resource_type='agent',
            resource_id=agent.id,
            permission='write',
            db=db,
        )
    )
    return AgentAccessResponse(**agent.model_dump(), write_access=write_access)


############################
# UpdateAgentById
############################


@router.post('/id/{id}/update', response_model=Optional[AgentModel])
async def update_agent_by_id(
    request: Request,
    id: str,
    form_data: AgentForm,
    user=Depends(get_verified_user),
    db: AsyncSession = Depends(get_async_session),
):
    agent = await Agents.get_agent_by_id(id, db=db)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    await _check_write(agent, user, db)

    form_data.access_grants = await filter_allowed_access_grants(
        request.app.state.config.USER_PERMISSIONS,
        user.id,
        user.role,
        form_data.access_grants,
        'sharing.public_agents',
    )

    payload = {
        'name': form_data.name,
        'description': form_data.description,
        'data': form_data.data.model_dump(),
        'meta': form_data.meta.model_dump() if form_data.meta else {},
        'is_active': form_data.is_active,
        'access_grants': form_data.access_grants,
    }
    updated = await Agents.update_agent_by_id(id, payload, db=db)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ERROR_MESSAGES.DEFAULT('Error updating agent'),
        )
    return updated


############################
# UpdateAgentAccessById
############################


class AgentAccessGrantsForm(BaseModel):
    access_grants: list[dict]


@router.post('/id/{id}/access/update', response_model=Optional[AgentModel])
async def update_agent_access_by_id(
    request: Request,
    id: str,
    form_data: AgentAccessGrantsForm,
    user=Depends(get_verified_user),
    db: AsyncSession = Depends(get_async_session),
):
    agent = await Agents.get_agent_by_id(id, db=db)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    await _check_write(agent, user, db)

    form_data.access_grants = await filter_allowed_access_grants(
        request.app.state.config.USER_PERMISSIONS,
        user.id,
        user.role,
        form_data.access_grants,
        'sharing.public_agents',
    )

    await AccessGrants.set_access_grants('agent', id, form_data.access_grants, db=db)
    return await Agents.get_agent_by_id(id, db=db)


############################
# ToggleAgentById
############################


@router.post('/id/{id}/toggle', response_model=Optional[AgentModel])
async def toggle_agent_by_id(
    id: str,
    user=Depends(get_verified_user),
    db: AsyncSession = Depends(get_async_session),
):
    agent = await Agents.get_agent_by_id(id, db=db)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )
    await _check_write(agent, user, db)

    updated = await Agents.toggle_agent_by_id(id, db=db)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ERROR_MESSAGES.DEFAULT('Error toggling agent'),
        )
    return updated


############################
# DeleteAgentById
############################


@router.delete('/id/{id}/delete', response_model=bool)
async def delete_agent_by_id(
    id: str,
    user=Depends(get_verified_user),
    db: AsyncSession = Depends(get_async_session),
):
    agent = await Agents.get_agent_by_id(id, db=db)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )
    await _check_write(agent, user, db)
    return await Agents.delete_agent_by_id(id, db=db)


############################
# RunAgent
############################


class AgentRunForm(BaseModel):
    prompt: str
    chat_title: Optional[str] = None


@router.post('/id/{id}/run')
async def run_agent_by_id(
    request: Request,
    id: str,
    form_data: AgentRunForm,
    user=Depends(get_verified_user),
    db: AsyncSession = Depends(get_async_session),
):
    agent = await Agents.get_agent_by_id(id, db=db)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ERROR_MESSAGES.NOT_FOUND,
        )

    # Run requires read access (anyone who can see the agent can run it).
    if not (
        user.role == 'admin'
        or agent.user_id == user.id
        or await AccessGrants.has_access(
            user_id=user.id,
            resource_type='agent',
            resource_id=agent.id,
            permission='read',
            db=db,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ERROR_MESSAGES.ACCESS_PROHIBITED,
        )

    if not agent.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ERROR_MESSAGES.DEFAULT('Agent is paused'),
        )

    prompt = (form_data.prompt or '').strip()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ERROR_MESSAGES.DEFAULT('Prompt is required'),
        )

    # Re-load the user so we have a full UserModel (including settings /
    # timezone) for downstream pipeline filters that read them.
    full_user = await Users.get_user_by_id(user.id)

    # Create the chat synchronously so we can return chat_id immediately,
    # then push the LLM streaming pass into a background task so the
    # client can navigate into the new chat and watch the completion
    # stream over the socket instead of blocking on a long HTTP call.
    started = await start_agent_chat(agent, full_user, prompt, form_data.chat_title)
    if started is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ERROR_MESSAGES.DEFAULT('Failed to start agent'),
        )
    chat_id, user_msg_id, assistant_msg_id = started
    asyncio.create_task(
        run_agent_completion(
            request.app,
            agent,
            full_user,
            prompt,
            chat_id,
            user_msg_id,
            assistant_msg_id,
        )
    )
    return {'chat_id': chat_id, 'agent_id': agent.id}
