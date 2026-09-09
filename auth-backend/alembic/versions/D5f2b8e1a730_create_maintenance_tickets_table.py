"""create_maintenance_tickets_table (superseded by d7e2b4a9f610)

Revision ID: d5f2b8e1a730
Revises: c4a8f1d6e903
Create Date: 2026-08-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5f2b8e1a730'
down_revision: Union[str, Sequence[str], None] = 'c4a8f1d6e903'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op: table already created by d7e2b4a9f610."""
    pass


def downgrade() -> None:
    """No-op."""
    pass