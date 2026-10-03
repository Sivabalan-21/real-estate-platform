"""add notifications table

Save as alembic/versions/<rev>_add_notifications_table.py
Set down_revision to the output of `alembic heads`.
"""
from alembic import op
import sqlalchemy as sa

revision = "n0t1f1cat10n"
down_revision = "k5l6m7n8o9p0"
branch_labels = None
depends_on = None


def upgrade():
    # Skip if Base.metadata.create_all() already created it at app startup.
    if "notifications" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("title", sa.String(80), nullable=False),
        sa.Column("body", sa.String(200), nullable=False),
        sa.Column("ticket_id", sa.String(), sa.ForeignKey("maintenance_tickets.id", ondelete="CASCADE"), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_notifications_user_created", "notifications", ["user_id", "created_at"])
    op.create_index("ix_notifications_user_unread", "notifications", ["user_id", "is_read"])


def downgrade():
    op.drop_index("ix_notifications_user_unread", table_name="notifications")
    op.drop_index("ix_notifications_user_created", table_name="notifications")
    op.drop_table("notifications")
