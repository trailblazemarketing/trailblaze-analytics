# Phase 2.5 — Rich Extraction Design (v2)

**Status:** Design, approved by Andrew (decisions signed off 2026-04-22).
**Revision:** v2 — supersedes v1 (commit `728f414`). See §0 for change log.
**Prereq:** `documentation/RICH_EXTRACTION_NOTES.md` — raw pattern capture. Read that first.
**Depends on:** Phase 1.1 closure (Gmail reprocess complete), Phase 1.2 (entity canonicalisation) complete.
**Blocks:** Phase 3 Beacon™ modelling (needs segment + regional data this phase produces).

---

## 0. Revision history

### v2 — 2026-04-22 (this revision)

Incorporates Andrew's sign-off decisions from the design review session:

- **Priority reordering.** Pattern 1 (operator segment + regional + product splits) is promoted into the first shipping unit alongside Pattern 4. Operators must ship with country/region AND casino-vs-sports splits from the start, not as a later phase. See §2.
- **Parser architecture tightened.** §3 now specifies **modular pattern recognisers** rather than a single monolithic prompt. Each pattern is an independently testable, versionable prompt block. Same LLM call structure, better long-term evolvability.
- **Region representation confirmed as Option A** (virtual market rows). §4 updated.
- **Affiliate top-nav approved.** Previously parked; now a Step-10 deliverable. §6.4 and §7 updated. Acceptance of "delete it later if it doesn't work."
- **Sub-decisions from §5 accepted as recommended.** See §5 for the locked-in answers.

### v1 — 2026-04-22 (superseded)

Initial draft with open decisions. Committed as `728f414`. Kept in git history for reference.

---

## 1. Context & motivation

The current extraction pipeline pulls headline metrics (revenue, EBITDA, EBITDA margin, stock price) from analyst-note prose and summary tables, but collapses the richer tabular structure in the email bodies. `RICH_EXTRACTION_NOTES.md` documents five distinct table patterns found in Oyvind Miller's emails. Each pattern contains data we want.

The order-of-magnitude estimate: based on the four emails inspected, the current parser captures ~5–10 metrics per analyst note from prose. The same notes contain 40–120 metrics in tabular form that we're losing. Phase 2.5 aims to close that gap.

**Non-goal of this phase:** We are NOT redesigning the extraction pipeline from scratch. We are extending the existing LLM extraction pass to handle tables better (through modular recognisers — see §3), re-running against stored `raw_text`, and lighting up UI primitives that already exist but have no data.

**Critical constraint:** `reports.raw_text` preserves every ingested email body. Re-extraction runs against DB-stored text. No Gmail re-ingest required.

**Durability principle (surfaced from the project architecture):** `reports.raw_text` is the durable asset. The parser is a derivation over that text. Parser upgrades mean re-running the derivation; they do not mean re-ingesting emails. Phase 2.5 is one such derivation run, and more will follow as the parser evolves.

---

## 2. Execution priority — revised for v2

The five patterns no longer ship in strict priority order. Based on Andrew's sign-off, **Patterns 4 and 1 ship together as Unit A**, because operator surfaces need BOTH state × operator rankings AND segment/regional/product splits to feel complete. Shipping Pattern 4 without Pattern 1 would produce leaderboards without segment breakdowns — a partial operator view.

### Unit A (highest priority) — Operator completeness
Ships together:
- **Pattern 4** — State × operator performance matrix (Massachusetts-style)
- **Pattern 1** — Operator segment + regional splits (Betsson-style), including casino/sportsbook product split and country/region geography

**Ship gate for Unit A:**
- Leaderboard on `/markets/massachusetts` (and other states) shows DraftKings/FanDuel/BetMGM/etc. with handle + GGR + YoY + market share
- Operator detail pages show casino-vs-sports revenue split and country/region geographic breakdown where disclosed
- Betsson and Flutter both render correctly as worked examples

**Why together:** operators are the main product audience. Shipping one dimension (cross-operator rankings) without the other (intra-operator splits) gives users half a tool. The two patterns also share schema dependencies — once segment/region schema lands for Pattern 1, Pattern 4 benefits from the same additions for any cross-segment aggregation.

### Unit B — State × month time-series depth
- **Pattern 5** — State × month time-series grid (US Online Sports handle)

**Ship gate:** TimeMatrix on `/markets` index or a new `/overview` panel shows 17 states × 6 months of Online Sports handle.

### Unit C — Affiliate completeness
- **Pattern 3** — Affiliate revenue-model + vertical + business-line splits (Raketech-style)
- Affiliate top-nav entry (new in v2)

**Ship gate:** Raketech renders with revenue-model composition, Casino/Sports vertical split, NDCs as lead indicator. `/affiliates` top-level nav entry populated with an affiliate-focused leaderboard.

### Unit D — B2B completeness
- **Pattern 2** — B2B supplier proprietary KPIs (Kambi-style)

**Ship gate:** Kambi renders with turnover_index as a primary tile, operator_margin, adj_ebitda / adj_ebita distinction.

### Rationale for unit-based approach

Previously the doc treated the five patterns as serial, prioritised individually. Andrew's operator-completeness point reveals that some patterns form natural units. A unit ships as a single coherent release; units ship sequentially. This is a small reframing but matters for how the work gets planned and demoed.

---

## 3. Parser architecture — modular pattern recognisers

**Decision locked in v2:** Extend the existing LLM extraction pass, but architected as **modular pattern recognisers** rather than a single monolithic prompt. Same LLM call structure, same cost profile, better evolvability as the pattern count grows.

### What this means concretely

The extraction prompt becomes a structured document composed of:

```
[Header — role and extraction contract]
[Metric vocabulary — dictionary of allowed codes]
[Output schema — ExtractedMetric / ExtractedNarrative definitions]

--- RECOGNISER BLOCKS ---

## Recogniser: prose-headline (existing, unchanged)
Pattern: headline figures mentioned in narrative prose
Example: "Revenue in Q2-25 was €303.7m, up 11.9% year-over-year"
Extraction: one ExtractedMetric per mentioned figure

## Recogniser: summary-table (existing, unchanged)
[...]

## Recogniser: operator-segment-region (NEW, Pattern 1)
Pattern: operator's own performance broken down by product segment,
         business segment (B2B/B2C), and geographic region.
Example: [Betsson table with Casino/Sportsbook/Other + CEECA/LatAm/etc]
Extraction: one ExtractedMetric per (metric_code × period × segment × region) cell
Required dimensions: segment, region_group
Required metric codes: revenue, ebit_margin, actives, arpu, marketing_spend_pct, sports_margin, sports_turnover

## Recogniser: state-operator-matrix (NEW, Pattern 4)
[...]

## Recogniser: state-month-timeseries (NEW, Pattern 5)
[...]

## Recogniser: affiliate-revenue-model (NEW, Pattern 3)
[...]

## Recogniser: b2b-supplier-kpis (NEW, Pattern 2)
[...]
```

### Why modular beats monolithic

1. **Independent testing.** Each recogniser can be tested against fixtures drawn specifically for its pattern. If the Pattern 4 recogniser regresses, we know it's not affecting Pattern 5.

2. **Independent versioning.** `parser_version` can become more granular — `2.1.0` might mean "operator-segment-region recogniser v1 added," `2.1.1` might mean "matrix recogniser prompt tightened." Makes re-extraction scope-control easier (re-run only reports affected by a specific recogniser upgrade).

3. **Independent disable/enable.** If a recogniser produces noisy output on a subset of reports, we can disable it for those reports without disabling extraction entirely.

4. **Easier reasoning.** A new engineer reading the prompt sees named blocks, not a 3000-token wall of instructions interleaved with examples.

5. **Scales past five patterns.** `RICH_EXTRACTION_NOTES.md` already flags six additional patterns ("operator × product matrix", "company-level geographic revenue", "peer comparison tables", etc.) likely to emerge. A modular architecture accommodates these as Phase 2.6 / 2.7 / 2.8 additions without rewriting Phase 2.5.

### What doesn't change

- Same Pydantic `ExtractedMetric` / `ExtractedNarrative` schemas (extended with optional fields — see §4)
- Same confidence scoring (single scale — see §5)
- Same `disclosure_status` enum
- Same idempotency via `file_hash` + `parser_version`
- Same number of LLM calls per report (one extraction call, with the full prompt body)

### What changes

- Prompt body restructured into named recogniser blocks
- `ExtractedMetric` gains optional `segment`, `region_group`, `revenue_model`, `table_id` fields
- Metric dictionary expanded (turnover_index, ndcs, data_supplier_costs, adj_ebitda, adj_ebita_acq, etc.)
- Test fixtures reorganised by recogniser

---

## 4. Schema implications — per pattern

This section assumes the current schema per the handoff. Before implementation, Step 1 of §7 (schema audit) must be run against the live schema.

| Pattern | Schema change needed | Severity |
|---|---|---|
| 4. State × operator matrix | None. Existing schema handles it. | — |
| 5. State × month grid | None. Existing schema handles it. | — |
| 1. Operator segment + regional + product splits | Add `segment` enum (casino / sportsbook / other / b2b / b2c). Create virtual `markets` rows with `scope_type='region'` for CEECA / LatAm / Nordic / WE / RoW. | Medium |
| 3. Affiliate revenue-model split | Add `revenue_model` enum (rev_share / upfront / flat_fee / subscription). Add NDCs to metric vocabulary. | Low-Medium |
| 2. B2B supplier metrics | Add metric codes (turnover_index, operator_margin, data_supplier_costs, adj_ebitda, adj_ebita_acq). Treat adj variants as distinct metric_codes rather than flags. | Low |

### Region representation — Option A confirmed

Per Andrew's sign-off, regions like CEECA, LatAm, Nordic, Western Europe, and RoW are stored as **virtual `markets` rows** with `scope_type='region'`. Pros: reuses existing market infrastructure. Trade-off accepted: region membership is analyst-defined and approximate — we don't try to auto-rollup from child countries. If Oyvind says "LatAm revenue was €84.7M," that's the data we have, regardless of whether it exactly equals Brazil + Mexico + Argentina + Colombia.

Implementation note: virtual region rows need explicit creation in a migration, with known names and identifiers, before the parser writes to them. The parser should NOT auto-create virtual markets from extracted text — that creates a canonicalisation nightmare parallel to the entity canonicalisation work in Phase 1.2.

### Metric-code vs sub-dimension — decision v2

From §5 open-question 3, confirmed: **structured** for revenue splits, **flat codes** for genuinely distinct metrics.

- Revenue splits use ONE `revenue` metric_code plus `revenue_model` sub-dim (rev_share / upfront / flat_fee / subscription) and `segment` sub-dim (casino / sportsbook / other).
- Genuinely distinct metrics (NDCs, turnover_index, operator_margin, adj_ebitda, data_supplier_costs) each get their own flat metric_code in the dictionary.

Reasoning: revenue-by-segment is fundamentally the same metric type (euros of revenue) with a breakdown — storing as `revenue` + sub-dims enables cross-segment summation and keeps the metric dictionary tractable. NDCs and turnover_index are different things measured in different units (count, index value) — forcing them under a single code would misrepresent them.

---

## 5. Locked-in answers to §5 open questions

All five questions from v1 §5 are now resolved per Andrew's sign-off.

1. **Rolled-up time-series rows** like "LA, IA, KS, KY and CT": **skip with warning logged**. Revisit only if Oyvind uses this pattern consistently across many reports.

2. **Two-block table recognition** (Massachusetts Handle block then GGR block, stacked with identical operator rows): **will be tested against 3–5 real fixtures in Step 3 of §7**. If the modular recogniser handles it cleanly, no further work needed. If not, budget 0.5 day for prompt iteration.

3. **Metric-code proliferation**: **structured for revenue splits (one code + sub-dim), flat for distinct metrics**. Implemented in §4 above.

4. **Affiliate navigation**: **OVERRIDDEN by Decision 5** — affiliates get a top-level nav entry. See §6.4 and §7 Step 10 below.

5. **Confidence scoring for matrix cells**: **single scale**. A tabular extraction at 95% confidence means the same thing as a prose extraction at 95%.

---

## 6. UI mockups (rough)

### 6.1 State × operator Leaderboard (Pattern 4) — Unit A

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

Handle/GGR/Active toggle swaps the metric across all rows. Sparklines populate once Pattern 5 data exists.

### 6.2 Operator segment + regional split (Pattern 1) — Unit A

Where: `/companies/betsson` — promoted into Unit A because operators need both state × operator AND intra-operator splits simultaneously.

```
┌─────────────────────────────────────────────────────────────────────┐
│ REVENUE BY PRODUCT — Q2-25                                          │
├─────────────────────────────────────────────────────────────────────┤
│ Casino        ████████████████████████████   €212.4M  70.0%  +11.1% │
│ Sportsbook    ███████████                    € 90.0M  29.6%  +14.8% │
│ Other         ▏                              €  1.3M   0.4%  -35.0% │
├─────────────────────────────────────────────────────────────────────┤
│ REVENUE BY BUSINESS MODEL — Q2-25                                   │
│ B2C           ██████████████████████████     €227.2M  74.8%  +13.1% │
│ B2B           █████████                      € 76.5M  25.2%   +8.4% │
├─────────────────────────────────────────────────────────────────────┤
│ REVENUE BY REGION — Q2-25                                           │
│ CEECA         █████████████████              €118.2M  38.9%   +3.7% │
│ LatAm         ████████████                   € 84.7M  27.9%  +35.3% │
│ Western Europe ████████                      € 59.3M  19.5%  +35.7% │
│ Nordic        █████                          € 33.9M  11.2%  -28.3% │
│ RoW           █                              €  7.6M   2.5%  +94.9% │
└─────────────────────────────────────────────────────────────────────┘
```

Three stacked strips: product, business-model, region. The region with biggest YoY gain subtly highlighted. Missing segments hidden.

### 6.3 State × month TimeMatrix (Pattern 5) — Unit B

Where: `/markets` index, or a new `/overview` heatmap panel.

```
┌────────────────────────────────────────────────────────────────────────┐
│ US ONLINE SPORTS HANDLE — STATE BY MONTH                       [$m] YoY│
├────────────────┬───────┬───────┬───────┬───────┬───────┬───────────────┤
│                │ Dec24 │ Jan25 │ Feb25 │ Mar25 │ Apr25 │ May25         │
│ New York       │ 2,281 │ 2,481 │ 1,976 │ 2,440 │ 2,153 │ 2,212  ▓▓▓▓▓▓ │
│ Illinois       │ 1,459 │ 1,438 │ 1,135 │ 1,457 │ 1,258 │     —  ▓▓▒▓▓░ │
│ New Jersey     │ 1,163 │ 1,106 │   950 │ 1,063 │   954 │   967  ▓▒░▒░░ │
│ Pennsylvania   │   849 │   830 │   727 │   806 │   681 │   625  ▒▒░▒░░ │
│ ...            │       │       │       │       │       │               │
├────────────────┼───────┼───────┼───────┼───────┼───────┼───────────────┤
│ Total          │15,111 │15,139 │12,036 │14,932 │12,029 │     —         │
│ YoY            │ 14.2% │ 14.9% │ 12.1% │ 10.6% │  9.8% │  14.6%        │
└────────────────┴───────┴───────┴───────┴───────┴───────┴───────────────┘
```

Cell background coloured by relative value within row. Missing cells show "—". Total and YoY rows pinned. Toggle: absolute $m / YoY% / sparkline-only.

### 6.4 Affiliate page + top-nav (Pattern 3) — Unit C — NEW IN v2

**Top-nav change:** a new `Affiliates` entry added to the top-level navigation, between `Operators` and `Reports`.

```
[logo] Overview  Markets  Companies  Operators  Affiliates  Reports  Methodology
```

**Attitude:** Andrew explicitly accepted "delete it later if it doesn't work." The nav entry ships with Unit C and stays unless usage or feedback argues otherwise.

**`/affiliates` page:** follows the Operators-page pattern — top leaderboard of affiliates by revenue, with an affiliate-specific column set (NDCs, revenue-model mix, margin) rather than operator-specific columns (ARPU, active users).

**`/companies/raketech` detail:** uses a new `PANELS.affiliate` layout.

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

NDCs flagged as the lead indicator. Warning icon when YoY is <-25%.

### 6.5 B2B supplier KPIs (Pattern 2) — Unit D

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

B2B-specific primary layout. Turnover Index is a dimensionless volume proxy — formatted without currency.

---

## 7. Implementation sequence — revised for v2

Sequence restructured around the four units from §2. Each unit is independently shippable and demoable. Within a unit, steps remain sequential.

### PREP — Shared foundation (before any unit)

**Step P1 — Schema audit (0.5 day)**
Query the live schema. Document current coverage of segment / region_group / revenue_model / metric_codes. Output: migration brief listing exactly what columns, enum values, and virtual market rows need to be added.
**Exit criteria:** Andrew approves the migration brief.

**Step P2 — Schema migration (0.5 day)**
Apply the migration. Additive-only changes. Create virtual market rows for CEECA / LatAm / Nordic / Western Europe / RoW.
**Exit criteria:** Migration runs cleanly on a fresh DB copy. All existing tests pass.

**Step P3 — Parser prompt restructure into modular recognisers (0.5 day)**
Reorganise the existing prompt into named recogniser blocks. No new recognisers yet — just architecture. Existing prose-headline and summary-table recognisers are the only ones active.
**Exit criteria:** Re-extracting 5 test reports produces byte-identical metric output to the pre-restructure version (architecture change with zero behavioural drift).

### UNIT A — Operator completeness (Patterns 4 + 1)

**Step A1 — Parser recogniser for operator-segment-region (Pattern 1) (1 day)**
Add the recogniser block to the prompt. Test against 3 Betsson reports and 2 Flutter reports as fixtures.
**Exit criteria:** Betsson Q2-25 re-extraction produces expected product, business-model, and region breakdowns.

**Step A2 — Parser recogniser for state-operator-matrix (Pattern 4) (1 day)**
Add the recogniser block. Test against Massachusetts, New Jersey, Pennsylvania, Arizona state-level reports.
**Exit criteria:** Massachusetts May-25 re-extraction produces per-operator Handle and GGR rows with YoY and market share.

**Step A3 — Re-extraction for Unit A (0.5 day)**
Build `trailblaze-reextract --recogniser=operator-segment-region,state-operator-matrix`. Run against all reports.
**Exit criteria:** Re-extraction completes. metric_values row count increases by expected order of magnitude.

**Step A4 — UI: state × operator Leaderboard on `/markets/[slug]` (0.5 day)**
Wire Leaderboard primitive to new state × operator data. Toggle between Handle, GGR, Actives.
**Exit criteria:** Massachusetts, Arizona, Pennsylvania, New Jersey, New York all render operator leaderboards.

**Step A5 — UI: operator segment + regional panels on `/companies/[slug]` (0.5 day)**
Add three stacked composition panels per §6.2 to Company detail pages.
**Exit criteria:** Betsson, Flutter, DraftKings render with correct splits.

**Unit A total: ~4 days**

### UNIT B — State × month time-series depth (Pattern 5)

**Step B1 — Parser recogniser for state-month-timeseries (1 day)**
Add the wide-table recogniser. Test against the US Online Sports handle grid and 2 other multi-month tables.
**Exit criteria:** 17-state × 6-month grid produces 102 metric_value rows.

**Step B2 — Re-extraction for Unit B (0.5 day)**
Build `--recogniser=state-month-timeseries`. Run against relevant reports.
**Exit criteria:** Re-extraction completes.

**Step B3 — UI: TimeMatrix on `/markets` index or `/overview` (0.5 day)**
Wire TimeMatrix primitive. Cell colouring, totals row, YoY row.
**Exit criteria:** 17 states × 6 months grid renders.

**Unit B total: ~2 days**

### UNIT C — Affiliate completeness (Pattern 3 + affiliate nav)

**Step C1 — Parser recogniser for affiliate-revenue-model (1 day)**
Add the recogniser block. Test against Raketech and 2 other affiliates.
**Exit criteria:** Raketech Q2-25 re-extraction produces revenue-model, vertical, business-line splits, and NDCs.

**Step C2 — Re-extraction for Unit C (0.5 day)**

**Step C3 — UI: affiliate top-nav + `/affiliates` index page (1 day)**
NEW in v2. Add `Affiliates` top-nav entry. Build `/affiliates` index with affiliate-specific leaderboard columns.
**Exit criteria:** Affiliates nav entry present. `/affiliates` renders a ranked affiliate leaderboard.

**Step C4 — UI: affiliate detail panel layout (0.5 day)**
New `PANELS.affiliate` for `/companies/[slug]` when entity type is affiliate.
**Exit criteria:** Raketech renders with revenue composition, vertical, business-line splits, NDCs lead indicator.

**Unit C total: ~3 days**

### UNIT D — B2B completeness (Pattern 2)

**Step D1 — Parser recogniser for b2b-supplier-kpis (0.5 day)**
Add the recogniser block. Test against Kambi and 2 other B2B entities.
**Exit criteria:** Kambi Q2-25 re-extraction produces turnover_index, operator_margin, adj_ebitda, adj_ebita_acq, data_supplier_costs.

**Step D2 — Re-extraction for Unit D (0.5 day)**

**Step D3 — UI: B2B primary panel layout (0.5 day)**
New `PANELS.b2b_sportsbook` per §6.5.
**Exit criteria:** Kambi renders with turnover_index as primary tile.

**Unit D total: ~1.5 days**

### Total phase budget

- Prep: ~1.5 days
- Unit A: ~4 days
- Unit B: ~2 days
- Unit C: ~3 days
- Unit D: ~1.5 days
- Cross-unit re-extraction over all reports at end: ~1 day (overnight runs)
- Buffer for prompt iteration and edge cases: ~1 day
- **Realistic total: 13–14 working days** (revised up from v1's 8–10 days — the Unit A bundling adds ~2 days, and Unit C's top-nav adds ~1 day)

---

## 8. Risks & unknowns (updated)

**Unknown parser behaviour on dense tables.** First fixture runs in Step A1/A2 could reveal misassignment or table-conflation. Mitigation: each recogniser has dedicated fixture runs before being treated as production-ready; the modular architecture makes per-recogniser iteration cheap.

**Schema drift risk.** Live schema may have drifted from documented schema. Mitigation: Step P1 is a live-DB audit, not a document review.

**Re-extraction cost and duration.** Phase 2.5 re-extraction against ~472 reports at rich-pattern density will produce more tokens per report than the current parser. Conservative estimate: 3–5 minutes of LLM time per report at the denser prompt, with more output tokens per extraction. 472 × 4 min ≈ 31 hours of wall time. Plan a weekend run for the full re-extraction at unit-boundaries.

**UI density on smaller screens.** Matrix and grid views are information-dense. Desktop-first for Phase 2.5; responsive work is a later phase.

**Affiliate top-nav pollution.** With the nav entry committed, even a small number of affiliate entities get a full top-level surface. Mitigation: explicitly revisit the nav decision at end of Unit C — if the affiliate entity count is <10 and engagement is low, demote to a Companies filter. Andrew pre-accepted this possibility ("delete it later if it doesn't work").

**Modular prompt growth.** As recognisers accumulate, the total prompt token count grows. At some point, prompt-caching or per-recogniser extraction calls become cheaper than single-call extraction. Out of scope for Phase 2.5 but worth measuring.

---

## 9. What this phase does NOT include

- **Beacon™ modelling on the new metrics.** Phase 3.
- **Peer-comparison tables.** Listed in the notes file as a "not yet captured" pattern. Phase 2.6.
- **Guidance-range extraction.** Phase 2.6.
- **Automated stock scraper fix.** Separate, Phase 6.
- **Country-level rollup for online_ggr / online_ngr.** Deferred from the label-fix session, a separate design session of its own.
- **Composite score / index.** Christian's suggestion; correctly sequenced after Phase 2.5 finishes so the underlying metric coverage is dense enough to justify a composite.

---

## 10. Sign-off record

All decisions from v1 §10 are now resolved:

1. ✅ **Priority ordering** — revised into Unit A (Patterns 4+1 together), Unit B (5), Unit C (3 + nav), Unit D (2)
2. ✅ **Parser approach** — extend existing pass, **architected as modular pattern recognisers** (Gil's call on the architecture, approved approach)
3. ✅ **Schema approach** — Option A (virtual market rows for regions)
4. ✅ **Sub-questions from v1 §5** — all five answered per §5 above
5. ✅ **Affiliate top-nav** — APPROVED; ships in Unit C; revisitable later

Sign-off context: Andrew confirmed decisions during the 2026-04-22 coordinator session while the Phase 1.1 Gmail reprocess was running. Phase 2.5 implementation does not begin until Phase 1.1 closes and Phase 1.2 (entity canonicalisation) completes.

---

## Related files

- `documentation/RICH_EXTRACTION_NOTES.md` — raw pattern capture (read before this doc)
- `documentation/PHASE_2_5_DESIGN.md` — v1 of this design (superseded; in git history)
- `documentation/ROADMAP_2.md` — roadmap; Phase 2.5 entry should cross-reference this v2
- `documentation/ui documentation/UI_SPEC_1_PRIMITIVES.md` — Leaderboard / TimeMatrix definitions
- `documentation/ui documentation/UI_SPEC_2_KPI_PANELS.md` — panel layouts
- `documentation/ui documentation/UI_SPEC_3_PAGE_COMPOSITIONS.md` — page layouts (affiliate top-nav decision now lives in this doc instead, §6.4)
- `src/trailblaze/parser/` — extraction pipeline (exact file TBD by engineer)

---

**End of v2 design doc.**
