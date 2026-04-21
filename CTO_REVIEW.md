# CTO System Review — 2026-04-21

Reviewing the Trailblaze Analytics Platform against spec (SCHEMA_SPEC, UI_SPEC_1-3,
project brief v2), the live database, and the four Gemini mockups.

## Summary
The product is built to the spec's **bones** — every table in SCHEMA_SPEC exists,
every primitive in UI_SPEC_1 is a reusable component, every panel definition
in UI_SPEC_2 is keyed to entity_type in `lib/scorecard-builder.ts`, and every
page composition in UI_SPEC_3 is routed and rendering real data. Sparklines,
Beacon™ treatment, EUR conversion, period selector, PDF overlay — all live.

What's **not** built to spec is the data itself. Three shortfalls dominate:
1. **275 auto-added entities** with `metadata->>'status' = 'auto_added_needs_review'`
   are leaking into every leaderboard. This is the single biggest UX regression:
   an analyst looking at an operator leaderboard sees "Betparx" and "betParx" as
   separate rows, or sees 7 dressed-up stubs mixed with FanDuel at the top.
2. **4/5 US regulators are broken** (PA/MI/CT/IL) — per SCRAPERS_STATUS.md.
   Only NJ DGE produces operator-level rows (106 entity-populated). UI_SPEC_2
   flagged per-operator market share as the priority unlock for a complete
   Market detail page.
3. **Zero Beacon™ estimates** in DB. The visual treatment is wired but there's
   nothing to visualize. G3 already auto-hides the coverage column so the zero
   state is handled gracefully, but the modelled-gap story in the sales pitch
   is unbacked.

## Conformance matrix

| Surface | Spec | Status |
|---|---|---|
| `entities`, `entity_types`, `metrics`, `periods`, `markets`, `reports`, `metric_values`, `narratives`, `beacon_estimates`, `fx_rates`, `market_tax_history`, `metric_aliases`, `sources` tables | SCHEMA_SPEC §Tables | ✅ all present; 13 public tables |
| `metric_value_canonical` view | SCHEMA_SPEC §Derived views | ✅ exists (used throughout the app) |
| `metric_value_discrepancies` view | SCHEMA_SPEC §Derived views | ✅ exists |
| Leaderboard primitive | UI_SPEC_1 §1 | ✅ + auto-hide Beacon column, entity-type chip colors |
| Time Matrix primitive | UI_SPEC_1 §2 | ✅ |
| Scorecard primitive | UI_SPEC_1 §3 | ✅ |
| Deep Dive primitive | UI_SPEC_1 §4 | 🟡 pieces (chart + table + narratives) present on Company/Market detail, but no unified Deep Dive route with "Add comparison" overlay |
| 7 KPI panels keyed to entity_type | UI_SPEC_2 | ✅ all defined in `PANELS` object; builder filters empty secondary tiles |
| Beacon™ visual treatment | UI_SPEC_1 §Beacon | ✅ wired (dotted sparklines, ™ superscript, amber borders, hover methodology card) |
| Overview page (`/`) | UI_SPEC_3 §1 | ✅ ticker strip + Markets + Recent Reports + Data Drops + Operators tab + 3-module bottom row |
| Markets index (`/markets`) | UI_SPEC_3 §2 | ✅ leaderboard with filter chips + metric switcher + coverage helper |
| Market detail (`/markets/[slug]`) | UI_SPEC_3 §2 | ✅ scorecard + 2-col operators/time-matrix + narratives + filings + tax history |
| Markets compare | UI_SPEC_3 §2 | 🟡 exists but is generic; hasn't been rebuilt to match the pair-aware compare pattern the Companies compare page now uses |
| Companies index (`/companies`) | UI_SPEC_3 §3 | ✅ + aggregate KPI strip (C1) |
| Company detail (`/companies/[slug]`) | UI_SPEC_3 §3 | ✅ header chips + primary scorecard + secondary + stock row + two-col body + quarterly table + source strip |
| Companies compare | UI_SPEC_3 §3 | ✅ side-by-side grid + Δ A−B + overlay charts |
| Operators (`/operators`) | UI_SPEC_3 §4 | ✅ custom heatmap + leaderboard w/ stock columns + 3-module bottom row |
| Reports (`/reports`) | UI_SPEC_3 §5 | ✅ filter chips, sort, density; PDF overlay preserved |
| Report overlay modal | UI_SPEC_3 §5 | ✅ exists (see `components/reports/viewer-modal.tsx`) |
| Methodology (`/methodology`) | UI_SPEC_3 §6 | 🟡 placeholder — real copy is human-write work |
| ⌘K omnibox | UI_SPEC_3 top-nav | ✅ `components/search/omnibox.tsx` wired in AppHeader |

## Data pipeline health (as of 2026-04-21)

**Parser (T1):**
- 307 / 307 PDFs parsed (100%)
- 4 clean / 285 with_warnings / 18 shells
- Category A landed: `unknown_metric_code` warnings dropped from 3,221 → expected sub-1,000 per brief (not re-measured here)
- Category B (narrative ratios, B2B-specific primary metrics) **deferred**
- Parser output quality is good enough to build UI against for v1

**Scrapers (T3):**
- Stock API: ✅ production, 23 tickers live, 321 rows
- Regulators: ⚠️ 1/5 production (NJ DGE only, 106 operator-level + 12 state-total rows)
- Company IR: 🔴 all 15 scaffolded, not running
- International regulators: 🔴 all 7 scaffolded

**Beacon™ engine:**
- 🔴 Not built. 0 rows in `beacon_estimates`.

**Entity curation:**
- 🔴 275 entities flagged `auto_added_needs_review` — a firehose of aliases (Betparx vs betParx, brand names, report-segment stubs like "MGM Digital"). These pollute every leaderboard.

## Cross-referencing the four Gemini mockups

- `Gemini_..._h6fjz4...` Market detail NJ — we match the 4-primary / 2-col / operators leaderboard / tax history / filings pattern. Our scorecard uses EUR-first formatting (mock shows `€2.14B`), which we honor. Gemini shows a bar-chart + markers "MARKET QoQ TIME SERIES" — we have a TimeMatrix for that dimension instead of a dedicated chart; acceptable trade.
- `Gemini_..._hg9rez...` Operators — our new heatmap matches (sized by market cap, colored by day change); leaderboard has the PRICE / DAY% / MARKET CAP / EV·EBITDA columns as packed in the `extra` cell. Bottom 3-module row matches.
- `Gemini_..._qfallq...` Overview — Markets leaderboard left / Recent Reports + Data Drops right / Operator leaderboard / 3-module bottom row — matches.
- `Gemini_..._tflll2...` Flutter detail — header chip trio, 4-tile primary (Revenue / Margin / Actives / ARPU), 8-tile secondary, stock row, revenue chart + Forecast & Strategy + Investment View, quarterly breakdown — matches.

The one visual delta vs mockups: our heatmap colors use a softer `color-mix` blend; Gemini's use saturated flat reds/greens. Low-effort fix if desired.

## 5-pass optimization plan (self-directed)

1. **Hide un-canonicalized entities by default.** 275 `auto_added_needs_review`
   entities skew every leaderboard. Add a default filter (`metadata->>'status'
   IS DISTINCT FROM 'auto_added_needs_review'` or equivalent) to every entity
   leaderboard query, plus an opt-in toggle to show them.
2. **Market detail chart.** Add the explicit time-series chart from the Gemini
   mockup (overlay line: disclosed GGR + Beacon™ projection). Currently the
   page uses a TimeMatrix only.
3. **/markets/compare rebuild.** Bring it up to the same pair-aware side-by-side
   standard the Companies compare just got.
4. **Stock Heatmap visual fidelity.** Match Gemini mockup's saturated flat
   colors; add hover price/change overlay on each tile.
5. **Period selector UX.** Today it's a dropdown — visually quiet. Rework into
   a pill-group (M / Q / H / FY / LTM tabs) with a period picker inside,
   matching Bloomberg-style time-granularity selectors. Apply consistently.

Bonus if time allows:
- **Seeded Beacon™ example:** pick 3-5 strategic gaps (e.g., Super Group iGaming
  CT Q4-25 from the mockup) and seed beacon_estimates rows so the UI treatment
  has something to render — demo-quality only, flagged as such.
- **Missing panels on Market detail:** UI_SPEC_2 Panel 7 secondary KPIs include
  "Beacon™ coverage %" — we omit this tile when we could still show 0%.
