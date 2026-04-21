"""Prompt templates for the parser.

Pass 1 (classification) is a static prompt.

Pass 2 (extraction) is **assembled dynamically** at call time from the current
state of the `metrics`, `metric_aliases`, and `periods` tables. The LLM can't
map to a canonical dictionary that it can't see, so we render the dictionary
into the system prompt itself.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from trailblaze.db.models import Metric, MetricAlias, Period

PASS1_SYSTEM = """You are the classifier stage of the Trailblaze Analytics PDF parser. Read the extracted text of a single Trailblaze PDF report and return structured metadata via the `classify_document` tool.

Your job in this pass is NOT to extract metrics. It is to identify:
1. `document_type` — one of: market_update, company_report, presentation, trading_update, analyst_call, capital_markets_day, ma_announcement, regulatory_update, or `shell` if the report has no substantive content.
2. `primary_entities` — the companies the report is primarily about. Include the exact name as written, plus any aliases you see used in the same document.
3. `primary_markets` — jurisdictions the report is primarily about (e.g. "New Jersey", "United Kingdom").
4. `primary_period` — the financial period the report covers. Prefer Trailblaze period codes: Q1-25, Q2-25, H1-25, 9M-25, FY-25.
5. `shell_likely` — true if the report appears to be a stub/shell with no substantive data.
6. `confidence` — 0.0 to 1.0 on your overall classification.

Always return via the tool. Never output free-form text.
"""


# Base frame for PASS2 — the metric list, period grammar, and alias block are
# substituted in at build time. Keep this string in sync with the builder.
_PASS2_FRAME = """You are the extraction stage of the Trailblaze Analytics PDF parser. You have already classified this document. Now extract every numeric metric and every qualitative narrative section via the `extract_content` tool.

# Canonical metric dictionary

You MUST emit `metric_code` values from this list only. Match on meaning, not lexical form — if a report says "net gaming revenue" use `ngr`, if it says "gross gaming revenue" use `ggr`, etc.

{metrics_section}

# Canonical period grammar

Emit `period_code` values matching one of these patterns exactly:

- Quarterly:   `Q1-25`, `Q2-25`, `Q3-25`, `Q4-25`
- Half-year:   `H1-25`, `H2-25`
- Nine months: `9M-25`
- Full year:   `FY-25`
- LTM (year-end):    `LTM-25` (equivalent: `TTM-25`)
- LTM (quarter-end): `LTM-Q1-25`, `LTM-Q2-25`, `LTM-Q3-25`, `LTM-Q4-25`
- Monthly:     `Jan-25`, `Feb-25`, ..., `Dec-25` (three-letter month, two-digit year)
- Monthly (numeric variant): `M01-25`, `M02-25`, ..., `M12-25`
- Year-to-date: `YTD-Jun-25`, `YTD-Sep-25`, `YTD-Dec-25` (YTD-<Mmm>-<YY>)
- YTD full year: `YTD-25`

Do NOT emit freeform period strings like "Q3 2025", "October 2025", "last twelve months" — always convert to the canonical format above.

# Common alias reminders

The LLM-emitted codes below are NON-CANONICAL. Use the canonical code instead:

{aliases_section}

# Rules

- Emit `metric_code` values ONLY from the canonical list above. Do NOT invent codes.
- Emit `period_code` values ONLY matching the grammar above. Do NOT invent period formats.
- If a value doesn't cleanly match any canonical metric, emit the closest match AND add a note to `warnings[]` explaining what was reported and why you chose that code.
- For each numeric value, output ONE metric row.
- Set `disclosure_status`:
    - `disclosed` — number is stated in the document
    - `not_disclosed` — document explicitly notes the figure is not disclosed
    - `partially_disclosed` — e.g. YoY change given but absolute is not (use `value_text` / `yoy_change_pct`, leave `value_numeric` null)
    - `beacon_estimate` — NEVER use in this stage (reserved for the Beacon engine)
    - `derived` — document reports it as calculated from other values
- Store values AS REPORTED. If the document says "€15bn", set `value_numeric=15`, `currency="EUR"`, `unit_multiplier="billions"`. Do NOT normalise across rows.
- Segment splits (e.g. "casino revenue: 100, sportsbook revenue: 50") become SEPARATE metric rows — one per `metric_code`.
- Extract narrative sections (`executive_summary`, `company_insights_interpretation`, `market_deep_dive`, `affiliate_benchmarking`, `forecast_strategy`, `investment_view`, `valuation_downside`, `valuation_base`, `valuation_upside`). Copy the section text verbatim into `content` — do not summarise.
- Per-value confidence: 0.9+ if explicitly stated in clean prose, 0.7–0.9 if inferred from a table or noisy context, below 0.7 if you're guessing.

If the document contains no extractable numeric data, return `metrics=[]` (the orchestrator will mark the report as a shell). Always return via the tool. Never output free-form text.
"""


def build_pass2_system(session: Session) -> str:
    """Render the pass-2 system prompt against the current metric / alias /
    period tables. Called once per process (llm.py caches the result)."""
    # --- metrics grouped by category ---
    rows = session.execute(
        select(Metric.code, Metric.display_name, Metric.category)
        .order_by(Metric.category.nulls_last(), Metric.code)
    ).all()
    by_category: dict[str, list[tuple[str, str]]] = {}
    for code, display_name, category in rows:
        by_category.setdefault(category or "other", []).append((code, display_name))

    metrics_lines: list[str] = []
    for category in sorted(by_category.keys()):
        metrics_lines.append(f"## {category.replace('_', ' ').title()}")
        for code, display_name in by_category[category]:
            metrics_lines.append(f"- `{code}` — {display_name}")
        metrics_lines.append("")
    metrics_section = "\n".join(metrics_lines).rstrip()

    # --- top metric aliases (if any) ---
    alias_rows = session.execute(
        select(MetricAlias.alias_code, Metric.code)
        .join(Metric, Metric.id == MetricAlias.canonical_metric_id)
        .order_by(MetricAlias.alias_code)
    ).all()
    if alias_rows:
        aliases_section = "\n".join(
            f"- `{alias}` → use `{canonical}`" for alias, canonical in alias_rows
        )
    else:
        aliases_section = "(none currently)"

    return _PASS2_FRAME.format(
        metrics_section=metrics_section,
        aliases_section=aliases_section,
    )


# Kept for any external code / tests that import the legacy constant; it
# resolves to a placeholder because the real prompt is now dynamic.
PASS2_SYSTEM = (
    "(This is a placeholder. The pass-2 system prompt is now built dynamically "
    "via `build_pass2_system(session)`. Do not use this constant directly.)"
)
