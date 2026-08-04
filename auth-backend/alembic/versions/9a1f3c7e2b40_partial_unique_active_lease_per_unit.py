"""partial_unique_active_lease_per_unit

Revision ID: 9a1f3c7e2b40
Revises: 5dd9b87dfe2d
Create Date: 2026-08-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9a1f3c7e2b40'
down_revision: Union[str, Sequence[str], None] = '8f1c3ab90d21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Drop the old plain unique index — it blocks a unit from ever having
    # more than one lease row in its history (even terminated/expired ones).
    op.drop_index(op.f('ix_leases_unit_id'), table_name='leases')

    # Replace it with a partial unique index: only ONE row with
    # status = 'active' is allowed per unit_id. Terminated/expired leases
    # no longer collide with new ones. This matches the app-level check
    # already in create_lease() in main.py.
    op.create_index(
        'ix_leases_unit_id_active',
        'leases',
        ['unit_id'],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )

    # Keep a plain, non-unique index on unit_id for lookup performance
    # (queries like _unit_for_company / get_unit_lease still filter on it).
    op.create_index(
        op.f('ix_leases_unit_id'),
        'leases',
        ['unit_id'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_leases_unit_id'), table_name='leases')
    op.drop_index('ix_leases_unit_id_active', table_name='leases')
    op.create_index(
        op.f('ix_leases_unit_id'),
        'leases',
        ['unit_id'],
        unique=True,
    )