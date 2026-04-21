"""Metric aliases — LLM-emitted codes mapped to canonical metric_id.

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-21
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "metric_aliases",
        sa.Column("alias_code", sa.Text, primary_key=True),
        sa.Column(
            "canonical_metric_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("metrics.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("notes", sa.Text),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_metric_aliases_canonical", "metric_aliases", ["canonical_metric_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_metric_aliases_canonical", table_name="metric_aliases")
    op.drop_table("metric_aliases")
