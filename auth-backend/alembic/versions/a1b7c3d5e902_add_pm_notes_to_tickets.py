"""add pm_notes to maintenance_tickets (Day 17)

Revision ID: a1b7c3d5e902
Revises: f2a9c6d1e854
Create Date: 2026-08-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'a1b7c3d5e902'
down_revision: Union[str, Sequence[str], None] = 'f2a9c6d1e854'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in [c["name"] for c in inspect(bind).get_columns(table)]


def upgrade() -> None:
    """Upgrade schema.

    Day 17 spec: internal PM-facing notes on a ticket, stored as a single
    text field for now (real threaded ticket_comments with visible_to
    scoping is Month 2 / Day 27 per the ticket).
    """
    if not _has_column("maintenance_tickets", "pm_notes"):
        op.add_column(
            "maintenance_tickets",
            sa.Column("pm_notes", sa.String(), nullable=True),
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("maintenance_tickets", "pm_notes")