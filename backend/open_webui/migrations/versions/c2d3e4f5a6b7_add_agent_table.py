"""add agent table

Revision ID: c2d3e4f5a6b7
Revises: 461111b60977
Create Date: 2026-06-02

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from open_webui.migrations.util import get_existing_tables

revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = '461111b60977'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    existing_tables = get_existing_tables()

    if 'agent' not in existing_tables:
        op.create_table(
            'agent',
            sa.Column('id', sa.String(), nullable=False, primary_key=True),
            sa.Column('user_id', sa.String(), nullable=False),
            sa.Column('name', sa.Text(), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('data', sa.JSON(), nullable=False),
            sa.Column('meta', sa.JSON(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False),
            sa.Column('updated_at', sa.BigInteger(), nullable=False),
            sa.Column('created_at', sa.BigInteger(), nullable=False),
        )
        op.create_index('idx_agent_user_id', 'agent', ['user_id'])
        op.create_index('idx_agent_updated_at', 'agent', ['updated_at'])


def downgrade() -> None:
    op.drop_index('idx_agent_updated_at', table_name='agent')
    op.drop_index('idx_agent_user_id', table_name='agent')
    op.drop_table('agent')
