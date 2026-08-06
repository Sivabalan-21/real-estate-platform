"""create maintenance_tickets table

Revision ID: d7e2b4a9f610
Revises: c4a8f1d6e903
Create Date: 2026-08-06 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7e2b4a9f610'
down_revision: Union[str, Sequence[str], None] = 'c4a8f1d6e903'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'maintenance_tickets',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('property_id', sa.String(), nullable=False),
        sa.Column('unit_id', sa.String(), nullable=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='open'),
        sa.Column('priority', sa.String(), nullable=False, server_default='normal'),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['property_id'], ['properties.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['unit_id'], ['units.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_maintenance_tickets_property_id'), 'maintenance_tickets', ['property_id'], unique=False)
    op.create_index(op.f('ix_maintenance_tickets_unit_id'), 'maintenance_tickets', ['unit_id'], unique=False)
    op.create_index(op.f('ix_maintenance_tickets_status'), 'maintenance_tickets', ['status'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_maintenance_tickets_status'), table_name='maintenance_tickets')
    op.drop_index(op.f('ix_maintenance_tickets_unit_id'), table_name='maintenance_tickets')
    op.drop_index(op.f('ix_maintenance_tickets_property_id'), table_name='maintenance_tickets')
    op.drop_table('maintenance_tickets')