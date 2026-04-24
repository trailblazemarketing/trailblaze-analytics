# Trailblaze Analytics — Roadmap Recap

**Date:** 2026-04-24
**Horizon:** Next 2 weeks
**Structure:** Goal-oriented

---

## Part 1 — Where we actually are

### What's live and working

**Data layer (production-ready)**
- Oyvind email ingestion pipeline running
- 175 reports in corpus, parser v2.1.0
- Canonical matview with largest-value tiebreaker (fixes 18 duplicate-row entity families)
- 21,158 metric values
- 92.5% accuracy at 0.5% tolerance verified against source PDFs
- 3 parser sanitisers (NGR > Revenue guard, glyph stripper, percentage range) applied to 130 of 175 reports

**Product layer (production-ready)**
- 4 analytical primitives (Leaderboard, Time Matrix, Scorecard, Deep Dive)
- Company pages, Market pages, Operators page, Affiliates section (index + 5 detail pages)
- Beacon™ v1 live: 8 estimates, dotted-line rendering on charts, methodology tooltips
- 70 verified narratives surfaced on Hero tiles, chart points, leaderboard rows
- Admin panel, user management, profiles, session logging
- Auth gate (splash + login/logout)

**Infrastructure (in flight)**
- GitHub repo pushed (`trailblazemarketing/trailblaze-analytics`)
- Neon Postgres provisioned, data restored
- Vercel deploying now
- Custom domain `insight.trailblaze-marketing.com` pending DNS from developer

### What's outstanding but not blocking

| Item | Impact | Effort to fix |
|---|---|---|
| 45 reports at pre-sanitiser state | Low — sanitisers are additive | 1-2 hours targeted reprocess |
| 524 auto-added entities pending canonicalisation | Medium — blocks clean leaderboards | 1-2 days with your review |
| Narrative coverage 70/400 target | Medium — demo polish | 2-3 hours prompt tuning + re-run |
| UK-specific parser TODOs (bet365 entity, Entain splits, turnover→handle alias, etc.) | Medium — blocks UK demo specifically | 1 day dedicated session |
| Italy operator coverage gap | Low — one market, known fix path | Half-day |
| Synthetic PDF source-priority dedup | Low — matview masks symptom | Phase 1.2.5 design exists |

---

## Part 2 — Structural problem with the current plan

The master plan went through 8 iterations in 48 hours. Every iteration added phases, sub-phases, cross-references, and working principles. It's now comprehensive but unnavigable.

**Specifically:**
- 11 major sections
- 7+ phases with sub-units each
- 17 working principles
- Dozens of TODOs scattered across 5 documents
- Phases 2.0, 2.1, 2.2, 2.3, 2.4, 2.5 (Units A/B/C/D), 2.6, 2.7, 2.8, 2.9
- Cross-references between phases that require reading 4 documents to trace

The plan is trying to hold everything everywhere all at once. That was useful during rapid build-out. It's not useful for "what do I do next."

**This recap replaces the master plan as your day-to-day reference.** The master plan stays as archive. This document is what you work from.

---

## Part 3 — The 2-week plan

Four workstreams. Each with a concrete deliverable. Each can be done by one Claude Code session or one afternoon of your time.

### Workstream 1 — Finish what's mid-flight (Day 4, tomorrow)

**Why first:** These are 80% done. Finishing them clears mental space.

**Deliverables:**
1. Vercel deployment completes → production URL live
2. Developer adds CNAME → `insight.trailblaze-marketing.com` resolves
3. Smoke-test production — log in, load 5 pages, confirm data renders
4. Reprocess the 45 remaining reports to get to 175/175 sanitiser coverage
5. Re-run narrative extraction with tuned prompt → get from 70 to ~300+ verified narratives

**Estimated effort:** 1 day. 2-3 Claude Code sessions.

**Exit criteria:** `insight.trailblaze-marketing.com` is live, shows logged-out splash, logged-in users see all pages with data.

---

### Workstream 2 — Entity cleanup (Days 5-6)

**Why second:** With production live, data quality becomes visible. The 524 pending entities show up as weird duplicates and missing operators on leaderboards. This is the single biggest quality gap for any pilot demo.

**Deliverables:**
1. Phase 1.2 — Entity canonicalisation
   - Claude Code generates similarity clusters via `pg_trgm`
   - You review 50-entity batches in CSV
   - Decisions applied (promote/merge/drop)
   - Target: <50 pending entities remaining
2. Phase 1.2.5 — Synthetic PDF source dedup
   - Script the 3-workstream cleanup from existing design doc
   - Flag Oyvind as canonical where synthetic exists
   - Stop ingesting new synthetics into parser pipeline

**Estimated effort:** 2 days. Your review bandwidth is the bottleneck, not code.

**Exit criteria:** Every operator leaderboard shows sensible entity names. No Gamesys+evoke duplicates, no Bally's Interactive vs Corp confusion. bet365 appears where expected.

---

### Workstream 3 — UK demo polish (Days 7-8)

**Why third:** UK is your most data-rich market and the easiest demo showcase. The UK audit found 10 specific parser issues. Fixing them unlocks UK as a flagship market page.

**Deliverables:**
1. Fix the 10 UK parser TODOs as a dedicated session:
   - `online_ggr` dedup
   - `ggr` vs `online_ggr` separation
   - bet365 entity + UK attribution
   - Sky Betting child entity of Flutter
   - `sportsbook_handle` / `sportsbook_turnover` alias
   - `casino_ggr` Q2-25 divergent values
   - Q3-25 `online_ggr` derivation from components
   - Currency normalisation
   - Entain UK segment splits
2. Targeted reprocess of UK-related reports
3. Re-run narrative extraction against fresh UK data

**Estimated effort:** 1-2 days. Parser work, so higher concentration risk than UI work.

**Exit criteria:** `/markets/united-kingdom` is demo-quality — accurate values, complete operator list, clean time series, no duplicated rows.

---

### Workstream 4 — Content + narrative expansion (Days 9-10)

**Why fourth:** By now data is clean, infrastructure stable, one market proven. Time to widen narrative coverage and write the methodology page.

**Deliverables:**
1. Narrative prompt engineering
   - Analyse the 28% verify-fail cases
   - Refine prompt to handle edge cases (multi-entity reports, narrative-heavy formats)
   - Re-run `--top-n 30` full extraction to target ~800 verified narratives
2. Methodology page (`/methodology`)
   - How Oyvind emails get parsed
   - What Beacon™ does and doesn't claim
   - Data freshness policy
   - Accuracy statement (92.5% at 0.5% tolerance verified against source)
   - Legal/compliance language
3. About page and footer polish (stretch)

**Estimated effort:** 1-2 days. Half technical, half writing.

**Exit criteria:** Every major entity has 15+ narratives surfaced. `/methodology` is legally defensible and reads professionally.

---

### Days 11-14 — Buffer week

Reserve these for what comes up. Things that always come up in a 2-week plan:
- Production bugs you find once real traffic hits
- Beacon v2 exploration (forward estimates, not gap-fill)
- Another QA round after everything above lands
- Responding to opportunities (investor intro, partner request, pilot conversation)
- Rest

---

## Part 4 — What's explicitly OUT of scope for these 2 weeks

Worth naming these, because the master plan keeps them warm and they'll pull attention if you let them.

- **Phase 2 enrichment scrapers** (Finnhub, SEC EDGAR, regulator scrapers) — your corpus is already rich enough for pilot. Delay until after first customer conversations tell you what's missing.
- **Phase 2.5 Units B/C/D** (state×month grids, affiliate completeness expansion, B2B panels) — defer unless a pilot user specifically requests the missing data
- **AI commentary (Phase 5)** — not needed for pilot, large scope
- **Mobile-responsive polish** — pilot users will be on desktop
- **Billing / subscription infrastructure** — defer until you have pilot interest
- **Bloomberg parity comparison** — defined vaguely, would inflate scope. Revisit after pilot conversations.

---

## Part 5 — What to watch for

Three patterns that have caused problems and will cause more problems if not watched:

**1. Scope creep inside sessions.** You've established the "brief size inversely correlated with fix quality" rule. Keep it. If a brief grows past 5 fix classes during writing, split it.

**2. Working against moving data.** UI fixes applied during active reprocess create regressions. If a parser reprocess is running, don't do UI fixes on the same files.

**3. Trying to do three things in parallel.** Day 3 had main reprocess + Beacon sandbox + UI overnight + admin panel + narratives + deploy all running simultaneously. It worked but was chaotic. Aim for 2 things in flight max.

---

## Part 6 — How to use this document

**When you sit down tomorrow:** look at Workstream 1. Start the first deliverable.

**When a Claude Code session finishes:** check off against the Workstream's deliverables. Pick the next one.

**When something new comes up:** does it fit in one of the 4 workstreams? If yes, add it. If no, add it to Part 4 (out of scope) or Part 5 (future). Don't let it become a new workstream.

**When a week passes:** check Part 3. If you're behind, that's fine — push each workstream one day. If you're ahead, move the buffer work up.

**When this 2-week plan ends:** write the next one the same way. Keep it focused.

---

## Change log

- **v1 (this doc)** — replaces master plan v8 as the primary reference. Master plan archived. 2-week goal-oriented horizon. Explicit out-of-scope list to prevent drift.
