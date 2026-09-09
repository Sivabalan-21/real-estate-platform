"""add logo to companies

Revision ID: b1c2d3e4f5a6
Revises: 6ca8a12ad101
Create Date: 2026-09-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b1c2d3e4f5a6'
down_revision = '6ca8a12ad101'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('companies', sa.Column('logo', sa.String(), nullable=True))
    op.add_column('companies', sa.Column('company_code', sa.String(), nullable=True))
    op.create_unique_constraint(op.f('companies_company_code_key'), 'companies', ['company_code'])


def downgrade():
    op.drop_constraint(op.f('companies_company_code_key'), 'companies', type_='unique')
    op.drop_column('companies', 'company_code')
    op.drop_column('companies', 'logo')