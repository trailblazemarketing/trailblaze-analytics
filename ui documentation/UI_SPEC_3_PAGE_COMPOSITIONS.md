# UI Design Spec — Part 3 of 3
# Page Compositions

**Companion docs:** `UI_SPEC_1_PRIMITIVES.md`, `UI_SPEC_2_KPI_PANELS.md`
**Read those first.** This doc composes their ingredients into full pages.

---

## Top-level navigation

Persistent shell, top bar:

```
[Trailblaze logo]  Overview  Markets  Companies  Operators  Reports  Methodology    ⌘K search    [avatar]
```

- **Tabs, not pages** — clicking moves within the app shell without full page reload
- `⌘K` opens global omnibox search (entities, markets, metrics, reports all in one)
- Avatar menu: user info, logout, settings

---

## Tab 1 — OVERVIEW (`/`)

**Purpose:** A live analyst home. Every time they come back, they see what's new, what's biggest, what's moving.

### Layout (single-page, scrollable, panels vertically stacked)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ STOCK TICKER STRIP (thin, top)                                                │
│ FLUT +2.4% · DKNG -1.1% · MGM +0.8% · PENN +3.2% · EVO -0.4% · PLTK +1.5% ... │
│ [scrolling or static, color-coded]                                             │
└────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┬──────────────────────────────────────────────┐
│ PANEL A (2/3 width)          │ PANEL B (1/3 width)                          │
│ MARKETS LEADERBOARD          │ RECENT REPORTS                               │
│ [Primitive: Leaderboard]     │ [compact list, last 10]                      │
│                              │                                              │
│ Top 15 markets ranked by     │ · Allwyn H1-25 Report · Jul 30 (Company)    │
│ LTM Online GGR               │ · Betsson Q3 Report · Oct 24 (Company)      │
│ With sparklines, YoY,        │ · US Update NJ/CT/TN · Nov 7 (Market)       │
│ operator count,              │ · ATG Q3 Report · Oct 23 (Company)          │
│ Beacon™ coverage %           │ · ...                                        │
│                              │                                              │
│                              │ Click → opens PDF in overlay                 │
│                              │ [View All Reports →]                         │
└──────────────────────────────┴──────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────┐
│ PANEL C — OPERATORS LEADERBOARD (full width, 3 sub-tabs)                       │
│ [Tabs: Operators (B2C) · Affiliates · B2B]                                    │
│ [Primitive: Leaderboard, active sub-type]                                     │
│                                                                                │
│ Top 15 of selected sub-type, ranked by latest revenue                         │
│ Columns: rank, name, revenue, YoY, primary markets, ticker, Beacon™ flag      │
│                                                                                │
│ Click row → /companies/[slug]                                                  │
│ [View All Companies →]                                                         │
└────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────┐
│ PANEL D — RECENT DATA DROPS (compact feed)                                     │
│                                                                                │
│ ▪ 3 hrs ago — NJ Online GGR Dec-25: $273M (+8% YoY) · Source: NJ DGE          │
│ ▪ 5 hrs ago — FanDuel PA Sports Handle Mar-26: $242M (-26% YoY) · PGCB        │
│ ▪ 1 day ago — Allwyn FY25 Revenue: €8.6B (+4% YoY) · Trailblaze Report        │
│ ▪ 1 day ago — Betsson CEECA Q4-25: €120M (-9% YoY) · Trailblaze Report        │
│ ▪ Trailblaze Beacon™ — Super Group iGaming CT Q4-25: $14.2m (modeled, 87%) │
│ ...                                                                            │
│ [Show more]                                                                    │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Notes:**
- Everything is dense, dark, monospaced numbers, Trailblaze blue accents
- Beacon™ values clearly flagged with ™ superscript wherever they appear
- Clicking a report opens the PDF in an **overlay modal**, URL doesn't change
- Clicking anywhere else either drills or navigates

---

## Tab 2 — MARKETS (`/markets` and `/markets/[slug]`)

### `/markets` (index)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ MARKETS                                                   [Search] [Filters ▾] │
├────────────────────────────────────────────────────────────────────────────────┤
│ FILTERS: Region · Country · Regulated · Market size · Last reported            │
├────────────────────────────────────────────────────────────────────────────────┤
│ [Primitive: Leaderboard — all markets]                                         │
│ With more columns than overview version:                                       │
│ Market · LTM GGR · Sportsbook Handle · iGaming GGR · YoY · Tax rate ·          │
│ Operator count · Last reported · Beacon™ % · Regulator link                    │
│                                                                                │
│ Pagination / infinite scroll                                                   │
└────────────────────────────────────────────────────────────────────────────────┘
```

### `/markets/[slug]` (detail — e.g. `/markets/us-new-jersey`)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ NEW JERSEY                                                                     │
│ US State · Regulated since Nov 2013 · iGaming + Sportsbook                     │
│ Regulator: NJ DGE · Tax: 15% (iGaming), 13% (sports)                          │
├────────────────────────────────────────────────────────────────────────────────┤
│ [Primitive: Market Scorecard — 4 primary + 8 secondary KPIs]                   │
│                                                                                │
│ LTM GGR $3.2B (+12%) · Growth +12% · Operators 8 · Tax 15%                     │
│ [secondary row with 8 more]                                                    │
└────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┬──────────────────────────────────────────────┐
│ OPERATORS IN NJ              │ TIME SERIES                                  │
│ [Primitive: Leaderboard]     │ [Primitive: Time Matrix for this market]     │
│                              │                                              │
│ Ranked by NJ GGR             │ Rows: all tracked metrics                    │
│ With market share %          │ Columns: last 12 periods                     │
│                              │ Heat map toggle                              │
│ Click → FanDuel-in-NJ        │                                              │
│ deep dive                    │                                              │
└──────────────────────────────┴──────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────┐
│ NARRATIVES FOR THIS MARKET (most recent Trailblaze reports referencing NJ)     │
│ [Accordion: Executive Summary, Market Deep Dive, Forecast, Investment View]    │
│ Each section shows the latest 2-3 narrative excerpts, dated                    │
└────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────┐
│ SOURCE REPORTS (mentioning NJ, last 90 days)                                   │
│ [List with date, title, click → overlay]                                       │
└────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────┐
│ REGULATORY ACTIVITY                                                            │
│ Tax history timeline · Major policy changes · License renewals                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

### `/markets/compare?slugs=us-new-jersey,us-pennsylvania,us-michigan`

Simple: **Leaderboard** of selected markets + **Time Matrix** overlay chart + side-by-side scorecards.

---

## Tab 3 — COMPANIES (`/companies` and `/companies/[slug]`)

### `/companies` (index)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ COMPANIES                                                 [Search] [Filters ▾] │
├────────────────────────────────────────────────────────────────────────────────┤
│ TYPE TABS: All · Operators · Affiliates · B2B · Lottery · DFS                  │
│ FILTERS: Country · Listed/Private · Market · Last reported                     │
├────────────────────────────────────────────────────────────────────────────────┤
│ [Primitive: Leaderboard]                                                       │
│ Columns adapted to entity type (operators see ARPU, affiliates see NDCs, etc.) │
└────────────────────────────────────────────────────────────────────────────────┘
```

### `/companies/[slug]` (detail — e.g. `/companies/fanduel`)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ FANDUEL                                                                        │
│ B2C Operator · Subsidiary of Flutter Entertainment (LSE:FLTR)                  │
│ Primary markets: US (NJ, PA, MI, NY, IL, VA, MA...) · Launched 2018            │
├────────────────────────────────────────────────────────────────────────────────┤
│ [Primitive: Operator Scorecard — 4 primary + 8 secondary + stock widget]       │
└────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┬──────────────────────────────────────────────┐
│ GEOGRAPHIC BREAKDOWN         │ METRICS OVER TIME                            │
│ [Primitive: Time Matrix]     │ [Primitive: Time Matrix, different axis]     │
│                              │                                              │
│ Rows: markets where present  │ Rows: all primary + secondary KPIs           │
│ Columns: last 6 periods      │ Columns: last 12 periods                     │
│ Metric: GGR (toggle)         │                                              │
└──────────────────────────────┴──────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────┐
│ COMPETITIVE POSITION                                                           │
│ [Primitive: Leaderboard — operator vs peers in their primary market]           │
│ Shows FanDuel's rank and share vs DraftKings, BetMGM, etc.                     │
└────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────┐
│ NARRATIVES (Executive Summary · Forecast · Investment View · Valuation)        │
│ Latest from Trailblaze reports mentioning FanDuel / Flutter                    │
└────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────┐
│ SOURCE REPORTS — click any to overlay                                          │
└────────────────────────────────────────────────────────────────────────────────┘
```

### `/companies/compare`

Select up to 6 → **Leaderboard** snapshot + **Time Matrix** overlay chart + **Scorecard** grid (4×N tiles).

---

## Tab 4 — OPERATORS (`/operators`)

**Why separate from Companies:** operators are the heartbeat of iGaming — the tickers banks watch, the names hedge funds trade. They deserve their own lens.

### Layout

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ OPERATORS                                                                      │
│ Focused leaderboard + ranking dashboard                                        │
├────────────────────────────────────────────────────────────────────────────────┤
│ STOCK HEATMAP (full-width grid)                                                │
│ Each cell = one listed operator, sized by market cap, colored by day change   │
│ [Like Finviz treemap] — click any → /companies/[slug]                         │
├────────────────────────────────────────────────────────────────────────────────┤
│ OPERATOR LEADERBOARD (full-width)                                              │
│ [Primitive: Leaderboard with operator-specific columns]                        │
│ GGR · EBITDA margin · Actives · ARPU · US exposure % · Stock delta · Beacon™ %│
│ Default sort: LTM GGR desc                                                     │
├────────────────────────────────────────────────────────────────────────────────┤
│ DELTA MOVERS (3 side-by-side panels)                                           │
│ · Biggest Revenue Growers (YoY)                                                │
│ · Margin Expansion Leaders                                                     │
│ · Recent News (from scraped IR feeds)                                          │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## Tab 5 — REPORTS (`/reports`)

### `/reports` (index)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ REPORTS                                                   [Search] [Filters ▾] │
│ FILTERS: Document type · Entity · Market · Date range · Status                 │
├────────────────────────────────────────────────────────────────────────────────┤
│ Table:                                                                         │
│ Date · Title · Doc type · Entities covered · Markets covered · Metric count    │
│                                                                                │
│ Click row → overlay modal (NOT a new page, URL stays same)                     │
│ Button: "Open in new tab" → raw PDF file in new browser tab                    │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Report overlay modal

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [×] CLOSE                                           [Open in new tab ↗]      │
│ Betsson Q3 Report · Published 2025-10-24 · Company Report                     │
├─────────────────────────────────────┬────────────────────────────────────────┤
│                                     │  EXTRACTED DATA                         │
│  PDF VIEWER                         │                                        │
│  (embedded, scrollable)             │  Entities covered: Betsson             │
│                                     │  Markets covered: CEECA, LatAm, WE...  │
│  All 6 pages                        │                                        │
│                                     │  METRICS EXTRACTED (13):                │
│                                     │  · Revenue Q3-25: €295.8m              │
│                                     │  · EBITDA Q3-25: €82.5m                │
│                                     │  · ... [click any → drill to metric]   │
│                                     │                                        │
│                                     │  NARRATIVES EXTRACTED:                  │
│                                     │  · Executive Summary [expand]          │
│                                     │  · Forecast [expand]                   │
│                                     │  · Investment View [expand]            │
└─────────────────────────────────────┴────────────────────────────────────────┘
```

Overlay closes on `×`, Esc key, or clicking outside. URL never changed.

---

## Tab 6 — METHODOLOGY (`/methodology`)

Public-facing page explaining Trailblaze Beacon™. Already built as placeholder. To write real copy together in the chat when ready.

---

## Primitive-to-page mapping summary

| Page | Primitives used |
|---|---|
| Overview (`/`) | Leaderboard (×2) + compact feed + ticker strip |
| Markets index | Leaderboard |
| Market detail | Scorecard + Leaderboard + Time Matrix + Deep Dive |
| Markets compare | Leaderboard + Time Matrix + Scorecard grid |
| Companies index | Leaderboard |
| Company detail | Scorecard + Time Matrix + Leaderboard + Deep Dive |
| Companies compare | Leaderboard + Time Matrix + Scorecard grid |
| Operators | Stock heatmap (new) + Leaderboard |
| Reports index | Dense table |
| Report modal | PDF viewer + extracted data panel (not a primitive per se) |
| Methodology | Static content |

**No new primitives needed beyond the 4 defined.** Everything composes cleanly.

---

## What to build first (if briefing Terminal 2 in phases)

**Phase A (unblocks testing — ~45 min):**
1. Fix the `/reports/[id]` bug
2. Implement PDF overlay modal with "Open in new tab"
3. Remove the current report detail page behavior

**Phase B (the real rebuild — ~3 hours):**
4. Build the 4 primitives as reusable React components with full styling + Beacon™ treatment
5. Rebuild the Overview tab (`/`) from scratch using the composition above
6. Rebuild Market detail page
7. Rebuild Company detail page

**Phase C (polish + new surfaces — ~90 min):**
8. Build the new Operators tab with stock heatmap
9. Rebuild Markets and Companies index pages using Leaderboard primitive
10. Visual polish pass: typography, spacing, color hierarchy, loading states

---

**End of Part 3.**
**End of full UI spec.**
