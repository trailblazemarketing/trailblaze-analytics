# Rich Extraction Notes — Analyst Email Tables

**Status:** Capture only. Not scheduled.
**Created:** 2026-04-22
**Target phase:** Phase 2.5 or 2.6 (after entity canonicalization, before Beacon™ v1)
**Owner:** Andrew (strategist) + Coordinator (scoping) → Claude Code (engineer)

---

## Purpose

During the Gmail ingestion of Oyvind Miller's analyst notes we discovered that his emails contain structured tabular data **substantially richer** than what our current parser extracts. The current parser pulls headline figures (total revenue, ebitda, ebitda margin, stock price) from prose and summary tables, but loses the segmented / matrixed / time-series structure in the body tables.

This file captures concrete examples of that lost structure so that when we schedule the rich-extraction upgrade we have a clear spec to work from.

**Principle:** Nothing is lost today. `reports.raw_text` preserves the full email body for every ingested analyst note. The extraction upgrade re-runs against stored raw_text — no need to re-ingest Gmail.

---

## Five distinct table patterns found

### Pattern 1 — Operator deep-dive with segment + regional splits (Betsson)

```
Betsson EUR(m)         | Q2-25 | QoQ   | YoY    | H1-25 | YoY
-----------------------+-------+-------+--------+-------+-------
Casino                 | 212.4 |  0.0% |  11.1% | 424.7 |  14.3%
Sportsbook             |  90.0 | 12.9% |  14.8% | 169.7 |  17.9%
Other                  |   1.3 |-18.8% | -35.0% |   2.9 | -31.0%
Total Revenue          | 303.7 |  3.4% |  11.9% | 597.4 |  15.0%
                       |       |       |        |       |
B2B Revenue            |  76.5 |-15.2% |   8.4% | 166.7 |  20.3%
B2C Revenue            | 227.2 | 11.6% |  13.1% | 430.7 |  13.0%
                       |       |       |        |       |
Marketing +Affiliate   |  49.3 |  7.2% |  10.0% |  95.3 |   9.4%
% of B2C Revenue       | 21.7% |       |        | 22.1% |
                       |       |       |        |       |
B2C Actives '000       | 1,384 |  1.0% |  -1.4% |       |
B2C ARPU               | EUR 164| 10.5%| 14.7% |       |
                       |       |       |        |       |
Total Sports Turnover  | 1,468 |-19.9% |  -4.4% | 3,300 |   3.3%
Sports Margin          |  9.5% |       |        |  8.7% |
                       |       |       |        |       |
Operating Profit       |  69.0 |  7.8% |   7.6% | 133.0 |   9.0%
EBIT Margin            | 22.7% |       |        | 22.3% |
                       |       |       |        |       |
CEECA                  | 118.2 | -3.4% |   3.7% | 240.5 |   7.3%
LatAm                  |  84.7 | 13.7% |  35.3% | 159.2 |  49.8%
Nordic                 |  33.9 |-10.3% | -28.3% |  71.7 | -23.9%
Western Europe         |  59.3 |  6.7% |  35.7% | 114.9 |  31.9%
RoW                    |   7.6 |123.5% |  94.9% |  11.0 |  41.0%
```

**What the current schema captures:** `revenue` = 303.7, `ebit_margin` = 22.7%, maybe a few more headline figures.

**What's lost:**
- **Product segment split** — Casino / Sportsbook / Other as distinct revenue streams
- **B2B vs B2C split** — a major dimension for this company
- **Regional revenue split** — CEECA / LatAm / Nordic / Western Europe / RoW
- **Marketing spend as % of revenue** — ratio metric
- **Sports turnover + margin pair** — essential for sportsbook analysis
- **Active users + ARPU with QoQ/YoY deltas** — actives and monetization rate

**Schema implications:**
- Need a `segment` dimension on `metric_values` (product_segment: casino|sportsbook|other; business_segment: b2b|b2c)
- Need a `region` concept above `market` (superregion: ceeca|latam|nordic|western_europe|row) OR allow `market` rows for virtual regions
- Multiple `scope` values per metric (absolute value, qoq, yoy) — current schema may or may not handle this cleanly; need to check

---

### Pattern 2 — B2B supplier with operator metrics (Kambi)

```
Kambi EURm             | Q2-25 | QoQ    | YoY    | H1-25 | YoY
-----------------------+-------+--------+--------+-------+-------
Revenue                |  40.5 |  -2.4% | -11.5% |  81.9 |  -7.9%
Data Supplier Costs    |   4.7 |  -8.5% |  10.7% |   9.9 |   9.0%
Gross Profit           |  35.7 |  -1.6% | -13.8% |  72.0 |  -9.8%
                       |       |        |        |       |
Adj EBITDA             |  12.4 |  12.0% | -22.8% |  23.5 | -22.2%
Adj EBITA (acq)        |   3.7 |  61.7% | -50.3% |   6.0 | -54.5%
Kambi "Turnover Index" |   672 |  -8.8% |  -4.5% | 1,409 |  -0.5%
Operator margin        | 11.5% |        |        | 10.8% |
```

**What's lost:**
- **Data supplier costs + gross profit** — B2B cost structure
- **Adj EBITDA vs Adj EBITA** — distinction matters for B2B SaaS-style analysis
- **"Turnover Index"** — proprietary KPI from Kambi; a B2B volume proxy
- **Operator margin** — the aggregate margin of Kambi's customer operators

**Schema implications:**
- `metric_definition` table needs to accommodate proprietary KPIs (turnover_index)
- B2B entities may need a distinct `PANELS.b2b_sportsbook` layout featuring turnover_index + operator_margin
- Adj EBITDA vs EBITDA: these are different metrics — need separate rows or an `adjustment` flag

---

### Pattern 3 — Affiliate with revenue-source split (Raketech)

```
Raketech EURm     | Q2-25  | QoQ    | YoY    | H1-25  | YoY
------------------+--------+--------+--------+--------+-------
Revenue Share     |    3.9 | -10.3% | -31.0% |    8.1 | -31.4%
Upfront Payment   |    1.7 | -40.6% | -77.1% |    4.7 | -72.0%
Flat Fee          |    2.1 |  -5.1% | -20.0% |    4.3 | -13.0%
Subscription      |    0.1 | -60.4% | -89.3% |    0.4 | -81.9%
Total Revenue     |    7.8 | -19.8% | -53.8% |   17.6 | -51.0%
                  |        |        |        |        |
Casino            |    5.6 | -26.9% | -58.5% |   13.3 | -54.1%
Sports            |    2.2 |   6.9% | -35.5% |    4.3 | -38.3%
                  |        |        |        |        |
Affiliation       |    5.7 |  -4.3% | -24.9% |   11.7 | -28.5%
Sub-affiliation   |    2.0 | -43.0% | -75.9% |    5.4 | -68.4%
Tips/Subscription |    0.1 | -60.4% | -89.3% |    0.4 | -81.9%
                  |        |        |        |        |
Adj EBITDA        |    2.1 | -12.3% | -51.9% |    4.5 | -52.3%
margin            |  26.8% |        |        |  25.6% |
                  |        |        |        |        |
NDCs              | 15,867 | -17.7% | -67.9% | 35,144 | -67.8%
```

**What's lost:**
- **Revenue stream split** — Revenue Share / Upfront / Flat Fee / Subscription (critical for affiliate valuation)
- **Vertical split** — Casino / Sports revenue split within affiliate
- **Business-line split** — Affiliation / Sub-affiliation / Tips (different economics)
- **NDCs** — New Depositing Customers, the key lead indicator for affiliates

**Schema implications:**
- Affiliate entities need a distinct `PANELS.affiliate` panel layout (different from operator)
- `revenue_model` sub-dimension: rev_share | upfront | flat_fee | subscription
- NDCs is a first-class KPI for affiliates — add to metric vocabulary

**UI implications (Andrew's note):** affiliates may want a different top-level navigation or category on the Companies page. Currently everything is under `operator`. Needs a dedicated `affiliate` section with its own landing page showing top affiliates by NDCs, by revenue, by margin. Park for Phase 2 page-composition discussion.

---

### Pattern 4 — State × Operator matrix with handle AND GGR (Massachusetts, Arizona)

```
Massachusetts OSB $m    | May-25 |   YoY  |  m/s  |  YTD  |  YoY   |  m/s
------------------------+--------+--------+-------+-------+--------+------
DraftKings              |  330.8 |  10.5% | 51.2% | 1,743 |  15.6% | 50.4%
FanDuel                 |  171.9 |  -0.3% | 26.6% |   951 |   6.7% | 27.5%
BetMGM                  |   49.2 |  25.2% |  7.6% | 294.1 |  47.2% |  8.5%
Fanatics                |   46.3 | 133.5% |  7.2% | 214.8 | 123.7% |  6.2%
ESPN Bet                |   21.9 | -15.2% |  3.4% | 120.6 | -26.6% |  3.5%
Caesars                 |   20.7 |   2.9% |  3.2% | 112.2 |   5.7% |  3.2%
Bally Bet               |    4.9 |        |  0.8% |  22.9 |        |  0.7%
Online Handle - Settled |  645.7 |  11.9% |       | 3,458 |  16.0% |
Online Handle - Written |  645.3 |  11.8% |       | 3,453 |  16.0% |

DraftKings              |   42.4 |  46.0% | 52.1% | 199.9 |  37.5% | 54.8%
FanDuel                 |   23.5 |  15.8% | 28.8% | 105.1 |   9.4% | 28.8%
BetMGM                  |    5.0 |  60.5% |  6.2% |  23.5 |  46.1% |  6.4%
Fanatics                |    5.9 | 234.5% |  7.2% |  18.1 | 195.4% |  5.0%
ESPN Bet                |    2.7 |   6.2% |  3.3% |  10.3 |  -8.0% |  2.8%
Caesars                 |    1.8 |  11.0% |  2.2% |   6.2 |  14.1% |  1.7%
Bally Bet               |    0.2 |        |  0.3% |   1.4 |        |  0.4%
Online Sports GGR       |   81.5 |  39.7% |       | 364.4 |  29.8% |
```

**This is the most valuable pattern we're losing.**

**What's lost:** the entity × market matrix — individual operator performance within a single state, with three metrics per cell (value, YoY, market share). Plus it's a **two-stacked-matrix** — the first block is Handle, the second block is GGR, both with the same operator rows but different metric headers implicit from the totals row.

**Current schema CAN represent this:**
- `metric_values` has `entity_id` (DraftKings), `market_id` (Massachusetts), `metric_type` (handle), `period` (May-25), `value` (330.8), `scope` (yoy, market_share)
- This is exactly what the schema was designed for

**What's missing is the PARSER logic** to recognize that a matrix with operator rows and (value, YoY, m/s) column triads should emit one metric_value per cell per metric_type, not a collapsed summary.

**UI implications:** this pattern enables the **Leaderboard** primitive for any state + metric combination ("Who's winning in Massachusetts OSB handle YTD?"). We already have the Leaderboard component. We just don't have the data rows to populate it.

**Priority:** HIGH. This single pattern unlocks substantial competitive intelligence value and we already have both the schema and the UI — just need the extraction.

---

### Pattern 5 — State × Month time-series grid (US Online Sports handle)

```
US Online Sports $m    | Dec-24 | Jan-25 | Feb-25 | Mar-25 | Apr-25 | May-25
-----------------------+--------+--------+--------+--------+--------+-------
New York               |  2,281 |  2,481 |  1,976 |  2,440 |  2,153 |  2,212
Illinois               |  1,459 |  1,438 |  1,135 |  1,457 |  1,258 |
New Jersey             |  1,163 |  1,106 |    950 |  1,063 |    954 |    967
Ohio                   |    944 |    992 |    748 |    973 |    795 |
Pennsylvania           |    849 |    830 |    727 |    806 |    681 |    625
Arizona                |    844 |    858 |    696 |    882 |        |
Massachusetts          |    777 |    752 |    619 |    762 |    681 |    646
Virginia               |    727 |    730 |    553 |    683 |    604 |
North Carolina         |    630 |    647 |    543 |    685 |    576 |    562
Colorado               |    644 |    653 |    494 |    615 |    506 |
Maryland               |    619 |    601 |    463 |    573 |    501 |    494
Michigan               |    598 |    555 |    380 |    475 |    418 |    386
Nevada (mobile)        |    573 |    534 |    397 |    613 |    483 |
Tennessee              |    573 |    549 |    417 |    552 |    467 |    441
Indiana                |    549 |    526 |    424 |    540 |    427 |    424
LA, IA, KS, KY and CT  |  1,406 |  1,407 |  1,150 |  1,355 |  1,123 |    846
NH, OR, WV, RI, AR + 4 |    478 |    480 |    365 |    458 |    403 |    361
Total Online Handle    | 15,111 | 15,139 | 12,036 | 14,932 | 12,029 |
YOY                    |  14.2% |  14.9% |  12.1% |  10.6% |   9.8% |  14.6%
```

**What's lost:** a 17-row × 6-column time-series grid. 102 data points in a single table. Currently most or all of this collapses into prose extraction, losing the grid structure.

**Schema:** each cell is just a `metric_value` with `market_id` + `metric_type=online_sports_handle` + `period` + `value`. Schema handles this natively.

**Parser issue:** wide tables where columns are time periods are a distinct pattern from long tables where rows are periods. Need both recognizers.

**Special cases in this table:**
- **Rolled-up rows** ("LA, IA, KS, KY and CT", "NH, OR, WV, RI, AR + 4") — not a single state, an aggregate. Either skip these or create aggregate "market groups" entities.
- **Total row** — redundant if we have all individuals; but useful for data validation.
- **YOY row** — a metric about the totals, different scope.

**UI implications:** enables the **TimeMatrix** primitive for "US Online Sports handle by state, last 6 months". This is the second of our four core UI primitives. Having the data populated means the Markets index page can show a state heatmap that actually works.

---

## Patterns NOT captured in these four emails (but likely in the rest)

Things to watch for as ingest completes and we review the other ~40 reports:

1. **Operator × product matrix** — e.g., DraftKings revenue split by Sportsbook / iGaming / Lottery / DFS
2. **Company-level geographic revenue** — e.g., DraftKings revenue by state (if ever disclosed)
3. **Peer comparison tables** — "vs consensus", "vs prior year guidance"
4. **Event-driven tables** — M&A deal financials, state launch dates, regulatory changes
5. **Guidance tables** — FY guidance ranges, revisions
6. **Tax/take-rate tables** — effective tax by jurisdiction

---

## Implementation approach when we schedule this (Phase 2.5 / 2.6)

### Step A — Schema audit
Review `metric_values` schema vs. the five patterns above. Questions to answer:
- Do we have a `segment` dimension for product/business segments?
- Do we have a `scope` column that accommodates {absolute, yoy_pct, qoq_pct, market_share}?
- Do we have a `region_group` above `market`?
- Is `metric_type` vocabulary rich enough (turnover_index, ndcs, data_supplier_costs, etc.)?

Output: migration brief for any schema additions needed.

### Step B — Parser upgrade spec
For each of the five patterns, define:
- Detection heuristic (how does the LLM recognize this pattern?)
- Extraction contract (what rows does it emit to `metric_values`?)
- Edge cases (rolled-up rows, missing cells, multi-header tables)

Output: expanded `parser/pipeline.py` with new recognizers + test fixtures drawn from the real Oyvind emails in our DB.

### Step C — Re-run extraction
Re-run the parser against `reports.raw_text` for all `source_type='analyst_note'` reports. No Gmail re-ingest needed.

### Step D — UI work
Populate dormant UI primitives that now have data:
- **Leaderboard** for state × operator rankings (Pattern 4 data)
- **TimeMatrix** for state × month grids (Pattern 5 data)
- **Segmented revenue cards** for product/business splits (Patterns 1, 3)
- **Affiliate top-nav and panel** for Raketech-style entities (Pattern 3)

---

## Priority ordering within the rich-extraction phase

1. **Pattern 4 (state × operator matrix)** — highest value, schema already supports it, UI primitive ready
2. **Pattern 5 (state × month grid)** — same as above, tall-source TimeMatrix is the headline
3. **Pattern 1 (operator segment + regional splits)** — schema likely needs additions; most work
4. **Pattern 3 (affiliate revenue model split)** — needs affiliate panel + top-nav; UI-heavy
5. **Pattern 2 (B2B supplier metrics)** — fewer entities affected; can come last

---

## What NOT to do

- Do not change the parser while Gmail ingest or reprocess is running
- Do not add schema columns until we've done the audit above
- Do not build UI for data we don't yet have populated
- Do not promise this to a pilot client as a feature until the extraction works for at least 80% of analyst emails

---

## Related files

- `ROADMAP.md` — reference this file from Phase 2.5 / 2.6
- `src/trailblaze/parser/pipeline.py` — the extraction code
- `SCHEMA_SPEC.md` — current schema of record
- `UI_SPEC_1_PRIMITIVES.md` — Leaderboard and TimeMatrix definitions
- `UI_SPEC_2_KPI_PANELS.md` — per-entity-type panels
- `UI_SPEC_3_PAGE_COMPOSITIONS.md` — page layouts (affiliate top-nav decision lives here)
