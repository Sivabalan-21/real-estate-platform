"""add quote_amount to maintenance_tickets

Revision ID: f2a9c1d8e5b3
Revises: e7f1a2b3c4d5
Create Date: 2026-09-26 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f2a9c1d8e5b3"
down_revision: Union[str, Sequence[str], None] = "e7f1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Day 29 owner-approval inbox: the quote amount an Owner reviews before
    # approving/rejecting spend. Nullable — quote-request/vendor-quote flow
    # may not always populate it (e.g. a ticket manually pushed to
    # pending_owner_approval for testing), and a missing quote shouldn't
    # block the ticket from showing up in the inbox.
    op.add_column(
        "maintenance_tickets",
        sa.Column("quote_amount", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("maintenance_tickets", "quote_amount")