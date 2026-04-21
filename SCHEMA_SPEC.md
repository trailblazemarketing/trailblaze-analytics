# Trailblaze Analytics Platform — Database Schema Specification

**Version:** 0.1 (initial spec)
**Date:** 2026-04-21
**Status:** Ready for implementation

---

## Purpose

This document is the canonical schema specification for the Trailblaze Analytics Platform. It defines the database structure that backs the dashboard, the parser, the scraping layer, and the Beacon™ estimation engine.

It is written to be implementable directly. Claude Code should read this document and produce migrations, models, and the initial parser scaffolding from it.

---

## Background — what the platform does

Trailblaze Marketing publishes daily PDF market intelligence reports on the iGaming industry. The platform ingests these PDFs (plus external scraped data and proprietary modeled estimates) into a structured database, and exposes the data through a high-end analytical dashboard.

**Three analytical buckets:**
1. **Markets** — by jurisdiction (US states, countries). Includes a Business Planner for market-entry modeling.
2. **Companies** — operators, affiliates, B2B/platforms, lotteries, DFS. With cross-segment comparison.
3. **(Affiliates is a sub-type of Companies, not a separate bucket.)**

**Data sources:**
- Trailblaze's own daily PDF reports (~307 historical + ongoing daily)
- Public regulator data (NJ DGE, IL Gaming Board, etc.)
- Company investor releases & SEC filings
- Stock price / market data APIs
- Industry trade press (where licensing permits)
- **Trailblaze Beacon™** — proprietary modeled estimates for undisclosed values

---

## Design principles

1. **Long-format facts, dimensional everything else.** One central `metric_values` table holds all numeric data; everything else is a dimension.
2. **Provenance is first-class.** Every value knows where it came from and how confident we are in it.
3. **Missing data is a value, not an absence.** "Not disclosed" is meaningful and must be queryable.
4. **Multiple PDFs reporting the same fact is normal.** The schema preserves all variants; a reconciliation layer picks the canonical one.
5. **Estimates are first-class citizens.** Beacon™ values flow through the same pipes as disclosed values, with provenance flagging.
6. **Hierarchies are explicit.** Entities have parents (Allwyn → PrizePicks). Markets have parents (US → New Jersey). Both via self-referential foreign keys.

---

## Entity-relationship overview

```
reports ──┬── report_entities ──── entities ──┬── entity_types
          │                                    └── (parent_entity_id self-ref)
          ├── report_markets ───── markets ────── (parent_market_id self-ref)
          │
          └── metric_values ──┬── metrics
                              ├── periods
                              ├── entities
                              ├── markets
                              └── (sources)

metric_value_canonical ←── (derived view from metric_values)
metric_value_discrepancies ←── (derived view)
narratives ──── (one row per (report, section, entity))
```

---

## Tables

### `entities`

Companies, subsidiaries, brands, joint ventures.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | Canonical display name (e.g. "Allwyn International") |
| `slug` | text UNIQUE NOT NULL | URL-safe (`allwyn-international`) |
| `aliases` | text[] | Alternative names for parser matching ("Allwyn", "Allwyn Intl.") |
| `parent_entity_id` | uuid FK → entities | NULL for top-level. PrizePicks.parent = Allwyn. |
| `ticker` | text | Stock ticker if listed (e.g. "FLUT", "DKNG"). NULL if private. |
| `exchange` | text | "LSE", "NASDAQ", "OMX", etc. |
| `country_of_listing` | text (ISO-2) | |
| `headquarters_country` | text (ISO-2) | |
| `is_active` | boolean DEFAULT true | False if delisted/dissolved/merged |
| `description` | text | Free-form |
| `metadata` | jsonb | For anything else we discover later |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Indexes:** `slug`, `parent_entity_id`, `ticker`, GIN on `aliases`.

---

### `entity_types` and `entity_type_assignments`

Many-to-many — an entity can be multiple types simultaneously (Allwyn = lottery + operator + DFS).

`entity_types`:
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `code` | text UNIQUE NOT NULL | `operator`, `affiliate`, `b2b_platform`, `b2b_supplier`, `lottery`, `dfs`, `media`, `regulator`, `payment_provider` |
| `display_name` | text NOT NULL | "B2C Operator", "Affiliate", etc. |
| `description` | text | |

`entity_type_assignments`:
| column | type | notes |
|---|---|---|
| `entity_id` | uuid FK → entities | |
| `entity_type_id` | uuid FK → entity_types | |
| `is_primary` | boolean | True for the dominant type |
| PRIMARY KEY (entity_id, entity_type_id) | | |

---

### `markets`

Hierarchical jurisdictions: world regions → countries → US states / Canadian provinces / German Bundesländer / etc.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | "New Jersey", "United Kingdom", "CEECA" |
| `slug` | text UNIQUE NOT NULL | `us-new-jersey`, `united-kingdom`, `ceeca` |
| `aliases` | text[] | "NJ", "N.J.", "Jersey" |
| `market_type` | text NOT NULL | `region`, `country`, `state`, `province`, `territory`, `custom_grouping` |
| `parent_market_id` | uuid FK → markets | NJ.parent = US. US.parent = North America. |
| `iso_country` | text (ISO-2) | "US", "GB", "DE" — NULL for sub-national rows |
| `iso_subdivision` | text (ISO-3166-2) | "US-NJ", "CA-ON" |
| `regulator_name` | text | "New Jersey Division of Gaming Enforcement" |
| `regulator_url` | text | Source for scraping |
| `is_regulated` | boolean | |
| `regulation_date` | date | When regulated iGaming/OSB went live |
| `tax_rate_igaming` | decimal | Latest known. Historical changes go in `market_tax_history`. |
| `tax_rate_osb` | decimal | |
| `currency` | text (ISO-4217) | Local currency of the market |
| `metadata` | jsonb | |
| `created_at`, `updated_at` | timestamptz | |

**Indexes:** `slug`, `parent_market_id`, `iso_country`, `iso_subdivision`.

---

### `market_tax_history`

Tax rates change. The Business Planner needs the rate that applied at a given period.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `market_id` | uuid FK → markets | |
| `vertical` | text | `igaming`, `osb`, `lottery`, `poker` |
| `tax_rate` | decimal NOT NULL | |
| `tax_basis` | text | `ggr`, `ngr`, `handle` |
| `effective_from` | date NOT NULL | |
| `effective_to` | date | NULL = still in force |
| `notes` | text | |
| `source_url` | text | |

---

### `metrics`

The metric dictionary. Defines every quantitative thing we track.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `code` | text UNIQUE NOT NULL | `ggr`, `ngr`, `handle`, `ebitda`, `ebitda_margin`, `active_customers`, `arpu`, `ftd`, `ndc`, `marketing_spend`, `market_share`, etc. |
| `display_name` | text NOT NULL | "Gross Gaming Revenue" |
| `short_name` | text | "GGR" |
| `category` | text | `revenue`, `profitability`, `volume`, `customers`, `marketing`, `share`, `valuation`, `operational` |
| `unit_type` | text NOT NULL | `currency`, `count`, `percentage`, `ratio`, `text` |
| `default_currency_handling` | text | `as_reported`, `convert_to_eur`, `convert_to_usd` |
| `is_calculable` | boolean | True if derivable from other metrics (e.g. EBITDA margin = EBITDA / Revenue) |
| `calculation_formula` | text | If calculable, how (free-form note) |
| `description` | text | |

---

### `periods`

Time periods used in financial reporting. Pre-populate with all standard periods.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `code` | text UNIQUE NOT NULL | `Q1-25`, `Q2-25`, `H1-25`, `FY-25`, `9M-25`, `LTM-Sep25` |
| `period_type` | text NOT NULL | `quarter`, `half_year`, `nine_months`, `full_year`, `ltm`, `month`, `trading_update_window`, `custom` |
| `fiscal_year` | int | |
| `quarter` | int | NULL if not a quarter |
| `start_date` | date NOT NULL | |
| `end_date` | date NOT NULL | |
| `display_name` | text | "Q3 2025" |
| `description` | text | |

**Important:** Some companies have non-calendar fiscal years (e.g. Aristocrat FY ends Sep 30). The `fiscal_year` column should reflect the company's reported fiscal year, with `start_date`/`end_date` being the actual calendar dates.

---

### `sources`

Catalogue of data origins. Both PDF reports and external scraped sources live here.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `source_type` | text NOT NULL | `trailblaze_pdf`, `regulator_filing`, `sec_filing`, `company_ir`, `stock_api`, `industry_trade`, `social_media`, `beacon_estimate`, `manual_entry` |
| `name` | text | "NJ DGE Monthly Internet Gaming Report" |
| `url` | text | |
| `confidence_tier` | text NOT NULL | `verified`, `high`, `medium`, `low`, `modeled` |
| `display_label` | text | What appears in the dashboard ("Source: NJ DGE", "Trailblaze Beacon™") |
| `is_proprietary` | boolean | True for Beacon™ |
| `metadata` | jsonb | |

**Pre-seeded `source_type` rows must include `beacon_estimate` with `confidence_tier='modeled'` and `display_label='Trailblaze Beacon™'`.**

---

### `reports`

One row per ingested PDF.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `source_id` | uuid FK → sources | Always points to a `trailblaze_pdf` source |
| `filename` | text NOT NULL | Original filename |
| `original_path` | text | Path on Trailblaze server (`/home/datareporting/public_html/assets/files/group1/...`) |
| `local_path` | text | Path on our system |
| `file_hash` | text UNIQUE | SHA-256, for dedup |
| `document_type` | text NOT NULL | `market_update`, `company_report`, `presentation`, `trading_update`, `analyst_call`, `capital_markets_day`, `ma_announcement`, `regulatory_update`, `shell` |
| `published_timestamp` | timestamptz | Extracted from filename Unix timestamp; falls back to file mtime |
| `period_id` | uuid FK → periods | Primary period the report covers (most reports cover one) |
| `parsed_at` | timestamptz | |
| `parser_version` | text | For reprocessing logic |
| `parse_status` | text NOT NULL | `pending`, `parsed_clean`, `parsed_with_warnings`, `parsed_shell`, `failed` |
| `metric_count` | int | Quick check — 0 = shell |
| `parse_warnings` | jsonb | |
| `raw_text` | text | Full extracted text (for full-text search + reprocessing) |
| `created_at`, `updated_at` | timestamptz | |

**Indexes:** `file_hash`, `published_timestamp`, `parse_status`, `document_type`, GIN on `raw_text`.

---

### `report_entities` and `report_markets`

Many-to-many: a report can cover multiple entities and multiple markets.

`report_entities`:
| column | type | notes |
|---|---|---|
| `report_id` | uuid FK → reports | |
| `entity_id` | uuid FK → entities | |
| `is_primary_subject` | boolean | True for the main subject(s) of the report |
| `is_comparative_reference` | boolean | True if mentioned only for benchmarking |
| PRIMARY KEY (report_id, entity_id) | | |

`report_markets`: same structure with `market_id`.

---

### `metric_values`

**The fact table.** This is where everything ends up.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `entity_id` | uuid FK → entities | NULL allowed for pure-market metrics (e.g. "NJ iGaming GGR" can be entity=NULL) |
| `market_id` | uuid FK → markets | NULL allowed for entity-only metrics (e.g. "Group EBITDA") |
| `metric_id` | uuid FK → metrics NOT NULL | |
| `period_id` | uuid FK → periods NOT NULL | |
| `report_id` | uuid FK → reports | NULL if from non-PDF source |
| `source_id` | uuid FK → sources NOT NULL | |
| `value_numeric` | decimal | The number itself. NULL if not disclosed. |
| `value_text` | text | For text-typed metrics, or for narrative-style numbers ("approximately €15bn") |
| `currency` | text (ISO-4217) | If the metric is currency-typed |
| `unit_multiplier` | text | `units`, `thousands`, `millions`, `billions` — what the value is denominated in |
| `yoy_change_pct` | decimal | If reported as YoY in the source |
| `qoq_change_pct` | decimal | |
| `disclosure_status` | text NOT NULL | `disclosed`, `not_disclosed`, `partially_disclosed`, `beacon_estimate`, `derived` |
| `is_canonical` | boolean | TRUE for the chosen "primary" value when multiple sources disagree |
| `confidence_score` | decimal (0-1) | Parser's confidence; for Beacon™, model's confidence |
| `notes` | text | "noted -4% decline; absolute figure not disclosed" |
| `extracted_from_section` | text | `executive_summary`, `company_insights`, `market_deep_dive`, etc. |
| `extracted_from_table_id` | text | If from a table, which one |
| `created_at` | timestamptz | |

**Indexes:**
- `(entity_id, metric_id, period_id)` — for time series
- `(market_id, metric_id, period_id)` — for market views
- `(report_id)` — for "what did this report say"
- `(source_id, disclosure_status)` — for filtering by source quality
- `(is_canonical)` partial index WHERE is_canonical = true

**Uniqueness:** Do NOT enforce uniqueness on `(entity, market, metric, period)` — multiple values from different sources is the whole point. Canonicalisation happens in a derived view.

---

### `metric_value_canonical` (materialized view)

For each `(entity, market, metric, period)` tuple, the canonical value the dashboard should display.

Picked by precedence rules:
1. `disclosed` from `trailblaze_pdf` (most recent `report.published_timestamp`)
2. `disclosed` from `regulator_filing` or `sec_filing`
3. `disclosed` from `company_ir`
4. `disclosed` from any other source
5. `beacon_estimate` (highest `confidence_score`)
6. `not_disclosed` (placeholder so the gap is visible)

The chosen row's `id` is referenced; the dashboard reads from this view by default.

---

### `metric_value_discrepancies` (view)

Where the same `(entity, market, metric, period)` has **>1 disclosed value with >5% variance**, surface it as a discrepancy for QA.

| column | type | notes |
|---|---|---|
| `entity_id`, `market_id`, `metric_id`, `period_id` | | |
| `min_value`, `max_value` | decimal | |
| `variance_pct` | decimal | |
| `source_count` | int | |
| `value_ids` | uuid[] | All conflicting `metric_values.id` |

---

### `narratives`

The qualitative content in each report — Executive Summary, Forecast & Strategy, Investment View, Valuation Scenarios. Stored per (report, section, entity) so they're queryable.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `report_id` | uuid FK → reports | |
| `entity_id` | uuid FK → entities | NULL if not entity-specific |
| `market_id` | uuid FK → markets | NULL if not market-specific |
| `section_code` | text NOT NULL | `executive_summary`, `company_insights_interpretation`, `market_deep_dive`, `affiliate_benchmarking`, `forecast_strategy`, `investment_view`, `valuation_downside`, `valuation_base`, `valuation_upside` |
| `content` | text NOT NULL | The actual prose |
| `created_at` | timestamptz | |

**Indexes:** `(report_id, section_code)`, GIN on `content` for full-text search.

---

### `beacon_estimates`

Audit trail for every Beacon™ value generated. Lets clients (and us) understand the methodology behind any specific number.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `metric_value_id` | uuid FK → metric_values | The estimated value this audit row explains |
| `methodology_code` | text NOT NULL | `tax_rate_implied`, `peer_ratio`, `linear_interpolation`, `stock_price_implied`, `prior_period_extrapolation`, `composite_model` |
| `model_version` | text | Methodology versioning so we can re-run when models improve |
| `inputs` | jsonb | All inputs used (peer values, tax rates, etc.) |
| `confidence_score` | decimal (0-1) | |
| `confidence_band_low` | decimal | Lower bound of the estimate |
| `confidence_band_high` | decimal | Upper bound |
| `methodology_notes` | text | Free-form explanation that can be shown to clients |
| `created_at` | timestamptz | |

---

## Initial seed data

The migration must seed:

**`entity_types`** — `operator`, `affiliate`, `b2b_platform`, `b2b_supplier`, `lottery`, `dfs`, `media`, `regulator`, `payment_provider`

**`metrics`** (initial set, expand as discovered):
- Revenue & GGR: `revenue`, `ggr`, `ngr`, `online_revenue`, `online_ggr`, `online_ngr`
- Volume: `handle`, `turnover`, `sportsbook_handle`, `sportsbook_turnover`, `casino_turnover`
- Profitability: `ebitda`, `ebitda_margin`, `operating_profit`, `ebit_margin`, `net_income`, `gross_margin`
- Customers: `active_customers`, `monthly_actives`, `arpu`, `ftd`, `ndc`, `customer_deposits`
- Marketing: `marketing_spend`, `marketing_pct_revenue`, `paid_media_spend`, `seo_revenue`
- Share: `market_share`, `share_change`
- Sportsbook-specific: `sports_margin_pct`, `inplay_pct`
- Vertical splits: `casino_revenue`, `sportsbook_revenue`, `lottery_revenue`, `dfs_revenue`, `bingo_revenue`, `poker_revenue`, `horseracing_revenue`
- Valuation: `ev_ebitda_multiple`, `pe_ratio`, `market_cap`, `stock_price`
- Other: `app_downloads`, `live_streamed_events`, `gaming_library_size`, `licensee_count`

**`sources`** — at minimum:
- `trailblaze_pdf` (high)
- `regulator_filing` (verified)
- `sec_filing` (verified)
- `company_ir` (verified)
- `stock_api` (verified)
- `industry_trade` (medium)
- `social_media` (low)
- `beacon_estimate` (modeled, label: "Trailblaze Beacon™")
- `manual_entry` (high)

**`markets`** — initial set (parent → children):
- World regions: North America, Europe, LatAm, Asia-Pacific, Africa, MENA, CEECA, Nordics
- Countries: US, Canada, UK, Ireland, Germany, France, Italy, Spain, Portugal, Netherlands, Belgium, Sweden, Denmark, Finland, Norway, Switzerland, Austria, Czech Republic, Greece, Cyprus, Croatia, Lithuania, Latvia, Estonia, Georgia, Brazil, Argentina, Peru, Colombia, Chile, Mexico, Australia, New Zealand, Japan, Philippines
- US states (regulated iGaming and/or OSB): NJ, PA, MI, WV, CT, RI, DE, NV, NY, IL, IN, IA, KS, KY, LA, MA, MD, OH, OR, TN, VA, VT, WY, AZ, CO, NH, NC, ME (extend as discovered)
- Canadian provinces: Ontario, Alberta (extend)

**`entities`** — seed from the entities seen in our sample audit; the parser will add more as it finds them. Initial set: Allwyn International, OPAP, Kaizen Gaming, Betano, PrizePicks, ATG, Angler Gaming, Premier Gaming, Marlin Media, Sega Sammy, GAN, Stakelogic, Acroud, Aristocrat, NeoGames, NeoPollard, Higher Roller Technologies, Veikkaus, Fennica Gaming, Codere Online, Betsson, Realm Entertainment, Sporting Solutions, Starcasino, FanDuel, DraftKings, BetMGM, BetFanatics, Rush Street, MGM, Entain, Flutter, Sportradar, Playtech, Evolution, NetEnt, Light & Wonder, Better Collective, Catena Media, Gambling.com Group.

For each, set the parent relationship where known (e.g. PrizePicks → Allwyn, Betano → Kaizen Gaming, FanDuel → Flutter, Premier Gaming → Angler Gaming, Stakelogic → Sega Sammy, etc.).

---

## Parser requirements

The parser takes a PDF, returns structured data. High-level requirements:

1. **Use an LLM with a strict JSON schema output** (Claude or GPT). Pure regex/PDF table parsers cannot handle the variability we observed.
2. **Two-pass approach:**
   - Pass 1: Identify document type, primary entities, primary markets, primary period
   - Pass 2: Extract metrics + narratives based on the document type
3. **Confidence scoring per extracted value.** Low-confidence values get flagged for human review rather than silently ingested.
4. **Shell detection.** If pass 2 yields zero numeric extractions, mark `parse_status='parsed_shell'` and stop.
5. **Discrepancy detection on ingest.** If a new value conflicts with an existing canonical value, write both and let the canonical view sort it out.
6. **Idempotent.** Re-parsing the same PDF should not duplicate rows. Use `file_hash` as the dedup key.
7. **Versioned.** When the parser improves, mark old extractions with `parser_version` and offer reprocessing.

---

## Beacon™ engine requirements

Out of scope for the initial parser build, but the schema supports it. The engine will be built in a later phase. Initial methodologies to implement first:

1. **Tax-rate-implied:** `GGR ≈ tax_paid / tax_rate` (where tax payment is disclosed but GGR isn't)
2. **Peer-ratio:** `Entity X's CT iGaming = (FanDuel CT iGaming) × (Entity X NJ ratio vs FanDuel NJ)`
3. **Prior-period linear extrapolation:** `Q3 ≈ (H1 disclosed / 2) × seasonality factor`
4. **Stock-price-implied EBITDA:** Back-solve from market cap × peer EV/EBITDA
5. **Composite (later):** Weighted blend of multiple methodologies

Every Beacon™ value gets a row in `beacon_estimates` with the methodology, inputs, and confidence band. **Methodology must be defensible to clients.**

---

## Tech stack recommendation

- **Database:** Postgres 16 (jsonb support, materialized views, GIN indexes, fast full-text search)
- **Migrations:** Alembic (Python) or Prisma (Node) — Claude Code's choice based on rest of stack
- **Parser:** Python with Anthropic SDK; structured output via JSON schema
- **Backend:** FastAPI (Python) or Next.js API routes (TypeScript)
- **Frontend:** Next.js 14+ with Tailwind, Recharts/D3 for visuals
- **Hosting:** Vercel/Railway for app, Supabase or Neon for Postgres
- **File storage:** S3 or local during dev

---

## Out of scope for v1 schema

- Sentiment scoring (add column to `narratives` later)
- User accounts, permissions, multi-tenancy (add layer later)
- Audit log (Postgres triggers later)
- Caching layer (Redis later)
- Real-time updates / websockets

---

## Open questions for the team

1. Confirm Postgres vs SQLite for dev/initial. **Recommendation: Postgres from day one** — the jsonb and full-text search will be needed sooner than expected.
2. Should `narratives.content` be chunked/embedded for RAG-style search? (Probably yes, in a later phase.)
3. How should we handle entities that change ownership mid-period? (PrizePicks pre/post Allwyn acquisition.) Suggested: parent_entity_id should have its own history table later.

---

**End of spec.**
