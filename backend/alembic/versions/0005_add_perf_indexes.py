"""add performance indexes on FK and frequently-filtered columns

Revision ID: 0005_add_perf_indexes
Revises: 0004_add_compliance_fields
Create Date: 2026-06-02
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0005_add_perf_indexes"
down_revision: Union[str, None] = "0004_add_compliance_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_indexes = [
    ("ix_nodes_building_id",     "nodes",     ["building_id"]),
    ("ix_edges_building_id",     "edges",     ["building_id"]),
    ("ix_floors_building_id",    "floors",    ["building_id"]),
    ("ix_incidents_building_id", "incidents", ["building_id"]),
    ("ix_incidents_is_active",   "incidents", ["is_active"]),
    ("ix_nodes_floor_number",    "nodes",     ["floor_number"]),
    ("ix_nodes_type",            "nodes",     ["type"]),
]


def upgrade() -> None:
    for name, table, columns in _indexes:
        try:
            op.create_index(name, table, columns)
        except Exception:
            pass  # index may already exist on SQLite from create_table


def downgrade() -> None:
    for name, table, _ in reversed(_indexes):
        try:
            op.drop_index(name, table_name=table)
        except Exception:
            pass
