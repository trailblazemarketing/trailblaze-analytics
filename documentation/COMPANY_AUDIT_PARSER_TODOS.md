# Company page audit — parser TODOs (not fixed at frontend layer)

Discovered: 2026-04-23, `/companies/[slug]` audit
Companion to: `documentation/UK_AUDIT_PARSER_TODOS.md` (market-page audit
from the same day; some issues overlap and are noted by reference).

Sample entities inspected: `flutter`, `betsson`, `betmgm`,
`allwyn-international`, `evolution`, `kambi-group`, `better-collective`,
`prizepicks`. Plus aggregate scans across the entity table.

---

## Issue 1: 508 of 555 active entities have NO entity_type assignment
- What's wrong: 91% of active entities have zero rows in
  `entity_type_assignments`. Without a type code, `panelKindFor()` in
  the company page falls through to the `operator` default and renders
  the operator KPI panel. This is the root cause of "every entity gets
  the operator panel" symptoms in the brief — it's not a router bug,
  it's a missing-data bug.
- Evidence:
  ```sql
  SELECT COUNT(*) FROM entities e
  WHERE e.is_active = true
    AND NOT EXISTS (SELECT 1 FROM entity_type_assignments eta WHERE eta.entity_id = e.id);
  -- → 508
  ```
  Examples: `kaizen-betano`, `betclic`, `tipico`, `fdj-united`,
  `banijay-group`, `cvc`, all the `acroud-*` rows.
- Suggested fix: backfill `entity_type_assignments` from a heuristic
  pass — e.g. seed dictionary mapping known operator/affiliate/B2B
  names to type codes, then leave the long tail (`tipico-founders`,
  `cvc-and-tipico-management`, `admiral-acquired-by-tipico`) to manual
  review. Many of these aren't real entities (they're parsed
  capitalisations of phrases from PDFs); flag those as
  `is_active=false` instead.
- Priority: **blocker for the demo** — until this is fixed, the Fix D
  tile-suppression I just landed has no effect on most pages because
  they all resolve to the operator panel.
- Related Phase 2.5 Unit: B (entity resolution), with C/D once typed
  panels exist.

---

## Issue 2: Allwyn `revenue` Q3-25 = `1.02 EUR` with empty unit_multiplier
- What's wrong: `metric_value_canonical` shows
  `revenue|Q3-25|quarter|1.02|EUR|` (no multiplier). The intended value
  is €1.02 billion. The frontend renders €1.02 (one euro two cents).
  Sibling rows like `adjusted_ebitda|FY-25|1.58|EUR|billions` and
  `ggr|FY-25|8.6|EUR|billions` carry the multiplier correctly, so the
  parser knows about `billions` — it just dropped it for this row.
- Evidence:
  ```sql
  SELECT m.code, p.code, mv.value_numeric, mv.unit_multiplier
  FROM metric_value_canonical mv ... WHERE e.slug='allwyn-international'
    AND m.code IN ('revenue','adjusted_ebitda','ggr');
  ```
- Suggested fix: when the source phrase contains "billion" / "bn" /
  "B" suffix, force `unit_multiplier='billions'`. Add a unit-inference
  fallback that triggers whenever a currency value < 100 and no
  multiplier is set on a metric where >100M values are typical.
- Priority: high (renders comically wrong numbers on Allwyn page)
- Related Phase 2.5 Unit: A (recogniser units handling)

---

## Issue 3: Allwyn `online_revenue` Q1-25 has divergent values (862.1 vs 176.4 EUR M)
- What's wrong: two rows for the same (entity, metric, period, market=NULL)
  with different values: `862.1 EUR M` and `176.4 EUR M`. Both
  `disclosed`. The canonical view picks one but the discrepancy hints
  at extraction confusion (likely a Q1+Q2 figure misread as Q1, or a
  segment subtotal).
- Evidence:
  ```sql
  SELECT mv.value_numeric, mv.currency, mv.notes, s.source_type, r.filename
  FROM metric_values mv ... WHERE e.slug='allwyn-international'
    AND m.code='online_revenue' AND p.code='Q1-25';
  ```
- Suggested fix: add a "divergence guard" at insert time — when the
  incoming row's value differs by >10% from an existing row for the
  same (entity, metric, period) and both are `disclosed`, flag for
  review rather than silently inserting both.
- Priority: medium
- Related Phase 2.5 Unit: A

---

## Issue 4: Allwyn `online_ngr` FY-25 has units-mismatched duplicates
- What's wrong: rows `1.38 EUR billions` (= 1.38B EUR) and `866.0 EUR
  millions` (= 0.866B EUR) both for FY-25 online_ngr. Different
  values, different units. Likely two different report sections
  reporting in different scales.
- Evidence: same query as Issue 3.
- Suggested fix: same divergence guard, and a unit-normalisation pass
  that converts to a single base before comparing.
- Priority: medium
- Related Phase 2.5 Unit: A

---

## Issue 5: BetMGM `monthly_actives` Q4-25 has three different values
- What's wrong: three rows for monthly_actives Q4-25 — `1391`, `6589`,
  `8603` (all `thousands`). Likely three different segments (online
  igaming MAU vs online sportsbook MAU vs combined) all collapsed into
  one metric code. None of them are wrong individually but the
  canonical view picks one arbitrarily.
- Evidence:
  ```sql
  SELECT mv.value_numeric, mv.notes
  FROM metric_values mv ... WHERE e.slug='betmgm'
    AND m.code='monthly_actives' AND p.code='Q4-25';
  ```
- Suggested fix: split `monthly_actives` into vertical-segmented
  metric codes (`monthly_actives_igaming`, `monthly_actives_sports`,
  `monthly_actives_total`) OR carry a vertical dimension on the row
  (segment column). The latter is a schema change; the former is a
  recogniser refactor.
- Priority: high (the displayed MAU is unreliable and segment-mixing
  is a foundational data-quality issue)
- Related Phase 2.5 Unit: A (recogniser) + schema work

---

## Issue 6: BetMGM `casino_revenue` Q3-25 = 1.37 USD billions AND 1369 USD millions
- What's wrong: same value expressed twice, both rows persist. Lossless
  duplication (canonical view collapses on read), but inflates row
  counts and hides true `metric_count`.
- Evidence: same as above, `m.code='casino_revenue' AND p.code='Q3-25'`.
- Suggested fix: post-extraction normalisation pass — convert all
  values to the smaller scale (millions) before insert; UNIQUE index
  on (entity_id, market_id, metric_id, period_id, source_id, value_numeric)
  would catch trivial duplicates.
- Priority: nice-to-have (canonical view masks)
- Related Phase 2.5 Unit: A

---

## Issue 7: BetMGM `marketing_spend` Q3-25 has straight duplicate rows (413 USD M × 2)
- What's wrong: two identical rows for the same (entity, metric,
  period). Pure dedup failure.
- Evidence: same query pattern.
- Suggested fix: same as Issue 6.
- Priority: nice-to-have (canonical view masks)
- Related Phase 2.5 Unit: A (Issue 1 of UK audit overlaps)

---

## Issue 8: BetMGM `ebitda` Q4-25 = 832 USD M but `adjusted_ebitda` Q4-25 = 588 USD M
- What's wrong: large gap between EBITDA and adj-EBITDA (244 USD M).
  Adjusted should usually be HIGHER than reported EBITDA (adjustments
  remove one-offs that depressed earnings); this is reversed. Likely
  the recogniser swapped the labels on one of them.
- Evidence:
  ```sql
  SELECT m.code, p.code, mv.value_numeric, mv.notes
  FROM metric_value_canonical mv ... WHERE e.slug='betmgm'
    AND m.code IN ('ebitda','adjusted_ebitda') AND p.code='Q4-25';
  ```
- Suggested fix: tighten label disambiguation. When both `ebitda` and
  `adjusted_ebitda` are extracted from the same report and
  `adjusted < ebitda`, swap with a warning, or flag the row for
  review.
- Priority: medium (misleads margin reads)
- Related Phase 2.5 Unit: A

---

## Issue 9: BetMGM has Q3-25 + Q4-25 + 9M-25 + FY-25 but NO Q1/Q2-25 quarter rows
- What's wrong: extraction picked up the second-half-of-year quarters
  but not the first-half quarters, despite the FY-25 number being
  derivable as Q1+Q2+Q3+Q4 = 9416 USD M. So Q1-25 = FY - 9M = 9416 -
  2671 = 6745 USD M (huge — the 9M-25 = 2671 figure is also
  suspicious, see Issue 10).
- Evidence:
  ```sql
  SELECT p.code, p.period_type, mv.value_numeric
  FROM metric_value_canonical mv ... WHERE e.slug='betmgm'
    AND m.code='revenue' ORDER BY p.start_date DESC;
  ```
- Suggested fix: parser should derive missing quarters when
  FY/9M/H1/H2 + the available quarters are sufficient to reconstruct.
  Mark derived rows `disclosure_status='derived'`. Phase 2.5 Unit C
  was scoped for this.
- Priority: nice-to-have
- Related Phase 2.5 Unit: C

---

## Issue 10: BetMGM `revenue` 9M-25 = 2671 USD M and Q3-25 = 743 USD M look wrong
- What's wrong: 9M-25 (2671) ÷ 9 months × 12 = ~3561 implied annual,
  but FY-25 = 9416. Inconsistent by 2.6×. Q3-25 = 743 alone is
  implausibly small for BetMGM (Q4-25 = 2595). Likely a segment number
  parsed as the total.
- Evidence: same as Issue 9.
- Suggested fix: cross-period sanity check at extraction time — if a
  9M figure ÷ 9 × 12 differs from a sibling FY figure by >50%, flag.
- Priority: high (these numbers will surface on the chart and look
  insane; users will lose trust)
- Related Phase 2.5 Unit: A + C

---

## Issue 11: PrizePicks `revenue` Q3-25 row exists with empty `value_numeric`
- What's wrong: `revenue|Q3-25|quarter||` — null value, but the row
  takes up a slot and triggers "this entity reports Q3-25" downstream.
- Evidence:
  ```sql
  SELECT m.code, p.code, mv.value_numeric, mv.value_text, mv.notes
  FROM metric_value_canonical mv ... WHERE e.slug='prizepicks';
  ```
- Suggested fix: don't insert metric_values rows where both
  `value_numeric` AND `value_text` are NULL. Use `disclosure_status =
  'not_disclosed'` only when explicitly stated; otherwise skip the row.
- Priority: medium
- Related Phase 2.5 Unit: A

---

## Issue 12: PrizePicks `ngr` and `revenue` Q4-25 are identical (297 USD M)
- What's wrong: NGR (net gaming revenue) and Revenue are different
  concepts — for an operator, NGR = GGR − bonuses. They shouldn't
  collapse to the same number unless the source explicitly equates
  them. Likely a recogniser mapping the same line into both metric
  codes.
- Evidence: same query.
- Suggested fix: the new frontend Fix C (commit aa2d8ae) suppresses
  this visually, but the underlying parser shouldn't produce both
  rows. Pick one canonical mapping per source phrase.
- Priority: nice-to-have (frontend hides the duplicate)
- Related Phase 2.5 Unit: A

---

## Issue 13: Better Collective + Evolution have H1 + 9M + individual quarters all coexisting
- What's wrong: Better Collective `revenue` has Q1-25, Q2-25, Q3-25,
  Q4-25 AND H1-25 AND 9M-25 AND FY-25 — every aggregate window is
  separately disclosed. Evolution same. The frontend cadence picker
  (commit 7bb18f0) handles this fine, but the data model carries
  redundant rows that have to be filtered out at every read.
- Evidence:
  ```sql
  SELECT m.code, p.code, p.period_type, mv.value_numeric
  FROM metric_value_canonical mv ... WHERE e.slug='better-collective'
    AND m.code='revenue' ORDER BY p.start_date;
  ```
- Suggested fix: not actually a bug — the data is correct. But a
  derived view `metric_value_canonical_quarterly_only` would let UI
  components query without per-call cadence filtering. Optional.
- Priority: nice-to-have
- Related Phase 2.5 Unit: none (frontend / view-layer concern)

---

## Issue 14: Allwyn `lottery_revenue` is missing Q2-25 and Q3-25
- What's wrong: only Q1-25 (12.1 EUR M), Q4-25 (32.0 EUR M), FY-25
  (132.0 EUR M) exist. Q1+Q4 = 44.1, leaves 87.9 for Q2+Q3 — those
  quarters were either undisclosed or extraction missed them.
- Evidence:
  ```sql
  SELECT p.code, mv.value_numeric FROM metric_value_canonical mv ...
   WHERE e.slug='allwyn-international' AND m.code='lottery_revenue';
  ```
- Suggested fix: compare Q sums against FY at extraction; if a gap
  exists, derive the missing quarter(s) where possible (Q2 = FY − Q1
  − Q3 − Q4 only resolvable when 3 of 4 are known).
- Priority: medium
- Related Phase 2.5 Unit: C (derivations)

---

## Issue 15: BetMGM `ebitda_guidance` FY-25 has TWO conflicting rows (2.915 vs 2.24 USD billions)
- What's wrong: guidance is updated over time. Both old and revised
  values persist. Canonical view picks one, but downstream consumers
  see the wrong one half the time.
- Evidence:
  ```sql
  SELECT mv.value_numeric, mv.unit_multiplier, mv.notes,
         r.published_timestamp, r.filename
  FROM metric_values mv ... JOIN reports r ON r.id = mv.report_id
   WHERE e.slug='betmgm' AND m.code='ebitda_guidance' AND p.code='FY-25';
  ```
- Suggested fix: `metric_value_canonical` precedence should consider
  `published_timestamp` for guidance metrics — newest disclosed wins.
  Generally guidance/forecast metrics need a "valid at" dimension or a
  separate `metric_guidance` table with first/last-revised metadata.
- Priority: medium (guidance is a key headline and we surface stale
  figures)
- Related Phase 2.5 Unit: A (precedence) + schema

---

## Issue 16: Several entities have stock_price/market_cap as `custom` periods only
- Not a bug per se — `D2026-04-21` etc. is the daily stock snapshot
  cadence. But the existing `period_type IN ('quarter','half_year',
  'full_year','month')` filters in the time-matrix and chart pickers
  exclude `custom`, which means stock-price-only series can't surface
  there. They DO surface in the Stock Snapshot helper.
- Suggested fix: none required — separation by purpose is correct. But
  document so future contributors don't add `custom` to the cadence
  fallback by mistake.
- Priority: documentation only
- Related Phase 2.5 Unit: none

---

## Cross-cutting summary

**Likely auto-resolved by Phase 2.5 Unit A (in flight):**
- Issue 2 — units inference fallback
- Issue 3 — divergence guard
- Issue 4 — unit normalisation
- Issue 6 — duplicate row collapse
- Issue 7 — duplicate row collapse
- Issue 8 — adj-vs-reported swap detection

**Needs separate work (Unit B / C / D / schema):**
- Issue 1 — entity_type backfill (Unit B)
- Issue 5 — segment-aware MAU (schema or recogniser refactor)
- Issue 9, 10 — quarter derivation + sanity checks (Unit C)
- Issue 11 — empty-row guard (Unit A polish)
- Issue 12 — recogniser mapping audit
- Issue 14 — derivation (Unit C)
- Issue 15 — guidance precedence by published date

**Frontend only (already mitigated this session):**
- Sawtooth widgets — fixed by commit d6c6b40 (cadence picker)
- LTM-as-single-quarter — fixed by commit aa96d95
- Total≈Online tile collisions — fixed by commit aa2d8ae
- Generic-operator panel for non-operators — partially fixed by
  commit 627ba48 (tile suppression); fully fixes only when Issue 1
  also lands
- Stale "As of" date — fixed by commit 64dc99f

---

# Session 5 (2026-04-23) — data quality + UI polish pass

Findings from the post-audit polish session that hit /companies/betsson,
/companies/betmgm, /companies/allwyn-international, /companies/flutter,
/markets/united-kingdom, plus the Overview Markets widget. Some are new
parser TODOs; some clarify the source-of-truth for issues touched by
frontend fixes this session.

## Issue 17: YoY is a UI-side computation in three places (documented)
- What's wrong: not a bug — clarification. YoY is **never** stored as a
  metric in the DB; it's recomputed at render time in three sites:
  - `web/lib/scorecard-builder.ts` `buildKpiTile` — KPI tiles on
    Company + Market detail pages. Picks `prev` by ±45-day proximity
    to `latest.start_date - 365d`.
  - `web/lib/queries/analytics.ts` `getEntityLeaderboard` and
    `getMarketLeaderboard` — SQL LEFT JOIN that fetches
    `prev_year_value` from a 270-430 day window.
  - `web/lib/adapters.ts` — wraps both with `yoyPctGated` (currency
    conversion + sanity clamp).
- Implication: any YoY anomaly is debuggable without parser
  involvement. Session 5 commit b6d89ce hardened all three: prev row
  must match cadence (period_type), LTM rows excluded from
  comparisons, outlier clamp tightened from ±500% to ±80%.
- Priority: documentation only
- Related Phase 2.5 Unit: none (UI-layer)

## Issue 18: Sweden online_ggr — zero entity-attributed canonical rows
- What's wrong: the audit brief noted Betsson Sweden showing
  Kindred €10.8M / Betsson €1.6M (~100× too small). Investigation:
  `metric_value_canonical` returns ZERO rows for
  `(market='sweden', metric='online_ggr', entity_id IS NOT NULL)`
  for any 2025/2026 period. The widget the brief refers to must be
  reading from a different metric — but the symptom of "implausibly
  small operator values vs disclosed market total" is real for
  several Swedish operators on their other metrics too.
- Evidence:
  ```sql
  SELECT e.name, p.code, mvc.value_numeric, mvc.currency
  FROM metric_value_canonical mvc ... WHERE mk.slug='sweden'
    AND m.code='online_ggr' AND mvc.entity_id IS NOT NULL;
  -- → 0 rows
  ```
- Suggested fix: ensure the Sweden recogniser emits entity-attributed
  online_ggr rows for SGA-licensed operators (Kindred / Betsson /
  ATG / Svenska Spel / LeoVegas). Currently market-scope only.
- Priority: high (entire competitive position widget for Sweden
  reads from related metrics that may have unit issues)
- Related Phase 2.5 Unit: A (Sweden recogniser) + B (entity attribution)

## Issue 19: Allwyn lottery_revenue Q2-25 = 582 EUR M (10× off; likely H1 misparse)
- What's wrong: Allwyn quarterly lottery_revenue: Q1-25=12.1, Q2-25=582,
  Q4-25=32.0, FY-25=132.0. The 582 figure is roughly the H1 EUR
  online_revenue line (1112.5 / 2 = 556) — a wrong-line capture.
  Q2 should be ~30-50 EUR M consistent with siblings.
- Evidence:
  ```sql
  SELECT p.code, mv.value_numeric, mv.currency, mv.notes, r.filename
  FROM metric_values mv ... WHERE e.slug='allwyn-international'
    AND m.code='lottery_revenue' AND p.code='Q2-25';
  ```
- Suggested fix: cross-quarter sanity at extraction — if a quarter is
  >5× the median of sibling quarters within ±2 reporting periods,
  flag for review.
- Priority: medium (renders an outlier but quarters do flag visually)
- Related Phase 2.5 Unit: A + C (sanity rules)

## Issue 20: Allwyn `revenue` essentially absent (only Q3-25=1.02 raw)
- What's wrong: confirmed cause of the brief's "No revenue history
  for Allwyn" symptom — Allwyn doesn't disclose generic `revenue`
  separately, only sub-metrics (lottery_revenue, casino_revenue,
  online_revenue) and `ggr`. The lone Q3-25=1.02 row is a units-bug
  (Issue 2 above; should be 1.02 BILLIONS = 1020M) for what's
  probably the half-year online revenue line, not entity revenue.
- Suggested fix: lottery operators don't report a revenue line in
  the operator sense. Either (a) the parser should derive
  `revenue` = lottery_revenue + casino_revenue + sportsbook_revenue
  + online_revenue when a lottery entity has all four, or (b) accept
  that lottery entities don't have revenue and let the UI fall back
  through preferred-metric lists (which is what session 5 commit
  5fe3781 does).
- Priority: nice-to-have (frontend now falls back to GGR for the
  chart; KPI tiles handled per panel kind)
- Related Phase 2.5 Unit: C (derivation) — option (a) only

## Issue 21: Q4-25 quarterly gap is widespread across operators
- What's wrong: confirmed Q4-25 missing for Betsson (revenue),
  BetMGM (revenue), and others. Q3-25 ↔ Q1-26 with Q4-25 absent.
  Source: BetMGM and Betsson Q4-25 reports may be in `reports` table
  but the recogniser didn't emit revenue/EBITDA rows for the right
  period — possibly a date-parsing issue mistaking "fourth quarter"
  for FY in some report templates.
- Evidence:
  ```sql
  SELECT e.slug, COUNT(*) FILTER (WHERE p.code='Q4-25') AS q4_25,
         COUNT(*) FILTER (WHERE p.code='Q3-25') AS q3_25,
         COUNT(*) FILTER (WHERE p.code='Q1-26') AS q1_26
  FROM metric_value_canonical mvc ...
   WHERE m.code='revenue' AND mvc.entity_id IS NOT NULL
   GROUP BY e.slug HAVING COUNT(*) FILTER (WHERE p.code='Q3-25') > 0;
  ```
- Suggested fix: Unit A reprocess should help if it's a recogniser
  issue. If the gap persists post-reprocess, investigate the Q4-25
  reports specifically.
- Priority: high (visible gap on every chart; session 5 commit
  275b9a5 now renders the gap as a broken line segment instead of
  smoothing across, which makes the symptom visible to analysts but
  doesn't fix the source)
- Related Phase 2.5 Unit: A (likely auto-resolves)

## Issue 22: Overview "Top Markets" sparklines missing for Belgium / France / Canada
- What's wrong: the Overview page Markets widget renders em-dash in
  the trend column for several rows. Either insufficient trailing
  data (legitimate) or sparkline query bug (parser-adjacent).
- Suggested fix: investigate `getMarketLeaderboard.spark_raw` for
  these specific markets. If <2 periods of data exist for `online_ggr`
  the em-dash is correct — and the parser TODO becomes "ingest more
  market-scope online_ggr periods for these countries."
- Priority: medium (confirmed via screenshot; not yet root-caused)
- Related Phase 2.5 Unit: A + market data ingest

## Issue 13: US-state currency rows missing unit_multiplier on online_ggr (and friends)
- What's wrong: every US-state online_ggr row from Q4-25 / Q1-26 carries
  `unit_multiplier IS NULL` on values that are clearly stored in
  millions. NJ M2026-03 = 272.1 should be $272.1M; without the
  multiplier the formatter divides by FX rate and renders €254.40
  instead of €254.40M. Same pattern surfaced on Geographic Breakdown
  on /companies/flutter, /companies/allwyn-international,
  /companies/better-collective, /companies/evolution, BetMGM US.
- Evidence:
  ```sql
  SELECT mk.slug, p.code, mvc.value_numeric, mvc.currency, mvc.unit_multiplier
  FROM metric_value_canonical mvc
  JOIN markets mk ON mk.id = mvc.market_id
  JOIN metrics m ON m.id = mvc.metric_id
  JOIN periods p ON p.id = mvc.period_id
  WHERE mk.slug LIKE 'us-%' AND m.code = 'online_ggr' AND mvc.entity_id IS NULL;
  -- → all rows have unit_multiplier = '' (empty)
  ```
- Suggested fix: parser should default `unit_multiplier = 'millions'`
  for currency metrics when the source line carries a value < 100k —
  US-state regulator filings nearly always report in $ millions.
  Frontend has been patched defensively (Fix D in this session, commit
  8703f12) via `inferUnitMultiplier` + `nativeToEurInferred`; the
  parser fix is the canonical resolution.
- Priority: high (Fix D mitigates UI display but the underlying rows
  still carry the wrong scale, so direct DB queries / CSV exports
  remain wrong)
- Related Phase 2.5 Unit: A (recogniser units default)

## Session 6 (2026-04-23, evening) — QA report from Claude-in-Chrome

12 data-layer issues surfaced in a systematic 19-page audit. Frontend
fixes for the rest of the report shipped as Fix Classes A-R in commits
4dff860 through 9eca7c5; the items below need backend work.

## Issue 24: Entain market cap = €448.20B (100× scale error)
- What's wrong: stock card shows Entain market cap at €448B —
  approximately 100× too high. Real cap is ~€4-5B.
- Evidence:
  ```sql
  SELECT mv.value_numeric, mv.unit_multiplier, mv.currency, p.code
  FROM metric_values mv
  JOIN metrics m ON m.id = mv.metric_id
  JOIN periods p ON p.id = mv.period_id
  JOIN entities e ON e.id = mv.entity_id
  WHERE e.slug = 'entain' AND m.code = 'market_cap'
  ORDER BY p.start_date DESC LIMIT 5;
  ```
- Suggested fix: Stock-API ingest path. Probably extracting share
  count × price without converting share count from "thousands" /
  "millions" to raw share count. Or extracting market_cap with the
  wrong unit_multiplier on the source feed.
- Priority: high (visible on Entain detail page hero)
- Related Phase 2.5 Unit: stock ingest pipeline (separate from Unit A)

## Issue 25: Flutter Q3-25 revenue €128.6M with -96.4% QoQ, +3036.7% Q4-25
- What's wrong: Flutter Q3-25 revenue extracted at $128.6M when the
  real number is ~$3.6B (Q4-25 $3.5B is right). Single-quarter unit
  collapse → adjacent quarters' QoQ comparisons read as catastrophic
  swings.
- Evidence:
  ```sql
  SELECT p.code, mv.value_numeric, mv.currency, mv.unit_multiplier, r.filename
  FROM metric_values mv
  JOIN metrics m ON m.id = mv.metric_id
  JOIN periods p ON p.id = mv.period_id
  JOIN entities e ON e.id = mv.entity_id
  LEFT JOIN reports r ON r.id = mv.report_id
  WHERE e.slug = 'flutter' AND m.code = 'revenue'
    AND p.code = 'Q3-25';
  ```
- Suggested fix: post-Fix-A YoY clamp suppresses the percentage at the
  display layer (commit b6d89ce). Underlying value is still wrong.
  Same units-default fix as Issue 13 would catch this.
- Priority: high (figures from a Tier-1 operator must be defensible)
- Related Phase 2.5 Unit: A

## Issue 26: FanDuel + Flutter Entertainment both at €1.82B / 50% in Flutter US competitive widget
- What's wrong: parent (Flutter Entertainment) and child (FanDuel)
  both appear in the Competitive Position widget on the Flutter US
  market page, each at €1.82B / 50% share — they're the same number
  double-counted because the parser doesn't respect parent_entity_id
  hierarchy when surfacing operator competitive views.
- Suggested fix: leaderboard SQL should exclude either the parent
  (when its rolled-up value equals a child's value) OR the child
  (when the parent already aggregates it). Cleanest: walk the
  parent_entity_id chain and collapse to one canonical operator per
  market.
- Priority: medium (widget still readable, but visibly duplicated)
- Related Phase 2.5 Unit: B (entity hierarchy) + leaderboard SQL

## Issue 27: Sweden competitive widget — Kindred / Betsson / evoke €13.6M total vs €143.7M market
- What's wrong: Sweden Competitive Position renders at 1/10th the
  scale of the disclosed market total + omits ATG (the largest
  Sweden operator). Combination of Issue 13 (units multiplier) and
  Issue 18 (entity-attributed Sweden online_ggr missing).
- Suggested fix: see Issues 13 + 18. Fix E ⚠ scale badge from earlier
  this session now warns analysts at the UI layer.
- Priority: high (Sweden is a top-5 EU market)
- Related Phase 2.5 Unit: A + B

## Issue 28: BetMGM NGR €2.43B > Revenue €605.3M; Betsson NGR €1.19B > Revenue €285.0M
- What's wrong: NGR rendered larger than Revenue. By definition
  NGR ≤ Revenue (NGR = revenue minus bonus deductions). One side
  has wrong units.
- Evidence: BetMGM revenue Q1-26 row vs ngr Q4-25 row — the ngr
  carries the wrong unit_multiplier or currency. Likely the
  TopGolf-inclusive parent revenue line was extracted as NGR.
- Suggested fix: cross-metric sanity check at extraction — if
  ngr > revenue for the same (entity, period), flag both for review.
- Priority: high (every margin / take-rate analysis is bogus when
  the inputs are reversed)
- Related Phase 2.5 Unit: A (cross-metric sanity)

## Issue 29: Implausible YoYs not fully suppressed
- What's wrong: QA report flagged Entain H1-25 +65.4%, Catena Media
  Q4-25 +52.9%, Kaizen +23.5%, Better Collective EBITDA -32.7%,
  Overview Casino GGR +57.7%, Sportsbook +30.8%. Most are within the
  ±80% sanity bound (Fix A from polish session) so they pass through.
  Some genuine, some not.
- Suggested fix: not all of these are wrong — Catena Media +52.9%
  could be a real swing. Verify per-row. For UI: consider lowering
  the clamp to ±50% AND allowing a metric-specific override (e.g.
  newly-regulated markets). Best handled when Beacon methodology
  lands.
- Priority: investigate-only
- Related Phase 2.5 Unit: A + Beacon

## Issue 30: 153 of 158 reports at parsed_with_warnings status
- What's wrong: 96.8% of corpus has `parse_status = 'parsed_with_warnings'`.
  Either the warning bar is too low (everything trips it) or the corpus
  genuinely has systematic warnings worth investigating.
- Evidence:
  ```sql
  SELECT parse_status, COUNT(*) FROM reports GROUP BY parse_status;
  ```
- Suggested fix: dump the warnings on a sample of 10 reports and see
  what's recurring. If there's a single noisy warning ("missing
  optional field X"), suppress it. If the warnings are real, fix the
  recogniser.
- Priority: investigate-only
- Related Phase 2.5 Unit: A (parser observability)

## Issue 31: UK "Last 9 quarters" Sportsbook/Casino/NGR rows missing Q3-25 onwards
- What's wrong: time-matrix on /markets/united-kingdom shows
  Sportsbook GGR / Casino GGR / NGR rows trailing off after Q2-25.
  Likely the data exists at the entity scope (per-operator) but no
  market-scope aggregate landed for those quarters.
- Suggested fix: market-scope aggregate query — sum of operator
  values for the period — could fill gaps when no native row exists.
  Same pattern as country rollup (commit f0a5b33 in this session).
- Priority: medium
- Related Phase 2.5 Unit: A or query-layer rollup

## Issue 32: Italy "Last 6 quarters" skips Q2-24 and Q4-24
- What's wrong: time-matrix on /markets/italy renders Q1-24, Q3-24,
  Q1-25, Q2-25, Q3-25, Q4-25 — missing Q2-24 and Q4-24 entirely.
  The cadence picker in commit f6de180 handles consistent quarterly
  data; sparse quarters fall through.
- Suggested fix: parser likely failed to extract those specific
  quarters. Check the Italy AGIMEG monthly aggregate data — if Q2/Q4
  components exist as Apr+May+Jun / Oct+Nov+Dec months, derive the
  quarter from the months at the parser layer (Phase 2.5 Unit C).
- Priority: medium
- Related Phase 2.5 Unit: A + C

## Issue 33: Kambi Op. Turnover + EBITDA tiles empty on KPI panel
- What's wrong: Kambi is `b2b_platform`. The b2b_platform PANELS
  recipe in scorecard-builder includes `turnover` and `ebitda` as
  primary tiles, but Kambi disclosures use `b2b_revenue` + actual
  `adjusted_ebitda` instead. Tile labels don't match the metric
  codes the entity actually emits.
- Suggested fix: either (a) Kambi recogniser maps to `turnover` /
  `ebitda` (parser change), or (b) the b2b_platform panel uses
  `b2b_revenue` and `adjusted_ebitda` codes (frontend change). The
  PANELS migration belongs to Phase 2.5 Unit D (entity-type-specific
  panels).
- Priority: medium
- Related Phase 2.5 Unit: D

## Issue 34: Allwyn revenue chart only shows FY-25
- What's wrong: Allwyn's revenue chart on /companies/allwyn-international
  shows a single point (FY-25). Quarterly lottery breakdowns aren't
  extracted from the Allwyn quarterly reports. Fix C from session 5
  (commit 5fe3781) falls back to GGR which has even less coverage.
- Suggested fix: lottery operators report differently from
  sportsbook/casino — Phase 2.5 Unit D should add a lottery-specific
  recogniser that picks up draw-based revenue, instant games, etc.
- Priority: medium (Allwyn Tier-1 entity for the demo)
- Related Phase 2.5 Unit: C / D

## Issue 35: Q4-25 data gap across multiple operators
- Already logged as Issue 21 in session 5; reaffirmed by Q4-25-vs-Q1-26
  charts on Flutter/BetMGM/Betsson. Unit A reprocess pending.

---

# Session 5 (2026-04-23) — data quality + UI polish pass

## Issue 23: Overview Beacon™ column shows 0% for every row except Greece (4%)
- What's wrong: Beacon coverage column in the Top Markets widget
  reports near-zero everywhere. Two explanations: (a) Beacon
  methodology hasn't generated estimates for most markets yet
  (genuine 0%), or (b) the `beacon_coverage_pct` SQL in
  `getMarketLeaderboard` is miscomputed.
- Evidence:
  ```sql
  SELECT mk.slug,
         COUNT(*) AS n_total,
         COUNT(*) FILTER (WHERE disclosure_status IN ('beacon_estimate','derived')) AS n_beacon,
         ROUND(100.0 * COUNT(*) FILTER (WHERE disclosure_status IN ('beacon_estimate','derived')) / NULLIF(COUNT(*), 0), 1) AS pct
  FROM metric_value_canonical mvc JOIN markets mk ON mk.id = mvc.market_id
  GROUP BY mk.slug ORDER BY pct DESC LIMIT 20;
  ```
- Suggested fix: run the query above first. If 0% really is real
  everywhere, this is "Beacon™ methodology hasn't landed" and the
  column will fill in naturally as Beacon estimates are written.
  If pcts are non-zero in DB, the SQL needs review.
- Priority: investigate-only (don't fix UI until methodology lands)
- Related Phase 2.5 Unit: D (Beacon engine)


---

# QA Round 4 follow-up additions (2026-04-23, post-Unit-A reprocess)

## Issue: Flutter Q3-25 revenue €128.6M with -93.7% QoQ (4-round persistent)
- What's wrong: Flutter's `revenue` metric has multiple conflicting rows
  for the same (entity, period) partition. FY-25 has three
  "disclosed" values in the canonical view: 864 / 9416 / 2746 (all
  USD millions). Single-quarter picks collapse to the smallest,
  producing the -93.7% QoQ artefact.
- Evidence:
  ```sql
  SELECT p.code, p.period_type, mv.value_numeric, mv.unit_multiplier
  FROM metric_values mv JOIN metrics m ON m.id=mv.metric_id
  JOIN periods p ON p.id=mv.period_id
  WHERE mv.entity_id=(SELECT id FROM entities WHERE slug='flutter')
    AND mv.market_id IS NULL AND m.code='revenue'
    AND mv.disclosure_status='disclosed'
    AND p.period_type IN ('quarter','full_year','half_year')
  ORDER BY p.start_date DESC;
  ```
- Root cause hypothesis: parser emits segment revenues (FanDuel US,
  International, Sportsbet, group total) all as `revenue` metric_code
  against the parent entity. Should be distinct codes or sub-dim rows.
- Suggested fix: Pattern 1 extraction hardening — when the prompt sees
  multiple "Revenue" labels on a single operator table, each tagged with
  a segment (US / International / Group), emit distinct codes. Or
  extend the metric_value_canonical precedence to prefer group-rollup
  rows over segment rows.
- Priority: HIGH (sets Flutter Company detail at €128M instead of ~€10B).
- Related Unit: parser Unit A hardening / Phase 1.2.5 Workstream C++

## Issue: NGR > Revenue on BetMGM and Betsson
- What's wrong: BetMGM shows NGR €2.43B vs Revenue €605M; Betsson NGR
  €1.19B vs Revenue €285M. NGR is definitionally <= Revenue (NGR =
  Revenue - bonuses), so NGR > Revenue is impossible. Unit error at
  extraction.
- Root cause hypothesis: US-reported NGR stored with one multiplier
  convention, GAAP Revenue stored with another, or the NGR row captured
  a "lifetime" / "cumulative" figure instead of a period figure.
- Suggested fix: add a parser-side sanity check — when emitting `ngr`
  and `revenue` for the same (entity, period), assert ngr <= revenue;
  if not, hold one row for review.
- Priority: HIGH (misleads valuation widgets).

## Issue: Italy `/markets/italy` renders `€5.30B™` (™ glued to number)
- What's wrong: the Italy market scorecard's total value shows as
  `€5.30B™` — the ™ badge (which should be a superscript Beacon™
  indicator) is rendering inline as part of the number string.
- Root cause hypothesis: Either the parser emitted a literal `™`
  character inside `value_text`, or a UI formatter is concatenating the
  badge instead of wrapping it in `<sup>`.
- Suggested fix: grep for value_text rows containing "™"; if present,
  scrub at parser. If absent, the UI code-path is the culprit — find
  where the badge is applied to hero scorecard values vs leaderboard
  rows, likely in a template branch that missed the `<sup>` wrap.
- Priority: MEDIUM (cosmetic).

## Issue: Betsson Sweden competitive widget €1.6M scale — actually correct
- Follow-up verification: Betsson Nov-25 Sweden online_ggr = 17.5 with
  `unit_multiplier='millions'` + `currency='SEK'`. 17.5M SEK / ~11.4
  SEK-per-EUR = €1.54M, matching UI. The widget's apparent "20×
  undersized" is the user's expectation of scale, not a bug.
- Actual issue: ATG Sweden's primary type is `lottery`, LeoVegas /
  ComeOn / Svenska Spel Sport & Casino have NO entity_type. The
  Competitive Position widget filters `entityTypeCode='operator'` and
  excludes all four — giving a widget that misses the Swedish market
  leaders.
- Suggested fix: Phase 1.2 entity-type backfill — ATG gets both
  `lottery` and `operator` tags (it runs both businesses); LeoVegas /
  ComeOn / Svenska Spel classified as operators.
- Priority: HIGH (competitive widget misses #1-#3 Swedish operators).

## Issue: BetMGM "Market Share (GGR) (last 6 quarters)" shows bare "22" and "15"
- What's wrong: the 6-quarter sparkline-ish table shows numeric values
  without units or % signs. The metric is `market_share_ggr` (unit =
  percentage), so the raw `22` should render as `22.0%`.
- Root cause: either the parser stored the value with wrong `unit_type`
  on the metric def, or the UI is using a formatter that skips the %
  suffix for this specific widget.
- Suggested fix: check `metrics.unit_type` for `market_share_ggr` — if
  it's `ratio` or `count` instead of `percentage`, the formatter won't
  append %. If the metric def is correct, UI widget needs the
  percentage-aware formatter.
- Priority: MEDIUM.

## Issue: Kambi EV/EBITDA 173.1× and P/E 50.9×
- What's wrong: implausibly high multiples. Kambi post-Unibet-spinoff
  trades at maybe 5–10× EV/EBITDA.
- Root cause hypothesis: possibly a unit error in the stock_api scraper
  (Kambi EBITDA stored in thousands while EV stored in millions), or
  EBITDA nearly zero making the ratio explode.
- Suggested fix: scraper-side sanity guard — if EV/EBITDA computes
  > 100× or < 0, suppress as `derived_unreliable` rather than emitting.
- Priority: LOW (two entities affected).

## Issue: UK operator leaderboard duplicates (Gamesys vs evoke, Bally's Interactive vs Bally's Corporation)
- Fix class H from round 4 brief.
- What's wrong: UK market shows Gamesys (€639.0M), Bally's Interactive
  (€162.5M), Bally's Corporation (€162.7M) all separately. Gamesys is
  a subsidiary of evoke plc; the two Bally's rows look like the same
  entity counted twice.
- Evidence: `entities` table has both rows with `parent_entity_id =
  NULL` — no hierarchy link exists to collapse them in the UI layer.
- Suggested fix: Phase 1.2 entity canonicalisation — set
  `gamesys.parent_entity_id → evoke`, reconcile the two Bally's rows
  (merge or parent-link).
- Priority: MEDIUM (affects UK operator tables, not a blocker).

## Issue: Italy operator coverage — Sisal, Lottomatica, Snaitech, Bet365 Italy not extracted
- Fix class I from round 4 brief.
- What's wrong: `/markets/italy` operator leaderboard shows 3 operators
  (Flutter 83.2%, evoke 15.9%, FairPlay 0.9%) summing to €710M against
  an actual market of €1.45B. ~50% coverage gap. The Italian market
  leaders (Sisal, Lottomatica operating brand, Snaitech, Bet365 Italy)
  have no metric_values rows at the entity × Italy level.
- Evidence: querying entities with Italy rows returns ~12 names but
  only 5 have any revenue/GGR metric_values.
- Suggested fix: Pattern 4 extraction needs an Italian-market template
  pass — operator × Italy × (month|quarter) cells for Sisal,
  Lottomatica, Snaitech. Likely surfaced in Oyvind's digest emails
  covering Italy market updates.
- Priority: MEDIUM.

## Issue: Overview hero band not built (product request)
- Round 4 observation, not a bug. Logged for product decision.

## Issue: /markets Beacon™ coverage still 0% on most rows
- Expected — Beacon methodology is Phase 4.2, not yet implemented.
- No-op until then.

---

## Overnight v2 decision: Italy operator recogniser (Sanitiser 3.4)

Deferred. Round 9 brief asked for an optional Option B inline expansion
of Pattern 4 to recognise Italian operators (Lottomatica, Sisal,
Snaitech). Per the brief's decision rule ("if Option B requires
touching prompts.py for more than one recogniser, choose Option A and
log TODO") and overnight risk discipline, I chose Option A.

Scope expansion beyond brief boundary: extending Pattern 4's
market-name clause from "must name a US state" to "US state OR Italian
market name" risks reprocessing regressing the 6,422 existing US
state × operator cells — and the overnight dry-run would not have real
visibility into Italy outputs without also hand-constructing Italian
fixtures.

Next session owning this:
- Author a dedicated Pattern 6 recogniser ("eu-monthly-state-operator-
  matrix") that explicitly accepts Italy / Spain / Portugal / France /
  Denmark / Sweden monthly state tables, leaving Pattern 4 untouched.
- Fixture test against 3 Italy AGIMEG report samples.
- Reprocess full corpus only after two-fixture parity pass.

Expected unlock: ~15-20 Italian operator rows for Lottomatica
(iGaming / sports betting), Sisal (ditto), Snaitech (ditto), + 5-10
other EU operators in similar market shapes.

---

# Overnight v2 (2026-04-23→24) — sanitiser status

Phase 3 sanitisers landed live in `src/trailblaze/parser/ingest.py`. Applied to 73 of 175 reports during the partial reprocess (Phase 5 hit the 180-min HALT cap mid-run, killed cleanly with 0 errors — see `documentation/overnight-journal-20260423.md` for details). 0 `[needs_review]` flags fired across those 73 — a clean signal for the reports involved, not an invalidation of the guards.

- **TODO #2/#3 NGR > Revenue** — Sanitiser 3.1 guard live; flags pairs to `parse_warnings` on future ingest/reprocess. 0 fires on the reprocessed 73 (the specific BetMGM/Betsson rows flagged in round-4 QA remain in the un-reprocessed 102 and still show their pre-existing shape; they'll land on first reingest).
- **TODO #4 Italy ™ glyph** — Sanitiser 3.2 (glyph strip) live. Defensive for future Italy reports.
- **TODO #6 BetMGM bare "22/15"** — Sanitiser 3.3 (pct range) live. BetMGM + Italy report WAS in the reprocessed 73; 0 fires.
- **TODO #9 Italy operator coverage** — Sanitiser 3.4 deferred per brief decision rule. Separate recogniser (Pattern 6) authored in a future session per the TODO block above.

Recommended follow-up: next full or targeted reprocess on the 102 un-reprocessed reports will:
  (a) apply all three live sanitisers to the remaining corpus,
  (b) surface any hidden NGR>Revenue / pct-out-of-range anomalies as first-class flags,
  (c) strip any Italy ™ glyphs that crept in via older extractions.
