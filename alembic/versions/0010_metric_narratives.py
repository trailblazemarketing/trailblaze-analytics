"""Metric narratives — cached paragraph per (entity, metric, period, market).

Supports the narrative-surfacing product: for every displayed metric value,
we pre-extract the paragraph from the source report that contains or
explains that value, verify the number actually appears, and cache it for
instant tooltip display. Hallucinations or mis-attributions are worse than
no quote, so ``verified_number_match`` is checked by the extractor and
rows failing verification are never stored.

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-24
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "metric_narratives",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "entity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "metric_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("metrics.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "period_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("periods.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "market_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("markets.id", ondelete="CASCADE"),
            nullable=True,  # NULL = group-level narrative (no market slice)
        ),
        sa.Column(
            "source_report_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("reports.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("narrative_text", sa.Text, nullable=False),
        sa.Column(
            "verified_number_match",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("extraction_model", sa.Text, nullable=False),
        sa.Column(
            "extraction_timestamp",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("source_report_parser_version", sa.Text),
        sa.Column(
            "is_stale",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("metadata", postgresql.JSONB),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Unique per (entity, metric, period, market, source_report). The
    # COALESCE on market_id collapses the NULL case so two group-level
    # narratives for the same tuple can't both land.
    op.execute(
        "CREATE UNIQUE INDEX idx_metric_narratives_tuple "
        "ON metric_narratives(entity_id, metric_id, period_id, "
        " coalesce(market_id, '00000000-0000-0000-0000-000000000000'::uuid), "
        " source_report_id)"
    )
    op.create_index(
        "idx_metric_narratives_entity", "metric_narratives", ["entity_id"]
    )
    op.create_index(
        "idx_metric_narratives_report", "metric_narratives", ["source_report_id"]
    )
    # Partial index for the stale-sweep query path.
    op.execute(
        "CREATE INDEX idx_metric_narratives_stale "
        "ON metric_narratives(is_stale) WHERE is_stale = true"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_metric_narratives_stale")
    op.drop_index("idx_metric_narratives_report", table_name="metric_narratives")
    op.drop_index("idx_metric_narratives_entity", table_name="metric_narratives")
    op.execute("DROP INDEX IF EXISTS idx_metric_narratives_tuple")
    op.drop_table("metric_narratives")
