# Trailblaze Analytics — Master Plan

**Last updated:** 2026-04-23 (late session 4, post-synthetic-cleanup, Unit A reprocess in flight)
**Supersedes:** `ROADMAP_2.md`, `PHASE_2_5_DESIGN.md`, `PHASE_2_5_DESIGN_v2.md`, `PHASE_1_2_5_SOURCE_PRIORITY_DESIGN.md`, prior master plan v1, all prior handoffs
**Owner:** Andrew, Trailblaze Marketing
**Status:** Day 2, Phase 1 nearly closed, Phase 2.5 Unit A in live reprocess

---

## 1. The architecture, stated once and simply

Trailblaze Analytics has one primary source of truth: **Oyvind Miller's daily analyst emails**, ingested via Gmail. Everything else either enriches that data or is a derivative of it.

**The data flow, going forward:**

1. Oyvind email arrives → Gmail ingest picks it up
2. Parser extracts structured metrics, narratives, and entity mentions
3. Mentioned entities/markets trigger enrichment: regulator scrapes, stock data pulls, SEC/IR fetches, Wikipedia metadata, Beacon™ modeling
4. The enriched dataset is what the product serves
5. Synthetic PDFs are generated FROM this dataset for the `reporting.trailblaze-marketing.com` portal — they are outputs, not inputs

**Historical synthetic PDFs have been removed from the DB** (session 4, 2026-04-23). Missing Oyvind reports are recoverable from Gmail and can be re-ingested. The corpus is now single-source: Oyvind only.

That's the whole architecture. Everything else is implementation of this model.

---

## 2. Where we are right now

**Data layer (post session-4 cleanup, pre Unit A reprocess completion):**
- 175 Oyvind-sourced reports (all `gmail_` prefixed)
- Pre-Unit-A baseline: 18,777 metric_values; post-Unit-A expected substantially higher (Pattern 4 US matrices add many rows)
- 11,778 canonical partitions in `metric_value_canonical` matview (pre-Unit-A baseline)
- Zero synthetic contamination — `trailblaze_pdf` source_type has 0 canonical rows
- Oyvind is tier 1 in matview precedence; regulator/SEC/IR/stock follow; synthetic PDF tier 5 (vestigial)
- 2 errored US-update reports from morning's reprocess — will resolve in Unit A reprocess (max_tokens already raised to 128k)
- Backup at `backups/pre-synthetic-drop-20260423-082647.sql` (20.1 MB)

**Session 4 commits:**
- `76b43b4` — Market scorecard label collision fix (handle → sportsbook_handle)
- `9aa2f89` — Phase 1.2.5 design doc
- `be15e4d` — Parser max_tokens 32,768 → 128,000 (Opus 4.7 ceiling)
- Master plan v1 commit
- `0004_canonical_oyvind_primary.py` — Matview precedence flipped (Oyvind tier 1)
- Chart period filter commit (first pass — filter to quarter only)
- `7bb18f0` — Chart cadence hierarchical fallback (quarter → half_year → full_year)

**Session 4 non-code changes:**
- DB cleanup: 307 non-Oyvind reports + 6,558 metric_values + 779 narratives + 471 report_entities + 642 report_markets deleted. Oyvind-only corpus. Backup captured.
- Phase 1.2.5 Workstreams A, B, C all effectively closed via the cleanup
- Phase 1.2.6 (NorthStar cross-partition attribution bug) resolved accidentally

**Running now:**
- Phase 2.5 Unit A reprocess — all 175 reports being re-extracted under parser v2.1.0 with Pattern 1 + Pattern 4 recognisers. Started 10:56, ~1.2 min/report, ~3.5hr total. Monitor in place.

**Known issues (flagged, not today's fight):**
- Flutter Q2-25 $138M revenue — likely unit-multiplier error (may be fixed by v2.1.0 reprocess)
- Playtech H1-25 and FY-25 duplicate rows from multiple source reports — matview dedups, base data still dup
- QoQ column header stays literal on non-quarterly cadence (should read HoH / YoY)
- "Total Revenue" KPI tile period-type-agnostic — fragile if future FY arrives before latest quarter
- 506 entities flagged `auto_added_needs_review` — Phase 1.2 will canonicalise
- Unit A may add more auto_added entities (new operators from Pattern 4 US matrices)
- Country-level rollup for `online_ggr` / `online_ngr` / `handle` — Phase 3.4 work
- 30-day stock sparkline thin (~5 points) — Phase 6 automation cadence
- 10 `shell` document_type reports — provenance unclear, low priority
- Bespoke entity KPIs (Playtech "Investment Income EBITDA", etc.) likely dropped by Unit A — may need dictionary expansion later

---

## 3. The roadmap

### PHASE 1 — Data layer integrity (nearly closed)

**1.1 Gmail ingestion verification** ✅ CLOSED 2026-04-23

**1.2 Entity canonicalisation** ← NEXT after Unit A reprocess completes
- 506 auto-added entities need human review
- Unit A reprocess will add more `auto_added_needs_review` entities (Pattern 4 introduces operator names not previously in DB)
- Workflow: Claude Code generates similarity clusters + CSV export, Andrew reviews in batches
- Output: clean canonical entity list, `auto_added_needs_review` count → near zero

**1.2.5 Source priority** ✅ CLOSED 2026-04-23 (synthetic delete)

**1.2.6 NorthStar cross-partition attribution** ✅ CLOSED 2026-04-23 (resolved by synthetic delete)

**1.3 Retry 2 errored reports** → resolving in-flight via Unit A reprocess
- Post-Unit-A: verify `gmail_ingested_messages.status='error'` count is 0

**1.4 UI regression check**
- Post-Unit-A: spot-check Betsson, Flutter, Massachusetts, Playtech
- All should render denser than pre-Unit-A

**Exit gate:** Unit A reprocess complete, entities canonicalised, zero errors, UI spot-checks pass.

---

### PHASE 2 — Enrichment pipeline (the new architecture)

The big one. This is where Oyvind-triggered enrichment becomes real.

**2.1 Oyvind-triggered enrichment orchestrator**
- When an Oyvind email ingests and extracts entities/markets, automatically trigger relevant scrapers
- New CLI: `trailblaze-enrich --triggered-by=<report_id>`
- Dispatches to: regulator scraper (mentioned US states / EU markets), stock scraper (mentioned listed operators), company IR scraper (public listed entities), Wikipedia fetcher (new entities)
- Idempotent: re-running against same report produces no duplicate work

**2.2 Fix the 4 broken US regulator scrapers**
- PA PGCB, MI MGCB, CT DCP, IL IGB
- Unlocks per-operator data for PA (25 ops), MI (17), IL (9)

**2.3 European regulator scrapers**
- Spillemyndigheden (DK), Spelinspektionen (SE), ADM (IT), DGOJ (ES), Veikkaus (FI)

**2.4 SEC EDGAR scraper**
- 10-Q / 10-K for DKNG, MGM, BALY, RSI, CDRO, GAN, LNW, GAMB
- Queue for parser as `source_type='sec_filing'`

**2.5 Company IR scraper**
- Press releases + earnings announcements for top 15 entities
- Queue for parser as `source_type='company_ir'`

**2.6 Wikipedia metadata enrichment**
- MediaWiki API → founding date, HQ, parent company, subsidiaries
- CC-BY-SA attribution in UI

**2.7 Expanded stock data**
- Alpha Vantage or Finnhub — analyst ratings, 52-week ranges

**Exit gate:** Oyvind arrival auto-enriches dataset. Per-operator data live in 9+ markets. SEC + IR + Wikipedia populated.

---

### PHASE 2.5 — Rich tabular extraction

Four units, shipped sequentially. Unit A in flight now.

#### Unit A — Operator completeness (IN FLIGHT)
- **Patterns:** 1 (segment/regional/product splits) + 4 (state × operator matrices)
- **Parser:** v2.1.0, modular recognisers in `src/trailblaze/parser/prompts.py`
- **Schema:** migration 0005 added markets + metric codes for Pattern 1
- **Ship gates:**
  - `/companies/betsson` — segment splits visible
  - `/markets/us-massachusetts` — operator leaderboard populated
- **Status:** reprocess ~3.5 hours, started 10:56

#### Unit B — State × month grids (Pattern 5) — NEXT
- **Target:** US Online Sports handle by state by month (17×6 grid in US update emails)
- **Shape:** each cell = `(market_id=<state>, metric=online_sports_handle, period=<month>, value)`
- **Ship gate:** TimeMatrix primitive populated on Markets Overview showing "US Handle by State, Last 6 Months"
- **Est:** 2 days

#### Unit C — Affiliate completeness (Pattern 3)
- **Target:** Raketech-style revenue-model splits (Revenue Share / Upfront / Flat Fee / Subscription), vertical splits, business-line splits, NDCs
- **Schema:** `revenue_model` sub-dimension; `ndcs` first-class metric
- **UI:** `/affiliates` top-nav + affiliate-specific KPI panel
- **Ship gate:** `/companies/raketech` shows revenue-model breakdown; `/affiliates` tab renders
- **Est:** 3 days

#### Unit D — B2B completeness (Pattern 2)
- **Target:** Kambi-style KPIs: `turnover_index`, `operator_margin`, `adj_ebitda_b2b`, `data_supplier_costs`
- **Schema:** metric dictionary additions; B2B-specific panel layout
- **Ship gate:** Kambi and Playtech show B2B KPIs in hero row
- **Est:** 1.5 days

**Exit gate:** all 5 rich patterns extracted. UI primitives (Leaderboard, TimeMatrix) populated. Entity-type KPI panels correct.

---

### PHASE 3 — UI v2

**The visual tier-up.** After Phase 2 and 2.5, data density justifies the Gemini-mockup quality UI.

**3.1 Affiliate section** (partially delivered in Unit C)
- `/affiliates` top-level nav with Leaderboard, panels

**3.2 Overview page polish**
- Replace horizontal bar with Market GGR time-series
- Curated ticker strip (FLUT/DKNG/MGM/ENT first)
- Data drops feed cleanup

**3.3 Operators page enhancements**
- Stock heatmap (sized by market cap, colored by day change)
- Richer leaderboard columns (EV/EBITDA, P/E, day delta)
- Delta movers modules

**3.4 Market detail richer scorecards**
- Country-level rollup aggregates
- Tax history, regulatory filings, market commentary panels

**3.5 Company detail cleanup**
- QoQ column header → dynamic cadence-aware
- Total Revenue KPI tile period-type-aware
- Verify Beacon™ dotted extensions post-2.5

**Exit gate:** UI matches Gemini mockups. Stock heatmap live. Affiliate tab live.

---

### PHASE 4 — Beacon™ + Forecasting

Blocked on Phase 2.5.

- **4.1** Methodology page (legal-defensible, MUST ship before Beacon™ public)
- **4.2** Beacon™ v1 (tax-implied — Belgium, Italy, Spain)
- **4.3** Beacon™ v2 (peer-ratio — operator segment splits)
- **4.4** Beacon™ v3 (stock-implied — FLUT, DKNG, MGM)
- **4.5** Forecast engine v1
- **4.6** Forecast UI widget
- **4.7** Composite score / index (Christian's suggestion)

---

### PHASE 5 — News intelligence + AI commentary

- **5.1-5.4** News: RSS aggregator, classification, UI, AI summaries
- **5.5-5.8** AI commentary: templates, generation, UI, disclaimers

---

### PHASE 6 — Automation & production

- **6.1** Task scheduling (Gmail hourly, enrichment daily, stocks weekly, regulators monthly, RSS daily)
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

1. **Oyvind is canonical.** When Oyvind says something, that's what we show.
2. **One phase at a time.** Exit gate or no forward movement.
3. **No parser changes during ingest/reprocess.** Capture in notes, act when quiet.
4. **Commit frequently.** Small commits, clear messages.
5. **Design docs are the durable record.** Memory and handoffs are supplements.
6. **Claude Code does the engineering.** Main chat does coordination, planning, SQL, design.
7. **Verify handoff claims against live DB.** Never trust, always verify.
8. **Destructive operations require backup first.** `pg_dump` before mass DELETE, always.

---

## 5. Realistic timeline (revised post session 4)

- **Phase 1 (finish):** 1-2 days
- **Phase 2 (enrichment):** 2 weeks
- **Phase 2.5 (Units B/C/D):** 1.5-2 weeks
- **Phase 3 (UI v2):** 1-2 weeks
- **Phase 4 (Beacon + forecast):** 2 weeks
- **Phase 5 (news + commentary):** 1-2 weeks
- **Phase 6 (automation):** 3-4 days
- **Phase 7 (deploy + pilot):** 1-2 weeks

**Total to pilot-ready:** ~9-11 weeks. Ahead of prior estimate thanks to session 4 cleanup.

---

## 6. Claude Code briefs — ready to queue

These are drafts of the next three Unit briefs. Do NOT kick them off until Unit A is complete and committed. Adapt paths if Unit A changed conventions.

### 6.1 Brief: Phase 2.5 Unit B — State × month grids (Pattern 5)

> **Task:** Extract Pattern 5 — wide tables where columns are months and rows are US states. Each cell is a `(market_id, online_sports_handle, period, value)` point. Current parser collapses these or misses them entirely.
>
> **Read first:**
> - `documentation/TRAILBLAZE_MASTER_PLAN.md`
> - `documentation/RICH_EXTRACTION_NOTES.md` §Pattern 5
> - `src/trailblaze/parser/prompts.py` — follow Unit A's modular recogniser convention
>
> **Environment:**
> - Project: `C:\Users\Andrew\Documents\trailblaze-analytics`
> - Venv: `.venv\Scripts\Activate.ps1`
> - Postgres: `PGPASSWORD=trailblaze`, localhost, user trailblaze, db trailblaze
> - psql: `"C:\Program Files\PostgreSQL\16\bin\psql.exe"`
> - Current parser version: v2.1.0 (bump to v2.2.0)
>
> **Deliverables:**
>
> 1. New recogniser `pattern_5_state_month_grid` in `prompts.py` following Unit A's named-block convention
> 2. Handle three edge cases explicitly:
>    - **Rolled-up rows** (e.g., "LA, IA, KS, KY and CT") — skip; do not invent composite markets
>    - **Total row** — skip (redundant)
>    - **YOY row** — skip (computed summary, not a raw metric_value)
> 3. Verify `online_sports_handle` exists in metrics dictionary; if not, add via migration
> 4. Verify monthly period rows exist in `periods` for the date range covered; if not, add via seed update
> 5. Bump parser to v2.2.0
> 6. Backup: `pg_dump > backups/pre-unit-b-YYYYMMDD-HHMMSS.sql`
> 7. Reprocess: `trailblaze-scrape-gmail --reprocess-existing -v`
> 8. Verification queries:
>    - Count new `online_sports_handle` rows by market and period
>    - Expected: 15-20 US states × 6-12 months across corpus
>    - Spot-check: one US update email known to contain the grid → metric_values include all expected cells
>
> **Ship gate:**
> - A UI surface (discuss with Andrew which page) displays the TimeMatrix primitive populated with US state handle by month, last 6 months, grid intact
>
> **Constraints:**
> - Do NOT touch Pattern 1 or Pattern 4 extraction (Unit A output preserved)
> - Split commits: migration, parser, prompts as separate commits
> - Do NOT commit during reprocess
>
> **Est total runtime:** 4 hours (2hr dev, 3.5hr reprocess overlap)

### 6.2 Brief: Phase 2.5 Unit C — Affiliate completeness (Pattern 3)

> **Task:** Extract Pattern 3 — affiliate revenue-model splits (Revenue Share / Upfront / Flat Fee / Subscription), vertical splits (Casino / Sports), business-line splits (Affiliation / Sub-affiliation / Tips), plus NDCs. Then add UI surface.
>
> **Read first:**
> - `documentation/TRAILBLAZE_MASTER_PLAN.md`
> - `documentation/RICH_EXTRACTION_NOTES.md` §Pattern 3
> - `documentation/ui documentation/UI_SPEC_2_KPI_PANELS.md` §Panel 2 (Affiliate)
> - `documentation/ui documentation/UI_SPEC_3_PAGE_COMPOSITIONS.md`
>
> **Environment:** same as Unit B. Current parser version v2.2.0 (after Unit B); bump to v2.3.0.
>
> **Deliverables:**
>
> **Parser work:**
> 1. New recogniser `pattern_3_affiliate_splits` in `prompts.py`
> 2. Schema: `revenue_model` sub-dimension on `metric_values` — use Unit A's sub-dimension mechanism if that's what was chosen; otherwise add a column via migration
> 3. Verify `ndcs` metric code exists; if not, add via migration
> 4. Bump parser to v2.3.0
> 5. Backup + reprocess (175 reports, ~3.5hr)
>
> **UI work (AFTER reprocess completes):**
> 1. New top-level nav entry `/affiliates` in nav component
> 2. New page `web/app/(app)/affiliates/page.tsx` — Leaderboard primitive of affiliate entities, ranked by revenue or NDCs, configurable
> 3. Update Company detail page routing to detect `entity_type='affiliate'` and render affiliate-specific KPI panel (per UI_SPEC_2 §Panel 2):
>    - Primary KPIs: Total Revenue, EBITDA, NDCs, Revenue per NDC
>    - Secondary KPIs: SEO vs Paid split, Subscription share, Client count, Geographic mix
>
> **Ship gates:**
> - `/affiliates` route renders Leaderboard with Better Collective, Catena, Acroud, Raketech
> - `/companies/raketech` — affiliate-specific KPI panel (not operator panel), revenue-model splits visible
>
> **Constraints:**
> - UI work ONLY after parser reprocess completes and verification passes
> - Split parser commits from UI commits
> - Do NOT restructure operator pages as a side effect
>
> **Est total runtime:** 6 hours (2hr parser, 3.5hr reprocess, 1hr UI)

### 6.3 Brief: Phase 2.5 Unit D — B2B completeness (Pattern 2)

> **Task:** Extract Pattern 2 — B2B supplier KPIs: `turnover_index` (Kambi-style volume proxy), `operator_margin` (aggregate margin of licensee operators), `adj_ebitda_b2b` (distinct from aggregate EBITDA), `data_supplier_costs`, `adj_ebita`. Then add B2B-specific KPI panel.
>
> **Read first:**
> - `documentation/TRAILBLAZE_MASTER_PLAN.md`
> - `documentation/RICH_EXTRACTION_NOTES.md` §Pattern 2
> - `documentation/ui documentation/UI_SPEC_2_KPI_PANELS.md` §Panel 3 (B2B Platform) + §Panel 4 (B2B Supplier)
>
> **Environment:** same as Units B/C. Current parser v2.3.0 (after Unit C); bump to v2.4.0.
>
> **Deliverables:**
>
> **Parser work:**
> 1. New recogniser `pattern_2_b2b_supplier` in `prompts.py`
> 2. Migration adds metric codes: `turnover_index`, `operator_margin`, `adj_ebitda_b2b`, `data_supplier_costs`, `adj_ebita`
> 3. Critical: distinguish `ebitda` vs `adj_ebitda` — these are different metrics, not versions of the same. Audit current dictionary; if conflated, disambiguate in migration
> 4. Bump parser to v2.4.0
> 5. Backup + reprocess (175 reports)
>
> **UI work (AFTER reprocess):**
> 1. Entity-type router in `web/app/(app)/companies/[slug]/page.tsx` — detect `entity_type` IN ('b2b_platform', 'b2b_supplier') and render appropriate panel
> 2. B2B Platform panel (Kambi, Playtech, Evolution): primary KPIs = Revenue, EBITDA Margin, Operator Turnover, Take Rate %
> 3. B2B Supplier panel (NetEnt, Aristocrat, NeoGames): primary KPIs = Revenue, EBITDA Margin, Licensee Count, Revenue per Licensee
>
> **Ship gates:**
> - `/companies/kambi` — B2B platform panel with `turnover_index` + `operator_margin` prominent
> - `/companies/playtech` — B2B platform panel; bespoke Playtech metrics like "Investment Income EBITDA" may be dropped — log in known issues if so (needs dictionary-expansion discussion)
>
> **Constraints:**
> - UI after parser
> - Split commits
> - Do NOT conflate `ebitda` and `adj_ebitda` for simplification — distinction matters for analysts
>
> **Est total runtime:** 5 hours

---

## 7. Change log

- **2026-04-23 (morning, session 4)** — Master plan v1. Consolidates prior docs.
- **2026-04-23 (afternoon, session 4)** — Master plan v2 (this version). Reflects: Phase 1.2.5 Workstreams all closed via synthetic delete; Phase 1.2.6 NorthStar bug resolved accidentally; migration `0004_canonical_oyvind_primary` landed; chart cadence fix shipped; Unit A reprocess in flight; Unit B/C/D briefs drafted for queueing. Known issues captured.

---

**End of master plan.**
