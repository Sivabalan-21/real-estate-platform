"""add vendor_ticket_access table (secure per-ticket vendor links)

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6
Create Date: 2026-09-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'h2i3j4k5l6m7'
down_revision: Union[str, Sequence[str], None] = 'g1h2i3j4k5l6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'vendor_ticket_access',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('token', sa.String(), nullable=False),
        sa.Column('vendor_id', sa.String(), nullable=False),
        sa.Column('ticket_id', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id']),
        sa.ForeignKeyConstraint(['ticket_id'], ['maintenance_tickets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vendor_ticket_access_token'), 'vendor_ticket_access', ['token'], unique=True)
    op.create_index(op.f('ix_vendor_ticket_access_vendor_id'), 'vendor_ticket_access', ['vendor_id'])
    op.create_index(op.f('ix_vendor_ticket_access_ticket_id'), 'vendor_ticket_access', ['ticket_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_vendor_ticket_access_ticket_id'), table_name='vendor_ticket_access')
    op.drop_index(op.f('ix_vendor_ticket_access_vendor_id'), table_name='vendor_ticket_access')
    op.drop_index(op.f('ix_vendor_ticket_access_token'), table_name='vendor_ticket_access')
    op.drop_table('vendor_ticket_access')
