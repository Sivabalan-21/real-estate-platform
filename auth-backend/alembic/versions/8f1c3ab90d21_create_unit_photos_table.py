"""create_unit_photos_table

Revision ID: 8f1c3ab90d21
Revises: 2ebb5b2df12b
Create Date: 2026-08-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8f1c3ab90d21'
down_revision: Union[str, Sequence[str], None] = '2ebb5b2df12b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('unit_photos',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('unit_id', sa.String(), nullable=False),
    sa.Column('url', sa.String(), nullable=False),
    sa.Column('filename', sa.String(), nullable=False),
    sa.Column('uploaded_by', sa.String(), nullable=True),
    sa.Column('uploaded_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['unit_id'], ['units.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_unit_photos_unit_id'), 'unit_photos', ['unit_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_unit_photos_unit_id'), table_name='unit_photos')
    op.drop_table('unit_photos')