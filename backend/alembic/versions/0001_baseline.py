"""baseline — capture the schema that init_db() has been creating up to now.

This migration represents the pre-Alembic state of the database, so that
fresh installs can `alembic upgrade head` from zero, and existing databases
can be `alembic stamp 0001_baseline` to mark themselves caught up.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-05-17

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String, nullable=False, unique=True, index=True),
        sa.Column("password_hash", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_table(
        "buildings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("address", sa.String, server_default=""),
        sa.Column("description", sa.String, server_default=""),
        sa.Column("tmd_station_id", sa.String, server_default="515201"),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_table(
        "floors",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("building_id", sa.Integer, sa.ForeignKey("buildings.id"), nullable=False),
        sa.Column("floor_number", sa.Integer, nullable=False),
        sa.Column("image_filename", sa.String, server_default=""),
        sa.Column("image_width_px", sa.Integer, server_default="0"),
        sa.Column("image_height_px", sa.Integer, server_default="0"),
        sa.Column("scale_px_per_m", sa.Float, server_default="6.0"),
    )
    op.create_table(
        "nodes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("building_id", sa.Integer, sa.ForeignKey("buildings.id"), nullable=False),
        sa.Column("node_key", sa.String, nullable=False),
        sa.Column("type", sa.String, server_default="room"),
        sa.Column("label", sa.String, server_default=""),
        sa.Column("x", sa.Float, server_default="0.0"),
        sa.Column("y", sa.Float, server_default="0.0"),
        sa.Column("capacity", sa.Integer, server_default="20"),
        sa.Column("floor_number", sa.Integer, server_default="1"),
    )
    op.create_table(
        "edges",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("building_id", sa.Integer, sa.ForeignKey("buildings.id"), nullable=False),
        sa.Column("u_key", sa.String, nullable=False),
        sa.Column("v_key", sa.String, nullable=False),
        sa.Column("distance_m", sa.Float, server_default="10.0"),
        sa.Column("width_m", sa.Float, server_default="2.0"),
        sa.Column("is_stair", sa.Boolean, server_default=sa.text("0")),
    )
    op.create_table(
        "incidents",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("building_id", sa.Integer, sa.ForeignKey("buildings.id"), nullable=False),
        sa.Column("node_key", sa.String, nullable=False),
        sa.Column("incident_type", sa.String, nullable=False),
        sa.Column("severity", sa.Float, server_default="0.5"),
        sa.Column("reported_at", sa.DateTime),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("1")),
    )


def downgrade() -> None:
    op.drop_table("incidents")
    op.drop_table("edges")
    op.drop_table("nodes")
    op.drop_table("floors")
    op.drop_table("buildings")
    op.drop_table("users")
