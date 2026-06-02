"""Agent workspace entity — visually-composed, tool-using LLM orchestrators.

An Agent bundles a model + system prompt + tools + skills + knowledge into a
single first-class workspace artifact that runs through the existing chat
completion pipeline (which already implements a tool-calling loop). It can
optionally store a visual graph (nodes + edges) authored in the builder UI
so the same artifact can be edited as a flow or as a form.

The model schema follows the same shape used by `skill` / `model` /
`automation` so admins can reason about access grants and lifecycle in a
uniform way (cf. models/skills.py, models/models.py, models/automations.py).
"""

from __future__ import annotations

import logging
import time
from typing import Optional
from uuid import uuid4

from open_webui.internal.db import Base, JSONField, get_async_db_context
from open_webui.models.access_grants import AccessGrantModel, AccessGrants
from open_webui.models.groups import Groups
from open_webui.models.users import User, UserModel, UserResponse, Users
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import BigInteger, Boolean, Column, String, Text, cast, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)


####################
# DB Schema
####################


class Agent(Base):
    __tablename__ = 'agent'

    id = Column(String, primary_key=True, unique=True)
    user_id = Column(String, nullable=False)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    # Free-form per-agent configuration. Mirrors the {data} blob on
    # Automations so we can evolve the schema without migrations.
    # Expected shape (see AgentData below): model_id, system_prompt,
    # tool_ids, skill_ids, knowledge, params, agent_loop, graph.
    data = Column(JSONField, nullable=False)
    meta = Column(JSONField, nullable=True)  # profile_image_url, tags, ...
    is_active = Column(Boolean, default=True, nullable=False)
    updated_at = Column(BigInteger, nullable=False)
    created_at = Column(BigInteger, nullable=False)


####################
# Pydantic models
####################


class AgentLoopConfig(BaseModel):
    """Tunables for the underlying tool-calling loop.

    The values here mirror the canonical ReAct / tool-calling loop knobs:
      - `max_iterations` caps the number of tool round-trips so a runaway
        agent cannot spin forever (the chat pipeline enforces its own
        ceiling too; this is a per-agent override.)
      - `tool_choice` mirrors the OpenAI parameter — auto / required / none.
      - `parallel_tool_calls` toggles whether the model may emit multiple
        tool calls in a single step.
    """

    max_iterations: int = Field(default=6, ge=1, le=50)
    tool_choice: str = Field(default='auto')  # auto | required | none
    parallel_tool_calls: bool = True

    model_config = ConfigDict(extra='allow')


class AgentGraphNode(BaseModel):
    """A node on the visual builder canvas.

    The shape is intentionally close to @xyflow/svelte's `Node` so we can
    round-trip the graph between the editor and the server without
    re-mapping fields. `type` corresponds to one of the AgentBuilder node
    kinds (trigger | agent | tool | condition | output | note).
    """

    id: str
    type: str
    position: Optional[dict] = None
    data: Optional[dict] = None

    model_config = ConfigDict(extra='allow')


class AgentGraphEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None
    label: Optional[str] = None

    model_config = ConfigDict(extra='allow')


class AgentGraph(BaseModel):
    nodes: list[AgentGraphNode] = Field(default_factory=list)
    edges: list[AgentGraphEdge] = Field(default_factory=list)

    model_config = ConfigDict(extra='allow')


class AgentData(BaseModel):
    """Persisted shape of the `data` JSON column."""

    model_id: str
    system_prompt: str = ''
    tool_ids: list[str] = Field(default_factory=list)
    skill_ids: list[str] = Field(default_factory=list)
    knowledge: list[dict] = Field(default_factory=list)
    params: dict = Field(default_factory=dict)
    agent_loop: AgentLoopConfig = Field(default_factory=AgentLoopConfig)
    suggestion_prompts: Optional[list[dict]] = None
    graph: Optional[AgentGraph] = None

    model_config = ConfigDict(extra='allow')


class AgentMeta(BaseModel):
    profile_image_url: Optional[str] = None
    tags: list[dict] = Field(default_factory=list)

    model_config = ConfigDict(extra='allow')


class AgentModel(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    data: dict
    meta: Optional[dict] = None
    is_active: bool = True
    access_grants: list[AccessGrantModel] = Field(default_factory=list)
    updated_at: int
    created_at: int

    model_config = ConfigDict(from_attributes=True)


class AgentResponse(AgentModel):
    pass


class AgentUserResponse(AgentResponse):
    user: Optional[UserResponse] = None

    model_config = ConfigDict(extra='allow')


class AgentAccessResponse(AgentUserResponse):
    write_access: Optional[bool] = False


class AgentForm(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    data: AgentData
    meta: Optional[AgentMeta] = Field(default_factory=AgentMeta)
    is_active: bool = True
    access_grants: Optional[list[dict]] = None


class AgentListResponse(BaseModel):
    items: list[AgentUserResponse] = []
    total: int = 0


class AgentAccessListResponse(BaseModel):
    items: list[AgentAccessResponse] = []
    total: int = 0


####################
# Table
####################


class AgentsTable:
    async def _get_access_grants(self, agent_id: str, db: Optional[AsyncSession] = None) -> list[AccessGrantModel]:
        return await AccessGrants.get_grants_by_resource('agent', agent_id, db=db)

    async def _to_model(
        self,
        agent: Agent,
        access_grants: Optional[list[AccessGrantModel]] = None,
        db: Optional[AsyncSession] = None,
    ) -> AgentModel:
        data = AgentModel.model_validate(agent).model_dump(exclude={'access_grants'})
        data['access_grants'] = (
            access_grants if access_grants is not None else await self._get_access_grants(data['id'], db=db)
        )
        return AgentModel.model_validate(data)

    async def insert_new_agent(
        self,
        user_id: str,
        form_data: AgentForm,
        db: Optional[AsyncSession] = None,
    ) -> Optional[AgentModel]:
        async with get_async_db_context(db) as db:
            try:
                now = int(time.time())
                row = Agent(
                    id=form_data.id or str(uuid4()),
                    user_id=user_id,
                    name=form_data.name,
                    description=form_data.description,
                    data=form_data.data.model_dump(),
                    meta=form_data.meta.model_dump() if form_data.meta else {},
                    is_active=form_data.is_active,
                    created_at=now,
                    updated_at=now,
                )
                db.add(row)
                await db.commit()
                await db.refresh(row)
                await AccessGrants.set_access_grants('agent', row.id, form_data.access_grants, db=db)
                return await self._to_model(row, db=db)
            except Exception as e:
                log.exception(f'Error creating agent: {e}')
                return None

    async def get_agent_by_id(self, id: str, db: Optional[AsyncSession] = None) -> Optional[AgentModel]:
        try:
            async with get_async_db_context(db) as db:
                row = await db.get(Agent, id)
                return await self._to_model(row, db=db) if row else None
        except Exception:
            return None

    async def get_agents(self, db: Optional[AsyncSession] = None) -> list[AgentUserResponse]:
        async with get_async_db_context(db) as db:
            result = await db.execute(select(Agent).order_by(Agent.updated_at.desc()))
            rows = result.scalars().all()

            user_ids = list({row.user_id for row in rows})
            ids = [row.id for row in rows]

            users = await Users.get_users_by_user_ids(user_ids, db=db) if user_ids else []
            users_by_id = {u.id: u for u in users}
            grants_map = await AccessGrants.get_grants_by_resources('agent', ids, db=db)

            items: list[AgentUserResponse] = []
            for row in rows:
                u = users_by_id.get(row.user_id)
                items.append(
                    AgentUserResponse.model_validate(
                        {
                            **(await self._to_model(row, access_grants=grants_map.get(row.id, []), db=db)).model_dump(),
                            'user': u.model_dump() if u else None,
                        }
                    )
                )
            return items

    async def get_agents_by_user_id(
        self, user_id: str, permission: str = 'write', db: Optional[AsyncSession] = None
    ) -> list[AgentUserResponse]:
        agents = await self.get_agents(db=db)
        user_groups = await Groups.get_groups_by_member_id(user_id, db=db)
        user_group_ids = {g.id for g in user_groups}

        out: list[AgentUserResponse] = []
        for a in agents:
            if a.user_id == user_id:
                out.append(a)
            elif await AccessGrants.has_access(
                user_id=user_id,
                resource_type='agent',
                resource_id=a.id,
                permission=permission,
                user_group_ids=user_group_ids,
                db=db,
            ):
                out.append(a)
        return out

    async def search_agents(
        self,
        user_id: str,
        filter: dict | None = None,
        skip: int = 0,
        limit: int = 30,
        db: Optional[AsyncSession] = None,
    ) -> AgentListResponse:
        filter = filter or {}
        try:
            async with get_async_db_context(db) as db:
                stmt = select(Agent, User).outerjoin(User, User.id == Agent.user_id)

                if filter:
                    q = filter.get('query')
                    if q:
                        stmt = stmt.filter(
                            or_(
                                Agent.name.ilike(f'%{q}%'),
                                Agent.description.ilike(f'%{q}%'),
                                Agent.id.ilike(f'%{q}%'),
                                User.name.ilike(f'%{q}%'),
                                User.email.ilike(f'%{q}%'),
                            )
                        )

                    view = filter.get('view_option')
                    if view == 'created':
                        stmt = stmt.filter(Agent.user_id == user_id)
                    elif view == 'shared':
                        stmt = stmt.filter(Agent.user_id != user_id)

                    stmt = AccessGrants.has_permission_filter(
                        db=db,
                        query=stmt,
                        DocumentModel=Agent,
                        filter=filter,
                        resource_type='agent',
                        permission='read',
                    )

                stmt = stmt.order_by(Agent.updated_at.desc())

                count_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
                total = count_result.scalar()

                if skip:
                    stmt = stmt.offset(skip)
                if limit:
                    stmt = stmt.limit(limit)

                result = await db.execute(stmt)
                items = result.all()
                ids = [row.id for row, _ in items]
                grants_map = await AccessGrants.get_grants_by_resources('agent', ids, db=db)

                out: list[AgentUserResponse] = []
                for row, u in items:
                    out.append(
                        AgentUserResponse(
                            **(await self._to_model(row, access_grants=grants_map.get(row.id, []), db=db)).model_dump(),
                            user=(UserResponse(**UserModel.model_validate(u).model_dump()) if u else None),
                        )
                    )
                return AgentListResponse(items=out, total=total)
        except Exception as e:
            log.exception(f'Error searching agents: {e}')
            return AgentListResponse(items=[], total=0)

    async def update_agent_by_id(
        self, id: str, updated: dict, db: Optional[AsyncSession] = None
    ) -> Optional[AgentModel]:
        try:
            async with get_async_db_context(db) as db:
                access_grants = updated.pop('access_grants', None)
                if 'data' in updated and hasattr(updated['data'], 'model_dump'):
                    updated['data'] = updated['data'].model_dump()
                if 'meta' in updated and hasattr(updated['meta'], 'model_dump'):
                    updated['meta'] = updated['meta'].model_dump()
                await db.execute(
                    update(Agent).filter_by(id=id).values(**updated, updated_at=int(time.time()))
                )
                await db.commit()
                if access_grants is not None:
                    await AccessGrants.set_access_grants('agent', id, access_grants, db=db)
                row = await db.get(Agent, id)
                if row is None:
                    return None
                await db.refresh(row)
                return await self._to_model(row, db=db)
        except Exception as e:
            log.exception(f'Failed to update agent {id}: {e}')
            return None

    async def toggle_agent_by_id(self, id: str, db: Optional[AsyncSession] = None) -> Optional[AgentModel]:
        async with get_async_db_context(db) as db:
            try:
                result = await db.execute(select(Agent).filter_by(id=id))
                row = result.scalars().first()
                if not row:
                    return None
                row.is_active = not row.is_active
                row.updated_at = int(time.time())
                await db.commit()
                await db.refresh(row)
                return await self._to_model(row, db=db)
            except Exception:
                return None

    async def delete_agent_by_id(self, id: str, db: Optional[AsyncSession] = None) -> bool:
        try:
            async with get_async_db_context(db) as db:
                await AccessGrants.revoke_all_access('agent', id, db=db)
                await db.execute(delete(Agent).filter_by(id=id))
                await db.commit()
                return True
        except Exception:
            return False


Agents = AgentsTable()
