"""extend maintenance_tickets, add ticket_attachments and ticket_history (Day 14)

Revision ID: f2a9c6d1e854
Revises: e1f9a2c8b344
Create Date: 2026-08-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'f2a9c6d1e854'
down_revision: Union[str, Sequence[str], None] = 'e1f9a2c8b344'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return inspect(bind).has_table(name)


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in [c["name"] for c in inspect(bind).get_columns(table)]


def upgrade() -> None:
    """Upgrade schema.

    Guarded with has_table()/has_column() checks (same pattern as
    e1f9a2c8b344) because on at least one environment `ticket_attachments`
    and `ticket_history` were already created directly from models.py via
    Base.metadata.create_all() at app startup, ahead of this migration
    actually running.
    """
    # --- extend maintenance_tickets --------------------------------------
    if not _has_column('maintenance_tickets', 'company_id'):
        op.add_column('maintenance_tickets', sa.Column('company_id', sa.String(), nullable=True))
    if not _has_column('maintenance_tickets', 'category'):
        op.add_column('maintenance_tickets', sa.Column('category', sa.String(), nullable=True))
    if not _has_column('maintenance_tickets', 'assigned_pm'):
        op.add_column('maintenance_tickets', sa.Column('assigned_pm', sa.String(), nullable=True))
    if not _has_column('maintenance_tickets', 'assigned_vendor_id'):
        op.add_column('maintenance_tickets', sa.Column('assigned_vendor_id', sa.String(), nullable=True))
    if not _has_column('maintenance_tickets', 'rating'):
        op.add_column('maintenance_tickets', sa.Column('rating', sa.Integer(), nullable=True))

    # Backfill company_id on any pre-Day-14 rows from the parent property,
    # then make it required now that every row has a value.
    op.execute(
        """
        UPDATE maintenance_tickets
        SET company_id = properties.company_id
        FROM properties
        WHERE maintenance_tickets.property_id = properties.id
          AND maintenance_tickets.company_id IS NULL
        """
    )

    bind = op.get_bind()
    insp = inspect(bind)
    company_id_col = next(c for c in insp.get_columns('maintenance_tickets') if c['name'] == 'company_id')
    if company_id_col['nullable']:
        op.alter_column('maintenance_tickets', 'company_id', nullable=False)

    existing_fks = {fk['name'] for fk in insp.get_foreign_keys('maintenance_tickets')}
    if 'fk_maintenance_tickets_company_id' not in existing_fks:
        op.create_foreign_key(
            'fk_maintenance_tickets_company_id', 'maintenance_tickets', 'companies',
            ['company_id'], ['id'],
        )
    if 'fk_maintenance_tickets_assigned_pm' not in existing_fks:
        op.create_foreign_key(
            'fk_maintenance_tickets_assigned_pm', 'maintenance_tickets', 'users',
            ['assigned_pm'], ['username'],
        )

    existing_indexes = {ix['name'] for ix in insp.get_indexes('maintenance_tickets')}
    if op.f('ix_maintenance_tickets_company_id') not in existing_indexes:
        op.create_index(op.f('ix_maintenance_tickets_company_id'), 'maintenance_tickets', ['company_id'], unique=False)
    if op.f('ix_maintenance_tickets_category') not in existing_indexes:
        op.create_index(op.f('ix_maintenance_tickets_category'), 'maintenance_tickets', ['category'], unique=False)
    if op.f('ix_maintenance_tickets_assigned_pm') not in existing_indexes:
        op.create_index(op.f('ix_maintenance_tickets_assigned_pm'), 'maintenance_tickets', ['assigned_pm'], unique=False)
    if op.f('ix_maintenance_tickets_assigned_vendor_id') not in existing_indexes:
        op.create_index(op.f('ix_maintenance_tickets_assigned_vendor_id'), 'maintenance_tickets', ['assigned_vendor_id'], unique=False)

    # --- ticket_attachments ------------------------------------------------
    if not _has_table('ticket_attachments'):
        op.create_table(
            'ticket_attachments',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('ticket_id', sa.String(), nullable=False),
            sa.Column('url', sa.String(), nullable=False),
            sa.Column('filename', sa.String(), nullable=False),
            sa.Column('type', sa.String(), nullable=False),
            sa.Column('uploaded_by', sa.String(), nullable=True),
            sa.Column('uploaded_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['ticket_id'], ['maintenance_tickets.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
    existing_indexes = {ix['name'] for ix in inspect(op.get_bind()).get_indexes('ticket_attachments')}
    if op.f('ix_ticket_attachments_ticket_id') not in existing_indexes:
        op.create_index(op.f('ix_ticket_attachments_ticket_id'), 'ticket_attachments', ['ticket_id'], unique=False)

    # --- ticket_history ------------------------------------------------
    if not _has_table('ticket_history'):
        op.create_table(
            'ticket_history',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('ticket_id', sa.String(), nullable=False),
            sa.Column('from_status', sa.String(), nullable=True),
            sa.Column('to_status', sa.String(), nullable=False),
            sa.Column('changed_by', sa.String(), nullable=True),
            sa.Column('note', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['ticket_id'], ['maintenance_tickets.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
    existing_indexes = {ix['name'] for ix in inspect(op.get_bind()).get_indexes('ticket_history')}
    if op.f('ix_ticket_history_ticket_id') not in existing_indexes:
        op.create_index(op.f('ix_ticket_history_ticket_id'), 'ticket_history', ['ticket_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_ticket_history_ticket_id'), table_name='ticket_history')
    op.drop_table('ticket_history')

    op.drop_index(op.f('ix_ticket_attachments_ticket_id'), table_name='ticket_attachments')
    op.drop_table('ticket_attachments')

    op.drop_index(op.f('ix_maintenance_tickets_assigned_vendor_id'), table_name='maintenance_tickets')
    op.drop_index(op.f('ix_maintenance_tickets_assigned_pm'), table_name='maintenance_tickets')
    op.drop_index(op.f('ix_maintenance_tickets_category'), table_name='maintenance_tickets')
    op.drop_index(op.f('ix_maintenance_tickets_company_id'), table_name='maintenance_tickets')
    op.drop_constraint('fk_maintenance_tickets_assigned_pm', 'maintenance_tickets', type_='foreignkey')
    op.drop_constraint('fk_maintenance_tickets_company_id', 'maintenance_tickets', type_='foreignkey')
    op.drop_column('maintenance_tickets', 'rating')
    op.drop_column('maintenance_tickets', 'assigned_vendor_id')
    op.drop_column('maintenance_tickets', 'assigned_pm')
    op.drop_column('maintenance_tickets', 'category')
    op.drop_column('maintenance_tickets', 'company_id')