"""attachment size version role

Revision ID: ec79b0567b55
Revises: j4k5l6m7n8o9
Create Date: 2026-09-30 20:13:17.993096

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ec79b0567b55'
down_revision: Union[str, Sequence[str], None] = 'j4k5l6m7n8o9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column(
        'ticket_attachments',
        sa.Column('uploaded_by_role', sa.String(), nullable=True)
    )
    op.add_column(
        'ticket_attachments',
        sa.Column('size_kb', sa.Integer(), nullable=False, server_default='0')
    )
    op.add_column(
        'ticket_attachments',
        sa.Column('version', sa.Integer(), nullable=True)
    )


def downgrade():
    op.drop_column('ticket_attachments', 'version')
    op.drop_column('ticket_attachments', 'size_kb')
    op.drop_column('ticket_attachments', 'uploaded_by_role')
