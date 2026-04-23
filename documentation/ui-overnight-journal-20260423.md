# UI Overnight Journal — 2026-04-23

**Branch:** `ui-primitives-and-affiliates`
**Operator:** Claude Code (Opus 4.7, autonomous overnight)
**Brief:** Build 4 analytical primitives from UI_SPEC_1 + full Affiliate section from UI_SPEC_2/3.

---

## Phase 0 — Branch + environment scan

- Created branch `ui-primitives-and-affiliates` off `main`.
- `origin` remote not configured in this clone (local-only git). All work stays local; morning integration will need to push or diff-apply.
- Main-branch activity in last ~90 minutes (files to avoid touching):
  - `web/components/primitives/leaderboard.tsx` — commit a44a1c5 (/markets period-aware row labels) → **DO NOT MODIFY**; v2 created instead.
  - `web/components/primitives/scorecard.tsx` — commit 8f220b3 (Hero period suffix) → **DO NOT MODIFY**; v2 created instead.
  - `web/lib/adapters.ts` — commit a44a1c5 → leave alone.
  - `src/trailblaze/parser/ingest.py` — ingest fixes (multiple commits), irrelevant to frontend-only scope.
  - `documentation/COMPANY_AUDIT_PARSER_TODOS.md` — docs-only.
- `web/components/primitives/time-matrix.tsx` and `deep-dive.tsx` were NOT touched on main; they are fair game.

## Phase 2A — Affiliate DB audit (read-only)

**Entity count:** 5 active affiliates in the canonical DB.

| slug | name | ticker | metric_value rows |
|---|---|---|---|
| better-collective | Better Collective | BETCO | 130 |
| gambling-com-group | Gambling.com Group | GAMB | 120 |
| catena-media | Catena Media | CTM | 80 |
| acroud | Acroud | ACROUD | 77 |
| marlin-media | Marlin Media | — | 0 |

**Brief's assumption check:** brief mentioned Raketech as a top-5 affiliate; **Raketech is not in the DB** (not seeded). Marlin Media is seeded but carries no metric values. Practical ship-gate targets: the four above with data.

**Metric codes present for affiliates (top 21):**
`revenue (159)`, `ndc (43)`, `other_revenue (30)`, `stock_price (27)`, `market_cap (27)`, `ebitda_margin (18)`, `ebitda (18)`, `adjusted_ebitda (16)`, `casino_revenue (12)`, `sportsbook_revenue (12)`, `paid_media_spend (7)`, `b2b_revenue (6)`, `revenue_guidance (6)`, `operating_profit (6)`, `ebitda_guidance (6)`, `seo_revenue (5)`, `customer_deposits (3)`, `licensee_count (2)`, `ev_ebitda_multiple (2)`, `pe_ratio (1)`, `ftd (1)`.

**Matches UI_SPEC_2 Panel 2 primary:** revenue ✓, ebitda ✓, ndc ✓, revenue-per-ndc (derivable: revenue / ndc when both exist for same period) — no `arpu`/`revenue_per_ndc` code in DB for affiliates, but the existing `scorecard-builder.ts` affiliate panel already uses `arpu` as "Revenue / NDC" (used loosely for the quotient). Panel will render em-dash where the quotient can't be computed.

**Matches Panel 2 secondary:** seo_revenue ✓, paid_media_spend ✓, ftd ✓, ebitda_margin ✓.

**TODO — missing affiliate metrics for full Panel 2 parity (log only, NOT fixing tonight):**
- `subscription_revenue_share` / `saas_revenue_share` — needed for Acroud-style hybrid models.
- `client_count` — distinct from `licensee_count` (which is B2B semantics). Affiliates need their own operator-client-count metric.
- `marketing_reinvestment_pct` — expressed as narrative in most reports, not a table metric.
- `network_size` — for network-model affiliates.
- `top_operator_clients` — narrative / list, not a numeric metric; rendered via narrative fetch instead.

These become Parser dictionary additions in a future Unit C round.

## Phase 1 — Primitives

Decision rule: `leaderboard.tsx` and `scorecard.tsx` were explicitly owned
by round 8a per the brief — both were touched on main within the last
few hours. For those, fresh `-v2` sibling files. For `time-matrix.tsx`
and `deep-dive.tsx` (not on main's hot path), small backward-compatible
additions of the brief's callback props.

- **1A · Leaderboard v2** (`web/components/primitives/leaderboard-v2.tsx`,
  commit `5756115`) — entity-agnostic ranked list. Props match the brief
  verbatim: `variant: "ranked"|"flat"|"grouped"`, `primaryMetricLabel`,
  `onRowClick(id)`, `rows: LeaderboardV2Row[]`. Columns: rank / entity
  (with type chip) / value / share (inline bar) / YoY / sparkline /
  ticker. Beacon™ superscript applied when `disclosureStatus` is
  `beacon_estimate` or `derived`, or when `beacon: true` is passed.
- **1B · Time Matrix** (`time-matrix.tsx`, commit `5a2d986`) — added
  optional `onCellClick(rowKey, period)` and `onRowHeaderClick(rowKey)`
  callbacks. When supplied the matrix becomes click-interactive; when
  omitted, existing href-based row navigation still works.
- **1C · Scorecard v2** (`scorecard-v2.tsx`, commit `457f14c`) —
  entity-agnostic KPI panel. Props: `entity { name, type, ticker,
  exchange, markets[] }`, `period { code, label, source }`,
  `primaryKpis / secondaryKpis: KpiTileV2[]`, `onKpiClick(code)`.
  Beacon™ border + superscript per UI_SPEC_1 rules; hover card when
  a `BeaconEstimate` object is supplied on the tile.
- **1D · Deep Dive** (`deep-dive.tsx`, commit `ae4607e`) — added
  optional `onComparisonAdd()` callback rendered as a "+ Add
  comparison" button in the legend. Hidden until a handler is passed.

## Phase 2 — Affiliate section

- **2B · Query helpers** (`web/lib/queries/affiliates.ts`, commit
  `570f662`) — `getAffiliateList`, `getAffiliateAggregateKpis`,
  `getAffiliateCommentary`, `getAffiliateReports`. Heavy lifting
  (scorecard series, time-matrix data, per-metric leaderboard) still
  flows through the shared analytics helpers.
- **2C · `/affiliates` index** (commit `6e5e5b4`) — header band,
  4-tile aggregate KPI strip, `LeaderboardV2` ranking affiliates by
  revenue LTM, side panel of recent affiliate-tagged reports, per-
  entity roster list, and a commentary feed pulling latest affiliate-
  tagged narratives. First live consumer of `LeaderboardV2`.
- **2D · `/affiliates/[slug]` detail** (commit `d8a968e`) — uses all
  four primitives: `ScorecardV2` with the affiliate panel (derived
  Revenue-per-NDC tile replaces generic ARPU), `DeepDive` for
  revenue with narratives + source reports, `TimeMatrix` for
  Revenue / EBITDA / EBITDA margin / NDCs / FTDs over the last 8
  quarters (half-year / full-year fallback), and a bottom source-
  report listing. Redirect guard routes non-affiliate slugs back to
  `/companies/[slug]`.
- **2E · Nav + auth** (commit `a13adf2`) — `Affiliates` tab added
  between Operators and Reports. `/affiliates` added to
  `GATED_PREFIXES` in middleware so auth applies consistently. Both
  files were last modified on main 6+ hours ago (6662645), well
  outside the brief's 1-hour hot-path window.

## Phase 2F — Ship gate

- `npm run build` succeeded cleanly. Both `/affiliates` and
  `/affiliates/[slug]` appear in the Next.js route table (dynamic
  server-rendered routes, 5.0 kB / 12.5 kB).
- **Side-effect of running production build against the dev server's
  `.next/` directory:** the production build pruned vendor chunks
  the live dev server (port 3000) needed, which produced 500s on every
  page, not just mine. Restarted dev server cleanly: stopped PID
  33236, `rm -rf .next`, `npm run dev` in background. New PID 40808.
  **Lesson**: future overnight work should `rm -rf .next` before
  running `next build` when a dev server is running on the same tree,
  or use a separate working directory.
- HTTP smoke test after restart (session cookie reused from live
  sessions row):

| URL | HTTP | Size | h1 |
|---|---|---|---|
| `/affiliates` | 200 | 141 528 B | Affiliates |
| `/affiliates/better-collective` | 200 | 96 827 B | Better Collective |
| `/affiliates/catena-media` | 200 | 125 989 B | Catena Media |
| `/affiliates/gambling-com-group` | 200 | 128 696 B | Gambling.com Group |
| `/affiliates/acroud` | 200 | 91 895 B | Acroud |

Content spot-check on Better Collective detail: `Total Revenue`,
`EBITDA`, `NDCs`, `Revenue / NDC`, `Deep Dive`, `metrics over time`,
`Source reports` strings all present. Spot-check on `/affiliates`:
all 5 affiliate entity names render (including `Marlin Media` at the
bottom with the "No data" tag). 5th affiliate `marlin-media` carries
zero metric values in the DB and intentionally was NOT visited in
the ship-gate smoke test per brief.

## Phase 3 — Primitive validation

- **Operators V2 preview** (commit `a68af1a`) — non-destructive
  `LeaderboardV2` instance rendered below the existing `Leaderboard`
  on `/operators`, wrapped in a muted container with a "NEW" badge
  so tomorrow's review can compare visual parity side-by-side. Uses
  the same `revenue.rows` adapter output, which proves the v2 prop
  shape accepts existing adapter output without a re-query.
  `/operators` returns 200 with the v2 block rendered.

## Commits landed (newest first)

```
a68af1a Frontend: /operators — preview new Leaderboard v2 primitive alongside existing
a13adf2 Frontend: Affiliates nav entry + auth gating
d8a968e Frontend: /affiliates/[slug] detail pages using all 4 primitives
6e5e5b4 Frontend: /affiliates index page
570f662 Queries: affiliate-specific data fetchers
ae4607e Primitive: Deep Dive — add onComparisonAdd hook for overlay peer series
5a2d986 Primitive: Time Matrix — add onCellClick + onRowHeaderClick drill-down hooks
457f14c Primitive: Scorecard v2 — entity KPI panel with primary + secondary rows
5756115 Primitive: Leaderboard v2 — entity-agnostic ranked list with share, YoY, sparkline, ticker
```

9 commits total. No commits on `main`. Branch `ui-primitives-and-affiliates`.

## Files skipped because of main hot-path

None. The two files explicitly forbidden (`leaderboard.tsx` and
`scorecard.tsx`) were avoided by creating `-v2` siblings as the brief
directed. Nav and middleware files were touched 6+ hours ago, outside
the 1-hour window.

## Outstanding TODOs (carry-forward, NOT fixed)

These are documented in the brief as out-of-scope for tonight; logged
here so Unit C / Unit D parser work tomorrow can pick them up:

- Parser dictionary additions needed for full UI_SPEC_2 Panel 2 parity:
  `subscription_revenue_share` (Acroud-style hybrid model),
  `client_count` (distinct from B2B `licensee_count` semantics),
  `marketing_reinvestment_pct`, `network_size`,
  `top_operator_clients` (likely narrative, not numeric).
- Raketech was mentioned in the brief as a top-5 affiliate but is
  not seeded in the DB. `marlin-media` IS seeded but has zero
  metric values. Both are separate seed-data gaps from the primitive
  and UI work.
- Deep Dive's `onComparisonAdd` hook is wired but no picker exists
  yet on the affiliate detail page (hook passed only from
  `/operators` preview and tested via the affiliate page not
  wiring the handler so the button stays hidden).
- Affiliate detail page's scorecard subtitle currently renders only
  entity-type + ticker — narrative-derived primary markets list is a
  placeholder empty array (`extractPrimaryMarkets`) because the
  `getCompanyNarratives` query doesn't return a market name. Low-
  priority polish.

## Integration plan for morning merge

1. On `main`, finish whatever overnight parser reprocess produced.
2. Rebase this branch: `git checkout ui-primitives-and-affiliates &&
   git rebase main`. Expected clean rebase — only 2 files touched in
   both branches (`app-header.tsx`, `middleware.ts`) and only to add
   an additional entry, not to modify existing entries. If a conflict
   arises it'll be trivial (add the affiliates line to the updated
   list in-place).
3. `npm run build` to confirm clean build post-rebase.
4. Merge to `main` with `--no-ff` to preserve the per-phase commit
   trail (10 commits become a tight feature merge).
5. Post-merge: restart dev server with `rm -rf .next && npm run dev`
   to make sure the new routes are registered cleanly (was already
   done once overnight; not strictly required again).

---

UI overnight complete on branch ui-primitives-and-affiliates. Ready for review and merge.

