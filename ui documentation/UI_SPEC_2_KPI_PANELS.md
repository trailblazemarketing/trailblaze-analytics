# UI Design Spec — Part 2 of 3
# KPI Panels

**Companion docs:** `UI_SPEC_1_PRIMITIVES.md`, `UI_SPEC_3_PAGE_COMPOSITIONS.md`

---

## The problem this solves

The `metrics` table has ~50 codes. `metric_values` has thousands of rows spanning every metric for every entity. Showing all of them on every screen would be noise.

An analyst needs a **curated, consistent KPI panel** for each entity type — so when they move from FanDuel's page to BetMGM's, the same metrics appear in the same places. That consistency is what makes comparison possible.

**Rule:** Every entity type has a defined **primary panel** (3-5 hero KPIs) and **secondary panel** (4-8 supporting KPIs). Same layout every time.

---

## Entity types in the schema

From the `entity_types` seed:
- `operator` (B2C operators — FanDuel, ATG, Betsson)
- `affiliate` (Better Collective, Catena, Acroud)
- `b2b_platform` (Kambi, Playtech, Evolution)
- `b2b_supplier` (NetEnt, Aristocrat, NeoGames)
- `lottery` (OPAP, Allwyn, Veikkaus)
- `dfs` (PrizePicks, Underdog)
- `media`, `regulator`, `payment_provider` — rarely shown, low priority

---

## Panel 1 — B2C Operator

**The anchor entity type. Most companies we track are operators.**

### Primary KPIs (hero row, 4 tiles)

| # | Metric | Display | Why |
|---|---|---|---|
| 1 | **Total Revenue** | `revenue` or `ngr` | Top-line scale |
| 2 | **EBITDA Margin** | `ebitda_margin` | Profitability efficiency |
| 3 | **Active Users** | `active_customers` | Demand scale |
| 4 | **ARPU** | `arpu` | Monetization quality |

Each tile shows: big number, YoY delta (colored), tiny sparkline, source label.

### Secondary KPIs (support row, 8 tiles)

| Metric | Display |
|---|---|
| FTDs (first-time depositors) | `ftd` |
| Marketing % of revenue | `marketing_pct_revenue` |
| Online revenue share | `online_revenue` / total |
| Casino vs Sportsbook split | `casino_revenue` / `sportsbook_revenue` |
| Regulated market % | `locally_regulated_pct` |
| Sports margin | `sports_margin_pct` |
| Top geography | (computed: largest `market_id` for revenue) |
| Market count | (computed: distinct markets) |

### If the operator is listed (has a ticker)

Append a third row: **stock widget**
- Current price, day change, market cap
- 30-day chart
- EV/EBITDA multiple vs peer median
- P/E ratio
- Analyst rating (future: scraped)

---

## Panel 2 — Affiliate

### Primary KPIs (4 tiles)

| # | Metric | Why |
|---|---|---|
| 1 | **Total Revenue** | Top-line scale |
| 2 | **EBITDA** | Absolute profitability (affiliates often have volatile margins) |
| 3 | **NDCs** (new depositing customers referred) | The core volume metric |
| 4 | **Revenue per NDC** | Unit economics quality |

### Secondary KPIs (8 tiles)

- SEO revenue vs Paid media split
- Subscription / SaaS revenue share (for hybrid models like Acroud)
- Client count
- Top operator clients
- Geographic mix (top 3 markets)
- FTDs total
- Network size (if applicable)
- Marketing reinvestment %

---

## Panel 3 — B2B Platform (Kambi, Playtech, Evolution)

### Primary KPIs (4 tiles)

| # | Metric | Why |
|---|---|---|
| 1 | **Total Revenue** | Top-line scale |
| 2 | **EBITDA Margin** | Operator-like profitability |
| 3 | **Operator Turnover / Handle** (through platform) | Volume flowing through |
| 4 | **Take Rate %** | How much of turnover converts to their revenue |

### Secondary KPIs (8 tiles)

- Live games offered
- Operator customer count
- Revenue by tier (Tier 1 operators vs others)
- Geographic mix
- Sports coverage (for sportsbook platforms)
- Tables count (for live casino platforms)
- New game releases (last period)
- Top operator by revenue share

---

## Panel 4 — B2B Supplier (NetEnt, Aristocrat, NeoGames)

### Primary KPIs (4 tiles)

| # | Metric | Why |
|---|---|---|
| 1 | **Total Revenue** | Top-line scale |
| 2 | **EBITDA Margin** | Profitability |
| 3 | **Licensee Count** | Distribution reach |
| 4 | **Revenue per Licensee** | Monetization per customer |

### Secondary KPIs (8 tiles)

- Content revenue vs platform revenue split
- Game library size
- iLottery revenue (for lottery suppliers)
- iGaming market share in US (where relevant)
- New content releases
- Top 3 licensee operators
- Geographic revenue mix
- Recurring vs one-time revenue

---

## Panel 5 — Lottery (OPAP, Allwyn, Veikkaus)

### Primary KPIs (4 tiles)

| # | Metric | Why |
|---|---|---|
| 1 | **Total GGR** | Top-line scale |
| 2 | **EBITDA Margin** | Profitability (lottery margins usually 30-40%) |
| 3 | **Online % of GGR** | Digital transformation progress |
| 4 | **Active Players** | Demand |

### Secondary KPIs (8 tiles)

- Lottery vs iGaming vs sports split
- Retail network size (points of sale)
- Monopoly vs open-market revenue %
- Geographic mix
- Jackpot activity (impacts quarterly volatility)
- Tax paid / contributions to state
- Digital player conversion rate
- New game launches

---

## Panel 6 — DFS / Prediction Markets (PrizePicks, Underdog)

### Primary KPIs (4 tiles)

| # | Metric | Why |
|---|---|---|
| 1 | **Revenue** | Top-line scale |
| 2 | **EBITDA** | DFS margins are high — actual figures matter |
| 3 | **Monthly Actives** | The category metric |
| 4 | **App Downloads (LTM)** | Growth pipeline indicator |

### Secondary KPIs (8 tiles)

- FTDs
- Geographic mix (US states where legal)
- Contest entry volume
- Peer comparison (Underdog, Sleeper, Dabble)
- App ranking (iOS / Android)
- Monetization per active
- Retention %
- Prediction market vs traditional DFS split

---

## Panel 7 — Market (Jurisdiction)

**Not an entity — but needs the same treatment.** When an analyst looks at "New Jersey" or "UK", the scorecard is market-centric.

### Primary KPIs (4 tiles)

| # | Metric | Why |
|---|---|---|
| 1 | **Online GGR (LTM)** | Market size |
| 2 | **YoY Growth** | Market trajectory |
| 3 | **Operator Count** | Competitive density |
| 4 | **Tax Rate** | Regulatory economics |

### Secondary KPIs (8 tiles)

- Sportsbook handle (LTM)
- iGaming GGR vs Sportsbook GGR split
- Top operator market share %
- HHI (competition concentration)
- Beacon™ coverage % (how much of our data for this market is modeled)
- Last reported period (freshness indicator)
- Regulator filing count (LTM)
- Market launch date (if recent)

---

## Cross-cutting display rules

### Source labeling on KPI tiles

Every tile shows a small source label at the bottom. Hierarchy:
1. **"Source: Trailblaze Report — Q3 2025"** (from our PDFs)
2. **"Source: NJ DGE"** (from regulator scraper)
3. **"Source: Company IR — Q3 2025"** (from company IR scraper)
4. **"Source: Yahoo Finance (live)"** (stock data)
5. **"Trailblaze Beacon™"** (modeled, orange badge)

### When a metric doesn't exist for an entity type

Some metrics don't apply (e.g. Active Users for a B2B Supplier). The tile is **hidden**, not shown empty. Better to have 7 tiles than 8 with a blank one.

### When data is missing but Beacon™-estimable

The tile **still shows**, but the value is the Beacon™ estimate. This is the whole point of Beacon™ — fill gaps so the scorecard is complete for every entity.

### When data is truly unknown (not even estimable)

The tile shows **em-dash (—)** with a subtle "No data" label. The analyst knows we don't have it, but doesn't see zero (which would be misleading).

---

## What the parser + scrapers need to capture to support these panels

Right now, the parser and scrapers collect state totals. To fully populate these KPI panels, we also need:

**From PDFs (parser already capable, needs dictionary expansion):**
- ✅ Revenue, GGR, NGR (have it)
- ✅ EBITDA, EBITDA margin (have it)
- ✅ Active users, ARPU (have it — as of dictionary update)
- 🟡 FTDs, NDCs (have metric codes, inconsistently extracted — prompt tuning needed)
- 🔴 Marketing % of revenue (often disclosed as narrative, not table — extraction needs work)
- 🔴 Online revenue share / segment splits (present in PDFs but variable format)

**From regulators (scrapers capture totals, need operator-level):**
- ✅ State-level online GGR, handle, sportsbook revenue (have it)
- 🔴 **Per-operator market share** (critical — NJ DGE, PA PGCB, MI MGCB publish this; scrapers currently only capture state totals) ← **fix this next**
- 🔴 Per-operator handle / revenue at state level
- 🔴 Tax paid per operator per state

**From company IR scrapers (currently just indexing):**
- 🔴 Nothing yet — scrapers just detect new filings. Next phase: queue them for the parser.

**From stock APIs (scrapers capture):**
- ✅ Stock price, market cap, P/E, EV/EBITDA (have it)

---

## Summary

- **7 entity types**, each with a defined KPI panel (4 primary + 4-8 secondary)
- **Consistent layout** across all entities of the same type → comparison becomes possible
- **Beacon™ fills gaps** so panels are always complete
- **Source labeling** on every tile makes provenance transparent
- **Panel data requirements** inform what the parser and scrapers need to capture next

---

**End of Part 2.**
