"""merge divergent maintenance_tickets heads

Two migrations were independently created off c4a8f1d6e903, both creating
the identical maintenance_tickets table:
  - d5f2b8e1a730_create_maintenance_tickets_table.py
  - d7e2b4a9f610_create_maintenance_tickets_table.py

This merges them into a single head. The upgrade is guarded with a
has_table() check so it's safe no matter which (if either) of the two
duplicate migrations already ran on a given database.

Revision ID: e1f9a2c8b344
Revises: d5f2b8e1a730, d7e2b4a9f610
Create Date: 2026-08-06 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1f9a2c8b344'
down_revision: Union[str, Sequence[str], None] = ('d5f2b8e1a730', 'd7e2b4a9f610')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table('maintenance_tickets'):
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

    existing_indexes = {ix['name'] for ix in inspector.get_indexes('maintenance_tickets')} \
        if inspector.has_table('maintenance_tickets') else set()

    if 'ix_maintenance_tickets_property_id' not in existing_indexes:
        op.create_index(
            op.f('ix_maintenance_tickets_property_id'), 'maintenance_tickets', ['property_id'], unique=False
        )
    if 'ix_maintenance_tickets_unit_id' not in existing_indexes:
        op.create_index(
            op.f('ix_maintenance_tickets_unit_id'), 'maintenance_tickets', ['unit_id'], unique=False
        )
    if 'ix_maintenance_tickets_status' not in existing_indexes:
        op.create_index(
            op.f('ix_maintenance_tickets_status'), 'maintenance_tickets', ['status'], unique=False
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_maintenance_tickets_status'), table_name='maintenance_tickets')
    op.drop_index(op.f('ix_maintenance_tickets_unit_id'), table_name='maintenance_tickets')
    op.drop_index(op.f('ix_maintenance_tickets_property_id'), table_name='maintenance_tickets')
    op.drop_table('maintenance_tickets')