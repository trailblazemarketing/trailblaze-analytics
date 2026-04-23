# UK Market audit — parser TODOs (not fixed at frontend layer)

Discovered: 2026-04-23, `/markets/united-kingdom` audit
Status: blocked on parser work — Phase 2.5 Unit A reprocess may resolve some;
others need new recognisers, new metric mappings, or entity-resolution review.

## Issue 1: `online_ggr` rows duplicated 6–8x per period
- What's missing: `online_ggr` for UK FY-25 has 8 identical rows of 6837.1 EUR;
  Q4-25 has 7 identical rows of 1712.1 EUR; Q2-25 has 4 rows of 1749.9 EUR;
  H1-25 has 6 identical rows of 3485.6 EUR.
- Evidence: `SELECT m.code, p.code, mv.value_numeric, mv.currency FROM
  metric_values mv ... WHERE mk.slug='united-kingdom' AND m.code='online_ggr'`
  returns near-identical rows that all collapse to the same value/currency/period.
- Suggested fix: parser-level dedup before insert, or (entity_id NULL,
  market_id, metric_id, period_id) uniqueness reinforced on the write path.
  The materialised `metric_value_canonical` view picks one via precedence,
  so the UI mostly hides this — but it inflates `metric_count` on reports
  and risks divergent values from different extraction passes leaking through.
- Priority: nice-to-have (the canonical view masks the symptom)
- Related Phase 2.5 Unit: A (reprocess may collapse if dedup is added)

## Issue 2: `ggr` and `online_ggr` carry identical values for the same period
- What's missing: For UK Q4-25, FY-25, Q2-25, H1-25, both `ggr` and
  `online_ggr` carry the same EUR value (e.g. Q4-25 both = 1712.1 EUR).
  The frontend now suppresses the duplicate `Total GGR` tile when this
  happens, but the underlying parser is still mapping a single source
  number to two metric codes.
- Evidence: see Issue 1 query — `ggr` and `online_ggr` both have 1712.1 EUR
  for Q4-25.
- Suggested fix: tighten the recogniser so phrases like "online GGR" /
  "online gross gaming revenue" map only to `online_ggr`, never to
  `ggr`. `ggr` should require an explicit "total GGR" / un-qualified
  phrasing or an explicit retail+online sum.
- Priority: blocker for UK demo (without this the canonical Total GGR
  is wrong wherever a market only discloses online)
- Related Phase 2.5 Unit: A (recogniser-level)

## Issue 3: bet365 not attributed to UK market
- What's missing: bet365 is the largest privately-held UK operator and a
  Tier-1 entity, but no `metric_value` row exists with bet365 as
  `entity_id` and UK as `market_id`. The
  `gmail_oyvindmiller_20251223_bet365-fy25-accounts...pdf` is in `reports`
  but didn't yield UK-attributed bet365 rows.
- Evidence: `SELECT name FROM entities WHERE name ILIKE '%bet365%'` —
  check whether bet365 even has an entity record; check
  `report_entities` for the bet365 report.
- Suggested fix: ensure bet365 entity exists (slug `bet365`), add
  market_id = UK on extracted rows from bet365 reports, and confirm the
  parser emits revenue/GGR for UK from those filings.
- Priority: blocker for UK demo
- Related Phase 2.5 Unit: B / C (entity resolution + market attribution)

## Issue 4: Sky Betting & Gaming not surfaced as a separate UK entity
- What's missing: Sky Betting (now part of Flutter) is named in Oyvind's
  UK breakdown but doesn't appear as its own entity in UK metric_values.
  Currently rolled implicitly under Flutter Entertainment.
- Evidence: `SELECT name FROM entities WHERE name ILIKE '%sky%'` and
  cross-reference UK reports.
- Suggested fix: decide canonical handling — either (a) Sky Betting as a
  child entity of Flutter with its own UK rows, or (b) explicitly label
  Flutter UK = Paddy Power + Sky + Tombola. Probably (a) for analyst
  granularity. Document via `parent_entity_id` if that exists, otherwise
  via `metadata`.
- Priority: blocker for UK demo
- Related Phase 2.5 Unit: B (entity resolution)

## Issue 5: 16 of 18 active UK operator entities flagged `auto_added_needs_review`
- What's missing: Allwyn International, Rank Group, Super Group, Bally's
  Interactive, Bally's International Interactive, Tombola, Buzz Bingo,
  Mecca Bingo Digital, Click Competitions, Winvia Entertainment,
  Livescore Group, Playtech UK, Gaming Realms, Blueprint Gaming,
  Fence Topco, FDJ United, FairPlay Sports Media Group all carry
  `metadata->>'status' = 'auto_added_needs_review'`. The frontend now
  shows them on the markets page via `includePending: true`, but they
  remain hidden on global leaderboards.
- Evidence: `SELECT name, metadata->>'status' FROM entities WHERE id IN
  (SELECT DISTINCT entity_id FROM metric_value_canonical WHERE market_id =
  (SELECT id FROM markets WHERE slug='united-kingdom') AND entity_id IS NOT NULL)`.
- Suggested fix: triage backlog. For each: confirm canonical name, slug,
  ticker, entity_type assignment, then promote (clear the `status` flag).
  Some may need a parent_entity_id (Bally's International Interactive →
  Bally's Corporation, Mecca Bingo Digital → Rank Group, etc.).
- Priority: blocker for UK demo (and every other market)
- Related Phase 2.5 Unit: B (entity resolution review)

## Issue 6: `sportsbook_handle` vs `sportsbook_turnover` are not unified
- What's missing: UK has 6 quarterly `sportsbook_turnover` rows
  (Q2-24 = 6192, Q3-24 = 5606, Q4-24 = 5963, Q1-25 = 6162, Q2-25 = 6345
  GBP millions; LTM-Q1-25 = 23,923 GBP millions; FY-25 = 23.9 GBP billions)
  but zero `sportsbook_handle` rows. These are semantic synonyms in
  iGaming reporting (handle = turnover). The frontend now aliases
  turnover → handle, but the underlying metric codes diverge by source
  vocabulary.
- Evidence: `SELECT m.code, COUNT(*) FROM metric_values mv ... WHERE
  mk.slug='united-kingdom' AND m.code IN ('sportsbook_handle','sportsbook_turnover')
  GROUP BY m.code`.
- Suggested fix: add an entry in `metric_aliases` mapping
  `sportsbook_turnover` → `sportsbook_handle` (UK regulator uses
  "turnover", US uses "handle"; canonical is one of them — pick `handle`
  to match operator filings). Then either (a) re-route the recogniser
  output to the canonical, or (b) collapse via a periodic reconciliation
  job.
- Priority: blocker for UK demo (and several US states reporting handle)
- Related Phase 2.5 Unit: A (recogniser / metric_aliases)

## Issue 7: `casino_ggr` Q2-25 has 4 divergent values
- What's missing: UK `casino_ggr` Q2-25 has rows of 144.8, 903, 1378.8,
  and 744.6 (all GBP millions). Only 1378.8 matches Oyvind's
  Q2-25 casino number; the others are likely operator-specific subsets
  or extraction errors that landed as market-scope rows.
- Evidence: `SELECT mv.value_numeric, mv.currency, mv.notes,
  e.name AS entity, s.source_type FROM metric_values mv ... WHERE
  mk.slug='united-kingdom' AND m.code='casino_ggr' AND p.code='Q2-25'`.
- Suggested fix: investigate which reports yielded each row. Likely an
  entity row leaked into market scope (entity_id NULL when it should be
  set), or a "company X UK casino Q2" got mis-tagged as market total.
  Tighten the entity-vs-market disambiguation in the parser.
- Priority: high (corrupts Q2-25 casino landscape)
- Related Phase 2.5 Unit: A / C (extraction + scope tagging)

## Issue 8: Q3-25 `online_ggr` missing despite Q3-25 components present
- What's missing: UK `online_ggr` has Q1-25, Q2-25, Q4-25 but no Q3-25.
  Yet `casino_ggr|Q3-25 = 887.3 GBP` and `sportsbook_ggr|Q3-25 = 519.5
  GBP` and `bingo_revenue` (no Q3-25 in dump but historical). Sum
  ≈ 1407 GBP millions, which is plausibly the Q3-25 online GGR.
- Evidence: dump above; see also `online_ggr|9M-25 = 4356 GBP millions`
  which should be summable down to Q3-25 = 9M-25 − H1-25.
- Suggested fix: parser should derive `online_ggr` for a period when
  components (sportsbook_ggr + casino_ggr + bingo_revenue + poker_revenue)
  are all present and online_ggr itself is missing. Mark derived rows
  with `disclosure_status='derived'` and a `notes` trace of the
  components used. (This is what Phase 2.5 Unit C is for.)
- Priority: nice-to-have (UI now derives an LTM from quarters, but
  Q3-25 LTM specifically still hits a hole)
- Related Phase 2.5 Unit: C (derivations)

## Issue 9: Currency mixing for same metric+period (GBP and EUR rows)
- What's missing: UK `ggr|Q2-25` has rows in both GBP (1486, 2051.3
  millions) and EUR (1749.9 millions appearing 3 times).
  `casino_ggr|FY-25` has both `5.01 GBP billions` and (separately) an
  Entain row with NULL value.
- Evidence: dump above.
- Suggested fix: normalise currency at extraction (convert at parser
  time using period-end FX, or always store source currency and let the
  view handle conversion). Either way, dedup so the canonical row picks
  one source-of-truth, not three.
- Priority: nice-to-have (canonical view does pick one)
- Related Phase 2.5 Unit: A (precedence) / B (units normalisation)

## Issue 10: Entain UK metrics mostly land at market-scope, not Entain-attributed
- What's missing: Entain has UK `online_revenue` rows attributed to it
  (Entain entity), but UK `sportsbook_ggr`, `casino_ggr`, `bingo_revenue`,
  `poker_revenue` are all market-scope only — the actual Entain-UK split
  (Ladbrokes-Coral) doesn't surface as Entain entity rows.
- Evidence: dump above — entity_id is NULL for almost every UK
  sportsbook_ggr / casino_ggr / bingo_revenue row.
- Suggested fix: the UK Online table in Oyvind's reports IS the market
  total — those are correctly market-scope. But Entain's own quarterly
  segment disclosures (in their Q1/Q2/Q3 trading updates) should yield
  Entain-attributed UK rows for these verticals. Verify the Entain
  recogniser for trading updates is firing; it may only be picking up
  online_revenue and missing the segment splits.
- Priority: high (blocks operator-level UK casino/sports leaderboards)
- Related Phase 2.5 Unit: A / D (Entain trading-update recogniser)
