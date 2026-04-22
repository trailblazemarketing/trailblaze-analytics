# UI Design Spec — Part 1 of 3
# View Primitives

**Companion docs:** `UI_SPEC_2_KPI_PANELS.md`, `UI_SPEC_3_PAGE_COMPOSITIONS.md`
**Design DNA:** Entity-first, aggregates-forward, Beacon™-native, dense-and-dark.

---

## Why primitives

Every screen in the platform is composed from a small set of reusable **analytical view primitives**. Each primitive is a lens on the `metric_values` table — the underlying data is the same, but the shape of the question changes.

Defining them once means we build each primitive as a well-engineered React component, then compose pages from them rather than reinventing each view.

**There are 4 primitives.** They cover ~95% of what an analyst needs.

---

## Primitive 1 — Leaderboard

**Purpose:** Rank entities (or markets) by a single metric for a single period. Show scale, share, and trend at a glance.

**When to use:** "Who's biggest in NJ sports betting?" "Which markets have grown fastest YoY?" "Top 10 affiliates by revenue."

### Visual anatomy

```
┌────────────────────────────────────────────────────────────────────────┐
│ PA SPORTS BETTING — HANDLE (LTM)                 Mar-26 · Source: PGCB │
├────────────────────────────────────────────────────────────────────────┤
│ #   OPERATOR         HANDLE $m    SHARE    YoY       SPARK    TICKER   │
│ 1   FanDuel           241.8       34.5%    -25.8% ↓  ─╱\─     FLUT +2% │
│ 2   DraftKings        210.3       30.0%    +1.6%  ↑  ─\─╱     DKNG -1% │
│ 3   BetFanatics        63.9        9.1%   +10.5%  ↑  ─/─\─    ──       │
│ 4   BetMGM             51.9        7.4%   -33.2% ↓  ─\──     MGM -3%   │
│ 5   bet365             44.4        6.3%   +28.5%  ↑  ─╱─      ──       │
│ ...                                                                    │
│ TOTAL                 700.6       100.0%   -13.1%                      │
└────────────────────────────────────────────────────────────────────────┘
```

**Columns:**
- Rank
- Entity name (with entity-type chip if needed: `OP`, `AFF`, `B2B`)
- Primary metric value (right-aligned, monospace)
- Share % of total (when applicable) — a tiny horizontal bar chart inline
- YoY change (colored, with arrow)
- Sparkline (last 8 periods) — thin line, 40px wide
- Stock ticker delta today (if listed)
- Beacon™ ™ superscript where value is modeled

**Interaction:**
- Click row → drill into that entity within that context (e.g. /companies/fanduel?market=us-pennsylvania)
- Sort by any column
- Hover a Beacon™ value → methodology card
- Hover a ticker → mini chart + more metrics

**Data shape:** `[{entity, value, share?, yoy?, sparkline[], ticker?, disclosure_status}]`

**Variants:**
- **Ranked** (top N, default)
- **Flat list** (all, sorted, with filters)
- **Grouped** (by sub-type: operators / affiliates / B2B)

---

## Primitive 2 — Time Matrix

**Purpose:** Show a metric across *rows* (entities or markets) and *columns* (time periods). See trends, spot outliers, compare trajectories.

**When to use:** "US iGaming GGR by state by month." "Operator revenue by quarter." "Tax rates over time."

### Visual anatomy

```
┌──────────────────────────────────────────────────────────────────────────┐
│ US iGAMING GGR — $m                  Oct-25  Nov-25  Dec-25  Jan-26  YoY │
├──────────────────────────────────────────────────────────────────────────┤
│ Pennsylvania                         312.5   304.4   324.3   316.2 +12% │
│ Michigan                             278.5   248.4   315.8   298.3 +24% │
│ New Jersey                           260.3   253.0   273.2   258.9 +12% │
│ Connecticut                           68.5    60.1    68.4    69.3 +29% │
│ West Virginia                         39.1    34.6    41.3    33.8 +36% │
│ Delaware                              12.8    12.6    14.6    14.6 +57% │
│ Rhode Island                           5.4     5.6     5.8     5.7 +17% │
│                                     ────   ────   ────   ────   ────    │
│ TOTAL                                977.1   918.7 1,043.4   996.8 +18% │
│ YoY                                 +27.4%  +18.5%  +23.3%  +19.3%      │
└──────────────────────────────────────────────────────────────────────────┘
```

**Styling:**
- Row headers: entity or market name, with chip showing type
- Column headers: period codes, monospace
- Cells: right-aligned numbers, monospace
- Total row: bolded, slightly brighter bg
- Heat-map coloring optional (toggle): values colored by magnitude within column
- Beacon™ values: orange cell border or ™ superscript
- Empty cells: em-dash (—), not blank

**Interaction:**
- Click cell → drill into that specific value (shows source, confidence, history)
- Click row header → drill into entity/market detail
- Toggle: absolute values / YoY % / QoQ %
- Toggle: heat map on/off
- Export: CSV download

**Data shape:** `[{rowKey, periods: {[periodCode]: {value, disclosure_status, source}}}]`

**Variants:**
- **Rows = entities, columns = periods** (most common)
- **Rows = markets, columns = periods** (market-expansion tracking)
- **Rows = metrics, columns = periods** (single-entity scorecard over time)
- **Rows = entities, columns = markets** (geographic footprint)

---

## Primitive 3 — Scorecard

**Purpose:** Show N curated KPIs for a single entity (or market) at a single point in time, with comparison context.

**When to use:** Company detail page header. Market detail page header. "At a glance" views.

### Visual anatomy

```
┌──────────────────────────────────────────────────────────────────────────┐
│ MERIDIAN HOLDINGS                                    Q4 2025 · Published │
│ B2C Operator · LSE:MRDN · Serbia, Montenegro, Kenya                      │
├──────────────────────────────────────────────────────────────────────────┤
│  TOTAL REVENUE    ADJ EBITDA       ONLINE B2C       ACTIVE USERS         │
│  $49.6m           $4.6m            $27.4m           340.7k               │
│  +8.1% YoY ↑      -30.2% YoY ↓     +19.5% YoY ↑    +28.8% YoY ↑          │
│  ─╱─╲─ sparkline  ─╲─╱─            ─╱─╱─            ─╱─╱─                │
│  Trailblaze PDF   Trailblaze PDF   Trailblaze PDF   Trailblaze PDF       │
├──────────────────────────────────────────────────────────────────────────┤
│  ARPU $203        FTDs 274.3k      Marketing: 18.2% EBITDA margin 10.6%  │
│  -11.3% YoY ↓     +77.3% YoY ↑     of rev             Beacon™            │
└──────────────────────────────────────────────────────────────────────────┘
```

**Styling:**
- Top row: 3-5 primary KPIs, large numbers, big text
- Each KPI tile: value, YoY delta with arrow + color, tiny sparkline, source
- Secondary row: 4-8 supporting KPIs in smaller tiles
- Header row: entity name + type chip + ticker + primary markets

**Interaction:**
- Click any KPI tile → drill into that metric's time series
- Hover source → show full provenance chain
- Period selector at top-right: "Q4 2025" dropdown to see historical quarters

**Data shape:** `{entity, period, primary_kpis: [{metric, value, yoy, spark, source}], secondary_kpis: [...]}`

**Variants:**
- **Operator scorecard** — revenue, EBITDA, actives, ARPU (primary) + FTDs, marketing %, segment splits (secondary)
- **Affiliate scorecard** — revenue, EBITDA, NDCs, rev/NDC (primary) + SEO vs paid split, client count (secondary)
- **B2B scorecard** — revenue, EBITDA, licensees, rev/licensee (primary) + catalogue size, top operators (secondary)
- **Market scorecard** — total GGR, YoY growth, operator count, tax rate, Beacon™ coverage %

(Exact KPI choices defined in **Part 2: KPI Panels**.)

---

## Primitive 4 — Deep Dive

**Purpose:** Everything about one entity in one market (or one metric in one context). Narrative + chart + table + source list.

**When to use:** The main body of a detail page. The "show me everything" view.

### Visual anatomy

```
┌──────────────────────────────────────────────────────────────────────────┐
│ FANDUEL IN NEW JERSEY — iGaming GGR                      [Overview]      │
├───────────────────────────────────────────────────┬──────────────────────┤
│                                                   │                      │
│  CHART (60% width)                                 │  NARRATIVE (40%)     │
│  • Solid line: disclosed values                    │                      │
│  • Dotted line: Beacon™ estimates                  │  Forecast & Strategy │
│  • Shaded confidence band for estimates            │  (from most recent   │
│  • Vertical markers on new report dates            │  Trailblaze report,  │
│  • Click point → value, source, confidence         │  section 5)          │
│                                                   │                      │
│                                                   │  Investment View     │
│                                                   │  (section 6)         │
├──────────────────────────────────────────────────────────────────────────┤
│  TABLE: same data, all periods visible                                    │
│  Period  Value    YoY     QoQ     Source                 Confidence       │
│  Q4-25   128.3    +12%   +4%     Trailblaze PDF          Verified        │
│  Q3-25   123.4    +11%   +6%     Trailblaze PDF          Verified        │
│  Q2-25   116.1    +9%    +2%     NJ DGE (reconciled)     Verified        │
│  Q1-25   113.8    +8%    -3%     Trailblaze Beacon™      Modeled (87%)   │
│  ...                                                                     │
├──────────────────────────────────────────────────────────────────────────┤
│  SOURCE REPORTS (3): ATG_Q3_report.pdf · US_update_NJ_1763...pdf · ...   │
│  Click any to open in overlay                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

**Interaction:**
- Chart is fully interactive (zoom, hover, toggle series)
- Clicking a period on the chart → highlights that row in the table
- Clicking a source report → opens PDF overlay
- "Add comparison" button → overlay another entity's line (up to 6)

**Data shape:** `{entity, market, metric, values: [{period, value, disclosure_status, source, confidence, yoy, qoq}], narratives: [{section, content, report_id}], source_reports: [{id, title, date}]}`

---

## Beacon™ visual treatment (applies to ALL primitives)

**Non-negotiable:** Beacon™ values must always be visually distinct, never hidden, never mixed invisibly.

- **Numbers:** trailing `™` superscript in Trailblaze beacon orange (`#F59E0B`)
- **Cells in tables:** subtle orange border-left, 2px
- **Chart lines:** dotted stroke when the series is estimated; transition solid→dotted at the disclose/estimate boundary
- **Chart points:** orange fill for estimated, blue fill for disclosed
- **Confidence bands:** shaded orange area above/below the estimate line (from `confidence_band_low`/`high`)
- **Hover cards:** "Trailblaze Beacon™ — modeled estimate" badge, methodology name, confidence %, inputs summary, link to `/methodology`
- **Not-disclosed (no Beacon™ yet):** render as em-dash (`—`), never as blank or zero

---

## Cross-primitive interactions

Primitives are designed to chain:

1. **Leaderboard → Scorecard** — click operator row, drill to their scorecard
2. **Scorecard → Deep Dive** — click KPI tile, drill to that metric's deep dive
3. **Time Matrix → Leaderboard** — click column header, drill to leaderboard for that period
4. **Time Matrix → Deep Dive** — click cell, drill to that specific value's history
5. **Deep Dive → Leaderboard (as comparison)** — "add comparison" spawns leaderboard picker

The analyst can move fluidly across these without ever leaving the app context.

---

## Summary table — when to use which

| Question | Primitive |
|---|---|
| Who's biggest? | Leaderboard |
| How has X trended across Y dimension? | Time Matrix |
| What's the state of this entity right now? | Scorecard |
| Tell me everything about this entity in this market | Deep Dive |

**Every page in the platform = composition of 2-4 of these primitives. That's the whole rulebook.**

---

**End of Part 1.**
