"""add compliance fields (building metadata + node.area_m2)

Revision ID: 0004_add_compliance_fields
Revises: 0003_add_audit_log
Create Date: 2026-05-17

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004_add_compliance_fields"
down_revision: str | None = "0003_add_audit_log"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("buildings") as batch_op:
        batch_op.add_column(
            sa.Column("has_sprinkler", sa.Boolean, nullable=False, server_default=sa.text("0"))
        )
        batch_op.add_column(
            sa.Column("building_type", sa.String, nullable=False, server_default="office")
        )
        batch_op.add_column(
            sa.Column("total_floors", sa.Integer, nullable=False, server_default="1")
        )
    with op.batch_alter_table("nodes") as batch_op:
        batch_op.add_column(sa.Column("area_m2", sa.Float, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("nodes") as batch_op:
        batch_op.drop_column("area_m2")
    with op.batch_alter_table("buildings") as batch_op:
        batch_op.drop_column("total_floors")
        batch_op.drop_column("building_type")
        batch_op.drop_column("has_sprinkler")
