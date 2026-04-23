"""Canonical view — largest-value tiebreaker for currency + count metrics.

Round 8b. Flutter Q3-25 revenue had 9 rows in metric_values from a single
analyst_note report, all disclosed, all same timestamp, all same
confidence_score. The old ORDER BY fell through to ``mv.created_at DESC``
and the matview picked $151M ($128.6M EUR on UI) instead of the $3.79B
group total.

Fix: add a penultimate tiebreaker that prefers the LARGEST EUR-magnitude
row when precedence + timestamp + confidence all tie. Only applies to
``currency`` and ``count`` metrics — percentage and ratio metrics have no
definitional "largest wins" meaning, so they fall through to
``mv.created_at DESC`` as before.

Magnitude is computed in EUR (not raw ``value_numeric``) so the
tiebreaker doesn't mis-rank a ``2.43 billions`` row (2.43) against a
``2426 millions`` row (2426) when the latter is actually smaller in
native USD. Requires new joins into ``metrics`` (for ``unit_type``),
``periods`` (for ``end_date`` → FX lookup), and a LATERAL lookup against
``fx_rates``.

Scope: resolves 17+ known (entity, metric, period) dedup-collision
buckets (Flutter, Evolution, Kambi, Sportradar, Betsson, BetMGM, etc.)
in one migration. Leaves regional / segment-specific rows untouched —
they're in different partitions, never competed in the first place.

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-23
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Precedence CASE — identical to 0004. Kept here as a literal block so the
# migration is self-contained; 0004's shape must match for the downgrade
# path to restore its state faithfully.
_PRECEDENCE = """
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

# New tiebreaker: EUR magnitude, gated on unit_type so we don't inadvertently
# re-rank percentage / ratio metrics (EBIT margin, market share, etc.).
_MAGNITUDE_TIEBREAKER = """
    CASE WHEN m.unit_type IN ('currency','count')
         THEN ABS(COALESCE(mv.value_numeric, 0) *
                  CASE mv.unit_multiplier
                    WHEN 'billions'  THEN 1000000000
                    WHEN 'millions'  THEN 1000000
                    WHEN 'thousands' THEN 1000
                    ELSE 1
                  END /
                  NULLIF(COALESCE(fx.eur_rate, 1), 0))
         ELSE NULL
    END
"""


def _create_matview_with_tiebreaker() -> None:
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
                {_PRECEDENCE} AS precedence_tier,
                ROW_NUMBER() OVER (
                    PARTITION BY mv.entity_id, mv.market_id, mv.metric_id, mv.period_id
                    ORDER BY
                        {_PRECEDENCE} ASC,
                        r.published_timestamp DESC NULLS LAST,
                        mv.confidence_score DESC NULLS LAST,
                        {_MAGNITUDE_TIEBREAKER} DESC NULLS LAST,
                        mv.created_at DESC
                ) AS rn
            FROM metric_values mv
            JOIN sources s ON s.id = mv.source_id
            LEFT JOIN reports r ON r.id = mv.report_id
            JOIN metrics m ON m.id = mv.metric_id
            JOIN periods p ON p.id = mv.period_id
            LEFT JOIN LATERAL (
              SELECT f.eur_rate FROM fx_rates f
              WHERE f.currency_code = COALESCE(UPPER(mv.currency), 'EUR')
                AND f.rate_date <= p.end_date
              ORDER BY f.rate_date DESC LIMIT 1
            ) fx ON true
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
    op.execute("REFRESH MATERIALIZED VIEW metric_value_canonical")


def _create_matview_without_tiebreaker() -> None:
    """Restores 0004's state — no magnitude tiebreaker, no metrics/periods/fx joins."""
    op.execute("DROP MATERIALIZED VIEW IF EXISTS metric_value_canonical")
    op.execute(
        f"""
        CREATE MATERIALIZED VIEW metric_value_canonical AS
        WITH ranked AS (
            SELECT
                mv.id AS metric_value_id,
                mv.entity_id, mv.market_id, mv.metric_id, mv.period_id,
                mv.source_id, mv.report_id,
                mv.value_numeric, mv.value_text, mv.currency, mv.unit_multiplier,
                mv.disclosure_status, mv.confidence_score,
                s.source_type, r.published_timestamp,
                {_PRECEDENCE} AS precedence_tier,
                ROW_NUMBER() OVER (
                    PARTITION BY mv.entity_id, mv.market_id, mv.metric_id, mv.period_id
                    ORDER BY
                        {_PRECEDENCE} ASC,
                        r.published_timestamp DESC NULLS LAST,
                        mv.confidence_score DESC NULLS LAST,
                        mv.created_at DESC
                ) AS rn
            FROM metric_values mv
            JOIN sources s ON s.id = mv.source_id
            LEFT JOIN reports r ON r.id = mv.report_id
        )
        SELECT metric_value_id, entity_id, market_id, metric_id, period_id,
               source_id, report_id, value_numeric, value_text, currency,
               unit_multiplier, disclosure_status, confidence_score,
               source_type, published_timestamp, precedence_tier
        FROM ranked WHERE rn = 1
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
    op.execute("REFRESH MATERIALIZED VIEW metric_value_canonical")


def upgrade() -> None:
    _create_matview_with_tiebreaker()


def downgrade() -> None:
    _create_matview_without_tiebreaker()
