# Dictionary alias audit — Parser Category A

This document records every alias / canonicalisation decision made while
expanding the metric and period dictionaries during the Parser Category A
(vocabulary-aware extraction) session.

Snapshot of the state that triggered this work (taken before any edits):

- 307 PDFs parsed, 2,609 `metric_values` rows, 2,677 `narratives`
- **3,221 `unknown_metric_code` warnings** — LLM-emitted codes not in our `metrics` seed
- **1,749 `unknown_period_code` warnings** — mostly monthly codes
- Periods seed held only quarterly / half / nine-months / full-year / LTM; no monthly
- Prompt told the LLM to "map to our canonical metric dictionary" but never
  showed it the dictionary, so the LLM invented codes based on common industry
  shorthand ("sports_betting_handle", "osb_ggr", "igaming_ggr", …).

## Decision framework

1. If the observed LLM-emitted code names the same economic concept as an
   existing canonical code, it's an **alias**. The canonical name wins.
2. If it names a distinct concept with no existing canonical, it's a **new
   canonical metric**.
3. Prefer shorter, neutral names ("sportsbook_ggr") over acronyms tied to a
   single geographic convention ("osb_ggr" = US-regulator parlance).
4. Keep `ebitda` and `adjusted_ebitda` distinct — they differ materially in
   real filings and shouldn't be collapsed.

## Alias decisions (LLM-emitted → canonical)

| Observed LLM code | Occurrences | Canonical | Rationale |
|---|---|---|---|
| `sports_betting_handle` | 168 | `sportsbook_handle` | Same concept (total stakes wagered in sportsbook). Canonical name is domain-neutral; `sports_betting_` is verbose. |
| `sports_handle` | 35 | `sportsbook_handle` | Same concept, shorter LLM variant of the above. |
| `osb_handle` | 68 | `sportsbook_handle` | "OSB" = "Online Sports Betting", US-regulator lingo. Same concept; canonical is name-neutral. |
| `sports_revenue` | 52 | `sportsbook_revenue` | Same concept. Canonical name already seeded; the LLM just dropped the "book". |
| `sports_betting_ggr` | 85 | `sportsbook_ggr` | Same concept. Canonical `sportsbook_ggr` is newly added (see below). |
| `sports_ggr` | 35 | `sportsbook_ggr` | Shorter LLM variant of the above. |
| `osb_ggr` | 104 | `sportsbook_ggr` | US-regulator lingo. Same concept. |
| `igaming_ggr` | 76 | `casino_ggr` | iGaming in US/EU operator reporting almost always means online casino. Canonical `casino_ggr` is newly added (see below); avoids the regulatory-jurisdictional framing of "igaming". |
| `total_revenue` | 47 | `revenue` | "Total revenue" is the default meaning of `revenue` in a company-report context — no reason to bifurcate. |

## New canonical metrics (no alias target existed)

| New canonical | Category | Unit | Reason |
|---|---|---|---|
| `sportsbook_ggr` | revenue | currency | We had `sportsbook_revenue` but no GGR-level breakdown for sportsbook. The `_ggr`/`_revenue` distinction is material in financial reporting (GGR is pre-bonus/promo, revenue is post-). |
| `casino_ggr` | revenue | currency | Same reason — we had `casino_revenue` but not `casino_ggr`. |
| `market_share_handle` | share | percentage | Distinct from `market_share`: share of total handle (volume-based). Common in US state-level market updates. |
| `market_share_ggr` | share | percentage | Distinct from `market_share`: share of GGR (revenue-based). Also common in state-level reporting. The bare `market_share` stays as the generic "share of revenue" code when the doc doesn't specify. |
| `staff_costs` | profitability | currency | Personnel/salary expense line. European IFRS reports commonly list this explicitly; we had no code for it. |
| `adjusted_ebitda` | profitability | currency | Kept distinct from `ebitda`. "Adjusted" EBITDA excludes one-offs (legal, M&A, restructuring) and is the headline metric most operators publish. Collapsing would lose the reported-vs-adjusted distinction. |
| `revenue_guidance` | guidance | currency | Forward-looking management guidance figure. New "guidance" category (also covers `ebitda_guidance`). |
| `ebitda_guidance` | profitability | currency | Forward-looking management EBITDA range/midpoint. Category "profitability" to match `ebitda`. |

## Period decisions

Monthly codes were missing entirely. Added for **2024–2027** in three grammatical forms the LLM was observed emitting:

- `Mmm-YY` — `Jan-24`, `Feb-24`, …, `Dec-27` (48 rows)
- `YTD-Mmm-YY` — `YTD-Jan-24`, …, `YTD-Dec-27` (48 rows)
- `MNN-YY` — `M01-24`, `M02-24`, …, `M12-27` (48 rows, numeric variant)

No period-alias table was introduced — all three forms are seeded directly as
independent `periods.code` rows pointing at the same date range, so the
resolver finds them without any alias lookup. Alias table would be noise here.

## What was NOT done (preserving scope)

- No changes to narrative extraction — out of scope (Category B).
- No new B2B-specific metrics beyond those listed above — the top-15 was the
  anchor list; codes that appeared with < 30 occurrences are deferred.
- The 200 `auto_added_needs_review` entities were not touched — separate
  curation pass.
- No per-document-type prompt variants — single `PASS2_SYSTEM` remains.
