"""add unit_id to users

Revision ID: b3f7e9c1a5d2
Revises: 9a1f3c7e2b40
Create Date: 2026-08-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3f7e9c1a5d2'
down_revision: Union[str, Sequence[str], None] = '9a1f3c7e2b40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('unit_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_users_unit_id'), 'users', ['unit_id'], unique=False)
    op.create_foreign_key(
        op.f('fk_users_unit_id_units'),
        'users', 'units',
        ['unit_id'], ['id'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f('fk_users_unit_id_units'), 'users', type_='foreignkey')
    op.drop_index(op.f('ix_users_unit_id'), table_name='users')
    op.drop_column('users', 'unit_id')