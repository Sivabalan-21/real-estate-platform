"""create all tables

Revision ID: 4a6a1840e3c7
Revises: 6ca8a12ad101
Create Date: 2026-06-25 04:27:13.837313

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4a6a1840e3c7'
down_revision: Union[str, Sequence[str], None] = '6ca8a12ad101'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # company_code and logo are added on the other branch (b1c2d3e4f5a6);
    # this branch adds slug, which isn't created anywhere else.
    op.add_column('companies', sa.Column('slug', sa.String(), nullable=True))
    op.create_unique_constraint(op.f('companies_slug_key'), 'companies', ['slug'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f('companies_slug_key'), 'companies', type_='unique')
    op.drop_column('companies', 'slug')