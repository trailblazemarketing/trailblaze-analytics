# Trailblaze Analytics Platform — Project Brief v2

**Last updated:** 2026-04-21 (late day 1)
**Supersedes:** `PROJECT_BRIEF.md` (v1, 2026-04-21 morning)
**Status:** Active build, day 1, three terminals in coordinated parallel work
**Owner:** Andrew, Trailblaze Marketing
**Project folder:** `C:\Users\Andrew\Documents\trailblaze-analytics`

---

## Read this first — if you're a new chat picking this up

You're the strategist/coordinator. Andrew is non-technical and drives Claude Code terminals that do the engineering. Your job is to translate product intent into precise, scoped terminal briefs, hold the line on scope, and maintain coherence across three parallel workstreams.

**Reading order:**
1. This document end to end
2. `ARCHITECTURE.md` (v1, unchanged) — system design
3. `DECISIONS.md` (v1, unchanged) — rationale for each locked choice
4. `SCHEMA_SPEC.md` (v1, unchanged) — database blueprint
5. `ui documentation/UI_SPEC_1_PRIMITIVES.md` — the 4 analytical view primitives
6. `ui documentation/UI_SPEC_2_KPI_PANELS.md` — 7 entity-type panel definitions + parser/scraper extraction requirements
7. `ui documentation/UI_SPEC_3_PAGE_COMPOSITIONS.md` — **Andrew has this; upload at start of next chat. Not yet ingested by coordinator.**

v1 `PROJECT_BRIEF.md` is the day-1 snapshot. Use it for historical context only. This v2 doc is the current source of truth for status and next actions.

---

## The one-paragraph version (unchanged from v1)

Trailblaze Marketing publishes daily PDF market intelligence reports on the iGaming industry. We are building an analytics platform that ingests these PDFs (plus external scraped regulator + stock data and proprietary modeled estimates) into a structured database, and exposes the data through a high-end interactive dashboard at `analytics.trailblaze-marketing.com`. Positioned as Bloomberg-Terminal-for-iGaming, sold to investment banks, hedge funds, private equity, and operator strategy teams. Key differentiator is **Trailblaze Beacon™** — proprietary modeled estimates that fill data gaps competitors can't.

---

## What's changed since v1

v1 described day-1 morning state: schema done, 307 PDFs pulled, seed data loaded, three terminals "in progress."

What's actually happened since:

- **T1 (PDF parser) completed first pass** — all 307 PDFs through, 0 errors, but significant data was dropped (not flagged) due to vocabulary gaps in the extraction prompt.
- **T3 (scrapers) went broader than intended** — built 44 scraper scaffolds across regulators and company IR, but 0 of 5 core US regulators are verified working; only the yfinance stock pipeline is production-ready.
- **T2 (frontend) has been idle** pending UI spec finalization.
- **UI spec finalized** — 3 docs covering primitives, panels, page compositions. UI_SPEC_2 explicitly enumerates parser/scraper extraction requirements, which revealed gaps in what T1 and T3 delivered.
- **Strategic resets issued to T1 and T3.** Both are mid-flight on second passes as of this handoff.

---

## Tech stack — unchanged from v1

See v1 `PROJECT_BRIEF.md` table. PostgreSQL 16, Python 3.13, SQLAlchemy + Alembic, Anthropic Claude parser, Next.js 14 + TypeScript + Tailwind + shadcn/ui, Recharts, TanStack Table, Supabase Auth, Vercel + Neon + Railway.

---

## Current build state by terminal

### Terminal 1 — PDF Parser

**Status at handoff:** about to run Category A reparse (vocabulary-aware extraction).

**What landed in first pass:**
- 307 / 307 PDFs parsed, 0 errors, ~16 min at 15 workers
- 2,282 metric values, 2,677 narratives, 1,805 canonical rows after dedup
- 200 auto-created entities flagged `extra_metadata = {"status": "auto_added_needs_review"}`
- Parse-status: 3 clean / 221 with_warnings / 83 shells
- Parser code is production-quality: streaming, extra-field tolerant, race-safe auto-create, rate-limit-aware, idempotent via file_hash

**What we discovered was wrong:**
- 3,221 `unknown_metric_code` warnings and 1,749 `unknown_period_code` warnings
- **Those rows were dropped, not stored flagged** — confirmed at `ingest.py:136-142`, unknown codes trigger `continue` before reaching `metric_values`
- Root cause: `PASS2_SYSTEM` prompt tells the LLM to "map to our canonical metric dictionary" but never shows the dictionary. LLM was guessing canonical code names and mostly picking plausible-sounding-but-wrong ones (`sports_revenue` instead of `sportsbook_revenue`, freeform monthly periods instead of `Mmm-YY`)
- `entities.extra_metadata` (JSONB) already exists — same pattern on reports, markets, metric_values, narratives, beacon_estimates. No migration needed for Category B work.

**Category A brief issued (in-flight):**
- Seed expansion: monthly period codes (`Mmm-YY`, `YTD-Mmm-YY`, `MNN-YY`) for 2024–2027, top-15 missed metric codes
- Semantic alias audit — produce `dictionary_aliases.md` documenting canonical/alias decisions
- Add `metric_aliases` table; ingest consults it before dropping unknown codes
- Rewrite `PASS2_SYSTEM` to dynamically embed the canonical metric list + period grammar + common-aliases block + hard rules
- Bump `parser_version`, delete all 307 reports (FK cascades), reparse everything at 15 workers
- **Done criteria:** unknown_metric_code ≤ 966 (70% reduction from 3,221), unknown_period_code ≤ 200, metric_values count up ≥1,000

**Category B (deferred to next session):**
- Narrative ratio extraction: marketing %, regulated market %, sports margin commentary
- Entity metadata extraction: client count, licensee count, top-client lists, retail network size → into `entities.extra_metadata`
- New B2B-specific primary metrics: platform_turnover, take_rate_pct, licensee_count, game_library_size
- FTD/NDC extraction insistence (currently inconsistent)

**Curation backlog (human-judgment work, not terminal work):**
- 200 auto-added entities need review — mostly reporting segments ("MGM Digital", "Caesars Digital", "FDJ United Online") that should be attached to parent entities or merged into existing slugs. Don't hand to Claude Code; needs domain knowledge.

---

### Terminal 2 — Frontend (Next.js)

**Status at handoff:** idle, needs rebriefing with full UI spec.

**What Andrew reported:** T2 is idle. No detail on what it finished before going idle — needs ground-truth check at start of next session ("auth done? layout shell? any pages wired?").

**What the UI spec requires (summary):**
- 4 primitives as reusable components: Leaderboard, Time Matrix, Scorecard, Deep Dive (full specs in `UI_SPEC_1_PRIMITIVES.md`)
- 7 KPI panels keyed to entity type (operator, affiliate, b2b_platform, b2b_supplier, lottery, dfs, market) — each with defined primary (3-5 tiles) and secondary (4-8 tiles) KPIs. Full specs in `UI_SPEC_2_KPI_PANELS.md`
- Page routes and compositions — **specified in UI_SPEC_3, which the coordinator has not yet ingested.** Upload at start of next chat before briefing T2.
- Beacon™ visual treatment is non-negotiable: dotted chart lines, ™ superscript, amber (`#F59E0B`) accent, confidence bands on estimates, methodology hover cards

**Data available for T2 to bind against:**
- Everything from the PDF parser (post Category A reparse)
- Stock data from T3 yfinance pipeline (327+ rows, 22 tickers, live + historical)
- Regulator state-total data (partial — see T3 status)
- Canonical value picker (`metric_value_canonical` matview) already in schema

**What T2 is blocked on:**
- Nothing technically — schema and seed data support full build
- Coordination-wise: cleaner to rebrief after T1 Category A lands and T3 regulator fix lands, so T2 builds against the stabilized data layer, not a moving target

**Next action when resuming T2:**
- Upload UI_SPEC_3 to coordinator
- Get ground-truth status from T2 (what was built before it went idle)
- Write T2 rebrief covering: primitive components, KPI panel system keyed to entity_type, page routes per UI_SPEC_3, Beacon™ visual treatment

---

### Terminal 3 — Scrapers

**Status at handoff:** about to run regulator-layer reset (depth over breadth).

**What's production-ready:**
- **Stock scraper is done.** `trailblaze-scrape-stocks`, 22 tickers live (2 expected failures: GAN delisted, Kindred private), 327 rows inserted, idempotency verified (second run: 0 inserts / 13 updates / 314 unchanged). Pulls `stock_price`, `market_cap`, `pe_ratio`, `ev_ebitda_multiple`. Writes properly to `metric_values` with full provenance.
- **Scraping framework is sound.** Every scraper goes through `upsert_metric_value` with full keys (entity_id/market_id/metric_id/period_id/source_id). Periods auto-created via `PeriodCache`. Source resolution per run. Natural idempotency tuple.
- **7 new entities landed** from this pass: Kindred, Kambi, Evoke, Bally's (all with tickers), plus Caesars/Churchill Downs/Super Group pre-existing. Malta market added.

**What's NOT working:**
- **0 of 5 original US regulators are verified producing rows.** NJ DGE confirmed broken (stale URL pattern, 404s). PA PGCB / MI MGCB / CT DCP / IL IGB compile and have real index URLs but were never live-tested.
- **22 Expansion A regulators** (additional US + 7 internationals) — all untested scaffolding.
- **15 company IR scrapers** — all untested scaffolding.
- **No operator-level parsing exists.** T3 explicitly did not build this. All regulator scrapers populate `market_id` only, never `entity_id`. This is UI_SPEC_2's highest-priority flagged gap (per-operator market share in NJ/PA/MI).

**T3 brief issued (in-flight):**

*Step 1 — Archive Expansion A:* Move 22 international regulators + 15 IR scrapers to `_scaffolded/` or flag them `scraper_status='scaffolded_untested'`. Don't delete. Don't run by default. Document in `SCRAPERS_STATUS.md`.

*Step 2 — Fix and verify 5 US regulators (state totals):* NJ DGE, PA PGCB, MI MGCB, CT DCP, IL IGB. Run live, fix URL patterns + selectors + regex, verify rows land, confirm idempotency. Minimum metrics: `igaming_ggr`, `sports_betting_handle`, `sports_betting_ggr`.

*Step 3 — Operator-level parsing for NJ/PA/MI:* Table-aware parsing to extract per-operator rows. Populate `entity_id` (framework already supports it). Build `operator_aliases` table keyed `(market_id, reported_name) → entity_id` for name resolution — FanDuel vs "FanDuel Sportsbook" vs "Betfair Interactive US" etc. Metrics per operator: `sports_betting_handle`, `sports_betting_ggr`, `igaming_ggr` where published, `tax_paid` optional.

*Step 4 — Don't touch IR scrapers.* Scaffolded, deferred per D25 adjacency.

*Step 5 — Don't touch stock scraper.* Document 2 expected failures in `SCRAPERS_STATUS.md`, otherwise leave alone.

*Done criteria (hard):* 5/5 US regulators producing rows; NJ/PA/MI producing `entity_id`-populated rows; all 5 pass idempotency; `SCRAPERS_STATUS.md` committed; Expansion A archived or flagged. If any regulator resists 2-3 fix attempts, flag as `broken_needs_research` and move on.

---

## Strategic principles governing these briefs

Laid out in DECISIONS.md but worth re-stating because they drove the Category-A/B split and the T3 narrow reset:

1. **Risk asymmetry drives bundling decisions.** T1 Category A (teach vocabulary) is near-risk-free — cannot make extraction worse. T1 Category B (narrative extraction, judgment calls) has real noise risk. Splitting them means one reparse costs 16 minutes of diagnostic clarity; bundling loses the signal on which change caused which result.

2. **Depth before breadth on pipelines.** 44 untested scrapers is worse than 5 verified scrapers, because "compiled and has real URL" reads as "done" to anyone who doesn't know better. Just-in-time depth — light up more scrapers when product demand justifies verification.

3. **Foundation before features.** The PDF parser is upstream of every panel. The canonical view is upstream of every leaderboard. Fix data layer before building UI against it. T2 rebrief deliberately waits for T1 Category A and T3 regulator fix to land.

4. **Hard done-criteria on every brief.** If T1 Category A doesn't hit ≥70% warning reduction, it doesn't declare success — it investigates. Prevents plausible-looking-but-wrong completion claims.

5. **Human judgment stays with human.** The 200 auto-added entities, operator name aliases, pricing decisions, methodology page copy — these do not go to Claude Code. Claude Code will make plausible-sounding decisions here that silently pollute the DB.

---

## Next actions (in order)

**Immediately after this handoff:**
1. T1 runs Category A — ~20 min including seed + prompt rewrite + 16 min reparse
2. T3 runs regulator reset — longer, bounded by live iteration loops on URL patterns
3. Both run in parallel, don't step on each other

**While T1/T3 run:**
4. Upload UI_SPEC_3_PAGE_COMPOSITIONS.md to the new chat
5. Get ground-truth status from T2
6. Draft T2 rebrief covering primitives + panels + page compositions + Beacon™ treatment

**When T1 Category A lands:**
7. Review the summary. If ≥70% warning reduction achieved, scope T1 Category B against the new baseline (may have shrunk). If not, investigate before proceeding.
8. Category B candidates in rough priority order: narrative ratios (marketing %, regulated %), entity metadata (client/licensee counts), new B2B primary metrics. FTD/NDC insistence can likely be solved by alias work alone.

**When T3 regulator fix lands:**
9. Review `SCRAPERS_STATUS.md`. Verify operator-level rows exist in DB for NJ/PA/MI.
10. Decide whether CT/IL can stay broken-but-flagged or need another attempt. CT and IL are lower-priority markets than NJ/PA/MI.

**When T2 rebrief lands (after 1-3 above):**
11. T2 builds primitive components first, then KPI panel system, then page compositions.
12. First visible milestone: Operator scorecard page rendering against real data for ≥5 entities.

---

## Open questions / known issues

Carried forward from v1, still open:

- **Auth model:** separate from existing portal, Supabase magic link. Same users = two accounts for now.
- **Trailblaze Beacon™ methodology page:** content not yet written. Needs to be defensible to financial clients.
- **Pricing:** likely $15-30k/seat/year, needs validation with 3-5 friendly clients.
- **Sales/distribution:** no outreach plan yet.
- **Brand colors:** using best-guess hex (`#2BA8E0` blue, `#2B2D8E` purple, `#F59E0B` Beacon™ amber). Real palette from Trailblaze designer outstanding.

New since v1:

- **UI_SPEC_3 not yet ingested by coordinator.** Andrew has it. Must upload at start of next chat before T2 work can proceed.
- **200 auto-added PDF entities** need human curation. Not urgent, not blocking, but will cause cosmetic issues in leaderboards until resolved.
- **CT and IL regulator scrapers** may prove harder than NJ/PA/MI — those two states publish less structured data. If so, flag as deferred, don't force.
- **Company IR scrapers** parked. Light up when client asks for it or when PDF parser clearly misses something the IR page would catch.

---

## How to use this document

**If you're picking this up cold in a new chat:**
- Read this doc end to end
- Ask Andrew to upload UI_SPEC_3 if it's not already in context
- Ask Andrew for current terminal state before drafting any new briefs — things move fast in this build, the doc may be stale
- Default to the principles in the "Strategic principles" section when in doubt
- Treat the locked decisions in DECISIONS.md as settled; don't relitigate

**If you're Andrew returning to this:**
- You're the strategist. Your role is product intent + scope policing. Don't do engineering work in chat that belongs in a terminal.
- When a terminal reports back, the first question is always "does this meet the hard done-criteria?" If no, it's not done.
- When a terminal surfaces a new problem mid-brief, scope the decision back to this conversation — don't let terminals self-expand scope.

---

**End of brief v2.**
