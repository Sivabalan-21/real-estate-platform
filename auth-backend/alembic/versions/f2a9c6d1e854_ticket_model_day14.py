"""extend maintenance_tickets, add ticket_attachments and ticket_history (Day 14)

Revision ID: f2a9c6d1e854
Revises: e1f9a2c8b344
Create Date: 2026-08-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2a9c6d1e854'
down_revision: Union[str, Sequence[str], None] = 'e1f9a2c8b344'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # --- extend maintenance_tickets --------------------------------------
    op.add_column('maintenance_tickets', sa.Column('company_id', sa.String(), nullable=True))
    op.add_column('maintenance_tickets', sa.Column('category', sa.String(), nullable=True))
    op.add_column('maintenance_tickets', sa.Column('assigned_pm', sa.String(), nullable=True))
    op.add_column('maintenance_tickets', sa.Column('assigned_vendor_id', sa.String(), nullable=True))
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
    op.alter_column('maintenance_tickets', 'company_id', nullable=False)

    op.create_foreign_key(
        'fk_maintenance_tickets_company_id', 'maintenance_tickets', 'companies',
        ['company_id'], ['id'],
    )
    op.create_foreign_key(
        'fk_maintenance_tickets_assigned_pm', 'maintenance_tickets', 'users',
        ['assigned_pm'], ['username'],
    )
    op.create_index(op.f('ix_maintenance_tickets_company_id'), 'maintenance_tickets', ['company_id'], unique=False)
    op.create_index(op.f('ix_maintenance_tickets_category'), 'maintenance_tickets', ['category'], unique=False)
    op.create_index(op.f('ix_maintenance_tickets_assigned_pm'), 'maintenance_tickets', ['assigned_pm'], unique=False)
    op.create_index(op.f('ix_maintenance_tickets_assigned_vendor_id'), 'maintenance_tickets', ['assigned_vendor_id'], unique=False)

    # --- ticket_attachments ------------------------------------------------
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
    op.create_index(op.f('ix_ticket_attachments_ticket_id'), 'ticket_attachments', ['ticket_id'], unique=False)

    # --- ticket_history ------------------------------------------------
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