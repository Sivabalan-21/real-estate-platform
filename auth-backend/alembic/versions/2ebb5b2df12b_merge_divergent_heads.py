"""merge divergent heads

Revision ID: 2ebb5b2df12b
Revises: 4a6a1840e3c7, 5dd9b87dfe2d
Create Date: 2026-07-30 14:03:29.718656

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2ebb5b2df12b'
down_revision: Union[str, Sequence[str], None] = ('4a6a1840e3c7', '5dd9b87dfe2d')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
