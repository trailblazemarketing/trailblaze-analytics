# Trailblaze Analytics — Product Roadmap

**Last updated:** 2026-04-23
**Owner:** Andrew, Trailblaze Marketing
**Coordinator:** Claude Opus 4.7 (this doc)

---

## Purpose

This roadmap supersedes the ad-hoc "what should we build next" decisions that have driven days 1–2. It sequences every feature from the project's data-ingestion-and-scraper-work-notes into phases with clear exit gates.

**Working principle:** one phase at a time, don't start the next until the current exit gate is met. Each phase decomposes into one or more Claude Code sessions with dedicated briefs.

---

## Where we are (morning of day 3)

**Data layer:**
- 480 reports across 7 document types (209 company_report, 210 market_update, 25 analyst_call, 18 trading_update, 10 shell, 4 capital_markets_day, 4 ma_announcement)
- 24,747 `metric_values` rows
- 173 Oyvind analyst emails successfully ingested + reprocessed (Gmail pipeline live and idempotent); 48 own-replies correctly filtered; 2 errored on max_tokens truncation
- NJ DGE regulator data live — 118 rows including operator-level
- 321 stock rows across 22 tickers (yfinance)
- 224,718 FX rates (ECB historical, 1999–2026)

**Application layer:**
- Frontend live: 4 primitives, 7 KPI panels, period selector, EUR conversion
- Country/state hierarchy with US rollup
- Operator heatmap, leaderboards, scorecards, time matrices
- PDF viewer overlay, report metadata API
- Market scorecard label collision fixed (commit `76b43b4`): `sportsbook_handle` (391 rows, country-covered) now in primary slot; `handle` (8 rows, state-only) moved to secondary under correct label

**Known gaps entering the next phase:**
- **506 `auto_added_needs_review` entities** (up from 294 at end-of-day-2 due to heavy day-2 ingestion) — need human canonicalisation
- 4/5 original US regulators flagged `broken_needs_research` (PA, MI, CT, IL)
- 0 Beacon™ estimates exist yet — visual treatment wired, engine not built
- No forecasting, no news, no AI commentary yet
- 2 densest US-update reports errored on `max_tokens=32768` truncation — natural Phase 2.5 fixture candidates
- 10 `shell` document_type reports present — provenance unclear, to investigate

**Country-level rollup TODO (deferred from session 3):**
- `online_ggr`, `online_ngr`, `handle` show "No data" at country level on Market detail scorecards
- Data exists at state level only, no rollup materialisation exists
- Previous session identified `getCountryRollupValues` helper from earlier work that could be extended
- Needs a design session — approach A (augment with child rollup) vs. extending existing helper

---

## Phase 1 — Stabilize & verify

**Goal:** confirm what's already built actually works before adding anything new.

**1.1 Verify Gmail ingestion landed cleanly** ✅ CLOSED 2026-04-23
- SQL checks: 173 messages ingested, 48 rejected_sender (own-replies), 2 error (max_tokens truncation on densest US-update reports) — verified
- Date verification: all 15 oldest Gmail-ingested reports now show `published_timestamp::date = received_at::date`. Yesterday they all showed the opposite. Reprocess fixed a 10-month-wide timestamp error across ~170 reports.
- UI verification: "ANALYST NOTE" header chrome removed from synthetic PDF viewer
- Reprocess command used: `trailblaze-scrape-gmail --reprocess-existing -v` (runs ~8 hours overnight for 175 messages)
- Commits landed: `76b43b4` (market scorecard label fix), `728f414` (Phase 2.5 design v1), [hash] (Phase 2.5 design v2)

**1.2 Entity canonicalization — human in the loop** ← NEXT
- Walk through the **506** `auto_added_needs_review` entities (more than originally estimated)
- Merge duplicates (`Betparx` / `betParx`), attach subsidiaries (`MGM Digital` → `MGM Resorts`), resolve aliases
- Human judgment work — done with coordinator in chat, not by Claude Code
- Multiple chat sessions given the scale; produces `entity_canonicalization_log.md` for audit
- Workflow to design at session start: SQL query surfacing entities with similarity clusters + batched review UI or CSV export

**1.3 UI regression check**
- Screenshot every major page post-canonicalisation
- Compare against Gemini mockups + prior working state
- Catch any regressions before building more on top

**Exit gate:** clean data layer, canonical entity list, frontend verified. Nothing new starts until this is complete.

---

## Phase 2 — Data expansion (legitimate sources)

**Goal:** fill em-dashes with real data from legal, structured sources.

**2.1 Fix the 4 broken US regulator scrapers**
- PA PGCB (link filter drift), MI MGCB (403 on default UA), CT DCP (URL 404), IL IGB (redirect scheme)
- Each has a diagnosis already in SCRAPERS_STATUS.md
- Single T3 session, ~30-60 min per regulator
- Unlocks per-operator data for PA (25 ops), MI (17), IL (9)

**2.2 Add European regulator scrapers**
- **Spillemyndigheden** (Denmark) — public monthly data, PDF + CSV
- **Spelinspektionen** (Sweden) — quarterly public reports
- **ADM** (Italy) — monthly online gaming data
- **DGOJ** (Spain) — quarterly state-level data
- **Veikkaus** (Finland) — annual + interim reports
- Same pattern as NJ DGE — legal, structured, free
- 1-2 T3 sessions

**2.3 SEC EDGAR scraper for listed US operators**
- Pull 10-Q / 10-K filings for DKNG, MGM, BALY, RSI, CDRO, GAN, LNW, GAMB
- Queue for parser as `source_type='sec_filing'`
- Public domain, redistribution-safe
- 1 T3 session

**2.4 Company IR page scrapers**
- Top 15 entities: Flutter, DraftKings, BetMGM, Entain, Evoke, Betsson, Kambi, Evolution, Playtech, Bally's, Rush Street, Super Group, ATG, Kindred, Sportradar
- Pull press release pages and earnings announcement archives
- Queue matching PDFs for parser as `source_type='company_ir'`
- Expected use (companies publish these for analyst consumption)
- 1 T3 session

**2.5 Wikipedia entity enrichment**
- For every entity in DB, pull Wikipedia article (via MediaWiki API, official)
- Extract: founding date, HQ, parent company, subsidiaries, founder names
- Store in `entities.metadata` with `source='wikipedia_cc_by_sa'`
- License: CC-BY-SA, requires attribution shown in UI
- 1 T3 session

**2.6 Expanded stock data via free APIs**
- **Alpha Vantage** or **Finnhub** for analyst ratings, 52-week ranges, institutional ownership
- Augments yfinance (price/mcap/multiples) with sentiment-adjacent metrics
- Adds data that's referenced in UI_SPEC_2 Operator Panel
- 1 T3 session

**2.7 Parser Category B — narrative extraction (Phase 2 version)**
- Marketing % of revenue, regulated market %, sports margin commentary
- Entity metadata extraction into `entities.metadata` (client count, licensee count, top clients, retail network size)
- B2B-specific metrics (platform_turnover, take_rate_pct, licensee_count, game_library_size)
- FTD/NDC extraction insistence
- Reparse all ~480 PDFs once
- Note: this is NARRATIVE extraction. Tabular rich extraction is Phase 2.5.
- Single T1 session, now better-informed than day 1

**Exit gate:** per-operator data live for 9+ markets (5 US + 4 European minimum); SEC filings + company IR queued; Wikipedia metadata populated; narrative ratios rendering on Company detail pages; stock data expanded.

---

## Phase 2.5 — Rich tabular extraction ← NEW 2026-04-23

**Goal:** extract the rich tabular data in Oyvind's analyst emails that the current parser collapses. Current parser captures ~5–10 metrics per note from prose; dense tables contain 40–120 metrics per note we're currently losing.

**Design doc:** `documentation/PHASE_2_5_DESIGN_v2.md` (authoritative, approved by Andrew 2026-04-22)
**Pattern capture:** `documentation/RICH_EXTRACTION_NOTES.md` (raw examples of the 5 patterns)

**Prerequisites:**
- Phase 1.1 closed (✅ 2026-04-23)
- Phase 1.2 complete (entity canonicalisation — prevents orphan entity_id writes during rich extraction)

**Structure:** 4 shippable units, each independently demoable.

**Unit A — Operator completeness** (~4 days)
- Pattern 4 (state × operator matrix) + Pattern 1 (operator segment + regional + product splits)
- Bundled per Andrew sign-off: operators need both cross-operator rankings AND intra-operator splits simultaneously to feel complete
- Fixes max_tokens ceiling (unblocks the 2 errored US-update reports)
- Ship gate: `/markets/massachusetts` Leaderboard shows operator handle+GGR rankings; `/companies/betsson` shows casino/sportsbook/other + B2B/B2C + regional splits

**Unit B — State × month time-series depth** (~2 days)
- Pattern 5 (17 states × 6 months wide-table extraction)
- Ship gate: TimeMatrix primitive populated with US Online Sports handle grid

**Unit C — Affiliate completeness** (~3 days)
- Pattern 3 (affiliate revenue-model + vertical + business-line splits)
- NEW top-nav entry: `/affiliates` (Andrew sign-off: "add it, delete later if it doesn't work")
- Ship gate: Raketech renders with revenue composition, vertical, business-line splits, NDCs lead indicator

**Unit D — B2B completeness** (~1.5 days)
- Pattern 2 (B2B supplier proprietary KPIs: turnover_index, operator_margin, adj_ebitda/adj_ebita distinction)
- Ship gate: Kambi renders with turnover_index as primary tile

**Parser architecture:** modular pattern recognisers (named blocks in the extraction prompt that are independently testable, versionable, disable-able). Not a monolithic prompt.

**Total Phase 2.5 budget:** 13–14 working days including prep (schema migration, prompt restructure), all 4 units, and a weekend-scale re-extraction run over all ~480 reports.

**Exit gate:** all 5 rich patterns extracted cleanly across the corpus; corresponding UI surfaces populated (state-operator Leaderboards, state-month TimeMatrix, operator segment panels, affiliate panel + nav, B2B primary layout); 2 previously-errored US-update reports now parse cleanly under raised max_tokens.

---

## Phase 3 — Beacon™ + Forecasting (parallel)

**Goal:** the proprietary analytical layer — both historical estimates (Beacon™) and forward projections (forecast).

**Depends on Phase 2.5** for segment + regional data density. Running Beacon™ modelling on sparse metric coverage produces weak estimates.

**3.1 Methodology page content**
- Legal-defensible writing explaining Beacon™ methodologies
- Separate section for forecast methodology
- Disclaimers around confidence tiers and estimate nature
- Human + coordinator drafting session, optional professional copywriter review
- MUST ship before any Beacon™ or forecast values go public (per DECISIONS.md D29)

**3.2 Beacon™ engine v1 — tax-implied methodology**
- Target: `online_ggr` for markets where regulators publish tax receipts but not segment splits (Belgium, Italy, Spain)
- Back-solve: disclosed_tax / known_tax_rate = implied_ggr
- Writes to `beacon_estimates` audit table with `confidence_band_low/high`, methodology name, inputs used
- Canonical view picks up automatically
- Visual treatment already wired — amber dots, ™ superscript, dotted lines activate automatically
- 1 session

**3.3 Beacon™ v2 — peer-ratio methodology**
- For operators with public stock data but undisclosed segments (BetMGM, FanDuel within Flutter, DraftKings iGaming vs sports)
- Estimate segment splits from peer operator ratios in comparable markets
- 1 session

**3.4 Beacon™ v3 — stock-implied methodology**
- For listed operators, back-solve revenue from market cap / EV+multiple
- Applies to ENT, FLUT, DKNG, MGM — fills gaps where segments aren't disclosed
- 1 session

**3.5 Forecast engine v1 — deterministic time-series**
- Linear regression + seasonality decomposition on historical metric_values
- Per-metric, per-entity, per-market projections
- Confidence band based on historical variance
- Versioned — each forecast run stored with input metadata
- Refreshes when underlying data materially changes
- 1 session

**3.6 Forecast UI widget**
- Extends existing time series charts — solid line for actuals, dotted blue for forecast, shaded confidence band
- "FORECAST" module on Company detail + Market detail + Overview
- Methodology link visible
- 1 T2 session

**3.7 Composite score / index** (Christian's suggestion)
- Proprietary score combining multiple normalised KPIs into a single ranking metric per entity / market
- Deliberately sequenced AFTER Phase 2.5 so the underlying dataset is dense enough to justify the composite
- Benchmarking across operators, markets, affiliates, traffic sources
- Scope TBD based on pilot client feedback
- 1-2 sessions

**Exit gate:** Beacon™ coverage non-zero for 5+ markets; forecast widget live on Company + Market detail; methodology page drafted and linked; composite index live on Overview + Market + Company detail; dashboard visually complete (no more misleading 0% Beacon™ labels).

---

## Phase 4 — News intelligence (RSS-based, legal)

**Goal:** recent relevant news contextualized per entity/market.

**4.1 RSS aggregator scraper**
- 20-30 industry feeds: iGamingBusiness, EGR, SBC News, CalvinAyre, Gaming Intelligence, SportsHandle, Legal Sports Report, InGame
- Financial press RSS where available (Reuters RSS, FT company pages, Seeking Alpha company-specific feeds)
- Google News RSS (purpose-built for aggregation, legal)
- Company IR press-release RSS for every listed operator
- Stores: title + publisher + date + link + short AI-generated summary (NOT full article text)
- 1 T3 session

**4.2 Article classification / relevance tagging**
- Each article classified by: entity relevance, market relevance, topic (earnings, M&A, regulation, product, legal)
- Store mapping in new `news_articles_entity_map` table
- LLM-powered initial classification, human review for edge cases
- Recency-weighted relevance scoring
- 1 session

**4.3 News bulletin UI modules**
- Overview page: global "Recent News" feed, top 10 items
- Company detail: company-specific news feed in right column
- Market detail: market-specific news feed
- Format: headline / publisher / timestamp / short summary / link-out
- No full article text stored — attribution + link-out = legal
- 1 T2 session

**4.4 AI-generated summaries**
- 2-3 sentence summary per article
- Grounded in article content (fetched via allowed-use URLs)
- Clearly labeled: "AI summary of [publisher] article"
- Link-out to original source
- 1 session

**Exit gate:** news module live on Overview + entity + market pages, 200+ articles indexed and tagged, entity/market relevance working correctly.

---

## Phase 5 — AI analyst commentary

**Goal:** AI-generated outlook notes per entity/market, grounded in data.

**5.1 Template framework + prompt library**
- Structured input: recent metric_values + YoY changes + Beacon™ values + forecast + recent news + peer comparison
- Template structure: headline takeaway → key drivers → upside / downside → short-term outlook → medium-term outlook
- Per-entity-type templates (operator, affiliate, B2B, lottery, DFS, market)
- 1 session

**5.2 Commentary generation service**
- LLM call with structured inputs (Claude, same pattern as parser)
- Versioned per generation run
- Stored in new `analyst_notes` table with inputs_used audit trail
- Refreshes when underlying data materially changes (new report, new period, significant YoY shift)
- 1 session

**5.3 UI: analyst note panel**
- Dedicated widget on Company detail + Market detail
- Labeled "AI-generated analyst note — not investment advice"
- "Last updated" timestamp visible
- "Inputs used" expandable section showing what data drove the note
- 1 T2 session

**5.4 Legal disclaimers + footer**
- Every AI-generated element clearly labeled
- Methodology page extended with AI commentary section
- ToS update acknowledging AI-generated content
- 1 session of coordinator + user writing

**Exit gate:** AI analyst notes live on all major entity/market pages, clearly disclaimed, refreshing on data changes, audit trail traceable.

---

## Phase 6 — Automation & operationalization

**Goal:** the product runs itself on a schedule.

**6.1 Windows Task Scheduler (dev) / Railway cron (prod) setup**
- Hourly `trailblaze-scrape-gmail`
- Daily PDF ingest from `reporting.trailblaze-marketing.com`
- Weekly `trailblaze-scrape-stocks` (fixes the current thin 30-day sparkline issue on Flutter page)
- Monthly regulator scrape (2nd of month)
- Daily RSS pull
- 1 session

**6.2 Pipeline alerting**
- If a scheduled scrape fails 2x in a row → email notification
- Simple webhook-to-email or SMTP
- 1 session

**6.3 Coverage-gap detection**
- Weekly job: detect new entities/markets referenced in recent content that lack scraper coverage
- Generates `admin_tasks.md` or similar — "new entity 'X' seen in Oyvind email 2026-05-01, no IR page scraper exists, recommend add"
- 1 session

**6.4 Entry report auto-refresh**
- When new Oyvind email ingests, regenerate any derived reports or snapshots
- Triggered by ingestion webhook
- 1 session

**Exit gate:** system runs autonomously for a week without intervention, all ingestion scheduled, alerts functional.

---

## Phase 7 — Deploy to production & pilot

**Goal:** real users, real feedback.

**7.1 Production deployment**
- Vercel (frontend) + Neon (Postgres) + Railway (background workers)
- Domain DNS: `analytics.trailblaze-marketing.com`
- Supabase Auth live
- Environment separation (dev / prod DBs)
- Per ARCHITECTURE.md target topology
- 1-2 sessions

**7.2 Pilot client onboarding**
- 3-5 friendly clients you already know
- Magic-link accounts, brief onboarding call, shared Slack channel
- Weekly check-ins for feedback
- Usage analytics (Plausible or similar, privacy-respecting)

**7.3 Iterate on pilot feedback**
- Roadmap becomes client-driven from here
- Bug fixes, small features, polish based on real use

**Exit gate:** 3+ active weekly users providing concrete feedback.

---

## Phase 8+ — Conditional on pilot validation

Features that emerge from real client demand, not speculation:

- **Export to Excel / PDF** — likely first client request
- **Alerts / watchlists** — "email me when Flutter's NJ market share changes >2pp"
- **Saved views / custom dashboards** — power-user territory
- **Comparison workflows** — multi-entity, multi-market side-by-side analysis
- **Deeper Beacon™ methodology coverage** — more metrics, more markets
- **Advanced news** — paid feeds like Factiva IF client budgets justify
- **Mobile-friendly views** — if demand materializes
- **Additional regulators** — as market demand dictates (Brazil ANP, Germany GGL, Ontario iGO, etc.)
- **Additional rich-extraction patterns** — operator × product matrices, company-level geographic revenue, peer comparison tables, guidance-range extraction, tax/take-rate matrices (listed in `RICH_EXTRACTION_NOTES.md` as Phase 2.6+ candidates)

---

## Deliberately excluded — and why

**Nothing from the data-ingestion-and-scraper-work-notes document is excluded.** The four items previously flagged as "out of scope" are in the roadmap:

1. **External source scraping** — Phase 2 covers SEC EDGAR, company IR pages, Wikipedia, free stock APIs, and expanded regulators. Legal, structured sources only; no Google/Bloomberg scraping which would violate ToS.

2. **Forecasting** — Phase 3 includes it alongside Beacon™, not after. Deterministic time-series, transparent methodology.

3. **News ingestion** — Phase 4 via RSS (which publishers intend for aggregation) + Google News RSS. Attribution-preserving, link-out format, no full-text republishing.

4. **AI analyst commentary** — Phase 5, grounded in product data, versioned, disclaimed, audit-trailed.

**Additional rich tabular extraction (Phase 2.5)** was initially informal capture in `RICH_EXTRACTION_NOTES.md` during day-2 ingestion. Now fully scoped in `PHASE_2_5_DESIGN_v2.md` and inserted as its own phase.

---

## Timeline (realistic, 1-2 sessions/day)

- **Phase 1:** 3-4 days (1.1 closed 2026-04-23; 1.2 next, scale up from ~294 to 506 entities extends this)
- **Phase 2:** 1.5-2 weeks
- **Phase 2.5:** 13–14 working days
- **Phase 3:** 2 weeks
- **Phase 4:** 1 week
- **Phase 5:** 3-5 days
- **Phase 6:** 3-4 days
- **Phase 7:** 1-2 weeks
- **Phase 8+:** ongoing

**Total to pilot-ready:** ~9–11 weeks (extended from original 7–9 estimate, primarily due to Phase 2.5 insertion and larger Phase 1.2 entity pool).

Compressible if working full-time. Extendable if interruptions hit. Adjust expectations accordingly.

---

## Working rules

1. **One phase at a time.** No starting Phase 2 until Phase 1 exit gate is met.
2. **Each phase decomposes into sub-items with their own briefs.** Briefs are scoped, specific, and carry hard done-criteria.
3. **Commit frequently, small commits, clear messages.** Git history is safety net.
4. **Screenshot verification every major UI change.** Eyes on the product.
5. **When a brief scope expands mid-session, stop and scope the new work separately.** Don't let sessions balloon.
6. **User (Andrew) = strategist.** Coordinator (Claude Opus) = project manager. Claude Code = engineer. Respect the division.
7. **NEW:** Parser or extraction logic changes never happen while an ingest or reprocess is running. Use `RICH_EXTRACTION_NOTES.md`-pattern capture files to park observations until the pipeline is quiet.
8. **NEW:** Handoff documents between chat sessions are the durable record of where we are. They can contain errors inherited from prior handoffs — verify claims against live DB before acting on them.

---

## Change log

- **2026-04-22** — Initial roadmap created. Supersedes ad-hoc decisions from days 1-2.
- **2026-04-23** — Phase 1.1 closed: reprocess successfully applied 383b283 bug fixes to 173/175 Gmail-ingested reports. Phase 2.5 added as new phase between Phase 2 and Phase 3, scoped in `PHASE_2_5_DESIGN_v2.md`. Phase 3 gains composite index (3.7) per Christian's suggestion. Phase 1.2 entity count updated from 294 to 506 (heavy day-2 ingestion). Working rules 7 and 8 added capturing lessons from session 3.

---

**End of roadmap.**
