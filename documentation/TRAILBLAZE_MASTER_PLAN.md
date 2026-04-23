# Trailblaze Analytics — Master Plan

**Last updated:** 2026-04-23 (session 4 close, v7)
**Supersedes:** all prior master plans
**Owner:** Andrew, Trailblaze Marketing
**Status:** End of day 2. Phase 1.1 closed. Phase 2.5 Unit A data layer shipped. UI rounds 4 + 5 + 6 complete. 9 data-layer TODOs catalogued and phase-mapped. Ready for Phase 1.2 + Beacon™ v1 when day 3 starts.

---

## 1. The architecture, stated once and simply

Trailblaze Analytics has one primary source of truth: **Oyvind Miller's daily analyst emails**, ingested via Gmail. Everything else is enrichment or output.

**The data flow:**

1. Oyvind email arrives → Gmail ingest picks it up
2. Parser extracts structured metrics, narratives, mentioned entities/markets (parser v2.1.0 with Pattern 1 + Pattern 4 recognisers)
3. The Oyvind email triggers enrichment — mentioned entities/markets kick off scrapers automatically
4. Enriched dataset written to DB
5. Synthetic PDFs generated FROM DB for `reporting.trailblaze-marketing.com` — outputs, not inputs

**Historical synthetic PDFs removed. Corpus is Oyvind-only.** Old PDF parsing deprecated.

---

## 2. Where we are at end of day 2

### Data layer — Phase 2.5 Unit A ✅ COMPLETE
- 175/175 reports at parser_version 2.1.0, zero errors
- 21,189 metric_values (+2,412 vs baseline, +12.8%)
- 13,071 canonical partitions, matview in sync
- Pattern 1 (operator segment/region splits): 1,345 new rows
- Pattern 4 (state × operator matrices): 6,422 cells across 37 operators × 17 US states
- 300 regional rows extracted (9 regions, 37 operators)
- 18 new entities auto-added to review queue (adding to existing ~506 pending)

### Frontend — 4 QA rounds + 4 fix sweeps completed

**Round 4 fix sweep (most recent) shipped 12 commits, zero new regressions.** Full commit list at §8.

Shipped fixes delivered this session:
- Overview redesigned as command centre (world map + treemap + 6 KPI tiles + right rail)
- Entity-type KPI panels (lottery, DFS, B2B) suppress irrelevant tiles
- Geographic Breakdown unit suffix bugs resolved on company pages
- Flutter redirect works
- Companies reporting count fixed (3 → 28)
- Treemap coloured by entity type
- Treemap labels with full-name hover tooltips
- Treemap parent/child dedup (FanDuel hidden under Flutter)
- Chart cadence filters + chronological ordering applied
- Filename prefix stripped
- NJ hero KPI scale-aware formatter
- NJ operator share denominator corrected
- Overview Recent Commentary dedup + diversification
- /operators combined market cap GBp/GBP normalisation (Entain £3.9B not €448B)
- Biggest Growers ±50% suppression (filters BetMGM -51.8%, Catena +52.9%)
- Competitive Position widget respects parent-child hierarchy, filters self-compare

Unit A ship gate partial:
- `/companies/betsson` regional panel renders exact Q2-25 values (CEECA 118.2 / LatAm 84.7 / Nordic 33.9 / WE 59.3 / RoW 7.6) ✅
- Product-split panel (Casino/Sportsbook/Other) NOT wired — data exists, component missing ⚠
- B2B/B2C panel NOT wired — data exists, component missing ⚠
- `/markets/us-massachusetts` Pattern 4 leaderboard renders 9 operators ✅
- Handle/GGR/Market-Share toggle NOT wired — fixed column shows SPORTSBOOK_GGR ⚠

---

## 3. Known data-layer issues (catalogued, phase-mapped)

**Source:** `documentation/COMPANY_AUDIT_PARSER_TODOS.md` (9 entries, committed `f40b80b` 2026-04-23)

These are intentionally NOT being fixed ad-hoc. Each is routed to the phase that naturally resolves it. Reopening parser work now would jeopardise the just-stabilised v2.1.0 extraction.

| # | Issue | Symptom | Root cause | Resolved by | Priority |
|---|---|---|---|---|---|
| 1 | Flutter Q3-25 €128.6M / -93.7% QoQ | Single quarter shows impossible value | Multiple conflicting revenue rows per partition; canonical-view resolution picking wrong row | Phase 2.0 pre-blockers (canonical-view rule: prefer rollup rows) | HIGH |
| 2 | NGR > Revenue on BetMGM (€2.43B vs €605M) | Definitionally impossible | Unit error at extraction — NGR rows landing with wrong magnitude | Parser sanity rule (§4.5.1 new — standalone small task) | HIGH |
| 3 | NGR > Revenue on Betsson (€1.19B vs €285M) | Same as above | Same as above | Same as #2 | HIGH |
| 4 | Italy `€5.30B™` | ™ glyph rendering as part of number | Parser-emitted character OR UI string concat | Parser sanitiser (§4.5.2 new — trivial) | MEDIUM |
| 5 | Sweden competitive widget missing ATG et al | Widget shows Kindred/Betsson/evoke only | Entity-type assignment missing for ATG/LeoVegas/ComeOn/Svenska Spel | Phase 1.2 entity canonicalisation | HIGH |
| 6 | BetMGM "Market Share (GGR)" bare "22" / "15" | Missing % sign and scale | Parser didn't emit unit on those values | Parser unit-injection rule (§4.5.3 new — trivial) | MEDIUM |
| 7 | Kambi EV/EBITDA 173.1× and P/E 50.9 | Implausibly high multiples | No sanity guard on scraper | Phase 2.7 Finnhub (second stock source enables validation) | LOW |
| 8 | UK Gamesys/Bally's duplicates | Subsidiary + parent both in leaderboard | Missing parent_entity_id links | Phase 1.2 entity canonicalisation | MEDIUM |
| 9 | Italy operator coverage ~49% of market | Only Flutter/evoke/FairPlay shown | Pattern 4 extraction gap (Sisal/Lottomatica/Snaitech not captured) | Phase 2.5 Unit B (state × month) + Phase 2.3 IT regulator scraper | MEDIUM |

**Legend:**
- Phase 1.2 resolves: #5, #8 (2 items)
- Phase 2.0 resolves: #1 (1 item)
- Phase 2.7 resolves: #7 (1 item)
- Phase 2.5 Unit B + Phase 2.3 resolves: #9 (1 item)
- New small parser tasks §4.5: #2, #3, #4, #6 (4 items)

**No items are orphaned.** Every TODO has a home.

---

## 4. The roadmap

### PHASE 1 — Data layer integrity

- **1.1** Gmail ingestion verification ✅ CLOSED 2026-04-23
- **1.2** Entity canonicalisation ← NEXT
  - ~524 entities in `auto_added_needs_review` (506 pre Unit A + 18 from Unit A)
  - 16 of 18 active UK operators in this pile block UK demo
  - Resolves data-layer TODOs #5 and #8
  - Workflow: Claude Code generates similarity clusters + CSV, Andrew reviews batches of 50, promote/merge/drop decisions applied
- **1.2.5** Source priority ✅ CLOSED (synthetic delete)
- **1.2.6** NorthStar cross-partition bug ✅ CLOSED
- **1.3** Retry errored reports ✅ CLOSED via Unit A retries
- **1.4** UI regression check post-Unit-A ← IN PROGRESS (QA round 5 verification brief drafted)

**Exit gate:** entities canonicalised to <50 pending; UI round 5 verification reports clean.

---

### PHASE 2 — Enrichment pipeline

Top-10 rule: scrapers prioritise by entity revenue + market GGR. Top 10 get full coverage first.

**Pre-Phase-2 blockers (§2.0):**
- 12 new metric codes (fundamentals)
- `entities.metadata.listing_status` for Bally's, Kindred, GAN, NeoGames
- `entity_domains` structure (JSONB or separate table)
- **Canonical-view rule for multi-row revenue partitions** (resolves TODO #1 Flutter Q3-25)

**Then (in order):**
- **2.7** Finnhub stock fundamentals — FIRST (22 listed entities, free tier, ~2-3 days) — resolves TODO #7
- **2.4** SEC EDGAR — SECOND (10 US-listed entities, free, ~3 days)
- **2.2** Fix 4 broken US regulator scrapers (PA, MI, CT, IL) — THIRD (~4 days)
- **2.3** EU regulator scrapers (DK, SE, IT, ES) — FOURTH (~5 days) — contributes to TODO #9
- **2.5** Company IR PDF scraper — FIFTH (top 5 Nordic issuers first)
- **2.1** Oyvind-triggered enrichment orchestrator — SIXTH
- **2.6** Wikipedia metadata — LAST (batch-fill job)
- **2.8** News ingestion (trade press RSS + Google News + company wires) — folds into 2.1 when that lands
- **2.9** Web traffic (deferred — SimilarWeb when budget permits)

**Also immediate zero-code wins:** Expand Gmail `TRUSTED_SENDERS` for Redeye, Carnegie, Pareto, Jefferies, Truist, DB research aliases.

---

### PHASE 2.5 — Rich tabular extraction

- **Unit A** (Patterns 1 + 4) ✅ CLOSED — data shipped, UI wiring pending (see §6)
- **Unit B** — State × month grids (Pattern 5) — queued (resolves TODO #9 partially)
- **Unit C** — Affiliate completeness (Pattern 3) + `/affiliates` nav — queued
- **Unit D** — B2B completeness (Pattern 2) + B2B panels — queued

**Outstanding UI wiring from Unit A (bundle with Unit D):**
- Company page product-split panel (Casino/Sportsbook/Other per period)
- Company page B2B vs B2C split panel
- US state page Handle/GGR/Market-Share toggle on Leaderboard

---

### 4.5 Small parser sanitiser tasks (new, resolves 4 TODOs)

These are small, isolated parser-layer fixes. Can run as one Claude Code session when convenient — ideally AFTER Phase 1.2 and BEFORE the next full reprocess. Each is genuinely trivial on its own.

- **4.5.1** NGR > Revenue sanity rule — if extracted NGR exceeds extracted Revenue for the same entity/period/market, log warning and prefer lower-magnitude value (resolves TODOs #2, #3)
- **4.5.2** ™ glyph sanitiser — strip `™` and similar superscript badges from number strings during extraction (resolves TODO #4)
- **4.5.3** Percentage unit injection — when metric_code ends in `_pct` or `market_share`, enforce % formatter at render and validate source value in [0, 100] (resolves TODO #6)

**Ship gate:** reprocess a dozen flagged reports, confirm all 4 TODOs resolved in DB. No full-corpus reprocess required for this task.

---

### PHASE 3 — UI v2

Data density from Phase 2 + 2.5 unlocks full UI quality.

- **3.1** Affiliate section (delivered in Unit C)
- **3.2** Overview polish
- **3.3** Operators page — stock heatmap, richer leaderboard, delta movers
- **3.4** Market detail — country-level rollup, tax history, regulatory filings, commentary
- **3.5** Company detail cleanup
- **3.6** Per-entity news module (Phase 2.8)
- **3.7** Per-entity sellside research module (Gmail trusted-sender expansion)

---

### PHASE 4 — Beacon™ + Forecasting

Beacon™ concretised into three tiers (refined in v5 based on Betsson Q4-25 observation):

- **4.1** Methodology page — legal-defensible write-up (CONTENT BLOCKED — pending Andrew + legal review)
- **4.2 Beacon™ v1 — GAP-FILL** ← first concrete Beacon feature
  - Estimate missing quarters in disclosed time-series using trend + YoY + peer + narrative
  - Render as dotted line with tooltip showing methodology + confidence
  - **Data dependency: NONE beyond current corpus**
  - Ship gate: Betsson Q4-25 estimated and rendered as dotted line connecting Q3-25 to Q1-26
  - Can run PARALLEL to Phase 2
- **4.3 Beacon™ v2 — FORWARD ESTIMATE**
  - Predicts next-period values ahead of release
  - Enhanced by Phase 2.7 Finnhub consensus estimates
- **4.4 Beacon™ v3 — CROSS-ENTITY BACKSTOP**
  - Peer-ratio modelling for non-disclosed metrics
  - Depends on Phase 2 data density
- **4.5** Composite score / index (Christian's suggestion)

**Beacon™ v1 is demo-ready without Phase 2 scrapers.** Ships alongside Phase 1.2 completion as first pilot-quality feature.

---

### PHASE 5 — AI commentary

- **5.1-5.4** AI analyst commentary: templates, generation, UI panel, disclaimers

(News infrastructure moved to Phase 2.8.)

---

### PHASE 6 — Automation & production

- **6.1** Task scheduling
- **6.2** Pipeline alerting
- **6.3** Coverage-gap detection
- **6.4** Synthetic PDF generator FROM DB — closes architectural loop
- **6.5** Process resilience — longer exponential backoff on Anthropic capacity spikes (Unit A needed 3 retries due to this)

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
3. **Scrapers prioritise by size.** Top 10 entities / markets first.
4. **Free tier first.** Don't add paid providers until free tier is exhausted.
5. **Schema blockers land before scrapers.** Metric codes + listing_status + entity_domains must exist first.
6. **One phase at a time.** Exit gate or no forward movement.
7. **No UI fixes during active parser reprocess.** Wait for stable data before chasing UI bugs. (Lesson from session 4 — fixing against moving data compounds regressions.)
8. **One fix class per commit.** Bundled changes create regressions that are hard to bisect.
9. **Don't drive-by-refactor.** If code looks ugly but works, leave it.
10. **Commit frequently.** Small commits, clear messages.
11. **Design docs are the durable record.**
12. **Claude Code does engineering. Main chat does coordination.**
13. **Verify handoff claims against live DB.** Never trust, always verify.
14. **Destructive operations require backup first.** `pg_dump` before mass DELETE.
15. **Don't reopen closed phases to chase catalogued TODOs.** If a TODO has a phase mapped to it (see §3), wait. Reopening the parser to fix Flutter Q3-25 jeopardises Pattern 1/4 wins and costs another full reprocess.
16. **Brief size is inversely correlated with fix quality.** Observed pattern across 6 QA rounds:
    - Round 2 brief (15 fix classes, broad) → 5 new regressions
    - Round 3 brief (10 fix classes) → 3 new regressions
    - Round 4 brief (11 fix classes + strict one-commit-per-fix) → 0 new regressions but 1 incidental widget disappearance
    - Round 6 brief (1 fix, surgical) → expected 0 regressions
    Bigger briefs create bigger surface area for Claude Code to "improve while it's there", cascade unrelated changes, or misunderstand scope. Rule of thumb: **if a brief has more than 5 fix classes, split it.** Prefer 2 small briefs to 1 large one, even at the cost of more round-trips.

---

## 6. Unit A UI wiring — deferred to Unit D

Unit A shipped the data layer. Three UI components remain unwired and are bundled with Unit D since that session rebuilds entity-type panels anyway:

1. **Product-split panel on Company pages** — Revenue By Product (Casino/Sportsbook/Other) for each period. Ship gate: Betsson shows Q2-25 Casino €212.4M / Sportsbook €90.0M / Other €1.3M.
2. **B2B vs B2C split panel on Company pages** — Revenue By Business Model. Ship gate: Betsson shows the split.
3. **Handle/GGR/Market-Share toggle on US state pages** — Pattern 4 data already rendered as leaderboard, toggle UX missing. Ship gate: Massachusetts leaderboard switches between Handle / GGR / MS%.

---

## 7. Realistic timeline

- **Phase 1 finish (1.2 entity canonicalisation):** 1-2 days
- **Phase 2 pre-blockers (§2.0):** half-day
- **§4.5 small parser sanitisers:** half-day (after Phase 1.2, before next reprocess)
- **Phase 4.2 Beacon™ v1 (gap-fill):** 3-5 days (can run parallel to Phase 2)
- **Phase 2 through top-10 coverage:** 2-3 weeks
- **Phase 2.5 Units B/C/D:** 1.5-2 weeks
- **Phase 3 UI v2:** 1-2 weeks
- **Phase 4.3-4.5 Beacon™ v2/v3 + composite:** 2 weeks
- **Phase 5 AI commentary:** 1 week
- **Phase 6 automation:** 3-4 days
- **Phase 7 deploy + pilot:** 1-2 weeks

**Total to pilot-ready:** 8-11 weeks.

**Demo-ready sooner:** after Phase 1.2 + Beacon™ v1 ships (~1 week), the product shows real differentiation.

---

## 8. Claude Code briefs — queued

Do NOT kick off until QA round 5 verification completes.

### 8.1 Phase 1.2 — Entity canonicalisation

Prereq: Unit A complete ✅, QA round 5 verification clean.

Workflow:
1. Claude Code generates similarity clusters via `pg_trgm`. Output CSV to `documentation/entity_canonicalisation/cluster_YYYYMMDD.csv`. Columns: candidate_name, canonical_match, similarity_score, mention_count, suggested_action (promote / merge / drop).
2. Andrew reviews CSV in batches of 50 — accepts/rejects via edit or comment.
3. Claude Code applies decisions as DB updates (destructive — `pg_dump` backup first).
4. Iterate until `auto_added_needs_review` count < 50.

Resolves data-layer TODOs: #5 (Sweden entity-type assignment for ATG et al), #8 (UK Gamesys/Bally's dups).

Estimated: 1-2 days across multiple sessions (Andrew review bandwidth is bottleneck).

### 8.2 Phase 2.0 — Schema pre-blockers

Prereq: entity canonicalisation mostly done.

Commits:
- Alembic migration `0006_fundamentals_metric_codes.py` adding 12 new metric codes
- Data migration for `listing_status` on 4 flagged entities
- Add `domains` key to `entities.metadata` JSONB
- **Canonical-view rule for multi-row revenue partitions** (resolves TODO #1 Flutter Q3-25)

Estimated: ~4-6 hours.

### 8.3 Phase 2.7 — Finnhub stock fundamentals

Prereq: 8.2 (schema) committed.

Scraper module, CLI entry point, graceful delisted-entity handling, rate-limit respect, idempotency, tests.

Ship gates:
- `/companies/flutter` shows P/E, EV/EBITDA, analyst rating badge, price target range, next earnings date
- `/operators` heatmap populates with day-delta + market-cap values
- Kambi multiples validate against second source (resolves TODO #7)

Estimated: 2-3 days.

### 8.4 Phase 4.2 — Beacon™ v1 (gap-fill)

Prereq: Phase 1.2 (cleaner data → better Beacon estimates).

**Scope:**
1. Backend gap-fill compute: for each entity × metric × periodspan where a gap exists within disclosed periods, compute estimate via (a) linear trend of surrounding quarters (b) YoY same-quarter prior-year factor (c) narrative hint if mentioned.
2. Write estimated values to `metric_values` with `disclosure_status='beacon_estimate'` and metadata recording methodology + confidence score.
3. UI rendering: Revenue chart renders estimated values as dotted line connecting disclosed points. Beacon™ badge on entity/page where estimates present. Tooltip on dotted segment shows: "Estimated via [method] · confidence XX%".
4. Methodology page (Phase 4.1) — at least one short paragraph required before shipping Beacon™ to a user.

**Ship gate:** `/companies/betsson` Revenue chart renders dotted line through Q4-25 connecting Q3-25 to Q1-26, with tooltip showing methodology.

Estimated: 3-5 days total.

### 8.5 §4.5 Parser sanitiser tasks

Prereq: Phase 1.2 done. Ideally BEFORE any Unit B/C/D work.

Three small fixes in one session:
- 4.5.1 NGR > Revenue sanity rule (resolves TODOs #2, #3)
- 4.5.2 ™ glyph sanitiser (resolves TODO #4)
- 4.5.3 Percentage unit injection (resolves TODO #6)

Ship gate: reprocess ~12 flagged reports (Betsson, BetMGM, Italy, etc), confirm TODOs resolved. No full corpus reprocess.

Estimated: half-day.

### 8.6 Phase 2.5 Unit D + Unit A UI wiring bundle

See §6. Unit D session picks up product-split + B2B/B2C + MA toggle at same time.

---

## 9. Session 4 — commits landed today (2026-04-23)

QA round 4 follow-up (12 commits, zero regressions):
- `c48c7d1` — Heatmap no-data fill + zoom polish
- `721cc35` — NJ hero KPI tiles scale-aware formatter
- `fa407a6` — NJ operator share denominator
- `4f5cbf3` — Overview Recent Commentary dedup+diversify
- `081d92b` — /operators combined market cap GBp→GBP
- `b402bd7` — Biggest Growers ±50% filter
- `9494e0a` — Treemap labels with hover tooltips
- `376b1e9` — Treemap parent/child dedup
- `5909fd9` — Competitive Position hierarchy
- `f40b80b` — Parser TODOs round 4 logged

Earlier session 4:
- `76b43b4` Market scorecard fix
- `9aa2f89` Phase 1.2.5 design
- `be15e4d` Parser max_tokens 128k
- `0004_canonical_oyvind_primary.py` Matview Oyvind precedence
- `7bb18f0` Chart cadence fallback Company
- `cc42190` Unit A parser modular recognisers
- `e5d385a` Unit A migration 0005
- `ba5049d` Unit A retry-errors flag
- `d68ee74` Master plan v2
- `b61ef8e` Filename prefix strip
- `ccd35e4` Market chart cadence
- `c4103ec` Turnover→handle alias
- `dd077df` Total GGR em-dash
- `8b106a6` Online GGR LTM 4-quarter sum
- `55eb24b` Operators leaderboard expanded
- `ece474d` UK audit TODOs
- `decc11f` Source catalogue 01 web traffic
- `de34d03` Source catalogue 02 share prices
- `e094c3c` Source catalogue 03 official reports
- `fff4f68` Source catalogue 04 stock fundamentals
- `c1f4ec0` Source catalogue 05 news
- `6776d9f` Source catalogue 00 summary
- `863adfb` Master plan v3
- `aa96d95` LTM-or-sum-4-quarters
- `aa2d8ae` Em-dash collisions
- `627ba48` Entity-type panels
- `64dc99f` As-of freshest period
- `ef2ac0c` Parser TODO doc

**Key day-2 lesson:** fixing UI/calc issues on moving data compounds regressions. Wait for stable data layer before iterating on UI.

**Key day-2 discipline win:** round 4 fix sweep shipped 12 commits with ZERO new regressions (vs 5 regressions in round 2→3 and 3 regressions in round 3→4). The new principles (7/8/9) worked.

---

## 10. Change log

- **v1** — initial plan (morning)
- **v2** — synthetic delete + Unit A briefs
- **v3** — Oyvind-triggered orchestrator as Phase 2 core, top-10 prioritisation, old PDF pipeline deprecated
- **v4** — absorbed 5 source catalogue findings, Phase 2 reordered
- **v5** — Unit A complete, Beacon™ refined into v1/v2/v3 with gap-fill as concrete first feature
- **v6** — round 4 fix sweep complete with zero regressions; 9 data-layer TODOs explicitly phase-mapped (§3); new §4.5 for small parser sanitiser tasks; Unit A UI wiring gaps bundled to Unit D (§6); working principle 15 added (don't reopen closed phases for catalogued TODOs)
- **v7 (current)** — QA round 5 verified 8/9 round-4 fixes PASS, 1 PARTIAL (Flutter Competitive Position widget disappeared — surgical round 6 fix drafted); 2 TODOs incidentally improved (Italy ™ glyph, UK evoke dedup); Beacon™ v1 priority candidates identified (BetMGM strongest, Betsson single-gap); working principle 16 added (brief size vs fix quality — prefer small surgical briefs over large sweeping ones)

---

**End of master plan.**
