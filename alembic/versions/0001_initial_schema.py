"""Initial schema — all tables, indexes, views.

Implements SCHEMA_SPEC.md v0.1 in a single migration. Subsequent migrations
add/alter rather than restructure.

Revision ID: 0001
Revises:
Create Date: 2026-04-21
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ---------------------------------------------------------------------------
# Reusable bits
# ---------------------------------------------------------------------------

UUID_PK = sa.Column(
    "id",
    postgresql.UUID(as_uuid=True),
    primary_key=True,
    server_default=sa.text("gen_random_uuid()"),
)


def _created_updated() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    ]


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------


def upgrade() -> None:
    # Extensions required for gen_random_uuid()
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # ---- entity_types ----
    op.create_table(
        "entity_types",
        UUID_PK,
        sa.Column("code", sa.Text, nullable=False, unique=True),
        sa.Column("display_name", sa.Text, nullable=False),
        sa.Column("description", sa.Text),
    )

    # ---- entities (self-ref) ----
    op.create_table(
        "entities",
        UUID_PK,
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("slug", sa.Text, nullable=False, unique=True),
        sa.Column("aliases", postgresql.ARRAY(sa.Text)),
        sa.Column(
            "parent_entity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entities.id", ondelete="SET NULL"),
        ),
        sa.Column("ticker", sa.Text),
        sa.Column("exchange", sa.Text),
        sa.Column("country_of_listing", sa.Text),
        sa.Column("headquarters_country", sa.Text),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("description", sa.Text),
        sa.Column("metadata", postgresql.JSONB),
        *_created_updated(),
    )
    op.create_index("ix_entities_slug", "entities", ["slug"])
    op.create_index("ix_entities_parent_entity_id", "entities", ["parent_entity_id"])
    op.create_index("ix_entities_ticker", "entities", ["ticker"])
    op.create_index(
        "ix_entities_aliases_gin", "entities", ["aliases"], postgresql_using="gin"
    )

    op.create_table(
        "entity_type_assignments",
        sa.Column(
            "entity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entities.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "entity_type_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entity_types.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("is_primary", sa.Boolean, server_default=sa.text("false")),
    )

    # ---- markets (self-ref) ----
    op.create_table(
        "markets",
        UUID_PK,
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("slug", sa.Text, nullable=False, unique=True),
        sa.Column("aliases", postgresql.ARRAY(sa.Text)),
        sa.Column("market_type", sa.Text, nullable=False),
        sa.Column(
            "parent_market_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("markets.id", ondelete="SET NULL"),
        ),
        sa.Column("iso_country", sa.Text),
        sa.Column("iso_subdivision", sa.Text),
        sa.Column("regulator_name", sa.Text),
        sa.Column("regulator_url", sa.Text),
        sa.Column("is_regulated", sa.Boolean),
        sa.Column("regulation_date", sa.Date),
        sa.Column("tax_rate_igaming", sa.Numeric),
        sa.Column("tax_rate_osb", sa.Numeric),
        sa.Column("currency", sa.Text),
        sa.Column("metadata", postgresql.JSONB),
        *_created_updated(),
        sa.CheckConstraint(
            "market_type in ('region','country','state','province','territory','custom_grouping')",
            name="ck_markets_market_type",
        ),
    )
    op.create_index("ix_markets_slug", "markets", ["slug"])
    op.create_index("ix_markets_parent_market_id", "markets", ["parent_market_id"])
    op.create_index("ix_markets_iso_country", "markets", ["iso_country"])
    op.create_index("ix_markets_iso_subdivision", "markets", ["iso_subdivision"])

    op.create_table(
        "market_tax_history",
        UUID_PK,
        sa.Column(
            "market_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("markets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("vertical", sa.Text),
        sa.Column("tax_rate", sa.Numeric, nullable=False),
        sa.Column("tax_basis", sa.Text),
        sa.Column("effective_from", sa.Date, nullable=False),
        sa.Column("effective_to", sa.Date),
        sa.Column("notes", sa.Text),
        sa.Column("source_url", sa.Text),
    )
    op.create_index("ix_market_tax_history_market_id", "market_tax_history", ["market_id"])
    op.create_index(
        "ix_market_tax_history_effective",
        "market_tax_history",
        ["market_id", "vertical", "effective_from"],
    )

    # ---- metrics ----
    op.create_table(
        "metrics",
        UUID_PK,
        sa.Column("code", sa.Text, nullable=False, unique=True),
        sa.Column("display_name", sa.Text, nullable=False),
        sa.Column("short_name", sa.Text),
        sa.Column("category", sa.Text),
        sa.Column("unit_type", sa.Text, nullable=False),
        sa.Column("default_currency_handling", sa.Text),
        sa.Column("is_calculable", sa.Boolean, server_default=sa.text("false")),
        sa.Column("calculation_formula", sa.Text),
        sa.Column("description", sa.Text),
        sa.CheckConstraint(
            "unit_type in ('currency','count','percentage','ratio','text')",
            name="ck_metrics_unit_type",
        ),
    )

    # ---- periods ----
    op.create_table(
        "periods",
        UUID_PK,
        sa.Column("code", sa.Text, nullable=False, unique=True),
        sa.Column("period_type", sa.Text, nullable=False),
        sa.Column("fiscal_year", sa.Integer),
        sa.Column("quarter", sa.Integer),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("display_name", sa.Text),
        sa.Column("description", sa.Text),
        sa.CheckConstraint(
            "period_type in ('quarter','half_year','nine_months','full_year','ltm','month',"
            "'trading_update_window','custom')",
            name="ck_periods_period_type",
        ),
    )
    op.create_index("ix_periods_dates", "periods", ["start_date", "end_date"])
    op.create_index("ix_periods_fiscal_year", "periods", ["fiscal_year"])

    # ---- sources ----
    op.create_table(
        "sources",
        UUID_PK,
        sa.Column("source_type", sa.Text, nullable=False),
        sa.Column("name", sa.Text),
        sa.Column("url", sa.Text),
        sa.Column("confidence_tier", sa.Text, nullable=False),
        sa.Column("display_label", sa.Text),
        sa.Column("is_proprietary", sa.Boolean, server_default=sa.text("false")),
        sa.Column("metadata", postgresql.JSONB),
        sa.CheckConstraint(
            "source_type in ('trailblaze_pdf','regulator_filing','sec_filing','company_ir',"
            "'stock_api','industry_trade','social_media','beacon_estimate','manual_entry')",
            name="ck_sources_source_type",
        ),
        sa.CheckConstraint(
            "confidence_tier in ('verified','high','medium','low','modeled')",
            name="ck_sources_confidence_tier",
        ),
    )
    op.create_index("ix_sources_source_type", "sources", ["source_type"])

    # ---- reports ----
    op.create_table(
        "reports",
        UUID_PK,
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sources.id"),
            nullable=False,
        ),
        sa.Column("filename", sa.Text, nullable=False),
        sa.Column("original_path", sa.Text),
        sa.Column("local_path", sa.Text),
        sa.Column("file_hash", sa.Text, unique=True),
        sa.Column("document_type", sa.Text, nullable=False),
        sa.Column("published_timestamp", sa.TIMESTAMP(timezone=True)),
        sa.Column(
            "period_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("periods.id"),
        ),
        sa.Column("parsed_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("parser_version", sa.Text),
        sa.Column("parse_status", sa.Text, nullable=False),
        sa.Column("metric_count", sa.Integer),
        sa.Column("parse_warnings", postgresql.JSONB),
        sa.Column("raw_text", sa.Text),
        *_created_updated(),
        sa.CheckConstraint(
            "document_type in ('market_update','company_report','presentation','trading_update',"
            "'analyst_call','capital_markets_day','ma_announcement','regulatory_update','shell')",
            name="ck_reports_document_type",
        ),
        sa.CheckConstraint(
            "parse_status in ('pending','parsed_clean','parsed_with_warnings',"
            "'parsed_shell','failed')",
            name="ck_reports_parse_status",
        ),
    )
    op.create_index("ix_reports_file_hash", "reports", ["file_hash"])
    op.create_index("ix_reports_published_timestamp", "reports", ["published_timestamp"])
    op.create_index("ix_reports_parse_status", "reports", ["parse_status"])
    op.create_index("ix_reports_document_type", "reports", ["document_type"])
    op.execute(
        "CREATE INDEX ix_reports_raw_text_gin ON reports USING gin "
        "(to_tsvector('english', coalesce(raw_text, '')))"
    )

    op.create_table(
        "report_entities",
        sa.Column(
            "report_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("reports.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "entity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entities.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("is_primary_subject", sa.Boolean, server_default=sa.text("false")),
        sa.Column("is_comparative_reference", sa.Boolean, server_default=sa.text("false")),
    )

    op.create_table(
        "report_markets",
        sa.Column(
            "report_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("reports.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "market_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("markets.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("is_primary_subject", sa.Boolean, server_default=sa.text("false")),
        sa.Column("is_comparative_reference", sa.Boolean, server_default=sa.text("false")),
    )

    # ---- metric_values (fact table) ----
    op.create_table(
        "metric_values",
        UUID_PK,
        sa.Column(
            "entity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entities.id", ondelete="CASCADE"),
        ),
        sa.Column(
            "market_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("markets.id", ondelete="CASCADE"),
        ),
        sa.Column(
            "metric_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("metrics.id"),
            nullable=False,
        ),
        sa.Column(
            "period_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("periods.id"),
            nullable=False,
        ),
        sa.Column(
            "report_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("reports.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sources.id"),
            nullable=False,
        ),
        sa.Column("value_numeric", sa.Numeric),
        sa.Column("value_text", sa.Text),
        sa.Column("currency", sa.Text),
        sa.Column("unit_multiplier", sa.Text),
        sa.Column("yoy_change_pct", sa.Numeric),
        sa.Column("qoq_change_pct", sa.Numeric),
        sa.Column("disclosure_status", sa.Text, nullable=False),
        sa.Column("is_canonical", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("confidence_score", sa.Numeric),
        sa.Column("notes", sa.Text),
        sa.Column("extracted_from_section", sa.Text),
        sa.Column("extracted_from_table_id", sa.Text),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "disclosure_status in ('disclosed','not_disclosed','partially_disclosed',"
            "'beacon_estimate','derived')",
            name="ck_metric_values_disclosure_status",
        ),
        sa.CheckConstraint(
            "unit_multiplier is null or unit_multiplier in "
            "('units','thousands','millions','billions')",
            name="ck_metric_values_unit_multiplier",
        ),
        sa.CheckConstraint(
            "confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)",
            name="ck_metric_values_confidence_score_range",
        ),
    )
    op.create_index("ix_mv_entity_metric_period", "metric_values", ["entity_id", "metric_id", "period_id"])
    op.create_index("ix_mv_market_metric_period", "metric_values", ["market_id", "metric_id", "period_id"])
    op.create_index("ix_mv_report", "metric_values", ["report_id"])
    op.create_index("ix_mv_source_disclosure", "metric_values", ["source_id", "disclosure_status"])
    op.create_index(
        "ix_mv_canonical",
        "metric_values",
        ["is_canonical"],
        postgresql_where=sa.text("is_canonical = true"),
    )

    # ---- narratives ----
    op.create_table(
        "narratives",
        UUID_PK,
        sa.Column(
            "report_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("reports.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "entity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entities.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "market_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("markets.id", ondelete="SET NULL"),
        ),
        sa.Column("section_code", sa.Text, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "section_code in ('executive_summary','company_insights_interpretation',"
            "'market_deep_dive','affiliate_benchmarking','forecast_strategy',"
            "'investment_view','valuation_downside','valuation_base','valuation_upside')",
            name="ck_narratives_section_code",
        ),
    )
    op.create_index("ix_narratives_report_section", "narratives", ["report_id", "section_code"])
    op.execute(
        "CREATE INDEX ix_narratives_content_gin ON narratives USING gin "
        "(to_tsvector('english', content))"
    )

    # ---- beacon_estimates ----
    op.create_table(
        "beacon_estimates",
        UUID_PK,
        sa.Column(
            "metric_value_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("metric_values.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("methodology_code", sa.Text, nullable=False),
        sa.Column("model_version", sa.Text),
        sa.Column("inputs", postgresql.JSONB),
        sa.Column("confidence_score", sa.Numeric),
        sa.Column("confidence_band_low", sa.Numeric),
        sa.Column("confidence_band_high", sa.Numeric),
        sa.Column("methodology_notes", sa.Text),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "methodology_code in ('tax_rate_implied','peer_ratio','linear_interpolation',"
            "'stock_price_implied','prior_period_extrapolation','composite_model')",
            name="ck_beacon_methodology_code",
        ),
        sa.CheckConstraint(
            "confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)",
            name="ck_beacon_confidence_score_range",
        ),
    )
    op.create_index("ix_beacon_metric_value", "beacon_estimates", ["metric_value_id"])

    # ---- materialized view: metric_value_canonical ----
    # Precedence (§metric_value_canonical):
    #   1. disclosed from trailblaze_pdf (most recent report.published_timestamp)
    #   2. disclosed from regulator_filing / sec_filing
    #   3. disclosed from company_ir
    #   4. disclosed from any other source
    #   5. beacon_estimate (highest confidence_score)
    #   6. not_disclosed (placeholder so the gap is visible)
    op.execute(
        """
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
                CASE
                    WHEN mv.disclosure_status = 'disclosed' AND s.source_type = 'trailblaze_pdf' THEN 1
                    WHEN mv.disclosure_status = 'disclosed'
                         AND s.source_type IN ('regulator_filing','sec_filing') THEN 2
                    WHEN mv.disclosure_status = 'disclosed' AND s.source_type = 'company_ir' THEN 3
                    WHEN mv.disclosure_status = 'disclosed' THEN 4
                    WHEN mv.disclosure_status = 'beacon_estimate' THEN 5
                    WHEN mv.disclosure_status = 'not_disclosed' THEN 6
                    ELSE 99
                END AS precedence_tier,
                ROW_NUMBER() OVER (
                    PARTITION BY mv.entity_id, mv.market_id, mv.metric_id, mv.period_id
                    ORDER BY
                        CASE
                            WHEN mv.disclosure_status = 'disclosed' AND s.source_type = 'trailblaze_pdf' THEN 1
                            WHEN mv.disclosure_status = 'disclosed'
                                 AND s.source_type IN ('regulator_filing','sec_filing') THEN 2
                            WHEN mv.disclosure_status = 'disclosed' AND s.source_type = 'company_ir' THEN 3
                            WHEN mv.disclosure_status = 'disclosed' THEN 4
                            WHEN mv.disclosure_status = 'beacon_estimate' THEN 5
                            WHEN mv.disclosure_status = 'not_disclosed' THEN 6
                            ELSE 99
                        END ASC,
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
    # Unique index required for CONCURRENTLY refreshes.
    op.execute(
        "CREATE UNIQUE INDEX ix_mvc_dims ON metric_value_canonical "
        "(coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), "
        " coalesce(market_id, '00000000-0000-0000-0000-000000000000'::uuid), "
        " metric_id, period_id)"
    )
    op.execute("CREATE INDEX ix_mvc_entity ON metric_value_canonical (entity_id)")
    op.execute("CREATE INDEX ix_mvc_market ON metric_value_canonical (market_id)")
    op.execute("CREATE INDEX ix_mvc_metric_period ON metric_value_canonical (metric_id, period_id)")

    # ---- view: metric_value_discrepancies ----
    # >1 disclosed value with >5% spread (min-vs-max, apples-to-apples within
    # same currency + unit_multiplier to avoid false positives from unit mismatch).
    op.execute(
        """
        CREATE VIEW metric_value_discrepancies AS
        WITH disclosed AS (
            SELECT entity_id, market_id, metric_id, period_id,
                   currency, unit_multiplier,
                   value_numeric, id
            FROM metric_values
            WHERE disclosure_status = 'disclosed' AND value_numeric IS NOT NULL
        ),
        agg AS (
            SELECT
                entity_id, market_id, metric_id, period_id,
                currency, unit_multiplier,
                MIN(value_numeric) AS min_value,
                MAX(value_numeric) AS max_value,
                COUNT(*) AS source_count,
                array_agg(id) AS value_ids
            FROM disclosed
            GROUP BY entity_id, market_id, metric_id, period_id, currency, unit_multiplier
            HAVING COUNT(*) > 1
        )
        SELECT
            entity_id, market_id, metric_id, period_id,
            currency, unit_multiplier,
            min_value, max_value,
            CASE
                WHEN ABS(min_value) > 0
                    THEN ((max_value - min_value) / ABS(min_value)) * 100
                ELSE NULL
            END AS variance_pct,
            source_count, value_ids
        FROM agg
        WHERE ABS(min_value) > 0
          AND ((max_value - min_value) / ABS(min_value)) > 0.05;
        """
    )


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS metric_value_discrepancies")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS metric_value_canonical")
    op.drop_table("beacon_estimates")
    op.drop_table("narratives")
    op.drop_table("metric_values")
    op.drop_table("report_markets")
    op.drop_table("report_entities")
    op.drop_table("reports")
    op.drop_table("sources")
    op.drop_table("periods")
    op.drop_table("metrics")
    op.drop_table("market_tax_history")
    op.drop_table("markets")
    op.drop_table("entity_type_assignments")
    op.drop_table("entities")
    op.drop_table("entity_types")
    # pgcrypto left in place — other things may rely on it.
