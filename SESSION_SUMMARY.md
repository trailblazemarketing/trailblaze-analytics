# T2 Polish Session Summary

**Date:** 2026-04-21 (overnight unattended)
**Branch:** main
**Base commit:** 84b26ae (pre-polish checkpoint)

## What shipped

### G1 — density pass (global)
- App shell padding: `py-5 → py-3`
- Leaderboard row height: `py-1.5 → py-1`, sparkline column width 64px → 60px (brief spec)
- Module gap: `space-y-4 → space-y-3` across every page (16px gaps)
- View-all footer height: `py-1.5 → py-1`

### G2 — sparkline coverage
- Bug fix in `getEntityLeaderboard` / `getMarketLeaderboard`: when `periodCode` was set, the scoped CTE was pre-filtered to one period, so `spark_raw` only contained a single point. Refactored so scoped keeps full history; period-pin is applied to the `latest` JOIN.
- Leaderboard sparkline guard tightened from `≥2 points` to `≥3 real (non-null) points` per brief.
- Sparkline dimensions: 60 × 20, stroke 1.2px, blue for disclosed, dotted amber for Beacon™ segments (unchanged).

### G3 — Beacon column auto-hide
- `Leaderboard` computes `hasBeaconSignal` and drops the `beacon_coverage` column when every visible row reports 0% (or null).
- Keeps architecture intact: column reappears automatically when Beacon™ estimates land.
- Market detail leaderboards can force the column on via `forceBeaconColumn` prop (not yet wired — 0% is still 0% with no Beacon data in DB).

### Overview
- O1 DATA DROPS module, stacked under Recent Reports in the right column. Synthesized (no `activity_log` table) from: most-recent parser run, regulator filing, stock price ingest, narrative extraction burst, entity auto-add burst. Fresh (< 24h) rows get a green dot; older rows get a grey dot.
- O2 bottom 3-column module: Biggest Revenue Growers, Margin Expansion Leaders, Recent Commentary. New `lib/queries/movers.ts` and `components/overview/movers-row.tsx`.
- O3 leaderboard visible rows cap bumped to 12–15 (depends on panel width); density pass makes 10–12 fit on 1080p easily.

### Markets
- M1 sparkline fix lands via the G2 query refactor.
- M2 filter chips already had blue-border + blue-tint active state — confirmed working, no change needed.
- M3 helper text under the metric switcher: `Showing N of M markets with data for <metric>`.

### Companies (index)
- C1 aggregate KPI strip (4 tiles): total tracked companies, combined LTM revenue (EUR), weighted EBITDA margin, listed-vs-private split. New `getCompaniesAggregateKpis()` query.
- C2 entity-type chip colors wired at Leaderboard component level (shared across every leaderboard on every page). Subtle distinct backgrounds: operator blue-grey, B2B warm-grey, affiliate green-grey, lottery purple-grey, DFS amber-grey. Default (market_type chips etc.) keep the old bordered style.
- C3 ticker join is already correct in the query layer — any em-dashes in live data reflect entities actually missing a ticker in the DB, not a broken join.

### Operators
- OP1 heatmap replaced with a custom CSS-grid implementation (prior version was Recharts Treemap with irreducible padding). Tiles sized by market cap buckets (sqrt-scaled), 1px gaps, all 23 tickered operators visible.
- OP2 bottom 3-module composition (same as Overview O2).
- OP3 leaderboard `extra` column now packs PRICE / DAY% / MARKET CAP / EV·EBITDA per row, fed from the heatmap snapshot (no duplicate queries).
- Added missing PeriodSelector to the page header.

### Company detail (the anchor page)
- CD1 header: chip row (entity-type, LISTED/PRIVATE, NYSE:FLUT) + 24px bold entity name + HQ/market count subtitle + period selector + EUR badge + Compare button.
- CD2 primary KPI scorecard — 4 large tiles, big numbers, YoY chip, sparkline, source label, Beacon™ left border when applicable.
- CD3 secondary KPI row — up to 8 small single-line tiles.
- CD4 dedicated Stock Row module (listed entities only): ticker + price + day change (abs + %), 30-day sparkline, market cap / EV·EBITDA / P/E in three mini-stat boxes. Pulled from a new `getStockSnapshot(entityId)` helper.
- CD5 two-column body: revenue chart (60%) + stacked Forecast & Strategy / Investment View narrative cards (40%).
- CD6 quarterly breakdown table — last 6 periods, columns Period / Revenue / YoY / QoQ / EBITDA Margin / Active Users / Source / Confidence. Beacon™ rows styled amber.
- CD7 source-reports strip — horizontal chips with file icon + filename + date, one click → PDF overlay.

### Market detail
- MD1 operators-in-market leaderboard capped at 15 with "View all →" link.
- MD2 Regulatory Filings module (regulator-linked reports for this market) paired with tax-history table in a 1/3 + 2/3 grid.

### Reports
- R1 filter chips (one per document-type with live counts), Newest/Oldest sort toggle, tighter row height (`py-1`).

### /companies/compare
- Full rebuild: side-by-side header strip adapting to pair vs 3-6; primary-KPI grid with per-company value/YoY/sparkline; `Δ A − B` column surfaces when exactly two companies are picked (monetary in EUR, pct in pp); revenue + EBITDA-margin overlay charts; per-metric quarterly tables restricted to the 8 headline metrics.

## Data quality snapshot (live DB)

| Table | Rows |
|---|---|
| reports | 307 (4 clean, 285 warnings, 18 shells) |
| entities | 319 total — **275 `auto_added_needs_review`** |
| markets | 74 |
| metrics | 61 |
| periods | 290 |
| metric_values | 6,997 |
| narratives | 2,658 |
| beacon_estimates | 0 |
| fx_rates | 224,718 |

- Operator-level rows (entity+market): 2,996 — almost all from NJ DGE
- Stock API live: 23 tickers with price, 21 with market cap, 12 with P/E, 23 with EV/EBITDA
- Regulator rows: 118 (NJ only; PA/MI/CT/IL all `broken_needs_research`)

## Routes verified

All returned HTTP 200 in dev with no server-side errors in the log after the SQL fixes landed:

- `/`
- `/markets` · `/markets/us-new-jersey` · `/markets/us-pennsylvania`
- `/companies` · `/companies/flutter-entertainment` · `/companies/draftkings`
- `/companies/compare` · `/companies/compare?slugs=flutter-entertainment,draftkings`
- `/operators`
- `/reports`
- `/methodology`

## Commits (this session)

- `f08dadb` — G1-G3 globals + Overview polish
- `ac96843` — Markets / Companies / Operators polish
- `10e2330` — Company detail / Market detail / Reports polish
- `240ac34` — SQL fixes (ORDER BY alias, eur_rate numeric, metadata column)
- `dd90655` — Companies compare rebuild

Plus the ongoing CTO-review + optimization passes (see trailing commits).

## Deferred items

None from the original brief — all G1-G3, O1-O3, M1-M3, C1-C3, OP1-OP3, CD1-CD7, MD1-MD2, R1 items landed.

**Known data gaps (out of this session's scope):**
- 275 auto-added entities need curation — many show up in leaderboards alongside canonical entities. Will propose a default filter in the optimization pass.
- 4/5 US regulators broken (PA/MI/CT/IL). T3 responsibility, not T2.
- Beacon™ engine: no estimates in DB. Visual treatment is wired and degrades gracefully (em-dash, 0% auto-hidden).
- Parse-status distribution: 285/307 reports have warnings. Parser Category B still pending.

## Morning screenshot checklist

To verify visually:
- `/` — ticker strip scrolls; Markets leaderboard + Recent Reports + Data Drops + Operators tab + 3-module bottom row should all fit in 1080p without scroll
- `/markets` — "Showing N of M markets" helper visible; filter chip active state blue
- `/companies` — 4-tile aggregate scorecard at top; chip colors differ by entity type in the leaderboard rows
- `/operators` — heatmap shows 20+ tiles sized by market cap; leaderboard rightmost column shows PRICE / DAY% / MARKET CAP / EV·EBITDA
- `/companies/flutter-entertainment` — chip row (OPERATOR · LISTED · NYSE:FLUT), 4-tile primary, 8-tile secondary, Stock Row module, revenue chart + Forecast / Investment View, quarterly table, source chips
- `/markets/us-new-jersey` — operators leaderboard capped at 15, Regulatory Filings module present
- `/reports` — filter chips show document-type counts
- `/companies/compare?slugs=flutter-entertainment,draftkings` — side-by-side KPI grid with Δ A−B column
