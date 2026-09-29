"""link vendors to user logins (vendors.user_id)

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-09-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "i3j4k5l6m7n8"
down_revision: Union[str, Sequence[str], None] = "h2i3j4k5l6m7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vendors", sa.Column("user_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_vendors_user_id_users", "vendors", "users",
        ["user_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_vendors_user_id", "vendors", ["user_id"], unique=True)

    # Backfill: link each Vendor-role login to the vendor profile in the same
    # company with the same email (case-insensitive). If several profiles share
    # an email, the oldest wins, so the unique index can never be violated.
    op.execute(
        """
        UPDATE vendors v
        SET user_id = u.id
        FROM users u
        WHERE u.role = 'Vendor'
          AND u.company_id = v.company_id
          AND lower(u.email) = lower(v.email)
          AND v.user_id IS NULL
          AND v.id = (
              SELECT v2.id FROM vendors v2
              WHERE v2.company_id = u.company_id
                AND lower(v2.email) = lower(u.email)
              ORDER BY v2.created_at, v2.id
              LIMIT 1
          )
        """
    )


def downgrade() -> None:
    op.drop_index("ix_vendors_user_id", table_name="vendors")
    op.drop_constraint("fk_vendors_user_id_users", "vendors", type_="foreignkey")
    op.drop_column("vendors", "user_id")
