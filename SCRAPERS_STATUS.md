# Scrapers — Status of Truth

Single source of truth for which scrapers run by default, which are scaffolded, and which need research.

Default `trailblaze-scrape-regulators` / `trailblaze-scrape-stocks` / `trailblaze-scrape-companies` only run `production` scrapers. Pass `--include-scaffolded` (or `--only <name>`) to run others.

Last updated: 2026-04-22 (post-T3-Gmail).

---

## Gmail analyst-note ingest (production)

**`trailblaze-scrape-gmail`** — pulls emails labeled `Trailblaze-Ingest`, renders each to a synthetic PDF (analyst-note header + flattened body w/ preserved tables), and hands off to the existing `trailblaze-parse` pipeline. First run opens an OAuth consent screen; token is cached in `secrets/gmail_token.json`.

| Component | Status | Notes |
|---|---|---|
| `src/trailblaze/scrapers/gmail/client.py` (OAuth + Gmail API) | **production** | scope `gmail.modify` — required to relabel |
| `src/trailblaze/scrapers/gmail/render.py` (email → PDF) | **production** | pure-Python (`fpdf2`); tables flattened to pipe-separated text to keep the parser's tabular heuristics intact |
| `src/trailblaze/scrapers/gmail/ingest.py` (orchestrator) | **production** | idempotent via `gmail_ingested_messages.message_id`; retargets `source_id` → `analyst_note` post-parse |

### Trusted senders (allowlist)

Edit `src/trailblaze/scrapers/gmail/config.py:TRUSTED_SENDERS` to add analysts. Current list:

- `oyvindmiller@gmail.com`

Emails labeled `Trailblaze-Ingest` from any other sender are logged as `status='rejected_sender'` in `gmail_ingested_messages`, tagged `Trailblaze-Rejected-Sender` in Gmail, and skipped.

### Labels the pipeline manages

| Label | Direction | Meaning |
|---|---|---|
| `Trailblaze-Ingest` | user applies, pipeline removes | "process this email" |
| `Trailblaze-Ingested` | pipeline applies on success | parsed + metric_values populated |
| `Trailblaze-Rejected-Sender` | pipeline applies on allowlist miss | untrusted sender; ingest label cleared |
| `Trailblaze-Error` | pipeline applies on exception | ingest label stays so user can retry |

### Operational notes

- **Not part of the default `trailblaze-scrape-*` batch** — Gmail requires an interactive OAuth consent on first run and a separate trust model, so it's a dedicated CLI invoked manually (or by Task Scheduler once the token is cached).
- Synthetic PDFs land in `pdfs/gmail_{sender}_{date}_{subject}.pdf` and are parsed by the same deterministic pipeline that handles Trailblaze reports. Parser file-hash dedupe still protects against double-ingests even if `--force` is used.
- `source_type='analyst_note'` (confidence tier `verified`, is_proprietary) is injected into both the `reports` row and every `metric_values` row produced from the email.

---

## Stock API (production)

**`trailblaze-scrape-stocks`** — 1 scraper.

| Ticker | Entity | yfinance symbol | Status |
|---|---|---|---|
| Full list (24 entities) | See `src/trailblaze/seed/_data/entities.py` | varies by exchange | **production**, verified live (327 rows, idempotent) |

### Known stock failures — do not debug, these are expected

- **GAN** — delisted. yfinance returns "No data found, symbol may be delisted". Entity still in seed; skip in any future analysis.
- **KIND-SDB.ST** (Kindred Group) — taken private by FDJ (La Française des Jeux) in 2024. Yahoo lost the ticker feed post-delisting. Entity remains in seed for historical context; expect 0 rows.

---

## Regulators

**`trailblaze-scrape-regulators`** — 29 scrapers total.

### Production — verified live, idempotent enough to ship

| Scraper | Market | State totals | Operator-level | Notes |
|---|---|---|---|---|
| **NJ DGE** | us-new-jersey | ✅ 12 rows (3 months × 4 metrics) | ✅ 106 rows with `entity_id` | Parses press release + IGR tax return (DGE-105) + SWR tax return (DGE-107). Uses vocabulary-based skin tokeniser. Minor: second run may insert ~5 extra rows the first time due to auto-create alias convergence; converges on subsequent runs. |

### Broken — needs research (tried in T3 session, couldn't land within 2-3 iterations)

| Scraper | Market | Blocker | Suggested fix |
|---|---|---|---|
| **PA PGCB** | us-pennsylvania | Index page loads (200) but link-walk returns 0 PDF matches — page structure drifted | Re-inspect `https://gamingcontrolboard.pa.gov/?p=monthly_revenue_reports` HTML; rewrite link filter in `VerticalSpec`s |
| **MI MGCB** | us-michigan | Index returns 403 to default User-Agent | Apply browser-UA pattern from NJ DGE scraper (`Mozilla/5.0 ...`) |
| **CT DCP** | us-connecticut | Index URL returns 404 — CT portal restructured | Discover new index URL on `portal.ct.gov`; rewrite `base_url` |
| **IL IGB** | us-illinois | Old URL 302-redirects to `/sports-wagering` (different page layout) | Rewrite against new IGB sports-wagering landing page; may need XLSX parsing for totals |

### Scaffolded — untested, deferred pending demand (per T3 "breadth over depth reset")

**US state regulators (17)** — scraper code exists with best-effort URL patterns + regex labels; none have been run live:

- NY GC, NV GCB, WV Lottery, DE Lottery, RI Lottery, MA GC, MD Lottery, OH CCC, TN SWC, VA Lottery, IN IGC, IA RGC, AZ DG, CO DG, NH Lottery, NC SELC, ME GCU

**International regulators (7)** — scaffolding only, each has jurisdiction-specific format quirks:

- UKGC (UK), Spelinspektionen (SE), MGA (MT), iGO (CA-ON), DGOJ (ES), ANJ (FR), ADM (IT)

All 24 above are tagged `scraper_status = "scaffolded_untested"` and skipped by default. Run with `--include-scaffolded` to iterate. Per T3 brief: light up just-in-time when a client asks.

---

## Company IR scrapers

**`trailblaze-scrape-companies`** — 15 scrapers, **all scaffolded**, not running by default.

Betsson, Kindred, Kambi, Entain, Flutter, Playtech, Evolution, Evoke, DraftKings, MGM, Caesars, Rush Street, Bally's, Churchill Downs, Super Group.

Per T3 Step 4: IR scrapers are deferred — UI_SPEC_2 doesn't need company IR data for v1, and the PDF parser already handles Trailblaze-covered issuers. Light them up only on product demand.

---

## Operator-level parsing (NJ only, as of T3)

NJ DGE is the only regulator currently producing rows with `entity_id` populated. PA and MI are the other two regulators known to publish per-operator breakdowns but they landed in `broken_needs_research` this session (blockers listed above). Operator-level for PA/MI remains the UI_SPEC_2 priority unlock — when PA/MI are fixed, clone NJ's vocabulary-based skin tokeniser approach.

### NJ auto-added operators (need manual review)

After first clean run, 19 entities were auto-created with `extra_metadata.status = 'auto_added_needs_review'`. The `operator_resolver` logged every unresolved name. Review path:

1. Query: `SELECT slug, name, metadata FROM entities WHERE metadata->>'status' = 'auto_added_needs_review' AND metadata->>'first_seen_market' = 'us-new-jersey'`
2. For each, either:
   - Merge into an existing canonical entity by adding the reported name to that entity's `aliases` array, then delete the auto-added row (cascade will redirect metric_values — or manually re-point via UPDATE).
   - Or confirm it's a genuinely new operator and clear the `auto_added_needs_review` status flag.

A few obvious ones to canonicalise: "Betparx" / "betParx" → single entity; "OCEAN" / "PLAYSTAR" / "PRIME" should be lowercase brand rows.

---

## Framework pieces (production, not scrapers)

| Component | Status |
|---|---|
| `scrapers/base.py` (RegulatorScraper + ScrapedMetric) | production |
| `scrapers/companies/_base.py` (IRScraper) | production |
| `scrapers/upsert.py` (idempotent metric_value upsert) | production, verified via stock re-runs |
| `scrapers/periods.py` (PeriodCache: monthly/quarterly/daily/FY) | production |
| `scrapers/operator_resolver.py` (name→entity resolver) | production, first real use in NJ DGE |
| `scrapers/common.py` (httpx client + retry) | production |
| `scrapers/regulators/_index.py` (shared index walker) | production |
| `scrapers/regulators/_pdf.py` (label-regex helpers) | production |

---

## Done criteria scorecard (T3 brief)

| Criterion | Status |
|---|---|
| 5 of 5 US regulators produce non-zero rows | ❌ 1 of 5 (NJ only) |
| NJ/PA/MI produce operator-level rows | ⚠️ 1 of 3 (NJ only; PA/MI broken_needs_research) |
| All 5 regulators pass idempotency test | ⚠️ NJ converges after 2 runs (first re-run inserts ~5 rows then stable); PA/MI/CT/IL are zero-row no-ops so technically idempotent but not useful |
| SCRAPERS_STATUS.md committed | ✅ this file |
| Expansion A scrapers archived / not running by default | ✅ `scraper_status` filter wired into both CLIs |
| Git commit message prescribed | ✅ on commit |

Reality vs brief: **1 of 5 regulators fully working (NJ), 4 marked broken_needs_research per the "don't force it" guidance**. NJ is the operator-level unlock for UI_SPEC_2; PA/MI need another session each.
