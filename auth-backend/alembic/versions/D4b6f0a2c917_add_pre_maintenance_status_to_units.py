"""add pre_maintenance_status to units

Revision ID: d4b6f0a2c917
Revises: a1b7c3d5e902
Create Date: 2026-09-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'd4b6f0a2c917'
down_revision: Union[str, Sequence[str], None] = 'a1b7c3d5e902'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in [c["name"] for c in inspect(bind).get_columns(table)]


def upgrade() -> None:
    """Upgrade schema.

    Lets a unit's status auto-revert once its open maintenance tickets are
    all resolved: when a ticket flips a unit to "maintenance", the unit's
    prior status (vacant/occupied) is stashed here so it can be restored
    instead of guessed at.
    """
    if not _has_column("units", "pre_maintenance_status"):
        op.add_column(
            "units",
            sa.Column("pre_maintenance_status", sa.String(), nullable=True),
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("units", "pre_maintenance_status")