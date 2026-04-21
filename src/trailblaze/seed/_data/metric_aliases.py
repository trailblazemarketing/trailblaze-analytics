"""Metric code aliases — LLM-emitted variants → canonical `metrics.code`.

Keep this list short and grounded in actual observed LLM output. Every row
here should have a rationale recorded in `dictionary_aliases.md` at repo root.
Add new aliases when you see the same concept emitted under multiple names
in `reports.parse_warnings`.
"""

from __future__ import annotations

METRIC_ALIASES: list[dict] = [
    # Sportsbook handle variants
    {"alias_code": "sports_betting_handle", "canonical_code": "sportsbook_handle",
     "notes": "Verbose 'sports_betting_' prefix → canonical name."},
    {"alias_code": "sports_handle", "canonical_code": "sportsbook_handle",
     "notes": "Shorter LLM variant."},
    {"alias_code": "osb_handle", "canonical_code": "sportsbook_handle",
     "notes": "US-regulator parlance ('online sports betting')."},

    # Sportsbook revenue / GGR variants
    {"alias_code": "sports_revenue", "canonical_code": "sportsbook_revenue",
     "notes": "LLM drops the 'book'."},
    {"alias_code": "sports_betting_ggr", "canonical_code": "sportsbook_ggr",
     "notes": "Verbose prefix → canonical."},
    {"alias_code": "sports_ggr", "canonical_code": "sportsbook_ggr",
     "notes": "Shorter variant."},
    {"alias_code": "osb_ggr", "canonical_code": "sportsbook_ggr",
     "notes": "US-regulator parlance."},

    # iGaming → casino
    {"alias_code": "igaming_ggr", "canonical_code": "casino_ggr",
     "notes": "'iGaming' in US/EU operator reporting almost always means online casino."},

    # Total revenue / revenue
    {"alias_code": "total_revenue", "canonical_code": "revenue",
     "notes": "'Total revenue' is the default meaning of revenue in company-report context."},
]
