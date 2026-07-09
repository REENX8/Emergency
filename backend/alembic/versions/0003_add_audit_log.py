"""add audit_logs table

Revision ID: 0003_add_audit_log
Revises: 0002_add_user_role
Create Date: 2026-05-17

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003_add_audit_log"
down_revision: str | None = "0002_add_user_role"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True, index=True),
        sa.Column("actor_email", sa.String, nullable=True),
        sa.Column("action", sa.String, nullable=False, index=True),
        sa.Column("target_type", sa.String, nullable=True),
        sa.Column("target_id", sa.String, nullable=True),
        sa.Column("payload", sa.String, server_default=""),
        sa.Column("created_at", sa.DateTime, index=True),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
