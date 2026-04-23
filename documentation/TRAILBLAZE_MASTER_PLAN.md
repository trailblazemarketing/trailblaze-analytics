# Trailblaze Analytics — Master Plan

**Last updated:** 2026-04-23 (session 4, v4)
**Supersedes:** all prior master plans, `ROADMAP_2.md`, `PHASE_2_5_DESIGN.md`, `PHASE_2_5_DESIGN_v2.md`, `PHASE_1_2_5_SOURCE_PRIORITY_DESIGN.md`, all prior handoffs
**Owner:** Andrew, Trailblaze Marketing
**Status:** Day 2, Phase 1 nearly closed, Phase 2.5 Unit A reprocess resuming, Phase 2 architecture + source catalogues locked in

---

## 1. The architecture, stated once and simply

Trailblaze Analytics has one primary source of truth: **Oyvind Miller's daily analyst emails**, ingested via Gmail. Everything else is enrichment or output.

**The data flow:**

1. Oyvind email arrives → Gmail ingest picks it up
2. Parser extracts structured metrics, narratives, mentioned entities/markets
3. **The Oyvind email triggers enrichment** — entities/markets mentioned kick off scrapers automatically:
   - Stock fundamentals + analyst ratings (listed entities)
   - Share prices (listed entities)
   - Official reports (SEC / RNS / company IR / regulator filings)
   - News (trade press + Google News + company wires)
   - Web traffic (when budget permits)
4. Enriched dataset is written to DB
5. Synthetic PDFs are generated FROM the DB for `reporting.trailblaze-marketing.com` — outputs, not inputs

**Historical synthetic PDFs have been removed from the DB.** Missing Oyvind reports are recoverable from Gmail. The corpus is Oyvind-only. **Old PDF parsing pipeline is deprecated.** Going forward: Gmail (Oyvind) + scrapers. Nothing else is a write path.

That's the whole architecture.

---

## 2. Where we are right now

**Data layer (pre Unit A reprocess completion):**
- 175 Oyvind-sourced reports
- Pre-Unit-A baseline: 18,777 metric_values, 11,778 canonical partitions
- Zero synthetic contamination; Oyvind is tier 1 in matview precedence
- Backup at `backups/pre-synthetic-drop-20260423-082647.sql`

**Session 4 commits (chronological):**
- `76b43b4` — Market scorecard label fix
- `9aa2f89` — Phase 1.2.5 design doc
- `be15e4d` — Parser max_tokens 128,000
- Master plan v1
- `0004_canonical_oyvind_primary.py` — Matview Oyvind precedence
- Chart period filter first pass
- `7bb18f0` — Chart cadence hierarchical fallback (Company detail)
- `cc42190` — Phase 2.5 Unit A parser modular recognisers
- `d68ee74` — Master plan v2
- `b61ef8e` — Frontend: strip gmail_oyvindmiller_ prefix
- Master plan v3
- `ccd35e4` — Market detail chart cadence fallback
- `c4103ec` — sportsbook_turnover aliased into handle slot
- `dd077df` — Total GGR em-dash when == Online GGR
- `8b106a6` — Online GGR LTM sums 4 trailing quarters
- `55eb24b` — Market operators leaderboard surfaces more entities
- `ece474d` — UK audit: parser TODOs logged
- Source catalogue commits: `decc11f`, `de34d03`, `e094c3c`, `fff4f68`, `c1f4ec0`, `6776d9f`

**Session 4 non-code:**
- 307 non-Oyvind reports + 6,558 metric_values + cascades deleted
- Phase 1.2.5 Workstreams A, B, C all closed
- Phase 1.2.6 (NorthStar cross-partition) resolved accidentally
- 5 source catalogues + summary written and committed

**Running now:**
- Phase 2.5 Unit A reprocess — 77/175 at v2.1.0, 98 in error status after credits exhausted. Credits topped up, retry resumed.

**Known issues (flagged, not today):**
- Flutter Q2-25 $138M revenue — unit-multiplier error (may resolve via v2.1.0 reprocess)
- Playtech H1-25 / FY-25 duplicate rows (matview dedups; base data still dup)
- QoQ column header literal on non-quarterly cadences
- Total Revenue KPI tile period-type-agnostic
- 506 entities `auto_added_needs_review` — Phase 1.2 target
- 16 of 18 active UK operators stuck in the pending backlog — directly blocks UK demo
- Country-level rollup for online_ggr / online_ngr / handle — Phase 3.4
- 30-day stock sparkline thin (~5 points) — Phase 6 cadence fix
- bet365 missing as UK-attributed entity despite having reports
- Sky Betting & Gaming child-entity decision pending (Flutter parent / standalone)
- Entain UK segment splits land at market scope, not Entain-attributed
- Bespoke entity KPIs (Playtech "Investment Income EBITDA") may be dropped by Unit A — dictionary expansion later

---

## 3. Source catalogues — what we know about external data (new in v4)

Five committed catalogues in `documentation/source_catalogues/` define the external data landscape for Phase 2 enrichment. Summary:

| # | Catalogue | Tier-1 source | Cost | Coverage |
|---|---|---|---|---|
| 01 | Web traffic | SimilarWeb | ~$1,500/mo | 44 entities × primary domains |
| 02 | Share prices | yfinance | $0 | 22 listed entities, 8 exchanges |
| 03 | Official reports | SEC EDGAR + LSE RNS + regulator scrapers | $0 | 22 IR pages + 28 US states + 15 EU + 10 RoW regulators |
| 04 | Stock fundamentals | Finnhub free tier | $0 | 22 listed + sellside specialist list |
| 05 | News | Trade press RSS + Google News | $0 | 44 entity queries + 76 market feeds |

**Key findings informing the roadmap:**

1. **Four of five data types are $0/month at Tier 1.** Only web traffic needs paid access. This changes Phase 2 economics substantially — scrapers can ship without budget approval.

2. **Finnhub free tier is the single-biggest unlock.** 22 listed entities, analyst ratings + price targets + earnings calendar + fundamentals in one API. Highest ROI Phase 2 sub-task — recommended first.

3. **Entity ↔ domain is many-to-one in reality but one-to-one in schema.** Flutter owns 8+ consumer brands, Entain 15+. Before web-traffic scraping, an `entity_domains` structure needs to exist.

4. **Metric dictionary needs ~12 new codes** for Phase 2.7 fundamentals: `pe_trailing`, `pe_forward`, `ev_sales`, `analyst_recommendation_*`, `analyst_price_target_*`, `earnings_date_next`, `rev_estimate_*`, `ebitda_estimate_*`. Seed migration is a blocker.

5. **Four corporate events need special handling:** Bally's take-private, Kindred→FDJ, GAN→SEGA Sammy, NeoGames→Light & Wonder. Enrichment orchestrator needs `entities.metadata.listing_status` flag and graceful 404 handling.

6. **Gmail is the right channel for sellside notes, not a new integration.** Expanding `TRUSTED_SENDERS` to include Redeye, Carnegie, Pareto, Jefferies, Truist, Deutsche Bank research aliases gives deep sellside coverage for hours of trust-verification work. No new code.

7. **Regulator per-operator data availability is binary.** Half of world's regulators publish per-operator splits, half don't. Catalogue 03 documents which. Top 8 for scraper rebuild ranked by operator-count × market attention: PA, MI, IL, ADM (IT), DGOJ (ES), iGO (CA-ON), Spelinspektionen (SE), Spillemyndigheden (DK).

8. **Industry conference calendar drives news volume spikes.** ICE Barcelona (Jan-Feb), G2E Vegas (Oct), SiGMA Europe (Nov), SBC Summit BCN (Sep), iGB Live (Jul) all produce M&A / partnership announcements.

---

## 4. The roadmap

### PHASE 1 — Data layer integrity (nearly closed)

- **1.1** Gmail ingestion verification ✅ CLOSED 2026-04-23
- **1.2** Entity canonicalisation ← NEXT after Unit A reprocess
  - 506 auto_added_needs_review entities
  - 16 of 18 active UK operators are stuck here — blocks UK demo
  - Similar story for every other market
  - Workflow: Claude Code generates similarity clusters + CSV, Andrew reviews in batches
- **1.2.5** Source priority ✅ CLOSED (synthetic delete)
- **1.2.6** NorthStar cross-partition bug ✅ CLOSED
- **1.3** Retry errored reports → resolving in Unit A retry
- **1.4** UI regression check post-Unit-A

**Exit gate:** Unit A complete, entities canonicalised to <50 pending, zero errors, UI spot-checks pass.

---

### PHASE 2 — Enrichment pipeline (revised per catalogue findings)

Oyvind email triggers everything downstream. Prioritisation informed by source catalogue summary §Recommended Phase 2 sub-task ordering.

**Top-10 rule:** scrapers prioritise by entity size (latest revenue) and market size (latest online GGR). Top 10 entities and top 10 markets are Tier 1 first-class coverage. Tier 2 (entities 11-25) follows. Everything else is Tier 3.

#### 2.0 Pre-Phase-2 blockers — must land first
Three schema changes before any scraper runs:
- **Seed ~12 new metric codes** (fundamentals — per catalogue 04) — half-day migration
- **`entities.metadata.listing_status`** — active / delisted / private — one-off update for 4 flagged entities (Bally's, Kindred, GAN, NeoGames)
- **`entity_domains` structure** — JSONB array or separate table — for catalogue 01 (web traffic). Not needed until Phase 2.8.

#### 2.1 Phase 2.7 FIRST — Stock fundamentals via Finnhub
**Reprioritised from last-item to first.** Highest value/effort ratio. 22 listed entities get:
- P/E (trailing + forward)
- EV/EBITDA, EV/Sales
- Analyst recommendation trends + price targets
- Earnings calendar
- Revenue + EBITDA consensus estimates
- Nightly refresh

Activates the existing StockRow widget on Company detail pages and Operators heatmap. Free. ~2 days engineering.

**Ship gate:** `/companies/flutter-entertainment` shows P/E, EV/EBITDA, analyst rating badge; `/operators` heatmap live.

#### 2.2 Phase 2.4 — SEC EDGAR scraper
US-listed half of universe (10 entities) get structured financial-statement parsing. Clean provenance — direct from filings, no third-party. Complements Finnhub with richer segment detail. ~3 days.

**Ship gate:** `/companies/draftkings` shows SEC 10-Q-sourced revenue segments, quarter-level filings feed reports table.

#### 2.3 Phase 2.2 — Fix 4 broken US regulator scrapers (PA, MI, CT, IL)
Per-operator data unlocks for 51 operator-market cells (25 PA + 17 MI + 9 IL; CT partial). Scrapers exist but broken — highest regulator-data-per-day ratio. ~4 days.

**Ship gate:** `/markets/us-pennsylvania` operators leaderboard populated with per-operator handle + GGR.

#### 2.4 Phase 2.3 — EU regulator scrapers (DK, SE, IT, ES)
Per-operator-capable EU regulators. Skip Finland (monopoly). ~5 days for four scrapers.

**Ship gate:** `/markets/italy` operators leaderboard with ADM per-operator data.

#### 2.5 Phase 2.5 — Company IR PDF scraper
High engineering cost per entity (each IR site is different). Start with top 5 Nordic issuers where SEC doesn't apply (Betsson, Evolution, Kambi, Better Collective, Catena Media).

#### 2.6 Phase 2.1 — Oyvind-triggered enrichment orchestrator
**Reprioritised from first-item to 6th.** Orchestrator's value multiplies with number of attached scrapers. Build after 2.1-2.5 so a single Oyvind email triggers ≥4 fan-out scrapers worth their cost.

CLI: `trailblaze-enrich --triggered-by=<report_id>`. Idempotent. Dispatches per entity/market mentioned.

#### 2.7 Phase 2.6 — Wikipedia metadata
Nice-to-have. Fills `headquarters_country`, `founding_date`, `parent_company` on pending entities. Batch-fill job.

#### 2.8 News ingestion (new — split from Phase 5)
Trade press RSS (iGB, SBC News, GGB, CDC Gaming) + Google News per-entity + company wires. ~60 feeds. Free. Fold into 2.6 orchestrator fan-out when that lands.

**Ship gate:** news_article rows in `reports`; per-entity news module on Company detail.

#### 2.9 Web traffic (deferred — budget-gated)
SimilarWeb integration once ~$1,500/mo budget approved. Requires `entity_domains` structure first. Phase 3 territory unless budget comes earlier.

**Also worth doing immediately (independent, zero code):**
- Expand `TRUSTED_SENDERS` allowlist for Gmail — Redeye, Carnegie, Pareto, Jefferies, Truist, Deutsche Bank research aliases. ~30 min per sender. Gives deep sellside research ingest for free.

**Exit gate:** Top 10 entities + top 10 markets have full Phase 2 coverage. Orchestrator live. News feed live. Sellside note allowlist expanded.

---

### PHASE 2.5 — Rich tabular extraction

Four units. Unit A in flight; B/C/D queued per §5.

- **Unit A** (IN FLIGHT) — Operator completeness (Patterns 1 + 4)
- **Unit B** — State × month grids (Pattern 5)
- **Unit C** — Affiliate completeness (Pattern 3) + `/affiliates` nav
- **Unit D** — B2B completeness (Pattern 2) + B2B panels

**Exit gate:** all 5 rich patterns extracted. UI primitives (Leaderboard, TimeMatrix) populated.

---

### PHASE 3 — UI v2

Data density from Phase 2 + 2.5 unlocks Gemini-mockup quality UI.

- **3.1** Affiliate section (delivered in Unit C)
- **3.2** Overview polish — ticker ordering, Market GGR time-series, data drops cleanup
- **3.3** Operators page — stock heatmap, richer leaderboard, delta movers
- **3.4** Market detail — country-level rollup, tax history, regulatory filings, commentary
- **3.5** Company detail cleanup — QoQ → cadence-aware, KPI tile period-type-aware
- **3.6** Per-entity news module (powered by Phase 2.8 feed)
- **3.7** Per-entity sellside research module (powered by Gmail trusted-sender expansion)

---

### PHASE 4 — Beacon™ + Forecasting

Blocked on Phase 2.5 data density.

- **4.1** Methodology page (legal-defensible)
- **4.2** Beacon™ v1 (tax-implied)
- **4.3** Beacon™ v2 (peer-ratio)
- **4.4** Beacon™ v3 (stock-implied)
- **4.5** Forecast engine v1
- **4.6** Forecast UI widget
- **4.7** Composite score / index (Christian's suggestion)

---

### PHASE 5 — AI commentary (news infra moved to Phase 2.8)

- **5.1-5.4** AI analyst commentary: template framework, generation service, UI panel, disclaimers

*Note:* News infrastructure (RSS aggregation, classification, UI modules) lives in Phase 2.8. Phase 5 is the intelligence layer on top.

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

## 5. Working principles

1. **Oyvind is canonical.** Only write path is Oyvind + scrapers triggered by Oyvind.
2. **Old PDF parsing is deprecated.** Ingest = Gmail only.
3. **Scrapers prioritise by size.** Top 10 entities / markets get full coverage first.
4. **Free tier first.** 4 of 5 data types work at $0/month. Don't add paid providers until free tier is exhausted.
5. **Schema blockers land before scrapers.** Metric codes + listing_status + entity_domains must exist before the scrapers that use them.
6. **One phase at a time.** Exit gate or no forward movement.
7. **No parser changes during ingest/reprocess.** Capture in notes, act when quiet.
8. **Commit frequently.** Small commits, clear messages.
9. **Design docs are the durable record.**
10. **Claude Code does the engineering.** Main chat does coordination.
11. **Verify handoff claims against live DB.** Never trust, always verify.
12. **Destructive operations require backup first.** `pg_dump` before mass DELETE, always.

---

## 6. Realistic timeline (revised)

- **Phase 1 finish:** 1-2 days (Unit A complete + entity canonicalisation)
- **Phase 2 pre-blockers (§2.0):** half-day
- **Phase 2 (through top-10 coverage):** 2-3 weeks
- **Phase 2.5 Units B/C/D:** 1.5-2 weeks
- **Phase 3 UI v2:** 1-2 weeks
- **Phase 4 Beacon + forecast:** 2 weeks
- **Phase 5 AI commentary:** 1 week
- **Phase 6 automation:** 3-4 days
- **Phase 7 deploy + pilot:** 1-2 weeks

**Total to pilot-ready:** ~8-11 weeks.

---

## 7. Claude Code briefs — ready to queue

DO NOT kick these off until Unit A is complete and committed.

### 7.1 Phase 2.0 — Schema pre-blockers for Phase 2

> **Task:** Land three schema changes that unblock Phase 2 scraper builds. Before any scraper can write data it needs the right metric codes, entity metadata, and optional entity_domains scaffolding.
>
> **Environment:** standard Trailblaze dev env; psql / postgres credentials in env vars; master plan §2.0.
>
> **Three changes, separate commits:**
>
> 1. **Metric dictionary seed** — new Alembic migration `0006_fundamentals_metric_codes.py` adding: `pe_trailing`, `pe_forward`, `ev_sales`, `analyst_recommendation_buy`, `analyst_recommendation_hold`, `analyst_recommendation_sell`, `analyst_recommendation_strong_buy`, `analyst_recommendation_strong_sell`, `analyst_price_target_high`, `analyst_price_target_mean`, `analyst_price_target_low`, `earnings_date_next`, `eps_estimate_next_quarter`, `rev_estimate_next_quarter`, `rev_estimate_next_fy`, `ebitda_estimate_next_fy`. Check first whether any exist (`SELECT code FROM metrics WHERE code = ANY(ARRAY[...]);`) to avoid duplicates. Commit migration separately.
>
> 2. **Entities listing_status metadata** — for each of Bally's, Kindred Group, GAN, NeoGames, update `entities.metadata` to include `listing_status` key. Values: `active`, `delisted_YYYY-MM-DD`, `acquired_by_<slug>_YYYY-MM-DD`, `private`. Verify dates externally (one `curl` of yfinance per ticker). Commit as an Alembic data migration or a one-off SQL script in `scripts/`.
>
> 3. **`entity_domains` structure** — simpler option: add `domains` key to `entities.metadata` as a JSONB array. Complex option: separate `entity_domains` table with `entity_id`, `domain`, `primary` boolean, `ingested_at`. Recommend simple JSONB for speed. Do NOT populate — that's a separate curation task after Phase 2.7 proves data flow. Just add the structure.
>
> **Ship gate:** `\d metrics` shows new codes; `SELECT metadata FROM entities WHERE slug IN ('ballys','kindred-group','gan','neogames')` shows listing_status values; metadata JSONB supports `domains` key without schema error.
>
> **Constraints:** no UI changes; no scraper code; no parser changes. Pure data-layer prep. ~4 hours total.

### 7.2 Phase 2.7 — Stock fundamentals via Finnhub

> **Task:** Implement nightly Finnhub-driven enrichment for 22 listed entities. Write fundamentals + analyst ratings + earnings calendar to `metric_values`. Activate the StockRow UI widget.
>
> **Prereq:** 7.1 (Phase 2.0) committed. New metric codes must exist.
>
> **Environment:**
> - Finnhub free tier API key (Andrew provides; store in `.env` as `FINNHUB_API_KEY`)
> - Standard Trailblaze Python + Postgres env
> - Catalogue reference: `documentation/source_catalogues/04_STOCK_FUNDAMENTALS.md`
>
> **Deliverables:**
>
> 1. **Scraper module** `src/trailblaze/scrapers/finnhub_scraper.py` — one class per endpoint: `FinnhubRecommendations`, `FinnhubPriceTarget`, `FinnhubEarnings`, `FinnhubRevenueEstimate`, `FinnhubEbitdaEstimate`, `FinnhubBasicFinancials`
>
> 2. **CLI entry point** `trailblaze-scrape-finnhub` — accepts `--entity=<slug>`, `--all-listed`, `--nightly`. Fans out across 22 listed entities per catalogue 04 table. Writes `metric_values` with `source_type='stock_api'` (reuse existing source_type; catalogue 04's proposed new source_type values can be deferred).
>
> 3. **Graceful handling** of delisted entities (listing_status != 'active') — log skip, don't error. Matches the four FLAG entities from catalogue 02 + 04.
>
> 4. **Rate limit respect** — 60 rpm hard cap; scraper self-paces
>
> 5. **Idempotency** — one metric_value per (entity, metric_code, period_id). Period for fundamentals = 'daily:YYYY-MM-DD' or 'quarterly:current'. Pick a convention, document in scraper header.
>
> 6. **Tests** — unit tests with mocked Finnhub responses; one integration test against live API for one entity (FLUT)
>
> **Ship gates:**
> - CLI runs successfully on all 22 entities without errors
> - `/companies/flutter-entertainment` shows P/E trailing, P/E forward, EV/EBITDA, analyst rating badge, price target range, next earnings date
> - `/operators` heatmap populates day-delta and market-cap values
>
> **Estimated runtime:** 2 days engineering + 1 day testing + UI verification.
>
> **Constraints:** don't touch parser or Oyvind-ingest. Don't modify UI code unless the StockRow widget literally doesn't read one of the new metric codes (if so, minimal single-line fix).

### 7.3 Phase 1.2 — Entity canonicalisation

> **Task:** Review and promote 506 `auto_added_needs_review` entities (plus any new ones added by Unit A reprocess). Output is a clean canonical entity list, with the `auto_added_needs_review` count reduced to <50.
>
> **Prereq:** Unit A reprocess complete.
>
> **Approach:**
>
> 1. **Generate similarity clusters.** Use `pg_trgm` with `similarity(name, canonical_name) > 0.8` threshold. Produce a CSV: `name, metadata, mention_count, likely_canonical_match, action_suggestion` (merge/promote/drop).
>
> 2. **Batch review** — output in chunks of 50 entities; Andrew reviews in chat with clear accept/reject; Claude Code applies the decisions as SQL UPDATEs.
>
> 3. **Promote** — entities with ≥3 mentions in `reports` AND clean name AND no ambiguity → set `metadata.status = null` (clear flag), assign `entity_type_id`.
>
> 4. **Merge** — entities that are re-spellings of canonical (Flutter Entertainment vs Flutter Entertainment plc vs Flutter Ent.) → delete the dup, re-point any metric_values / report_entities to canonical.
>
> 5. **Drop** — entities mentioned only once, no external confirmation → delete.
>
> **Ship gate:** `SELECT COUNT(*) FROM entities WHERE metadata->>'status' = 'auto_added_needs_review'` drops from 506+ to <50; UK operators like bet365 have canonical rows; Sky Betting hierarchy decided.
>
> **Constraints:** destructive DB operations — `pg_dump` backup first. Irreversible deletes need explicit Andrew approval. Merges must preserve all source report links.
>
> **Estimated runtime:** 1-2 days across multiple sessions (Andrew review bandwidth is the bottleneck).

### 7.4 Phase 2.5 Unit B — State × month grids (Pattern 5)
*[Brief preserved from master plan v3 §6.1]*

> **Task:** Extract Pattern 5 — wide tables where columns are months and rows are US states. Each cell is a `(market_id, online_sports_handle, period, value)` point.
>
> **Read:** Master plan, RICH_EXTRACTION_NOTES §Pattern 5.
>
> **Deliverables:** recogniser `pattern_5_state_month_grid`; edge cases (rolled-up / total / YOY rows skipped); verify `online_sports_handle` metric; monthly periods seeded; parser v2.2.0; backup + reprocess; 15-20 US states × 6-12 months expected.
>
> **Ship gate:** TimeMatrix primitive populated with US state handle by month, last 6 months.

### 7.5 Phase 2.5 Unit C — Affiliate completeness (Pattern 3)
*[Preserved from v3 §6.2]*

> **Task:** Pattern 3 — affiliate revenue-model splits + UI surface.
>
> **Read:** Master plan, RICH_EXTRACTION_NOTES §Pattern 3, UI_SPEC_2_KPI_PANELS §Panel 2.
>
> **Parser:** recogniser `pattern_3_affiliate_splits`, `revenue_model` sub-dimension, `ndcs` first-class, v2.3.0, backup + reprocess.
>
> **UI:** `/affiliates` top-nav entry; `web/app/(app)/affiliates/page.tsx` with Leaderboard; entity-type routing on Company detail for affiliate panel.
>
> **Ship gates:** `/affiliates` renders; `/companies/raketech` shows revenue-model splits.

### 7.6 Phase 2.5 Unit D — B2B completeness (Pattern 2)
*[Preserved from v3 §6.3]*

> **Task:** Pattern 2 — B2B supplier KPIs + UI panels.
>
> **Read:** Master plan, RICH_EXTRACTION_NOTES §Pattern 2, UI_SPEC_2_KPI_PANELS §Panel 3 + §Panel 4.
>
> **Parser:** recogniser `pattern_2_b2b_supplier`; metrics `turnover_index`, `operator_margin`, `adj_ebitda_b2b`, `data_supplier_costs`, `adj_ebita`; distinguish `ebitda` from `adj_ebitda`; v2.4.0; backup + reprocess.
>
> **UI:** entity-type router; B2B Platform panel; B2B Supplier panel.
>
> **Ship gates:** `/companies/kambi` shows turnover_index + operator_margin; `/companies/playtech` shows B2B panel.

### 7.7 Top-10 ranking query (§6.4 in v3, unchanged)

> **Task:** Ranked list of top 10 entities by latest revenue + top 10 markets by latest online GGR. Run AFTER Unit A reprocess so numbers reflect enriched extraction.
>
> **Output:** `documentation/PHASE_2_TIER_1_SCOPE.md` with two tables annotated per entity with required scrapers per source catalogues.
>
> **Constraints:** read-only, markdown only, commit.

---

## 8. Change log

- **2026-04-23 (morning)** — Master plan v1
- **2026-04-23 (afternoon)** — v2: synthetic delete + Unit A briefs
- **2026-04-23 (late afternoon)** — v3: Oyvind-triggered orchestrator as Phase 2 core, top-10 prioritisation, old PDF pipeline deprecated
- **2026-04-23 (evening)** — v4 (this version). Absorbed 5 source catalogue findings. Reprioritised Phase 2: Finnhub fundamentals first (highest value/effort), orchestrator 6th not 1st. Added Phase 2.0 schema pre-blockers. Split news into Phase 2.8. Flagged sellside trusted-sender expansion as zero-code immediate win. Added 7.1, 7.2, 7.3 briefs (schema pre-blockers, Finnhub, entity canonicalisation).

---

**End of master plan.**
