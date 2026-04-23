"""Reorder metric_value_canonical precedence: Oyvind canonical, synthetic fallback.

Phase 1.2.5 Workstream C. Swaps the precedence of source_type='analyst_note'
(Oyvind emails) and source_type='trailblaze_pdf' (synthetic PDFs) so Oyvind
wins contested (entity, market, metric, period) partitions and synthetic
fills gaps. Also grants explicit (non-tier-99) tiers to disclosure_status
values 'derived' and 'partially_disclosed' which previously fell through
to the default.

metric_value_canonical is a MATERIALIZED VIEW; Postgres has no
``CREATE OR REPLACE MATERIALIZED VIEW`` syntax, so both upgrade and
downgrade DROP and recreate, then REFRESH to repopulate. The four indexes
(ix_mvc_dims UNIQUE for CONCURRENTLY refresh, plus ix_mvc_entity /
ix_mvc_market / ix_mvc_metric_period) are also recreated each time.
parser/pipeline.py's REFRESH MATERIALIZED VIEW call continues to work
unchanged against the same view name.

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-23
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# New precedence (Oyvind primary). Module-level so upgrade and downgrade
# read from a single source. The CASE is emitted twice when the matview is
# built — once as the output column, once inside the window function's
# ORDER BY — because Postgres window functions can't reference SELECT-list
# aliases.
_PRECEDENCE_NEW = """
    CASE
        WHEN mv.disclosure_status = 'disclosed' AND s.source_type = 'analyst_note' THEN 1
        WHEN mv.disclosure_status = 'disclosed'
             AND s.source_type IN ('regulator_filing','sec_filing') THEN 2
        WHEN mv.disclosure_status = 'disclosed' AND s.source_type = 'company_ir' THEN 3
        WHEN mv.disclosure_status = 'disclosed' AND s.source_type = 'stock_api' THEN 4
        WHEN mv.disclosure_status = 'disclosed' AND s.source_type = 'trailblaze_pdf' THEN 5
        WHEN mv.disclosure_status = 'disclosed' THEN 6
        WHEN mv.disclosure_status = 'derived' THEN 7
        WHEN mv.disclosure_status = 'beacon_estimate' THEN 8
        WHEN mv.disclosure_status = 'partially_disclosed' THEN 9
        WHEN mv.disclosure_status = 'not_disclosed' THEN 10
        ELSE 99
    END
"""

# Old precedence (pre-Workstream C). Retained verbatim for downgrade.
_PRECEDENCE_OLD = """
    CASE
        WHEN mv.disclosure_status = 'disclosed' AND s.source_type = 'trailblaze_pdf' THEN 1
        WHEN mv.disclosure_status = 'disclosed'
             AND s.source_type IN ('regulator_filing','sec_filing') THEN 2
        WHEN mv.disclosure_status = 'disclosed' AND s.source_type = 'company_ir' THEN 3
        WHEN mv.disclosure_status = 'disclosed' THEN 4
        WHEN mv.disclosure_status = 'beacon_estimate' THEN 5
        WHEN mv.disclosure_status = 'not_disclosed' THEN 6
        ELSE 99
    END
"""


def _recreate_matview(precedence_case_sql: str) -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS metric_value_canonical")
    op.execute(
        f"""
        CREATE MATERIALIZED VIEW metric_value_canonical AS
        WITH ranked AS (
            SELECT
                mv.id AS metric_value_id,
                mv.entity_id,
                mv.market_id,
                mv.metric_id,
                mv.period_id,
                mv.source_id,
                mv.report_id,
                mv.value_numeric,
                mv.value_text,
                mv.currency,
                mv.unit_multiplier,
                mv.disclosure_status,
                mv.confidence_score,
                s.source_type,
                r.published_timestamp,
                {precedence_case_sql} AS precedence_tier,
                ROW_NUMBER() OVER (
                    PARTITION BY mv.entity_id, mv.market_id, mv.metric_id, mv.period_id
                    ORDER BY
                        {precedence_case_sql} ASC,
                        r.published_timestamp DESC NULLS LAST,
                        mv.confidence_score DESC NULLS LAST,
                        mv.created_at DESC
                ) AS rn
            FROM metric_values mv
            JOIN sources s ON s.id = mv.source_id
            LEFT JOIN reports r ON r.id = mv.report_id
        )
        SELECT
            metric_value_id,
            entity_id,
            market_id,
            metric_id,
            period_id,
            source_id,
            report_id,
            value_numeric,
            value_text,
            currency,
            unit_multiplier,
            disclosure_status,
            confidence_score,
            source_type,
            published_timestamp,
            precedence_tier
        FROM ranked
        WHERE rn = 1
        WITH NO DATA;
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX ix_mvc_dims ON metric_value_canonical "
        "(coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), "
        " coalesce(market_id, '00000000-0000-0000-0000-000000000000'::uuid), "
        " metric_id, period_id)"
    )
    op.execute("CREATE INDEX ix_mvc_entity ON metric_value_canonical (entity_id)")
    op.execute("CREATE INDEX ix_mvc_market ON metric_value_canonical (market_id)")
    op.execute(
        "CREATE INDEX ix_mvc_metric_period ON metric_value_canonical (metric_id, period_id)"
    )
    # Populate. Not CONCURRENTLY — CONCURRENTLY requires an already-
    # populated matview, and we just created an empty one via WITH NO DATA.
    op.execute("REFRESH MATERIALIZED VIEW metric_value_canonical")


def upgrade() -> None:
    _recreate_matview(_PRECEDENCE_NEW)


def downgrade() -> None:
    _recreate_matview(_PRECEDENCE_OLD)
