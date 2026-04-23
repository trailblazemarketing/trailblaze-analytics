# Trailblaze Analytics — Master Plan

**Last updated:** 2026-04-23 (late session 4, v3)
**Supersedes:** all prior master plans, `ROADMAP_2.md`, `PHASE_2_5_DESIGN.md`, `PHASE_2_5_DESIGN_v2.md`, `PHASE_1_2_5_SOURCE_PRIORITY_DESIGN.md`, all prior handoffs
**Owner:** Andrew, Trailblaze Marketing
**Status:** Day 2, Phase 1 nearly closed, Phase 2.5 Unit A reprocess running, Phase 2 source catalogue research running

---

## 1. The architecture, stated once and simply

Trailblaze Analytics has one primary source of truth: **Oyvind Miller's daily analyst emails**, ingested via Gmail. Everything else is enrichment or output.

**The data flow, going forward:**

1. Oyvind email arrives → Gmail ingest picks it up
2. Parser extracts structured metrics, narratives, and mentioned entities/markets
3. **The Oyvind email acts as the trigger** — mentioned entities and markets kick off enrichment automatically:
   - Web traffic scrapers (consumer-facing domains)
   - Share price + stock fundamentals scrapers (listed entities)
   - Official reports scrapers (regulator filings for mentioned markets, SEC/RNS/IR for mentioned entities)
   - News scrapers (trade press + financial news tied to the entities)
4. Enriched dataset is written to DB
5. Synthetic PDFs are generated FROM the DB for `reporting.trailblaze-marketing.com` portal — outputs, not inputs

**Historical synthetic PDFs have been removed from the DB.** Missing Oyvind reports are recoverable from Gmail. The corpus is now Oyvind-only.

**Old PDF parsing pipeline is deprecated.** Going forward: Gmail (Oyvind) + scrapers. Nothing else is a write path.

That's the whole architecture.

---

## 2. Where we are right now

**Data layer (pre Unit A reprocess completion):**
- 175 Oyvind-sourced reports
- Pre-Unit-A baseline: 18,777 metric_values, 11,778 canonical partitions
- Zero synthetic contamination
- Oyvind is tier 1 in matview precedence
- Backup at `backups/pre-synthetic-drop-20260423-082647.sql`

**Session 4 commits:**
- `76b43b4` — Market scorecard label fix
- `9aa2f89` — Phase 1.2.5 design doc
- `be15e4d` — Parser max_tokens 128,000
- Master plan v1
- `0004_canonical_oyvind_primary.py` — Matview Oyvind precedence
- Chart period filter (first pass)
- `7bb18f0` — Chart cadence hierarchical fallback
- `cc42190` — Phase 2.5 Unit A parser modular recognisers
- `d68ee74` — Master plan v2
- `b61ef8e` — Frontend: strip gmail_oyvindmiller_ prefix

**Session 4 non-code:**
- 307 non-Oyvind reports + 6,558 metric_values + cascades deleted; Oyvind-only corpus
- Phase 1.2.5 Workstreams A, B, C all closed via the cleanup
- Phase 1.2.6 (NorthStar cross-partition bug) resolved accidentally

**Running now (3 concurrent Claude Code sessions):**
- Session #1: Phase 2.5 Unit A reprocess (175 reports, ~2hr remaining from start 10:56)
- Session #3: completed (filename strip shipped)
- Session #4: Source catalogue research, autonomous, ~2-3hr remaining

**Known issues (flagged, not today):**
- Flutter Q2-25 $138M revenue — likely unit-multiplier error (may resolve via v2.1.0 reprocess)
- Playtech H1-25 and FY-25 duplicate rows (matview dedups; base data still dup)
- QoQ column header stays literal on non-quarterly cadences
- "Total Revenue" KPI tile period-type-agnostic
- 506 entities `auto_added_needs_review` — Phase 1.2
- Country-level rollup for online_ggr / online_ngr / handle — Phase 3.4
- 30-day stock sparkline thin — Phase 6 cadence fix
- 10 `shell` document_type reports — provenance unclear
- Bespoke entity KPIs (Playtech "Investment Income EBITDA", etc.) may be dropped by Unit A — dictionary expansion later

---

## 3. The roadmap

### PHASE 1 — Data layer integrity (nearly closed)

- **1.1** Gmail ingestion verification ✅ CLOSED 2026-04-23
- **1.2** Entity canonicalisation ← NEXT after Unit A reprocess
- **1.2.5** Source priority ✅ CLOSED (synthetic delete)
- **1.2.6** NorthStar cross-partition bug ✅ CLOSED (resolved by synthetic delete)
- **1.3** Retry 2 errored reports → resolving via Unit A reprocess
- **1.4** UI regression check post-Unit-A

**Exit gate:** Unit A complete, entities canonicalised, zero errors, UI spot-checks pass.

---

### PHASE 2 — Enrichment pipeline (the new architecture)

**This is the new core of the product.** Oyvind email triggers everything downstream. Old PDF ingest pipeline is deprecated.

#### 2.0 Source catalogue research (IN FLIGHT)
- Autonomous Claude Code session cataloguing 5 source types (web traffic, share prices, official reports, stock fundamentals, news) per-entity and per-market
- Output: 5 markdown files under `documentation/source_catalogues/` + 00_SUMMARY.md
- Directly feeds the scraper build decisions in 2.2-2.7

#### 2.1 Oyvind-triggered enrichment orchestrator
- Central piece of the architecture. When an Oyvind email is ingested and parsed, extract mentioned entities and markets, then dispatch scraper tasks.
- New CLI: `trailblaze-enrich --triggered-by=<report_id>`
- Dispatches to: web traffic scraper, stock scraper, regulator scraper, IR scraper, news scraper — all scoped to what Oyvind mentioned
- Idempotent
- **Prioritisation rule:** scrapers fire for top-N entities/markets first (ranked by latest revenue, or market GGR), not all at once. Cheap API quota preservation.

#### 2.2-2.7 Scraper builds — prioritised by entity/market size

**Prioritisation approach** (new):
- Rank entities by latest disclosed revenue. Top 10 are Tier 1 (build scrapers first).
- Rank markets by latest online GGR. Top 10 are Tier 1.
- Tier 2 and 3 follow only after Tier 1 pipeline is proven
- **Top 10 is the MVP boundary.** Pilot clients see rich data on top 10 entities/markets, lighter data below.

**2.2 Web traffic scrapers** (Tier 1 entities)
- Per top-10 entities: consumer-facing domain mapping, traffic API integration (SimilarWeb/Semrush/equivalent — choice informed by 2.0 catalogue)
- Rate limits + quota management
- Triggers from 2.1 when entity is mentioned in Oyvind

**2.3 Stock scrapers** (Tier 1 listed entities)
- Price, market cap, P/E, EV/EBITDA, 52-week range, analyst ratings
- Yahoo Finance / Finnhub / Alpha Vantage — choice informed by 2.0 catalogue
- Fires on any Oyvind mention of a listed entity + daily cadence anyway

**2.4 Official reports — company earnings** (Tier 1 entities)
- SEC EDGAR for US-listed (DKNG, MGM, BALY, etc.)
- RNS for LSE-listed
- Company IR page scrapers for non-US/UK listed
- Queue for parser as `source_type='sec_filing'` or `company_ir`

**2.5 Official reports — regulator filings** (Tier 1 markets)
- Fix the 4 broken US regulator scrapers (PA PGCB, MI MGCB, CT DCP, IL IGB) — existing diagnoses
- Add top European regulators: UKGC, MGA, DGOJ, ADM, Spelinspektionen, Spillemyndigheden
- Per-operator data unlocks for top 10 markets

**2.6 News scrapers** (Tier 1 entities + markets)
- Trade press RSS (iGB, SBC News, EGR, GGB)
- Financial news (Reuters RSS, Bloomberg)
- Company press release feeds
- Beats: tickers, entity names, market keywords

**2.7 Wikipedia metadata** (all entities)
- One-shot baseline fetch: founding date, HQ, parent, subsidiaries
- CC-BY-SA attribution in UI

**Exit gate:** Oyvind arrival auto-enriches top-10 entities and markets across all 5 source types. Scraper orchestrator proven end-to-end on a live Oyvind email.

---

### PHASE 2.5 — Rich tabular extraction

Four units, shipped sequentially. Unit A in flight now.

#### Unit A — Operator completeness (IN FLIGHT)
- Patterns 1 (segment/regional/product splits) + 4 (state × operator matrices)
- Parser v2.1.0 with modular recognisers
- Migration 0005 — markets + metric codes
- Ship gates: `/companies/betsson` segment splits; `/markets/us-massachusetts` operator leaderboard

#### Unit B — State × month grids (Pattern 5)
- Brief ready in §6.1

#### Unit C — Affiliate completeness (Pattern 3)
- Brief ready in §6.2. Includes `/affiliates` top-nav + affiliate KPI panel

#### Unit D — B2B completeness (Pattern 2)
- Brief ready in §6.3. Includes B2B-specific KPI panels

**Exit gate:** all 5 rich patterns extracted. UI primitives (Leaderboard, TimeMatrix) populated. Entity-type KPI panels correct.

---

### PHASE 3 — UI v2

Data density from Phase 2 + Phase 2.5 unlocks the Gemini-mockup UI quality.

- **3.1** Affiliate section (delivered in Unit C)
- **3.2** Overview polish — ticker ordering, market GGR time-series, data drops cleanup
- **3.3** Operators page — stock heatmap, richer leaderboard, delta movers
- **3.4** Market detail — country-level rollup, tax history, regulatory filings, commentary
- **3.5** Company detail cleanup — QoQ → cadence-aware, KPI tile period-type-aware, Beacon™ refinements

---

### PHASE 4 — Beacon™ + Forecasting

Blocked on Phase 2.5 data density.

- **4.1** Methodology page (legal-defensible, MUST ship before Beacon™ public)
- **4.2** Beacon™ v1 (tax-implied)
- **4.3** Beacon™ v2 (peer-ratio)
- **4.4** Beacon™ v3 (stock-implied)
- **4.5** Forecast engine v1
- **4.6** Forecast UI widget
- **4.7** Composite score / index (Christian's suggestion)

---

### PHASE 5 — News intelligence + AI commentary

- **5.1-5.4** News: aggregator, classification, UI modules, AI summaries
- **5.5-5.8** AI commentary: templates, generation, UI, disclaimers

*Note:* News scraping infrastructure lands in Phase 2.6. Phase 5 is the intelligence layer on top of that.

---

### PHASE 6 — Automation & production

- **6.1** Task scheduling (Gmail hourly, enrichment on-trigger, stocks daily, regulators monthly, news daily)
- **6.2** Pipeline alerting
- **6.3** Coverage-gap detection
- **6.4** Synthetic PDF generator FROM DB — closes the architectural loop

---

### PHASE 7 — Production deployment

- Vercel + Neon + Railway
- `analytics.trailblaze-marketing.com`
- Supabase Auth
- Pilot: 3-5 friendly clients

---

## 4. Working principles

1. **Oyvind is canonical.** Only write path is Oyvind + scrapers triggered by Oyvind.
2. **Old PDF parsing is deprecated.** Ingest = Gmail only.
3. **Scrapers prioritise by size.** Top 10 entities / markets get full coverage first.
4. **One phase at a time.** Exit gate or no forward movement.
5. **No parser changes during ingest/reprocess.** Capture in notes, act when quiet.
6. **Commit frequently.** Small commits, clear messages.
7. **Design docs are the durable record.**
8. **Claude Code does the engineering.** Main chat does coordination.
9. **Verify handoff claims against live DB.** Never trust, always verify.
10. **Destructive operations require backup first.** `pg_dump` before mass DELETE, always.

---

## 5. Realistic timeline (revised)

- **Phase 1 (finish):** 1-2 days
- **Phase 2 (enrichment — top 10 MVP):** 2 weeks
- **Phase 2.5 (Units B/C/D):** 1.5-2 weeks
- **Phase 3 (UI v2):** 1-2 weeks
- **Phase 4 (Beacon + forecast):** 2 weeks
- **Phase 5 (news + commentary):** 1-2 weeks
- **Phase 6 (automation):** 3-4 days
- **Phase 7 (deploy + pilot):** 1-2 weeks

**Total to pilot-ready:** ~9-11 weeks.

---

## 6. Claude Code briefs — ready to queue

DO NOT kick these off until Unit A is complete and committed.

### 6.1 Brief: Phase 2.5 Unit B — State × month grids (Pattern 5)

> **Task:** Extract Pattern 5 — wide tables where columns are months and rows are US states. Each cell is a `(market_id, online_sports_handle, period, value)` point.
>
> **Read first:** `documentation/TRAILBLAZE_MASTER_PLAN.md`, `documentation/RICH_EXTRACTION_NOTES.md` §Pattern 5, `src/trailblaze/parser/prompts.py` (Unit A convention).
>
> **Environment:**
> - Project: `C:\Users\Andrew\Documents\trailblaze-analytics`
> - Venv: `.venv\Scripts\Activate.ps1`
> - Postgres: `PGPASSWORD=trailblaze`, localhost, trailblaze/trailblaze
> - psql: `"C:\Program Files\PostgreSQL\16\bin\psql.exe"`
> - Parser: bump to v2.2.0
>
> **Deliverables:**
> 1. New recogniser `pattern_5_state_month_grid` in `prompts.py`
> 2. Edge cases: rolled-up rows (skip), total rows (skip), YOY rows (skip)
> 3. Verify `online_sports_handle` metric exists; add if missing
> 4. Verify monthly periods exist in `periods`; add via seed if needed
> 5. Bump to v2.2.0
> 6. Backup + reprocess 175 reports
> 7. Verification: expected 15-20 states × 6-12 months
>
> **Ship gate:** TimeMatrix primitive populated with US state handle by month, last 6 months.
>
> **Constraints:** no parser changes outside Pattern 5. Split commits.

### 6.2 Brief: Phase 2.5 Unit C — Affiliate completeness (Pattern 3)

> **Task:** Pattern 3 — affiliate revenue-model splits + UI surface.
>
> **Read first:** Master plan, `RICH_EXTRACTION_NOTES.md` §Pattern 3, `UI_SPEC_2_KPI_PANELS.md` §Panel 2.
>
> **Deliverables:**
>
> **Parser:**
> 1. Recogniser `pattern_3_affiliate_splits`
> 2. `revenue_model` sub-dimension (match Unit A's mechanism)
> 3. `ndcs` metric first-class
> 4. Bump to v2.3.0
> 5. Backup + reprocess
>
> **UI (after parser):**
> 1. `/affiliates` top-nav entry
> 2. `web/app/(app)/affiliates/page.tsx` — Leaderboard of affiliate entities
> 3. Entity-type routing on Company detail — affiliate panel for entity_type='affiliate'
>
> **Ship gates:** `/affiliates` renders; `/companies/raketech` shows revenue-model splits.
>
> **Constraints:** UI only after parser reprocess passes. Split commits.

### 6.3 Brief: Phase 2.5 Unit D — B2B completeness (Pattern 2)

> **Task:** Pattern 2 — B2B supplier KPIs + UI panels.
>
> **Read first:** Master plan, `RICH_EXTRACTION_NOTES.md` §Pattern 2, `UI_SPEC_2_KPI_PANELS.md` §Panel 3 + §Panel 4.
>
> **Deliverables:**
>
> **Parser:**
> 1. Recogniser `pattern_2_b2b_supplier`
> 2. New metrics: `turnover_index`, `operator_margin`, `adj_ebitda_b2b`, `data_supplier_costs`, `adj_ebita`
> 3. Distinguish `ebitda` from `adj_ebitda` — separate metrics, not versions
> 4. Bump to v2.4.0
> 5. Backup + reprocess
>
> **UI (after parser):**
> 1. Entity-type router detects b2b_platform / b2b_supplier
> 2. B2B Platform panel (Kambi, Playtech, Evolution): Revenue, EBITDA Margin, Operator Turnover, Take Rate %
> 3. B2B Supplier panel (NetEnt, Aristocrat, NeoGames): Revenue, EBITDA Margin, Licensee Count, Revenue per Licensee
>
> **Ship gates:** `/companies/kambi` shows turnover_index + operator_margin; `/companies/playtech` shows B2B panel.
>
> **Constraints:** UI after parser. Don't conflate ebitda vs adj_ebitda.

### 6.4 Brief: Phase 2 prioritisation — Top 10 entities + markets ranking

> **Task:** Produce a ranked list of top 10 entities (by latest disclosed revenue) and top 10 markets (by latest online GGR), to define Phase 2 Tier 1 scraper scope.
>
> **Read first:** `documentation/source_catalogues/00_SUMMARY.md` (from session #4 research) and TRAILBLAZE_MASTER_PLAN.md §PHASE 2.
>
> **Environment:** read-only DB access.
>
> **Queries:**
> ```sql
> -- Top entities by latest revenue
> WITH latest AS (
>   SELECT DISTINCT ON (mvc.entity_id)
>     mvc.entity_id, mvc.value_numeric, mvc.currency, p.code
>   FROM metric_value_canonical mvc
>   JOIN metrics m ON m.id = mvc.metric_id
>   JOIN periods p ON p.id = mvc.period_id
>   WHERE m.code = 'revenue' AND mvc.entity_id IS NOT NULL
>   ORDER BY mvc.entity_id, p.start_date DESC, mvc.confidence_score DESC NULLS LAST
> )
> SELECT e.slug, e.name, et.code AS type, l.value_numeric, l.currency, l.code AS period
> FROM latest l
> JOIN entities e ON e.id = l.entity_id
> JOIN entity_types et ON et.id = e.entity_type_id
> ORDER BY l.value_numeric DESC NULLS LAST
> LIMIT 25;
>
> -- Top markets by latest online_ggr
> WITH latest AS (
>   SELECT DISTINCT ON (mvc.market_id)
>     mvc.market_id, mvc.value_numeric, mvc.currency, p.code
>   FROM metric_value_canonical mvc
>   JOIN metrics m ON m.id = mvc.metric_id
>   JOIN periods p ON p.id = mvc.period_id
>   WHERE m.code = 'online_ggr' AND mvc.market_id IS NOT NULL
>   ORDER BY mvc.market_id, p.start_date DESC, mvc.confidence_score DESC NULLS LAST
> )
> SELECT mk.slug, mk.name, l.value_numeric, l.currency, l.code AS period
> FROM latest l
> JOIN markets mk ON mk.id = l.market_id
> ORDER BY l.value_numeric DESC NULLS LAST
> LIMIT 25;
> ```
>
> **Currency normalisation:** convert revenue to EUR using latest fx rates table (if exists) or skip currency adjustment and flag in notes.
>
> **Output:** `documentation/PHASE_2_TIER_1_SCOPE.md` with two tables (top 10 entities, top 10 markets), each row annotated with: what scrapers it needs (web traffic, stock, IR, regulator), which source catalogue recommendations apply.
>
> **Constraints:** read-only. Markdown only. Commit.
>
> Run this AFTER Phase 2.5 Unit A reprocess completes (so the revenue numbers reflect the enriched extraction).

---

## 7. Change log

- **2026-04-23 (morning)** — Master plan v1
- **2026-04-23 (afternoon)** — Master plan v2: synthetic delete + Unit A briefs
- **2026-04-23 (late afternoon)** — Master plan v3 (this version). Phase 2 refined: Oyvind-triggered enrichment orchestrator as central architecture. Old PDF parsing formally deprecated. Top-10 prioritisation rule added. Phase 2.0 source catalogue research called out. Phase 2.1 orchestrator made the defining item. Unit B/C/D briefs preserved. Added 6.4 brief: Phase 2 Tier 1 scope ranking query.

---

**End of master plan.**
