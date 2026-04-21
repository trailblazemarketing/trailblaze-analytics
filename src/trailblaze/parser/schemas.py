"""Strict Pydantic schemas for the two-pass parser's LLM outputs.

These double as the JSON schema passed to Anthropic tool-use — forcing the
model to return well-formed, schema-compliant data rather than free-form prose.

Field names match SCHEMA_SPEC.md terminology where possible; name-based
references (``entity_name``, ``market_name``) are resolved to UUIDs at ingest
time by the resolver.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DocumentType = Literal[
    "market_update", "company_report", "presentation", "trading_update",
    "analyst_call", "capital_markets_day", "ma_announcement",
    "regulatory_update", "shell",
]

DisclosureStatus = Literal[
    "disclosed", "not_disclosed", "partially_disclosed",
    "beacon_estimate", "derived",
]

UnitMultiplier = Literal["units", "thousands", "millions", "billions"]

SectionCode = Literal[
    "executive_summary", "company_insights_interpretation",
    "market_deep_dive", "affiliate_benchmarking", "forecast_strategy",
    "investment_view", "valuation_downside", "valuation_base",
    "valuation_upside",
]


# ---------------------------------------------------------------------------
# Pass 1 — classify
# ---------------------------------------------------------------------------


class EntityMention(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(description="Entity name as written in the document")
    aliases_seen: list[str] = Field(default_factory=list)


class MarketMention(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(description="Market name as written (e.g. 'New Jersey', 'United Kingdom')")
    iso_hint: str | None = Field(default=None, description="ISO-2 country or ISO-3166-2 subdivision if confident")


class PeriodMention(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code_hint: str | None = Field(
        default=None,
        description="Trailblaze period code if confident (e.g. 'Q2-25', 'H1-25', 'FY-24'). Null if unclear.",
    )
    description: str | None = Field(default=None, description="Period as described in the document")


class ClassificationOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_type: DocumentType
    primary_entities: list[EntityMention] = Field(default_factory=list)
    primary_markets: list[MarketMention] = Field(default_factory=list)
    primary_period: PeriodMention | None = None
    shell_likely: bool = False
    confidence: float = Field(ge=0.0, le=1.0)
    notes: str | None = None


# ---------------------------------------------------------------------------
# Pass 2 — extract
# ---------------------------------------------------------------------------


class ExtractedMetric(BaseModel):
    # Tool-use LLMs occasionally invent fields (e.g. market_share_pct on a metric
    # row). "ignore" drops them rather than crashing the whole parse.
    model_config = ConfigDict(extra="ignore")
    entity_name: str | None = None
    market_name: str | None = None
    metric_code: str = Field(description="Must match a row in the metrics dictionary (e.g. 'ggr').")
    period_code: str = Field(description="Trailblaze period code (e.g. 'Q2-25').")

    value_numeric: Decimal | None = None
    value_text: str | None = None
    currency: str | None = Field(default=None, description="ISO-4217, e.g. 'EUR'")
    unit_multiplier: UnitMultiplier | None = None
    yoy_change_pct: Decimal | None = None
    qoq_change_pct: Decimal | None = None

    disclosure_status: DisclosureStatus
    confidence: float = Field(ge=0.0, le=1.0)
    notes: str | None = None
    extracted_from_section: str | None = None
    extracted_from_table_id: str | None = None


class ExtractedNarrative(BaseModel):
    model_config = ConfigDict(extra="ignore")
    section_code: SectionCode
    entity_name: str | None = None
    market_name: str | None = None
    content: str = Field(min_length=1)


class ExtractionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metrics: list[ExtractedMetric] = Field(default_factory=list)
    narratives: list[ExtractedNarrative] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
