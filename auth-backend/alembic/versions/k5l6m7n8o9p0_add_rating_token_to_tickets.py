"""add rating_token to maintenance_tickets (day 31)

Revision ID: k5l6m7n8o9p0
Revises: fd645ed1f904
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "k5l6m7n8o9p0"
down_revision: Union[str, Sequence[str], None] = "fd645ed1f904"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("maintenance_tickets", sa.Column("rating_token", sa.String(), nullable=True))
    op.create_index("ix_maintenance_tickets_rating_token", "maintenance_tickets", ["rating_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_maintenance_tickets_rating_token", table_name="maintenance_tickets")
    op.drop_column("maintenance_tickets", "rating_token")
