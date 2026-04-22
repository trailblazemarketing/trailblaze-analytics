"""Source-type catalogue. Per SCHEMA_SPEC.md §sources."""

from __future__ import annotations

SOURCES: list[dict] = [
    {
        "source_type": "trailblaze_pdf",
        "name": "Trailblaze PDF report",
        "confidence_tier": "high",
        "display_label": "Trailblaze",
        "is_proprietary": True,
    },
    {
        "source_type": "regulator_filing",
        "name": "Regulator filing",
        "confidence_tier": "verified",
        "display_label": "Regulator",
    },
    {
        "source_type": "sec_filing",
        "name": "SEC filing",
        "confidence_tier": "verified",
        "display_label": "SEC filing",
    },
    {
        "source_type": "company_ir",
        "name": "Company investor relations",
        "confidence_tier": "verified",
        "display_label": "Company IR",
    },
    {
        "source_type": "stock_api",
        "name": "Stock market data API",
        "confidence_tier": "verified",
        "display_label": "Market data",
    },
    {
        "source_type": "industry_trade",
        "name": "Industry trade press",
        "confidence_tier": "medium",
        "display_label": "Trade press",
    },
    {
        "source_type": "social_media",
        "name": "Social media",
        "confidence_tier": "low",
        "display_label": "Social media",
    },
    {
        "source_type": "beacon_estimate",
        "name": "Trailblaze Beacon estimate",
        "confidence_tier": "modeled",
        "display_label": "Trailblaze Beacon™",
        "is_proprietary": True,
    },
    {
        "source_type": "manual_entry",
        "name": "Manual entry",
        "confidence_tier": "high",
        "display_label": "Manual entry",
    },
    {
        "source_type": "analyst_note",
        "name": "Analyst note (Gmail ingestion)",
        "confidence_tier": "verified",
        "display_label": "Analyst note",
        "is_proprietary": True,
    },
]
