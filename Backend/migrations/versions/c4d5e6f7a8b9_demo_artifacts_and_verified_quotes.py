"""evidence artifacts and server-verified quotes

Revision ID: c4d5e6f7a8b9
Revises: db662200d14a
Create Date: 2026-10-16 18:00:00.000000

Three additive, nullable-or-defaulted columns, so existing rows stay valid:

  evidence.artifacts              links to the work (PR, doc, ticket, recording)
  evidence_reviews.verified_quotes  quotes the reviewer made, each located verbatim
  item_responses.ai_detail        free-response key points met and their quotes

It also creates `knowledge_documents` when absent. Revision 7f382aba051c was
committed as an empty autogenerate stub, so a fresh `alembic upgrade head`
never created the table; the seed scripts' create_all hid that. Creating it
here only if missing keeps every existing database valid.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, None] = 'db662200d14a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_knowledge_documents_if_missing() -> None:
    if 'knowledge_documents' in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        'knowledge_documents',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('slug', sa.String(length=120), nullable=False),
        sa.Column('kind', sa.String(length=48), nullable=False),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('capability_id', sa.String(length=36), nullable=True),
        sa.Column('level', sa.String(length=32), nullable=True),
        sa.Column('kpi_ref', sa.String(length=120), nullable=True),
        sa.Column('is_approved', sa.Boolean(), nullable=False),
        sa.Column('approved_by', sa.String(length=36), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('related_slugs', sa.Text(), nullable=False),
        sa.Column('tenant_id', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['capability_id'], ['capabilities.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    for column in ('capability_id', 'is_approved', 'kind', 'slug', 'tenant_id'):
        op.create_index(
            f'ix_knowledge_documents_{column}', 'knowledge_documents', [column], unique=False
        )


def upgrade() -> None:
    _create_knowledge_documents_if_missing()
    with op.batch_alter_table('evidence') as batch:
        batch.add_column(sa.Column('artifacts', sa.JSON(), nullable=True))
    with op.batch_alter_table('evidence_reviews') as batch:
        batch.add_column(
            sa.Column('verified_quotes', sa.Text(), nullable=False, server_default='')
        )
    with op.batch_alter_table('item_responses') as batch:
        batch.add_column(sa.Column('ai_detail', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('item_responses') as batch:
        batch.drop_column('ai_detail')
    with op.batch_alter_table('evidence_reviews') as batch:
        batch.drop_column('verified_quotes')
    with op.batch_alter_table('evidence') as batch:
        batch.drop_column('artifacts')
