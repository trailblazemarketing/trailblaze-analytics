# Phase 2.5 — Rich Extraction Design

**Status:** Design. Not scheduled for implementation.
**Created:** 2026-04-22 (coordinator session continued from Day 2 handoff)
**Prereq:** `documentation/RICH_EXTRACTION_NOTES.md` — raw pattern capture. Read that first.
**Depends on:** Phase 1.1 closure (Gmail reprocess complete), Phase 1.2 (entity canonicalization) complete.
**Blocks:** Phase 3 Beacon™ modelling (needs segment + regional data this phase produces).

---

## 1. Context & motivation

The current extraction pipeline pulls headline metrics (revenue, EBITDA, EBITDA margin, stock price) from analyst-note prose and summary tables, but collapses the richer tabular structure in the email bodies. `RICH_EXTRACTION_NOTES.md` documents five distinct table patterns found in Oyvind Miller's emails during Day-2 ingestion. Each pattern contains data we want.

The order-of-magnitude estimate: based on the four emails inspected, the current parser captures ~5–10 metrics per analyst note from prose. The same notes contain 40–120 metrics in tabular form that we're losing. Phase 2.5 aims to close that gap.

**Non-goal of this phase:** We are NOT redesigning the extraction pipeline from scratch. We are extending the existing LLM extraction pass to handle tables better, re-running against stored `raw_text`, and lighting up UI primitives that already exist but have no data.

**Critical constraint:** `reports.raw_text` preserves every ingested email body. Re-extraction runs against DB-stored text. No Gmail re-ingest required.

---

## 2. The five patterns, re-ordered by execution priority

The notes file presents the patterns in the order they were discovered. For implementation, the order should reflect **value delivered per unit of work**. My proposed ordering, with rationale:

### Priority 1 — Pattern 4: State × operator matrix (Massachusetts-style)

Schema already supports this natively (`entity_id` + `market_id` + `metric_code` + `period_id`). UI primitive (Leaderboard) is built. The only missing piece is parser logic to recognize a matrix with operator rows and (value, YoY, market-share) column triads and emit one `metric_value` per cell.

**Ship gate:** Leaderboard on `/markets/massachusetts` shows DraftKings/FanDuel/BetMGM/etc. with handle + GGR + YoY + market share.

### Priority 2 — Pattern 5: State × month time-series grid

Same story — schema handles it, UI primitive (TimeMatrix) is built. Parser needs a wide-table recognizer (columns = periods, rows = markets) as opposed to the current long-table assumption.

**Ship gate:** TimeMatrix on `/markets` index or a new `/overview` panel shows 17 states × 6 months of Online Sports handle.

**Dependency:** Need a decision on rolled-up rows ("LA, IA, KS, KY and CT") — see §5.

### Priority 3 — Pattern 1: Operator segment + regional splits (Betsson-style)

Highest complexity. Requires schema additions for product segments (casino/sportsbook/other), business segments (B2B/B2C), and regional super-markets (CEECA/LatAm/Nordic/Western Europe/RoW). Worth doing before Pattern 3 because the B2B/B2C split also affects how we display affiliates.

**Ship gate:** Betsson company detail page shows revenue stacked/segmented across Casino + Sportsbook + Other, with regional breakdown below.

### Priority 4 — Pattern 3: Affiliate revenue-model split (Raketech-style)

UI-heavy. Needs a new affiliate PANELS layout, possibly a dedicated affiliate top-nav (parked decision from UI_SPEC_3). Parser work is moderate — similar to Pattern 1's segment split but with affiliate-specific dimensions (rev_share / upfront / flat_fee / subscription).

**Ship gate:** Raketech page shows revenue-model composition, Affiliation vs Sub-affiliation split, NDC trend.

### Priority 5 — Pattern 2: B2B supplier proprietary KPIs (Kambi-style)

Narrowest scope — affects the ~6 B2B entities in the DB. Parser needs to learn B2B-specific metric vocabulary (turnover_index, operator_margin, data_supplier_costs). PANELS.b2b layout needs a separate treatment. Lowest urgency because fewest entities benefit.

**Ship gate:** Kambi page shows turnover_index as a primary KPI alongside revenue.

---

## 3. Parser upgrade approach

**Decision:** Extend the existing LLM extraction pass. Do NOT add a separate table-extraction pass. Do NOT replace the parser.

### Rationale

A separate pass doubles LLM cost per report and introduces deduplication headaches when both passes extract the same metric. A parser replacement throws away working code and tests. Extension is the smallest change that delivers the capability.

### Extension approach

The current extraction prompt lives in `src/trailblaze/parser/` (exact file TBD — this design does not commit to a specific file without the engineer looking). The upgrade is:

1. **Add table-pattern recognizers to the prompt** — explicit examples of each of the five patterns, with an instruction to emit one `ExtractedMetric` per cell rather than a summary.
2. **Expand the `ExtractedMetric` schema** as needed to carry segment / region / revenue_model dimensions. These are additive — existing extractions remain valid.
3. **Add a `table_id` field** on `ExtractedMetric` so cells from the same table group together (useful for validation and for UI grouping later).
4. **Retain the existing narrative extraction unchanged.** Narratives are orthogonal to table density.

### Prompt structure sketch

```
You are extracting structured metrics from an analyst note.

EXTRACTION CONTRACT:
- Prose mentions → one ExtractedMetric each
- Summary tables (headline figures) → one ExtractedMetric per figure
- Segment tables → one ExtractedMetric per segment per period
- Matrix tables → one ExtractedMetric per cell

TABLE PATTERNS TO RECOGNIZE:

[Pattern 1 example: Betsson segment + region splits]
[Pattern 2 example: Kambi B2B KPIs]
[Pattern 3 example: Raketech revenue-model split]
[Pattern 4 example: Massachusetts state × operator matrix]
[Pattern 5 example: US Online Sports state × month grid]

For each pattern, the instruction is: produce one ExtractedMetric per cell,
populated with the correct entity_name, market_name, metric_code, period_code,
value_numeric, and any applicable segment / region / revenue_model.
```

### What stays the same

- Pydantic schemas for `ExtractedMetric` and `ExtractedNarrative` (existing)
- `disclosure_status` enum (existing)
- Confidence scoring (existing)
- Re-extraction idempotency via `file_hash` (existing)

### What changes

- Prompt body — significantly expanded with table pattern examples
- `ExtractedMetric` — add optional `segment`, `region_group`, `revenue_model`, `table_id` fields
- Metric dictionary — add new metric codes (turnover_index, ndcs, data_supplier_costs, adj_ebitda, adj_ebita_acq, etc.)

---

## 4. Schema implications — per pattern

This section assumes the current schema per the handoff (metric_values with entity_id, market_id, metric_code, period_id, value_numeric, currency, yoy_change_pct, etc.). Before implementation, Step A of the notes file (schema audit) must be run against the actual live schema.

| Pattern | Schema change needed | Severity |
|---|---|---|
| 4. State × operator matrix | None. Existing schema handles it. | — |
| 5. State × month grid | None. Existing schema handles it. | — |
| 1. Segment + regional splits | Add `segment` enum (casino/sportsbook/other/b2b/b2c). Add `region_group` dim OR create virtual market rows for regions. | Medium |
| 3. Affiliate revenue-model split | Add `revenue_model` enum (rev_share/upfront/flat_fee/subscription). Add NDCs to metric vocabulary. | Low-Medium |
| 2. B2B supplier metrics | Add metric codes (turnover_index, operator_margin, data_supplier_costs, adj_ebitda, adj_ebita_acq). Add `adjustment` flag OR treat as distinct metric_codes. | Low |

### The region_group question

Pattern 1's CEECA/LatAm/Nordic/WE/RoW are not countries — they're analyst-defined super-regions. Two representations:

**Option A — Virtual market rows.** Create `markets` rows with `scope_type='region'` for each super-region. Pros: reuses existing market infrastructure. Cons: these regions don't map to a clean hierarchy (CEECA ≠ a rollup of Bulgaria + Czechia + etc. unless we explicitly define the membership).

**Option B — Separate region_group dimension.** Add `region_group` column to `metric_values`. Pros: cleaner semantically. Cons: new dimension, new filters, new UI decisions.

**Recommendation:** Option A. Accept that region membership is analyst-defined and approximate; store the region as a market, tag the `scope_type` appropriately, and don't try to auto-rollup from children. If Oyvind says "LatAm revenue was €84.7M," that's the data we have, regardless of whether it equals Brazil + Mexico + Argentina + Colombia.

---

## 5. Open design questions

These block implementation and need answers before we start coding.

1. **Rolled-up rows in time-series grids.** Pattern 5 contains "LA, IA, KS, KY and CT" as a single row. Options: (a) skip it, (b) emit one metric per comma-separated state with the rolled-up value equally divided (wrong), (c) create a virtual "market_group" market row. Recommendation: (a) skip, with a warning logged. Revisit if Oyvind uses this pattern consistently.

2. **Pattern 4 two-block table recognition.** The Massachusetts example has two stacked blocks (Handle then GGR) with identical operator rows but different implicit metric types. The parser must recognize the stack and assign the correct metric_code to each block's rows. How robust is the LLM at this without explicit separators? Needs a test run against 3–5 real examples.

3. **Metric-code proliferation.** Pattern 2 introduces `adj_ebitda`, `adj_ebita_acq`, `turnover_index`, `operator_margin`, `data_supplier_costs`. Pattern 3 introduces `ndcs`, `rev_share_revenue`, `upfront_revenue`, `flat_fee_revenue`, `subscription_revenue`. Do we want flat metric_codes or structured (`revenue` with a `revenue_model` sub-dim)? Recommendation: structured for revenue splits (one `revenue` code + sub-dim), flat for genuinely distinct metrics (NDCs, turnover_index, adj_ebitda).

4. **UI implications for affiliates.** The notes file parks the affiliate top-nav decision. Phase 2.5 shouldn't ship without deciding. Either (a) affiliates get a top-level nav entry, or (b) affiliates are a filterable view within Companies. Recommendation: (b) for now, reconsider if affiliate entity count exceeds 15.

5. **Confidence scoring for extracted matrix cells.** A prose mention of "revenue was €303M" has different confidence semantics than a cell in a table. Do we want a separate confidence scale for tabular data? Recommendation: keep one scale. Tabular extraction at 95% confidence should mean the same thing as prose extraction at 95%.

---

## 6. UI mockups (rough)

### 6.1 State × operator Leaderboard (Pattern 4)

Where: `/markets/massachusetts` (or any state), new panel below existing scorecard.

```
┌─────────────────────────────────────────────────────────────────┐
│ OPERATORS IN MASSACHUSETTS — May 2025    [Handle] [GGR] [Active]│
├─────────────────────────────────────────────────────────────────┤
│ #  ENTITY        VALUE    YoY     MKT SHARE  SPARK              │
│ 1  DraftKings   $330.8M  +10.5%   51.2%      ▂▃▄▄▅▆             │
│ 2  FanDuel      $171.9M   -0.3%   26.6%      ▄▄▄▄▃▃             │
│ 3  BetMGM       $ 42.4M  +46.0%    6.6%      ▂▂▃▄▄▅             │
│ 4  Fanatics     $ 37.1M +234.5%    5.7%      ▁▂▃▄▅▆             │
│ 5  ESPN Bet     $ 24.1M   +6.2%    3.7%      ▃▃▃▃▃▃             │
│ 6  Caesars      $ 20.7M   +2.9%    3.2%      ▄▄▄▄▄▄             │
│ 7  Bally Bet    $  4.9M      —     0.8%      ▁▁▁▁▁▁             │
├─────────────────────────────────────────────────────────────────┤
│ TOTAL           $645.7M  +11.9%   100.0%                        │
└─────────────────────────────────────────────────────────────────┘
```

Notes: Handle/GGR/Active toggle swaps the metric across all rows. Sparklines show last 6 months if we have the data (Pattern 5 populates this). Total row stays pinned.

### 6.2 State × month TimeMatrix (Pattern 5)

Where: `/markets` index, or a new `/overview` heatmap panel.

```
┌────────────────────────────────────────────────────────────────────────┐
│ US ONLINE SPORTS HANDLE — STATE BY MONTH                       [$m] YoY│
├────────────────┬───────┬───────┬───────┬───────┬───────┬───────────────┤
│                │ Dec24 │ Jan25 │ Feb25 │ Mar25 │ Apr25 │ May25         │
│ New York       │ 2,281 │ 2,481 │ 1,976 │ 2,440 │ 2,153 │ 2,212  ▓▓▓▓▓▓ │
│ Illinois       │ 1,459 │ 1,438 │ 1,135 │ 1,457 │ 1,258 │     —  ▓▓▒▓▓░ │
│ New Jersey     │ 1,163 │ 1,106 │   950 │ 1,063 │   954 │   967  ▓▒░▒░░ │
│ Ohio           │   944 │   992 │   748 │   973 │   795 │     —  ▒▓░▓▒░ │
│ Pennsylvania   │   849 │   830 │   727 │   806 │   681 │   625  ▒▒░▒░░ │
│ Arizona        │   844 │   858 │   696 │   882 │     — │     —  ▒▒░▓░░ │
│ Massachusetts  │   777 │   752 │   619 │   762 │   681 │   646  ▒▒░▒░░ │
│ ...            │       │       │       │       │       │               │
├────────────────┼───────┼───────┼───────┼───────┼───────┼───────────────┤
│ Total          │15,111 │15,139 │12,036 │14,932 │12,029 │     —         │
│ YoY            │ 14.2% │ 14.9% │ 12.1% │ 10.6% │  9.8% │  14.6%        │
└────────────────┴───────┴───────┴───────┴───────┴───────┴───────────────┘
```

Notes: cell background colored by relative value within row. Missing cells show "—". Total and YoY rows pinned. Toggle: absolute $m / YoY% / sparkline-only.

### 6.3 Segment breakdown (Pattern 1)

Where: `/companies/betsson` scorecard secondary row, plus a new stacked bar in the chart area.

```
┌─────────────────────────────────────────────────────────────────────┐
│ REVENUE BY SEGMENT — Q2-25                                          │
├─────────────────────────────────────────────────────────────────────┤
│ Casino        ████████████████████████████   €212.4M  70.0%  +11.1% │
│ Sportsbook    ███████████                    € 90.0M  29.6%  +14.8% │
│ Other         ▏                              €  1.3M   0.4%  -35.0% │
├─────────────────────────────────────────────────────────────────────┤
│ REVENUE BY REGION — Q2-25                                           │
│ CEECA         █████████████████              €118.2M  38.9%   +3.7% │
│ LatAm         ████████████                   € 84.7M  27.9%  +35.3% │
│ Western Europe ████████                      € 59.3M  19.5%  +35.7% │
│ Nordic        █████                          € 33.9M  11.2%  -28.3% │
│ RoW           █                              €  7.6M   2.5%  +94.9% │
└─────────────────────────────────────────────────────────────────────┘
```

Notes: stacked within a single horizontal strip would also work. Region with biggest YoY gain highlighted subtly. Missing segments hidden.

### 6.4 Affiliate revenue-model composition (Pattern 3)

Where: `/companies/raketech` (or a dedicated affiliate page if that nav decision flips).

```
┌──────────────────────────────────────────────────────────────────────┐
│ REVENUE COMPOSITION — Q2-25                                          │
├──────────────────────────────────────────────────────────────────────┤
│ Revenue Share    █████████████████   €3.9M  50.0%  -31.0% YoY        │
│ Flat Fee         ████████            €2.1M  26.9%  -20.0% YoY        │
│ Upfront Payment  ███████             €1.7M  21.8%  -77.1% YoY  ⚠     │
│ Subscription     ▏                   €0.1M   1.3%  -89.3% YoY  ⚠     │
├──────────────────────────────────────────────────────────────────────┤
│ BY VERTICAL      Casino €5.6M (71.8%)  ·  Sports €2.2M (28.2%)       │
│ BY BUSINESS LINE Affiliation €5.7M  ·  Sub-affiliation €2.0M         │
├──────────────────────────────────────────────────────────────────────┤
│ LEAD INDICATOR   NDCs  15,867  ↓ -67.9% YoY  ⚠                       │
└──────────────────────────────────────────────────────────────────────┘
```

Notes: NDCs flagged as the lead indicator with a warning when YoY is <-25%. Affiliates panel (`PANELS.affiliate`) is distinct from operator panel.

### 6.5 B2B supplier KPIs (Pattern 2)

Where: `/companies/kambi` scorecard primary.

```
┌──────────────────────────────────────────────────────────────────────┐
│ KAMBI — Q2-25 PRIMARY                                                │
├────────────────┬────────────────┬─────────────────┬──────────────────┤
│ REVENUE        │ ADJ EBITDA     │ TURNOVER INDEX  │ OPERATOR MARGIN  │
│ €40.5M         │ €12.4M         │ 672             │ 11.5%            │
│ -11.5% YoY     │ -22.8% YoY     │ -4.5% YoY       │ -0.3pp YoY       │
└────────────────┴────────────────┴─────────────────┴──────────────────┘
```

Notes: B2B-specific primary layout. Turnover Index is a dimensionless volume proxy — formatted without currency.

---

## 7. Implementation sequence

Each step is independently shippable. Steps are sequential — a later step's success depends on earlier steps landing cleanly.

### Step 1 — Schema audit (0.5 day)
Query the live schema. Document current coverage of segment / region / revenue_model / metric_codes. Output: migration brief listing exactly what columns and enum values need to be added. No code changes yet.

**Exit criteria:** Andrew approves the migration brief.

### Step 2 — Schema migration (0.5 day)
Apply the migration from Step 1. Additive-only changes (new optional columns, new enum values). Existing extractions remain valid.

**Exit criteria:** Migration runs cleanly on a fresh DB copy. All existing tests pass.

### Step 3 — Parser prompt upgrade for Patterns 4 + 5 (1 day)
Extend the extraction prompt with Pattern 4 and Pattern 5 examples. Add the `table_id` field. Run against 5 test fixtures drawn from real analyst notes in the DB.

**Exit criteria:** For 5 fixtures, extracted metric count matches manual count for the matrix tables (±10%).

### Step 4 — Re-extraction, Patterns 4 + 5 only (0.5 day)
Build a `trailblaze-reextract --pattern=4,5` CLI command. Runs against all `document_type IN ('analyst_call', 'market_update', 'company_report', ...)` reports where `raw_text IS NOT NULL`. Idempotent via file_hash + parser_version.

**Exit criteria:** Re-extraction completes without errors. `metric_values` count increases substantially (rough target: 2–3× current count for reports re-extracted).

### Step 5 — UI: Leaderboard on `/markets/[slug]` (0.5 day)
Wire the existing Leaderboard primitive to the new state × operator data. Drop it into Market detail pages. Toggle between Handle, GGR, Actives.

**Exit criteria:** Massachusetts, Arizona, Pennsylvania, New Jersey, New York all render operator leaderboards with correct data.

### Step 6 — UI: TimeMatrix on `/markets` index (0.5 day)
Wire the existing TimeMatrix primitive to the new state × month data. Drop it as a new panel on the Markets index or Overview.

**Exit criteria:** 17 states × 6 months handle grid renders, with totals and YoY rows.

### Step 7 — Parser prompt upgrade for Pattern 1 (1 day)
Add Betsson-style segment + region recognition. Uses the new schema dimensions from Step 2.

**Exit criteria:** Betsson Q2-25 re-extraction produces expected segment breakdown (Casino/Sportsbook/Other + B2B/B2C + regions).

### Step 8 — UI: Segment breakdown on `/companies/[slug]` (0.5 day)
Add segment composition panel to Company detail pages. Stacked horizontal bars per §6.3.

**Exit criteria:** Betsson, Flutter, DraftKings, and other segment-rich operators show correct splits.

### Step 9 — Parser prompt upgrade for Pattern 3 (1 day)
Add Raketech-style revenue-model + vertical + business-line splits. Add NDCs to metric vocabulary.

**Exit criteria:** Raketech Q2-25 re-extraction produces expected revenue-model breakdown.

### Step 10 — UI: Affiliate panel (0.5–1 day, depends on affiliate top-nav decision)
New `PANELS.affiliate` layout. If top-nav gets approved, build the `/affiliates` index page. Otherwise surface on Companies with filter.

**Exit criteria:** Raketech renders with revenue composition, vertical split, NDCs lead indicator.

### Step 11 — Parser prompt upgrade for Pattern 2 (0.5 day)
Add Kambi-style B2B KPIs. Add turnover_index, operator_margin, adj_ebitda, adj_ebita_acq, data_supplier_costs to metric vocabulary.

**Exit criteria:** Kambi Q2-25 re-extraction produces expected B2B metrics.

### Step 12 — UI: B2B primary panel (0.5 day)
New `PANELS.b2b_sportsbook` layout per §6.5.

**Exit criteria:** Kambi renders with turnover_index as a primary tile.

### Totals
- Parser work: ~4 days
- Schema work: ~1 day
- UI work: ~2–2.5 days
- Re-extraction runs: ~1 day across all patterns
- **Realistic total: 8–10 working days** for a single engineer

---

## 8. Risks & unknowns

**Unknown parser behavior on dense tables.** The current extraction prompt has not been stress-tested against the matrix patterns. The first fixture runs in Step 3 could reveal that the LLM consistently misassigns rows or conflates multiple tables. Mitigation: budget an extra 0.5 day for prompt iteration in Step 3.

**Schema drift risk.** The migration brief in Step 1 is based on a schema described in a handoff doc. The live schema may have drifted. Mitigation: Step 1 is a live-DB audit, not a document review.

**Re-extraction cost.** Running the upgraded parser against all analyst notes + company reports + market updates + trading updates (~418 reports in the DB as of this session) at the density implied by the rich patterns will produce substantially more LLM calls per report. If each report now averages 90 seconds of LLM time instead of 30, a full re-extraction is 10+ hours. Mitigation: batch across days; plan a weekend run.

**UI density.** The matrix and grid views are information-dense. On smaller screens the Leaderboard + TimeMatrix panels may not render cleanly. Mitigation: assume desktop-first for Phase 2.5; responsive work is separate.

**Affiliate navigation decision.** Pattern 3's UI work partly depends on whether affiliates get their own top-nav. Mitigation: ship Step 9 (parser) before deciding the nav; Step 10 (UI) can be either-way.

---

## 9. What this phase does NOT include

- **Beacon™ modelling on the new metrics.** That's Phase 3.
- **Peer-comparison tables.** Listed in the notes file as a "not yet captured" pattern. Defer to Phase 2.6.
- **Guidance-range extraction.** Also Phase 2.6.
- **Automated stock scraper fix.** Separate, Phase 6.
- **Country-level rollup for online_ggr / online_ngr.** Deferred from the label-fix session, a separate design session of its own.

---

## 10. Open decisions requiring Andrew's sign-off before Step 1 starts

1. Priority ordering in §2 — accept, or reorder?
2. Parser approach in §3 — extend existing, agreed?
3. Schema approach in §4 — virtual market rows for regions (Option A), agreed?
4. The five open design questions in §5 — sign off on the recommendations?
5. Affiliate top-nav in §6.4 — decide before Step 9 or defer to a separate chat?

---

## Related files

- `documentation/RICH_EXTRACTION_NOTES.md` — raw pattern capture (read before this doc)
- `documentation/ROADMAP_2.md` — roadmap; add Phase 2.5 entry pointing here
- `documentation/ui documentation/UI_SPEC_1_PRIMITIVES.md` — Leaderboard / TimeMatrix definitions
- `documentation/ui documentation/UI_SPEC_2_KPI_PANELS.md` — panel layouts
- `documentation/ui documentation/UI_SPEC_3_PAGE_COMPOSITIONS.md` — page layouts
- `src/trailblaze/parser/` — extraction pipeline (exact file TBD by engineer)

---

**End of design doc.**
