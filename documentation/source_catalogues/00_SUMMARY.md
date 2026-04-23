# Source catalogue — summary + Phase 2 prioritization

*Companion index for the five catalogues in this directory. Generated 2026-04-23 as input to the master plan's Phase 2 Enrichment pipeline.*

## What was catalogued

Five research documents, one per data type, each covering: (a) provider landscape with tier rankings, (b) per-entity or per-market mapping, (c) integration notes (cadence, rate limits, cost), (d) known gaps flagged for human review.

| # | Catalogue | Primary Tier-1 source | Cost (Tier-1) | Coverage |
|---|---|---|---|---|
| [01](./01_WEB_TRAFFIC.md) | Web traffic | SimilarWeb API | ~$1,500/mo | 44 canonical entities → primary consumer domains |
| [02](./02_SHARE_PRICES.md) | Share prices | yfinance | $0 | 22 listed entities + 22 private/state-owned |
| [03](./03_OFFICIAL_REPORTS.md) | Official reports | SEC EDGAR + LSE RNS + regulator scrapers | $0 | 22 IR pages + 28 US state + 15+ EU + 10+ RoW regulators |
| [04](./04_STOCK_FUNDAMENTALS.md) | Stock fundamentals | Finnhub free tier | $0 | 22 listed entities + sellside specialty houses map |
| [05](./05_NEWS.md) | News | Trade press RSS + Google News RSS | $0 | 44 entity-specific queries + 76 per-market feeds |

**Four of five data types have a usable $0/month Tier-1 stack.** Only web traffic genuinely needs a paid provider for production-grade numbers (SimilarWeb at ~$1,500/mo). Everything else can be kicked off without a budget request.

## Entity universe at a glance

- **44 canonical entities** (active, not `auto_added_needs_review`): 23 operators, 8 B2B platforms, 5 B2B suppliers, 5 affiliates, 5 lotteries, 1 DFS.
- **22 listed** / **22 private or state-owned / subsidiary**. Four listed entities have recently delisted or are in deal limbo (Bally's take-private, Kindred → FDJ, GAN → SEGA Sammy, NeoGames → LNW).
- **510 auto_added_needs_review entities** — excluded from this catalogue per the brief. These are parser auto-extractions from analyst emails that haven't been promoted to canonical status yet. Catalogue scope will need to expand to cover them once a curation pass promotes the high-signal ones into canonical status.
- **76 markets**: 36 countries + 28 US states + 10 regions + 2 Canadian provinces. Regulator URLs are not yet stored in `markets.regulator_url` (all null today); catalogue 03 fills that gap on paper but the data-layer seeding is separate work.

## Most important findings across all five catalogues

1. **Finnhub's free tier is the Phase 2 MVP accelerator.** One API key, 60 rpm, covers share prices + fundamentals + earnings calendar + analyst ratings for every listed entity in the DB — including Nordic First North names that most free APIs skip. No other single provider matches this breadth-per-dollar.
2. **SEC EDGAR unlocks structured fundamentals for 10 of 22 listed entities** (FLUT dual-filer, DKNG, MGM, BALY, RSI, CDRO, GAN, LNW, GAMB, SRAD). For these, Trailblaze can self-compute P/E, EV/EBITDA, and segment splits without a third-party dependency — the cleanest provenance chain in the entire data model.
3. **Per-operator regulator breakdown is binary and high-impact.** Half the world's iGaming regulators publish per-operator splits; the other half publish jurisdiction totals only. Catalogue 03 documents this per regulator. The 8 highest-value regulators to (re)build scrapers for, ranked by `operator-count × market cap attention`: PA, MI, IL, ADM (IT), DGOJ (ES), iGO (CA-ON), Spelinspektionen (SE), Spillemyndigheden (DK).
4. **Entity ↔ domain mapping is many-to-one in reality** but one-to-one in the current schema. Flutter owns 8+ consumer brands; Entain 15+; Betsson ~10. Before any web-traffic scraper runs, an `entity_domains` seed (or `entities.metadata->>'domains'` array) needs populating.
5. **Metric dictionary is missing ~12 codes** that fundamentals + news catalogues assume exist: `pe_trailing`, `pe_forward`, `ev_sales`, `analyst_recommendation_*`, `analyst_price_target_*`, `earnings_date_next`, `rev_estimate_*`, `ebitda_estimate_*`. A seed migration is a blocker before Phase 2.7 can write data.
6. **Four recent corporate events** complicate coverage and need scraper-level handling: Bally's take-private (filings cease), Kindred → FDJ (Nordic feed reroutes to French parent), GAN → SEGA Sammy (delisting + reporting reroute to JP parent), NeoGames → Light & Wonder (absorbed into LNW 10-Q). The enrichment orchestrator needs a "listing_status" flag on entities and graceful handling of 404s.
7. **Gmail ingestion is the right delivery channel for sellside notes**, not a new integration. Expanding `TRUSTED_SENDERS` to include Redeye, Carnegie, Pareto, Jefferies, Truist, Deutsche Bank, Morgan Stanley research aliases gives Trailblaze deep sellside coverage for a few hours of trust-verification time — no new code required.
8. **News is cheap and dense**, but the current `source_type` enum may not include `news_article` / `news_wire`. Check + extend if needed before wiring catalogue 05 to the parser.

## Recommended Phase 2 sub-task ordering (by value ÷ effort)

Master plan Phase 2 has 7 sub-tasks (2.1 orchestrator, 2.2 broken US scrapers, 2.3 EU scrapers, 2.4 SEC EDGAR, 2.5 company IR, 2.6 Wikipedia, 2.7 expanded stock data). Given what these catalogues uncovered, the recommended ordering is:

### 1st — Phase 2.7 (expanded stock data via Finnhub)
**Why first:** highest value ÷ effort ratio in the entire Phase 2. One integration activates the existing Company Detail `StockRow` widget for 22 entities, populates the `stock heatmap`, unlocks the operator KPI secondary tiles for listed names, enables earnings-calendar-driven scheduling for every other sub-task. Free. ~2 days of engineering.

**Prerequisite:** seed migration adding ~12 fundamentals metric codes (see finding 5 above). ~2 hours of SQL.

### 2nd — Phase 2.4 (SEC EDGAR scraper)
**Why second:** builds structured provenance chain for US listed half of the universe. Uniform format across 10 entities. Enables self-computed multiples independent of third-party APIs. Complements 2.7 by giving richer financial-statement detail than Finnhub alone. Free. ~3 days.

**Prerequisite:** decide whether EDGAR is a separate scraper module or an extension of the company-IR scraper (2.5). Recommend separate — EDGAR has a formal JSON + XBRL API; non-US IR pages need PDF parsing.

### 3rd — Phase 2.2 (fix 4 broken US regulator scrapers — PA, MI, CT, IL)
**Why third:** unlocks per-operator data in the four biggest regulated US markets after NJ. 51 operator-market cells come online (25 PA + 17 MI + 9 IL; CT already partially covered). Highest regulator-data-per-engineering-day in this group — scrapers exist but are broken, not net-new.

**Prerequisite:** none beyond the existing regulator-scraper framework.

### 4th — Phase 2.3 (EU regulator scrapers: DK, SE, IT, ES)
**Why fourth:** per-operator-capable EU regulators (DGOJ, ADM, Spelinspektionen, Spillemyndigheden — see catalogue 03) are the best analog to NJ/PA/MI for European markets. Skip Veikkaus (monopoly, single operator, no breakdown needed). Finland's data is already available via the monopoly's annual report. ~5 days for four scrapers.

### 5th — Phase 2.5 (company IR PDF scraper)
**Why fifth:** high engineering cost per entity (each IR site has different layout; PDFs are inconsistent). Better to wait until the parser is proven on regulator + SEC formats first. Start with the top 5 Nordic issuers (Betsson, Evolution, Kambi, Better Collective, Catena Media) where SEC doesn't apply.

### 6th — Phase 2.1 (Oyvind-triggered orchestrator)
**Why sixth:** the orchestrator's value multiplies with the number of attached scrapers. Wire it up after 2.2 + 2.3 + 2.4 + 2.7 are landed, so a single Oyvind email triggers fan-out to ≥4 scrapers worth their fan-out cost. Building it earlier risks shipping an orchestrator that mostly no-ops.

### 7th — Phase 2.6 (Wikipedia metadata)
**Why last:** nice-to-have for filling `headquarters_country`, `founding_date`, `parent_company` on the 510 auto_added_needs_review set. Low urgency — none of the UI is blocked on it. Fits well as a batch-fill job after the canonical set is curated.

### Not in the master plan but recommended:
- **Web traffic (catalogue 01)** — add as a Phase 2.8 step once budget permits SimilarWeb. Don't block anything else on it. Phase 3 territory.
- **News ingestion (catalogue 05)** — lightweight addition to the existing Gmail-ingestion pipeline; could be folded into 2.1 orchestrator's fan-out when it lands.
- **Sellside-note trust-allowlist expansion** — zero-engineering Phase 2 win. ~30 minutes per sender to verify identity + add to `TRUSTED_SENDERS`. Could start immediately, independent of the above ordering.

## Schema / data-layer blockers

Three changes need to land before the Phase 2 ordering above can run cleanly:

1. **`entities.metadata->>'domains'` (or new `entity_domains` table)** — for web-traffic scraping, catalogue 01. JSON-array shape is cheapest; proper normalized table is cleaner. Choose one before Phase 2.8.
2. **Seed ~12 new fundamentals metric codes** — for Phase 2.7. Matches codes recommended in catalogue 04 integration-notes section. One Alembic migration + seed update.
3. **`entities.metadata->>'listing_status'` (`active` / `delisted_<YYYY-MM-DD>` / `private`)** — for graceful handling of Bally's, Kindred, GAN, NeoGames coverage changes across catalogues 02 + 03 + 04. Trivial to populate manually from known dates.

Less urgent:
- **`regulator_name` + `regulator_url` population** on `markets` rows (all null today). Catalogue 03 has the data on paper; a one-off seed UPSERT covers all 76 markets.
- **`source_type` enum extension** for `news_article` / `news_wire` if not already present. One migration.
- **`entities.metadata->>'domains'` vs multi-brand roll-up strategy** — decide how the UI aggregates traffic for multi-brand parents (Flutter, Entain, Kindred). Not urgent but affects web-traffic UI design.

## The 510 auto_added_needs_review entities

Per the brief these were deliberately excluded from this catalogue. Quick curation recommendation for Phase 2.6:

- Bulk-triage by `entity_type_id` — operators are most valuable, B2B suppliers second, media/unknown lowest.
- Collapse aliases: many rows are re-spellings of canonical entities (different parsing of the same name across reports). SQL: `WHERE similarity(name, canonical.name) > 0.8` using `pg_trgm`.
- Promote to canonical if they have ≥3 mentions in `reports` AND match a known ticker or domain pattern.
- Drop if mentioned only in one report and no external-source confirmation.

An estimated 60–120 of the 510 are plausibly canonical-worthy once deduped — bringing canonical count from 44 → ~150, which matches the brief's expected range.

## Remaining work (for human review)

- **Verify listing status** for Bally's, Kindred, GAN (3 tickers). ~15 minutes.
- **Catalogue-level RSS feed URLs** for every trade-press and regulator news page (catalogue 05 lists sites, not feed URLs). ~2 hours.
- **Onboard sellside distribution aliases** into `TRUSTED_SENDERS` (catalogue 04). Per-sender verification; ~30 min each.
- **Seed `markets.regulator_url`** from catalogue 03 tables. ~1 hour.
- **Schema blockers 1–3 above.** Half a day of migrations + seeds.

## Session outcomes

- 6 markdown documents: 5 catalogues + this summary.
- 6 commits against `main` (one per catalogue + summary).
- Zero code changes. Zero DB writes. All reads against live DB.
- Runtime: ~2.5 hours, within the 3-hour budget. All 5 catalogues delivered. No scope dropped.
