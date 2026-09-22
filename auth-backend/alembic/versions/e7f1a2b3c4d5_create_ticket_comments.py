"""create ticket comments and backfill legacy PM notes

Revision ID: e7f1a2b3c4d5
Revises: d4b6f0a2c917
Create Date: 2026-09-21 00:00:00.000000

"""
from datetime import datetime
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "e7f1a2b3c4d5"
down_revision: Union[str, Sequence[str], None] = "d4b6f0a2c917"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def backfill_legacy_notes(bind) -> None:
    # A legacy note has no guaranteed author: assigned_pm is the reliable PM
    # identifier when present; otherwise NULL preserves the note without
    # inventing a username. The original pm_notes value is retained.
    legacy_notes = bind.execute(
        sa.text(
            """
            SELECT
                id,
                pm_notes,
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM users
                        WHERE users.username = maintenance_tickets.assigned_pm
                    )
                    THEN assigned_pm
                    ELSE NULL
                END AS assigned_pm
            FROM maintenance_tickets
            WHERE pm_notes IS NOT NULL
              AND trim(pm_notes) <> ''
            """
        )
    ).mappings().all()
    for note in legacy_notes:
        already_backfilled = bind.execute(
            sa.text(
                """
                SELECT 1
                FROM ticket_comments
                WHERE ticket_id = :ticket_id
                  AND body = :body
                  AND visible_to = 'owner_pm'
                LIMIT 1
                """
            ),
            {"ticket_id": note["id"], "body": note["pm_notes"]},
        ).first()
        if already_backfilled:
            continue
        bind.execute(
            sa.text(
                """
                INSERT INTO ticket_comments
                    (id, ticket_id, author_username, author_role,
                     body, visible_to, created_at)
                VALUES
                    (:id, :ticket_id, :author_username, :author_role,
                     :body, :visible_to, :created_at)
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "ticket_id": note["id"],
                "author_username": note["assigned_pm"],
                "author_role": "Property Manager",
                "body": note["pm_notes"],
                "visible_to": "owner_pm",
                "created_at": datetime.utcnow(),
            },
        )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "ticket_comments" not in inspector.get_table_names():
        op.create_table(
            "ticket_comments",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("ticket_id", sa.String(), nullable=False),
            sa.Column("author_username", sa.String(), nullable=True),
            sa.Column("author_role", sa.String(), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("visible_to", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.CheckConstraint(
                "length(trim(body)) > 0",
                name="ck_ticket_comments_body_not_blank",
            ),
            sa.CheckConstraint(
                "visible_to IN ('all', 'owner_pm', 'pm_vendor')",
                name="ck_ticket_comments_visible_to",
            ),
            sa.ForeignKeyConstraint(
                ["ticket_id"], ["maintenance_tickets.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(["author_username"], ["users.username"]),
            sa.PrimaryKeyConstraint("id"),
        )

    existing_indexes = {
        index["name"] for index in inspect(bind).get_indexes("ticket_comments")
    }
    if "ix_ticket_comments_ticket_id" not in existing_indexes:
        op.create_index(
            "ix_ticket_comments_ticket_id",
            "ticket_comments",
            ["ticket_id"],
        )
    if "ix_ticket_comments_author_username" not in existing_indexes:
        op.create_index(
            "ix_ticket_comments_author_username",
            "ticket_comments",
            ["author_username"],
        )
    backfill_legacy_notes(bind)


def downgrade() -> None:
    op.drop_index("ix_ticket_comments_author_username", table_name="ticket_comments")
    op.drop_index("ix_ticket_comments_ticket_id", table_name="ticket_comments")
    op.drop_table("ticket_comments")
