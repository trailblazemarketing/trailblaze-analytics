"""Prompt templates for the parser.

Pass 1 (classification) is a static prompt.

Pass 2 (extraction) is **assembled dynamically** at call time from the current
state of the `metrics`, `metric_aliases`, and `periods` tables. The LLM can't
map to a canonical dictionary that it can't see, so we render the dictionary
into the system prompt itself.

Pass 2 is structured as **modular pattern recognisers** — each named block
describes one extraction pattern independently, with its own fixture example
and extraction contract. This matches the design in
`PHASE_2_5_DESIGN_v2.md §3`. Adding / tweaking / disabling a recogniser does
not require rewriting the rest of the prompt.
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


# ---------------------------------------------------------------------------
# Pass 2 — modular recognisers. Order: general → specific.
# ---------------------------------------------------------------------------

# Each recogniser describes ONE extraction pattern. Blocks are independently
# testable against fixtures drawn for their shape. The LLM emits rows under
# whichever recogniser(s) match the content it sees.

_RECOGNISER_PROSE_HEADLINE = """\
## Recogniser: prose-headline

Pattern: headline figures mentioned in the narrative prose of the report
(non-tabular). One `ExtractedMetric` row per mentioned figure.

Example input:
    "Revenue in Q2-25 was €303.7m, up 11.9% year-over-year, with EBITDA
     of €84.1m."

Emit:
    {metric_code: "revenue",  value_numeric: 303.7, currency: "EUR",
     unit_multiplier: "millions", yoy_change_pct: 11.9, period_code: "Q2-25",
     entity_name: <primary entity>, disclosure_status: "disclosed"}
    {metric_code: "ebitda",   value_numeric: 84.1,  currency: "EUR",
     unit_multiplier: "millions", period_code: "Q2-25",
     entity_name: <primary entity>, disclosure_status: "disclosed"}

Use your judgment for the primary entity — typically the subject of the
surrounding paragraph, or the entity named in the Subject line of the
analyst note.
"""

_RECOGNISER_SUMMARY_TABLE = """\
## Recogniser: summary-table

Pattern: compact summary tables at the top or bottom of reports that list
one row per metric with columns for the current period, QoQ%, YoY%, and
often a YTD column. Columns are metrics; rows are periods OR rows are
metrics and columns are periods — both orientations occur.

Example input:
    Online Revenue EUR(m)              |       | Q2-25 | QoQ  | YoY   | H1-25   | YoY
    Svenska Spel Online (inc lottery)  | GGR   | 104.9 | -1.5%| 4.6%  | 208.8   | 5.8%
    Evolution                          | Revenue | 524.3 | 0.6%| 3.1% | 1,045.2 | 3.5%

Emit one row per (entity, metric, period) cell. Period-columns (Q2-25,
H1-25) each become their own ExtractedMetric. QoQ/YoY columns populate
`qoq_change_pct` / `yoy_change_pct` on the corresponding absolute row — do
NOT emit standalone percentage rows for QoQ/YoY.
"""

_RECOGNISER_OPERATOR_SEGMENT_REGION = """\
## Recogniser: operator-segment-region   (Pattern 1)

Pattern: the analyst note's dedicated deep-dive table for a single operator,
listing ITS OWN revenue and KPIs broken down by product segment, business
model (B2B/B2C), and geographic region. These tables typically appear in
quarterly-result-digest emails and always cover a single entity named at
the top or in the section heading immediately above.

Concrete example (Betsson Q2-25):
    Betsson EUR(m)          | Q2-25 | QoQ   | YoY    | H1-25 | YoY
    Casino                  | 212.4 |  0.0% |  11.1% | 424.7 |  14.3%
    Sportsbook              |  90.0 | 12.9% |  14.8% | 169.7 |  17.9%
    Other                   |   1.3 |-18.8% | -35.0% |   2.9 | -31.0%
    Total Revenue           | 303.7 |  3.4% |  11.9% | 597.4 |  15.0%
    B2B Revenue             |  76.5 |-15.2% |   8.4% | 166.7 |  20.3%
    B2C Revenue             | 227.2 | 11.6% |  13.1% | 430.7 |  13.0%
    Marketing + Affiliate   |  49.3 |  7.2% |  10.0% |  95.3 |   9.4%
    % of B2C Revenue        | 21.7% |       |        | 22.1% |
    B2C Actives '000        | 1,384 |  1.0% |  -1.4% |       |
    B2C ARPU                | EUR 164 | 10.5% | 14.7% |       |
    Total Sports Turnover   | 1,468 |-19.9% |  -4.4% | 3,300 |   3.3%
    Sports Margin           |  9.5% |       |        |  8.7% |
    Operating Profit        |  69.0 |  7.8% |   7.6% | 133.0 |   9.0%
    EBIT Margin             | 22.7% |       |        | 22.3% |
    CEECA                   | 118.2 | -3.4% |   3.7% | 240.5 |   7.3%
    LatAm                   |  84.7 | 13.7% |  35.3% | 159.2 |  49.8%
    Nordic                  |  33.9 |-10.3% | -28.3% |  71.7 | -23.9%
    Western Europe          |  59.3 |  6.7% |  35.7% | 114.9 |  31.9%
    RoW                     |   7.6 |123.5% |  94.9% |  11.0 |  41.0%

Label → (metric_code, entity_name, market_name) mapping:

    Label               metric_code              entity_name     market_name
    ------------------- ------------------------ --------------- -----------
    Casino              casino_revenue           <operator>      (null)
    Sportsbook          sportsbook_revenue       <operator>      (null)
    Other               other_revenue            <operator>      (null)
    Total Revenue       revenue                  <operator>      (null)
    B2B Revenue         b2b_revenue              <operator>      (null)
    B2C Revenue         b2c_revenue              <operator>      (null)
    Marketing+Affiliate marketing_spend          <operator>      (null)
    % of B2C Revenue    marketing_pct_revenue    <operator>      (null)
    B2C Actives '000    active_customers         <operator>      (null)
                        (unit_multiplier="thousands")
    B2C ARPU            arpu                     <operator>      (null)
    Total Sports Turnover sportsbook_turnover    <operator>      (null)
    Sports Margin       sports_margin_pct        <operator>      (null)
    Operating Profit    operating_profit         <operator>      (null)
    EBIT Margin         ebit_margin              <operator>      (null)

    Regional rows — emit `revenue` per region as a separate row per period:
    CEECA               revenue                  <operator>      CEECA
    LatAm               revenue                  <operator>      LatAm
    Nordic              revenue                  <operator>      Nordic
    Western Europe      revenue                  <operator>      Western Europe
    RoW                 revenue                  <operator>      RoW

Rules specific to this recogniser:
  - Each period column in the header (Q2-25, H1-25 in the example) becomes
    its own set of rows. QoQ and YoY columns are attached as percentages on
    the corresponding absolute row, not emitted as standalone rows.
  - Leave `market_name` null except on the region sub-block (CEECA / LatAm /
    Nordic / Western Europe / RoW). Do NOT put the operator's country of
    listing in `market_name` — this recogniser is about intra-operator
    splits, not cross-market attribution.
  - If the table further splits a region by product ("LatAm casino EUR51.4m,
    LatAm sports EUR33.2m") — emit those sub-splits as additional rows with
    metric_code=casino_revenue / sportsbook_revenue AND market_name=LatAm.
  - If `B2C ARPU` is in EUR per user, set `currency="EUR"` and leave
    `unit_multiplier` null (ARPU is a dimensionless per-user figure, not
    millions).
  - The summary-table recogniser may ALSO see rows from this table — defer
    to this one; do not double-emit.
"""

_RECOGNISER_STATE_OPERATOR_MATRIX = """\
## Recogniser: state-operator-matrix   (Pattern 4)

Pattern: US state-level monthly-report tables where rows are operators and
columns give absolute value + YoY% + market-share% for a metric, with a
total-handle or total-GGR row at the bottom. Typically stacked two-deep —
one block for Handle, a second block for GGR, with the same operator rows.

Concrete example (Pennsylvania June 2025):
    PA Sports Betting $m          | Jun-25 | YoY    | m/s   | YTD   | YoY    | m/s
    FanDuel                       | 162.2  | -9.5%  | 35.2% | 1,629 | -2.3%  | 39.4%
    DraftKings                    | 130.5  |  0.9%  | 28.3% | 1,086 |  3.2%  | 26.3%
    BetMGM                        |  46.0  | 30.4%  | 10.0% | 358.9 | 48.5%  |  8.7%
    Fanatics                      |  35.0  |114.1%  |  7.6% | 325.0 |192.9%  |  7.9%
    bet365                        |  20.9  |        |  4.5% | 184.1 |        |  4.5%
    ESPN Bet                      |  21.0  | -9.9%  |  4.5% | 179.6 |-34.7%  |  4.3%
    Rush Street                   |  21.3  |-18.4%  |  4.6% | 170.8 |-10.0%  |  4.1%
    Caesars                       |  15.1  | -8.7%  |  3.3% | 137.3 |-14.5%  |  3.3%
    Others (2)                    |   8.6  |        |  1.9% |  59.2 |        |  1.4%
    Total Online Sports Handle    | 460.6  |  5.5%  |       | 4,130 |  8.8%  |
    (second block, same operator rows)
    ...
    Total Online Sports GGR       |  64.8  | 55.8%  |       | 364.8 |  1.1%  |
    Total Online Sports NGR       |  49.2  | 72.8%  |       | 231.9 | -6.3%  |

Label → emit mapping:

    Per operator row in the Handle block, for each period column:
      (metric_code=sportsbook_handle,  entity=<operator>, market=<state>,
        value_numeric=<$m>, currency="USD", unit_multiplier="millions",
        yoy_change_pct=<yoy>)
      (metric_code=market_share_handle, entity=<operator>, market=<state>,
        value_numeric=<m/s pct>)  -- only if m/s is present for that cell

    Per operator row in the GGR block, for each period column:
      (metric_code=sportsbook_ggr,      entity=<operator>, market=<state>, ...)
      (metric_code=market_share_ggr,    entity=<operator>, market=<state>, ...)

    Table-total rows (Total Online Sports Handle / GGR / NGR): emit with
    entity_name=null, market_name=<state> so they aggregate at the state
    level.

Rules specific to this recogniser:
  - `market_name` must name a US state (e.g. "Pennsylvania", "Massachusetts",
    "New Jersey"). Do NOT invent two-letter state codes.
  - Operator rows that combine multiple brands ("DraftKings, BetMGM, ESPN",
    "PlayLive, Betway, Jackpotcity", "FanDuel, StarDust", "Others (3)") are
    UNRESOLVABLE as single entities — do NOT emit them as metric rows. Add
    one `warnings[]` entry per skipped group describing what was skipped.
  - When the GGR block has NO explicit header row (it's implicit from the
    metric total at the bottom), rely on the total row's label to identify
    the block as GGR vs NGR vs Handle.
  - Period columns: "Jun-25" in the header → period_code "Jun-25".  "YTD"
    columns → period_code "YTD-Jun-25" (year-to-date through the current
    month).
  - If a YoY column is empty for an operator row that period (new entrant,
    e.g. bet365 without a year-prior comparison), emit the absolute row
    only and leave `yoy_change_pct` null. Do not skip the row.

Entity resolution: report operator names exactly as written
("DraftKings", "FanDuel", "BetMGM", "ESPN Bet", "Rush Street",
"Bally Bet", "Caesars", "Fanatics", "bet365"). Unknown operators get
auto-added at ingest time under `status=auto_added_needs_review` —
that is the expected behavior, not an error. Don't paraphrase names.
"""

# Future recognisers (Patterns 2, 3, 5) will slot in here as Units B–D ship.

_PASS2_RECOGNISERS = "\n\n".join([
    _RECOGNISER_PROSE_HEADLINE,
    _RECOGNISER_SUMMARY_TABLE,
    _RECOGNISER_OPERATOR_SEGMENT_REGION,
    _RECOGNISER_STATE_OPERATOR_MATRIX,
])


# Base frame — metric dictionary + period grammar + alias block substituted
# at build time. The recogniser blocks above are constant at import time; the
# dictionary is rebuilt from the DB once per process (cached in llm.py).
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

# Recognisers

Apply every recogniser below that matches content you see. Multiple
recognisers may fire on a single report. Each recogniser defines its own
extraction contract; follow them independently.

{recognisers_section}

# Global rules

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
        recognisers_section=_PASS2_RECOGNISERS,
    )


# Kept for any external code / tests that import the legacy constant; it
# resolves to a placeholder because the real prompt is now dynamic.
PASS2_SYSTEM = (
    "(This is a placeholder. The pass-2 system prompt is now built dynamically "
    "via `build_pass2_system(session)`. Do not use this constant directly.)"
)
