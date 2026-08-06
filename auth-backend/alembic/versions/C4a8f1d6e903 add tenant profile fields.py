"""add tenant profile fields to users

Revision ID: c4a8f1d6e903
Revises: b3f7e9c1a5d2
Create Date: 2026-08-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4a8f1d6e903'
down_revision: Union[str, Sequence[str], None] = 'b3f7e9c1a5d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('id_type', sa.String(), nullable=True))
    op.add_column('users', sa.Column('id_number', sa.String(), nullable=True))
    op.add_column('users', sa.Column('move_in_date', sa.Date(), nullable=True))
    op.add_column('users', sa.Column('tenant_status', sa.String(), nullable=True))
    op.create_index(op.f('ix_users_tenant_status'), 'users', ['tenant_status'], unique=False)

    # Backfill: anyone already sitting in the Tenant role before this
    # migration ran predates the LLD's status flow. Treat them as ACTIVE
    # (documents undefined, but they were already using the platform) rather
    # than leaving tenant_status NULL, which the app code treats as
    # "ONBOARDING" anyway on read -- this makes it explicit in the DB too.
    op.execute("UPDATE users SET tenant_status = 'ACTIVE' WHERE role = 'Tenant'")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_users_tenant_status'), table_name='users')
    op.drop_column('users', 'tenant_status')
    op.drop_column('users', 'move_in_date')
    op.drop_column('users', 'id_number')
    op.drop_column('users', 'id_type')