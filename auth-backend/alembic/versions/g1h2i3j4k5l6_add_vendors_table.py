"""add vendors table and real FK on maintenance_tickets.assigned_vendor_id

Revision ID: g1h2i3j4k5l6
Revises: f2a9c1d8e5b3
Create Date: 2026-09-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'g1h2i3j4k5l6'
down_revision: Union[str, Sequence[str], None] = 'f2a9c1d8e5b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'vendors',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('website', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('avg_rating', sa.Float(), nullable=True),
        sa.Column('total_jobs', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vendors_company_id'), 'vendors', ['company_id'], unique=False)
    op.create_index(op.f('ix_vendors_category'), 'vendors', ['category'], unique=False)

    op.create_foreign_key(
        'fk_maintenance_tickets_assigned_vendor_id_vendors',
        'maintenance_tickets',
        'vendors',
        ['assigned_vendor_id'],
        ['id'],
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_maintenance_tickets_assigned_vendor_id_vendors',
        'maintenance_tickets',
        type_='foreignkey',
    )
    op.drop_index(op.f('ix_vendors_category'), table_name='vendors')
    op.drop_index(op.f('ix_vendors_company_id'), table_name='vendors')
    op.drop_table('vendors')

