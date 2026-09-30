"""unique vendor email per company"""
from alembic import op

revision = "j4k5l6m7n8o9"
down_revision = "i3j4k5l6m7n8"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_email_key")
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_company_email
        ON vendors (company_id, lower(email))
        WHERE email IS NOT NULL
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS uq_vendors_company_email")
    op.execute("ALTER TABLE vendors ADD CONSTRAINT vendors_email_key UNIQUE (email)")