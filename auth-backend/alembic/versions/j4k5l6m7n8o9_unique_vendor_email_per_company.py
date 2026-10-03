"""unique vendor email per company"""
from alembic import op

revision = "j4k5l6m7n8o9"
down_revision = "i3j4k5l6m7n8"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS resolution_note TEXT")
    op.execute("ALTER TABLE ticket_attachments DROP COLUMN IF EXISTS attachment_type")
    op.execute("ALTER TABLE ticket_attachments ALTER COLUMN version DROP NOT NULL")


def downgrade():
    op.execute("ALTER TABLE maintenance_tickets DROP COLUMN IF EXISTS resolution_note")