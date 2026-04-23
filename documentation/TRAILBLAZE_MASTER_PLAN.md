# Trailblaze Analytics — Master Plan

**Last updated:** 2026-04-23
**Supersedes:** `ROADMAP_2.md`, `PHASE_2_5_DESIGN.md`, `PHASE_2_5_DESIGN_v2.md`, `PHASE_1_2_5_SOURCE_PRIORITY_DESIGN.md`, and all prior handoffs
**Owner:** Andrew, Trailblaze Marketing
**Status:** Day 2, Phase 1.1 closed, moving toward a cleaner architecture

---

## 1. The architecture, stated once and simply

Trailblaze Analytics has one primary source of truth: **Oyvind Miller's daily analyst emails**, ingested via Gmail. Everything else either enriches that data or is a derivative of it.

**The data flow, going forward:**

1. Oyvind email arrives → Gmail ingest picks it up
2. Parser extracts structured metrics, narratives, and entity mentions
3. Mentioned entities/markets trigger enrichment: regulator scrapes, stock data pulls, SEC/IR fetches, Wikipedia metadata, Beacon™ modeling
4. The enriched dataset is what the product serves
5. Synthetic PDFs are generated FROM this dataset for the `reporting.trailblaze-marketing.com` portal — they are outputs, not inputs

**Historical synthetic PDFs stay in the DB** only to fill gaps from the Oyvind reports you've lost. They are a fallback source, not a primary one. When both exist for the same data point, Oyvind wins.

That's the whole architecture. Everything else is implementation of this model.

---

## 2. Where we are right now

**Data layer:**
- 480 reports (173 Oyvind-sourced via Gmail, 297 historical synthetic PDFs, 10 other)
- 24,747 metric_values (~102/report from Oyvind, ~21/report from synthetic — Oyvind is 5× denser)
- 175 Gmail-ingested messages cleanly tracked in state table
- 2 errored reports from the reprocess (densest US-update emails; max_tokens ceiling raised, retry pending)

**Recent wins (this session and last):**
- Phase 1.1 closed: reprocess applied timestamp + PDF chrome fixes across 173 reports
- Market scorecard label collision fixed (commit `76b43b4`)
- Parser max_tokens raised from 32,768 → 128,000 (commit `be15e4d`)
- Phase 2.5 rich extraction designed and approved
- Phase 1.2.5 source priority designed
- Phase 1.2.5 Workstream C (metric_value_canonical view precedence flip) in flight via Claude Code

**Known issues still outstanding:**
- 2 errored US-update reports need retry (trivial after max_tokens fix)
- 506 entities flagged `auto_added_needs_review` — need human canonicalisation
- `metric_value_canonical` view was prioritising synthetic over Oyvind until the Workstream C fix (pending verification)
- Country-level rollup for `online_ggr` / `online_ngr` / `handle` — states have data, countries show "No data"
- 30-day stock sparkline shows ~5 points — scraper hasn't run long enough (automation phase)
- 10 `shell` document_type reports — provenance unclear

---

## 3. The roadmap

### PHASE 1 — Data layer integrity (in progress)

**1.1 Gmail ingestion verification** ✅ CLOSED 2026-04-23

**1.2 Entity canonicalisation** ← NEXT
- 506 auto-added entities need human review
- Workflow: Claude Code generates similarity clusters + CSV export, Andrew reviews in batches in chat
- Output: `entity_canonicalization_log.md`, clean canonical entity list

**1.2.5 Source priority — Oyvind canonical, synthetic fallback**
- **Workstream C** (the view precedence flip): IN FLIGHT
- **Workstream B** (stop ingesting new synthetic PDFs): do after C lands
- **Workstream A** (historical cleanup of demoted synthetic rows): optional, deferred — the view flip already hides them from the UI

**1.3 Retry 2 errored reports**
- Run reprocess targeting `status='error'` only
- Verify error count drops to 0
- Commit max_tokens change once confirmed working

**1.4 UI regression check**
- Screenshot major pages post-canonicalisation + view flip
- Spot-check NorthStar, Flutter, Betsson — all should render denser than before

**Exit gate:** clean data layer, canonical entities, Oyvind winning as source, errors cleared.

---

### PHASE 2 — Enrichment pipeline (the new architecture)

**The big one.** This is where Oyvind-triggered enrichment becomes real.

**2.1 Oyvind-triggered enrichment orchestrator**
- When an Oyvind email ingests and extracts entities/markets, automatically trigger the relevant scrapers
- One new CLI: `trailblaze-enrich --triggered-by=<report_id>`
- Dispatches to: regulator scraper (for mentioned US states / EU markets), stock scraper (for mentioned listed operators), company IR scraper (for public listed entities), Wikipedia fetcher (for new entities)
- Idempotent: re-running against the same report produces no duplicate work
- Single T3 session to design and build

**2.2 Fix the 4 broken US regulator scrapers**
- PA PGCB, MI MGCB, CT DCP, IL IGB
- Diagnoses exist in SCRAPERS_STATUS.md
- Unlocks per-operator data for PA (25 ops), MI (17), IL (9)

**2.3 European regulator scrapers**
- Spillemyndigheden (DK), Spelinspektionen (SE), ADM (IT), DGOJ (ES), Veikkaus (FI)
- Same pattern as NJ DGE

**2.4 SEC EDGAR scraper**
- 10-Q / 10-K filings for DKNG, MGM, BALY, RSI, CDRO, GAN, LNW, GAMB
- Queue for parser as `source_type='sec_filing'`

**2.5 Company IR scraper**
- Press releases and earnings announcements for top 15 entities
- Queue for parser as `source_type='company_ir'`

**2.6 Wikipedia metadata enrichment**
- MediaWiki API for every entity
- Pull founding date, HQ, parent company, subsidiaries
- CC-BY-SA attribution shown in UI

**2.7 Expanded stock data**
- Alpha Vantage or Finnhub for analyst ratings, 52-week ranges
- Augments yfinance

**Exit gate:** Oyvind arrival now automatically enriches the dataset. Per-operator data live in 9+ markets. SEC + IR + Wikipedia populated.

---

### PHASE 2.5 — Rich tabular extraction

**Approved design in `PHASE_2_5_DESIGN_v2.md`.** Pattern recognition for the five table types in Oyvind's emails that the current parser collapses.

**Four units, shipped sequentially:**

- **Unit A — Operator completeness:** state × operator matrix + operator segment/regional/product splits. ~4 days. Betsson, Flutter, DraftKings light up properly.
- **Unit B — State × month grids:** TimeMatrix primitive populated with US handle by state by month. ~2 days.
- **Unit C — Affiliate completeness:** revenue-model split + vertical split + NDCs, plus **new `/affiliates` top-nav entry**. Raketech-style rendering. ~3 days.
- **Unit D — B2B completeness:** turnover_index, operator_margin, adj_ebitda for Kambi-style entities. ~1.5 days.

**Parser architecture:** modular pattern recognisers (named blocks in extraction prompt, independently testable).

**Total budget:** 13-14 working days.

**Exit gate:** all 5 rich patterns extracted. UI primitives (Leaderboard, TimeMatrix) populated with data they were built for but didn't have.

---

### PHASE 3 — UI v2

**The visual tier-up.** After Phase 2 and 2.5 land, we have the data density to justify a more sophisticated UI. This is the step toward the Gemini mockups — Bloomberg-terminal-for-iGaming made real.

**3.1 Affiliate section**
- New `/affiliates` top-level nav (wired in Unit C)
- Affiliate-specific leaderboard: NDCs, revenue-model mix, margin (instead of operator's ARPU/actives)
- Follows the Operators page pattern with affiliate-specific primary/secondary KPI panels
- Raketech as worked example

**3.2 Overview page polish**
- Replace redundant horizontal bar chart with Market GGR time-series line chart
- Ticker strip: curate FLUT/DKNG/MGM/ENT first, alphabetical after (not alphabetical top-down)
- Data drops feed cleanup

**3.3 Operators page enhancements**
- Stock heatmap (sized by market cap, colored by day change) — already in UI_SPEC_3
- Operator leaderboard with richer columns (EV/EBITDA, P/E, day delta)
- Delta movers: biggest revenue growers, margin expansion leaders, recent news

**3.4 Market detail page — richer scorecards**
- Country-level rollup design session → populate online_ggr / online_ngr at country level
- Tax history panel
- Regulatory filings panel
- Market commentary panel

**3.5 Company detail page — quarterly breakdown with confidence**
- Already partially built. Verify Beacon™ dotted extensions are clean post-Phase 2.5.

**Exit gate:** UI matches the Gemini mockup quality. Stock heatmap live. Affiliate tab live. Every page dense and information-rich without clutter.

---

### PHASE 4 — Beacon™ + Forecasting

Blocked on Phase 2.5 (segment/regional data density makes modelling defensible).

- **4.1** Methodology page content (legal-defensible writing — MUST ship before Beacon™ goes public)
- **4.2** Beacon™ v1 (tax-implied methodology — Belgium, Italy, Spain)
- **4.3** Beacon™ v2 (peer-ratio methodology — operator segment splits)
- **4.4** Beacon™ v3 (stock-implied methodology — FLUT, DKNG, MGM)
- **4.5** Forecast engine v1 (deterministic time-series on historical metric_values)
- **4.6** Forecast UI widget
- **4.7** Composite score / index (Christian's suggestion)

**Exit gate:** Beacon™ coverage non-zero for 5+ markets, forecast live on Company/Market detail, methodology page published, composite index live.

---

### PHASE 5 — News intelligence + AI commentary

- **5.1-5.4** News intelligence: RSS aggregator, classification, UI modules, AI summaries
- **5.5-5.8** AI analyst commentary: template framework, generation service, UI panel, disclaimers

---

### PHASE 6 — Automation & production

- **6.1** Task scheduling (hourly Gmail, daily enrichment chains, weekly stocks, monthly regulators, daily RSS)
- **6.2** Pipeline alerting (failure notifications)
- **6.3** Coverage-gap detection
- **6.4** Synthetic PDF generator from DB — **this is where the "output" flow gets built**, so humans reading `reporting.trailblaze-marketing.com` see DB-rendered PDFs rather than the old OpenAI-reformatted ones

---

### PHASE 7 — Production deployment

- Vercel + Neon + Railway
- `analytics.trailblaze-marketing.com`
- Supabase Auth
- Pilot onboarding (3-5 friendly clients)

---

## 4. Working principles

1. **Oyvind is canonical.** When Oyvind says something, that's what we show. Synthetic PDFs fill gaps only.
2. **One phase at a time.** No skipping ahead until the current exit gate is met.
3. **Parser changes never happen while an ingest or reprocess is running.** Capture patterns in notes files instead, act when the pipeline is quiet.
4. **Commit frequently.** Small commits, clear messages.
5. **Design docs are the durable record.** Memory and handoffs are supplements, not substitutes.
6. **Claude Code does the engineering.** Main chat does coordination, planning, SQL diagnostics, and design.
7. **Verify handoff claims against the live DB.** Prior handoffs have contained errors that propagated because nobody verified.

---

## 5. Realistic timeline

- **Phase 1 (finish):** 3-5 days
- **Phase 2 (enrichment):** 2 weeks
- **Phase 2.5 (rich extraction):** 2-3 weeks
- **Phase 3 (UI v2):** 1-2 weeks
- **Phase 4 (Beacon + forecast):** 2 weeks
- **Phase 5 (news + commentary):** 1-2 weeks
- **Phase 6 (automation):** 3-4 days
- **Phase 7 (deploy + pilot):** 1-2 weeks

**Total to pilot-ready:** ~10-12 weeks of focused work.

---

## 6. Change log

- **2026-04-23** — This master plan created. Consolidates and supersedes ROADMAP_2.md, PHASE_2_5_DESIGN v1/v2, PHASE_1_2_5_SOURCE_PRIORITY_DESIGN, and session handoffs into one document. Captures the new Oyvind-primary architecture articulated by Andrew in session 4. Adds Phase 2 as the enrichment orchestration phase, Phase 3 as UI v2, moves Beacon™ to Phase 4.

---

**End of master plan.**
