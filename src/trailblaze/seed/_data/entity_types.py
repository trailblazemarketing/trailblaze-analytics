"""Entity-type seed rows. Per SCHEMA_SPEC.md §entity_types."""

from __future__ import annotations

ENTITY_TYPES: list[dict] = [
    {"code": "operator", "display_name": "B2C Operator", "description": "Consumer-facing iGaming / OSB operator"},
    {"code": "affiliate", "display_name": "Affiliate", "description": "Publisher monetising via referral of players"},
    {"code": "b2b_platform", "display_name": "B2B Platform", "description": "Platform supplier (PAM, sportsbook platform, live casino)"},
    {"code": "b2b_supplier", "display_name": "B2B Supplier", "description": "Game/content supplier or other B2B vendor"},
    {"code": "lottery", "display_name": "Lottery", "description": "Lottery operator (state, national, or private)"},
    {"code": "dfs", "display_name": "DFS", "description": "Daily Fantasy Sports / fantasy pick'em"},
    {"code": "media", "display_name": "Media", "description": "Industry media, trade press, data provider"},
    {"code": "regulator", "display_name": "Regulator", "description": "Gaming regulator or licensing authority"},
    {"code": "payment_provider", "display_name": "Payment Provider", "description": "Payments, KYC, fraud, or wallet provider"},
]
