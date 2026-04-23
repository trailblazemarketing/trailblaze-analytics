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
