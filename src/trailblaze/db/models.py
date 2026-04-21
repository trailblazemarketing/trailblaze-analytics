"""ORM models for the Trailblaze Analytics schema.

Mirrors SCHEMA_SPEC.md §Tables. All tables are declared here so Alembic's
autogenerate and `Base.metadata.create_all` both see them via a single import.

Conventions
-----------
* UUID primary keys, server-side `gen_random_uuid()` default (requires `pgcrypto`).
* Timestamps stored as `timestamptz` with `now()` server defaults where relevant.
* Numerics use `Numeric` without precision so we don't prematurely constrain
  currency magnitudes or percentage resolution. Narrow later if needed.
* `metadata` is renamed to `extra_metadata` at the Python level because
  `metadata` is reserved on SQLAlchemy's `DeclarativeBase`. The column name
  in the DB remains `metadata`.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from trailblaze.db.base import Base


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )


# ---------------------------------------------------------------------------
# entities / entity_types
# ---------------------------------------------------------------------------


class Entity(Base):
    __tablename__ = "entities"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    aliases: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    parent_entity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="SET NULL")
    )
    ticker: Mapped[str | None] = mapped_column(Text)
    exchange: Mapped[str | None] = mapped_column(Text)
    country_of_listing: Mapped[str | None] = mapped_column(Text)
    headquarters_country: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(server_default=text("true"), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    extra_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )

    parent: Mapped["Entity | None"] = relationship(
        "Entity", remote_side="Entity.id", back_populates="children"
    )
    children: Mapped[list["Entity"]] = relationship(
        "Entity", back_populates="parent", cascade="save-update"
    )
    type_assignments: Mapped[list["EntityTypeAssignment"]] = relationship(
        back_populates="entity", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_entities_slug", "slug"),
        Index("ix_entities_parent_entity_id", "parent_entity_id"),
        Index("ix_entities_ticker", "ticker"),
        Index("ix_entities_aliases_gin", "aliases", postgresql_using="gin"),
    )


class EntityType(Base):
    __tablename__ = "entity_types"

    id: Mapped[uuid.UUID] = _uuid_pk()
    code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    assignments: Mapped[list["EntityTypeAssignment"]] = relationship(
        back_populates="entity_type", cascade="all, delete-orphan"
    )


class EntityTypeAssignment(Base):
    __tablename__ = "entity_type_assignments"

    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        primary_key=True,
    )
    entity_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entity_types.id", ondelete="CASCADE"),
        primary_key=True,
    )
    is_primary: Mapped[bool | None] = mapped_column(server_default=text("false"))

    entity: Mapped[Entity] = relationship(back_populates="type_assignments")
    entity_type: Mapped[EntityType] = relationship(back_populates="assignments")


# ---------------------------------------------------------------------------
# markets / market_tax_history
# ---------------------------------------------------------------------------


class Market(Base):
    __tablename__ = "markets"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    aliases: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    market_type: Mapped[str] = mapped_column(Text, nullable=False)
    parent_market_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("markets.id", ondelete="SET NULL")
    )
    iso_country: Mapped[str | None] = mapped_column(Text)
    iso_subdivision: Mapped[str | None] = mapped_column(Text)
    regulator_name: Mapped[str | None] = mapped_column(Text)
    regulator_url: Mapped[str | None] = mapped_column(Text)
    is_regulated: Mapped[bool | None] = mapped_column()
    regulation_date: Mapped[Date | None] = mapped_column(Date)
    tax_rate_igaming: Mapped[Decimal | None] = mapped_column(Numeric)
    tax_rate_osb: Mapped[Decimal | None] = mapped_column(Numeric)
    currency: Mapped[str | None] = mapped_column(Text)
    extra_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )

    parent: Mapped["Market | None"] = relationship(
        "Market", remote_side="Market.id", back_populates="children"
    )
    children: Mapped[list["Market"]] = relationship("Market", back_populates="parent")
    tax_history: Mapped[list["MarketTaxHistory"]] = relationship(
        back_populates="market", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "market_type in ('region','country','state','province','territory','custom_grouping')",
            name="ck_markets_market_type",
        ),
        Index("ix_markets_slug", "slug"),
        Index("ix_markets_parent_market_id", "parent_market_id"),
        Index("ix_markets_iso_country", "iso_country"),
        Index("ix_markets_iso_subdivision", "iso_subdivision"),
    )


class MarketTaxHistory(Base):
    __tablename__ = "market_tax_history"

    id: Mapped[uuid.UUID] = _uuid_pk()
    market_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("markets.id", ondelete="CASCADE"), nullable=False
    )
    vertical: Mapped[str | None] = mapped_column(Text)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    tax_basis: Mapped[str | None] = mapped_column(Text)
    effective_from: Mapped[Date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[Date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text)

    market: Mapped[Market] = relationship(back_populates="tax_history")

    __table_args__ = (
        Index("ix_market_tax_history_market_id", "market_id"),
        Index("ix_market_tax_history_effective", "market_id", "vertical", "effective_from"),
    )


# ---------------------------------------------------------------------------
# metrics / periods / sources
# ---------------------------------------------------------------------------


class Metric(Base):
    __tablename__ = "metrics"

    id: Mapped[uuid.UUID] = _uuid_pk()
    code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    short_name: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(Text)
    unit_type: Mapped[str] = mapped_column(Text, nullable=False)
    default_currency_handling: Mapped[str | None] = mapped_column(Text)
    is_calculable: Mapped[bool | None] = mapped_column(server_default=text("false"))
    calculation_formula: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "unit_type in ('currency','count','percentage','ratio','text')",
            name="ck_metrics_unit_type",
        ),
    )

    aliases_rel: Mapped[list["MetricAlias"]] = relationship(
        back_populates="canonical_metric", cascade="all, delete-orphan"
    )


class MetricAlias(Base):
    """Maps LLM-emitted metric codes onto canonical `metrics.id`.

    Consulted at ingest time before dropping an unknown metric_code, so
    re-parsing only has to happen when the LLM invents a genuinely new
    concept — not just a synonym for an existing one.
    """

    __tablename__ = "metric_aliases"

    alias_code: Mapped[str] = mapped_column(Text, primary_key=True)
    canonical_metric_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("metrics.id", ondelete="CASCADE"),
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    canonical_metric: Mapped["Metric"] = relationship(back_populates="aliases_rel")

    __table_args__ = (
        Index("ix_metric_aliases_canonical", "canonical_metric_id"),
    )


class Period(Base):
    __tablename__ = "periods"

    id: Mapped[uuid.UUID] = _uuid_pk()
    code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    period_type: Mapped[str] = mapped_column(Text, nullable=False)
    fiscal_year: Mapped[int | None] = mapped_column(Integer)
    quarter: Mapped[int | None] = mapped_column(Integer)
    start_date: Mapped[Date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Date] = mapped_column(Date, nullable=False)
    display_name: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "period_type in ('quarter','half_year','nine_months','full_year','ltm','month',"
            "'trading_update_window','custom')",
            name="ck_periods_period_type",
        ),
        Index("ix_periods_dates", "start_date", "end_date"),
        Index("ix_periods_fiscal_year", "fiscal_year"),
    )


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = _uuid_pk()
    source_type: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    confidence_tier: Mapped[str] = mapped_column(Text, nullable=False)
    display_label: Mapped[str | None] = mapped_column(Text)
    is_proprietary: Mapped[bool | None] = mapped_column(server_default=text("false"))
    extra_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB)

    __table_args__ = (
        CheckConstraint(
            "source_type in ('trailblaze_pdf','regulator_filing','sec_filing','company_ir',"
            "'stock_api','industry_trade','social_media','beacon_estimate','manual_entry')",
            name="ck_sources_source_type",
        ),
        CheckConstraint(
            "confidence_tier in ('verified','high','medium','low','modeled')",
            name="ck_sources_confidence_tier",
        ),
        Index("ix_sources_source_type", "source_type"),
    )


# ---------------------------------------------------------------------------
# reports + report_entities / report_markets
# ---------------------------------------------------------------------------


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = _uuid_pk()
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sources.id"), nullable=False
    )
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    original_path: Mapped[str | None] = mapped_column(Text)
    local_path: Mapped[str | None] = mapped_column(Text)
    file_hash: Mapped[str | None] = mapped_column(Text, unique=True)
    document_type: Mapped[str] = mapped_column(Text, nullable=False)
    published_timestamp: Mapped[datetime | None] = mapped_column()
    period_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("periods.id")
    )
    parsed_at: Mapped[datetime | None] = mapped_column()
    parser_version: Mapped[str | None] = mapped_column(Text)
    parse_status: Mapped[str] = mapped_column(Text, nullable=False)
    metric_count: Mapped[int | None] = mapped_column(Integer)
    parse_warnings: Mapped[dict | None] = mapped_column(JSONB)
    raw_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )

    source: Mapped[Source] = relationship()
    period: Mapped[Period | None] = relationship()
    report_entities: Mapped[list["ReportEntity"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )
    report_markets: Mapped[list["ReportMarket"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )
    narratives: Mapped[list["Narrative"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "document_type in ('market_update','company_report','presentation','trading_update',"
            "'analyst_call','capital_markets_day','ma_announcement','regulatory_update','shell')",
            name="ck_reports_document_type",
        ),
        CheckConstraint(
            "parse_status in ('pending','parsed_clean','parsed_with_warnings',"
            "'parsed_shell','failed')",
            name="ck_reports_parse_status",
        ),
        Index("ix_reports_file_hash", "file_hash"),
        Index("ix_reports_published_timestamp", "published_timestamp"),
        Index("ix_reports_parse_status", "parse_status"),
        Index("ix_reports_document_type", "document_type"),
        Index(
            "ix_reports_raw_text_gin",
            text("to_tsvector('english', coalesce(raw_text, ''))"),
            postgresql_using="gin",
        ),
    )


class ReportEntity(Base):
    __tablename__ = "report_entities"

    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reports.id", ondelete="CASCADE"),
        primary_key=True,
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        primary_key=True,
    )
    is_primary_subject: Mapped[bool | None] = mapped_column(server_default=text("false"))
    is_comparative_reference: Mapped[bool | None] = mapped_column(server_default=text("false"))

    report: Mapped[Report] = relationship(back_populates="report_entities")
    entity: Mapped[Entity] = relationship()


class ReportMarket(Base):
    __tablename__ = "report_markets"

    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reports.id", ondelete="CASCADE"),
        primary_key=True,
    )
    market_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("markets.id", ondelete="CASCADE"),
        primary_key=True,
    )
    is_primary_subject: Mapped[bool | None] = mapped_column(server_default=text("false"))
    is_comparative_reference: Mapped[bool | None] = mapped_column(server_default=text("false"))

    report: Mapped[Report] = relationship(back_populates="report_markets")
    market: Mapped[Market] = relationship()


# ---------------------------------------------------------------------------
# metric_values — the fact table
# ---------------------------------------------------------------------------


class MetricValue(Base):
    __tablename__ = "metric_values"

    id: Mapped[uuid.UUID] = _uuid_pk()
    entity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE")
    )
    market_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("markets.id", ondelete="CASCADE")
    )
    metric_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("metrics.id"), nullable=False
    )
    period_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("periods.id"), nullable=False
    )
    report_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reports.id", ondelete="SET NULL")
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sources.id"), nullable=False
    )

    value_numeric: Mapped[Decimal | None] = mapped_column(Numeric)
    value_text: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str | None] = mapped_column(Text)
    unit_multiplier: Mapped[str | None] = mapped_column(Text)
    yoy_change_pct: Mapped[Decimal | None] = mapped_column(Numeric)
    qoq_change_pct: Mapped[Decimal | None] = mapped_column(Numeric)

    disclosure_status: Mapped[str] = mapped_column(Text, nullable=False)
    is_canonical: Mapped[bool] = mapped_column(server_default=text("false"), nullable=False)
    confidence_score: Mapped[Decimal | None] = mapped_column(Numeric)

    notes: Mapped[str | None] = mapped_column(Text)
    extracted_from_section: Mapped[str | None] = mapped_column(Text)
    extracted_from_table_id: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    metric: Mapped[Metric] = relationship()
    period: Mapped[Period] = relationship()
    source: Mapped[Source] = relationship()
    report: Mapped[Report | None] = relationship()
    entity: Mapped[Entity | None] = relationship()
    market: Mapped[Market | None] = relationship()
    beacon_audit: Mapped[list["BeaconEstimate"]] = relationship(
        back_populates="metric_value", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "disclosure_status in ('disclosed','not_disclosed','partially_disclosed',"
            "'beacon_estimate','derived')",
            name="ck_metric_values_disclosure_status",
        ),
        CheckConstraint(
            "unit_multiplier is null or unit_multiplier in "
            "('units','thousands','millions','billions')",
            name="ck_metric_values_unit_multiplier",
        ),
        CheckConstraint(
            "confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)",
            name="ck_metric_values_confidence_score_range",
        ),
        Index("ix_mv_entity_metric_period", "entity_id", "metric_id", "period_id"),
        Index("ix_mv_market_metric_period", "market_id", "metric_id", "period_id"),
        Index("ix_mv_report", "report_id"),
        Index("ix_mv_source_disclosure", "source_id", "disclosure_status"),
        Index(
            "ix_mv_canonical",
            "is_canonical",
            postgresql_where=text("is_canonical = true"),
        ),
    )


# ---------------------------------------------------------------------------
# narratives
# ---------------------------------------------------------------------------


class Narrative(Base):
    __tablename__ = "narratives"

    id: Mapped[uuid.UUID] = _uuid_pk()
    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reports.id", ondelete="CASCADE"), nullable=False
    )
    entity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="SET NULL")
    )
    market_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("markets.id", ondelete="SET NULL")
    )
    section_code: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    report: Mapped[Report] = relationship(back_populates="narratives")
    entity: Mapped[Entity | None] = relationship()
    market: Mapped[Market | None] = relationship()

    __table_args__ = (
        CheckConstraint(
            "section_code in ('executive_summary','company_insights_interpretation',"
            "'market_deep_dive','affiliate_benchmarking','forecast_strategy',"
            "'investment_view','valuation_downside','valuation_base','valuation_upside')",
            name="ck_narratives_section_code",
        ),
        Index("ix_narratives_report_section", "report_id", "section_code"),
        Index(
            "ix_narratives_content_gin",
            text("to_tsvector('english', content)"),
            postgresql_using="gin",
        ),
    )


# ---------------------------------------------------------------------------
# beacon_estimates (audit trail)
# ---------------------------------------------------------------------------


class BeaconEstimate(Base):
    __tablename__ = "beacon_estimates"

    id: Mapped[uuid.UUID] = _uuid_pk()
    metric_value_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("metric_values.id", ondelete="CASCADE"), nullable=False
    )
    methodology_code: Mapped[str] = mapped_column(Text, nullable=False)
    model_version: Mapped[str | None] = mapped_column(Text)
    inputs: Mapped[dict | None] = mapped_column(JSONB)
    confidence_score: Mapped[Decimal | None] = mapped_column(Numeric)
    confidence_band_low: Mapped[Decimal | None] = mapped_column(Numeric)
    confidence_band_high: Mapped[Decimal | None] = mapped_column(Numeric)
    methodology_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    metric_value: Mapped[MetricValue] = relationship(back_populates="beacon_audit")

    __table_args__ = (
        CheckConstraint(
            "methodology_code in ('tax_rate_implied','peer_ratio','linear_interpolation',"
            "'stock_price_implied','prior_period_extrapolation','composite_model')",
            name="ck_beacon_methodology_code",
        ),
        CheckConstraint(
            "confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)",
            name="ck_beacon_confidence_score_range",
        ),
        Index("ix_beacon_metric_value", "metric_value_id"),
    )


# Explicit export list keeps `from trailblaze.db.models import *` predictable and
# ensures Alembic's autogenerate registers everything.
__all__ = [
    "BeaconEstimate",
    "Entity",
    "EntityType",
    "EntityTypeAssignment",
    "Market",
    "MarketTaxHistory",
    "Metric",
    "MetricValue",
    "Narrative",
    "Period",
    "Report",
    "ReportEntity",
    "ReportMarket",
    "Source",
]
