import "server-only";
import { query, queryOne } from "@/lib/db";
import type { Narrative, Report } from "@/lib/types";

// Affiliate-specific data fetchers. Most heavy lifting (leaderboard,
// scorecard series, per-metric time series) goes through the shared
// analytics helpers — mirrors what /companies and /operators do. This
// file carries only what is SEMANTICALLY specific to affiliates:
// aggregate affiliate-industry KPIs, the affiliate entity list with
// summary stats, and affiliate-tagged cross-entity commentary.

export interface AffiliateSummaryRow {
  id: string;
  slug: string;
  name: string;
  ticker: string | null;
  exchange: string | null;
  revenue_eur: number | null; // latest disclosed (no LTM aggregation here —
                              // the Revenue LTM agg lives in the leaderboard
                              // helper that already handles cadence)
  revenue_period: string | null;
  ndc_latest: number | null;
  ndc_period: string | null;
  ebitda_margin_pct: number | null;
  ebitda_margin_period: string | null;
  metric_count: number;
}

export async function getAffiliateList(): Promise<AffiliateSummaryRow[]> {
  const rows = await query<{
    id: string;
    slug: string;
    name: string;
    ticker: string | null;
    exchange: string | null;
    rev_value: string | null;
    rev_mult: string | null;
    rev_currency: string | null;
    rev_rate: string | null;
    rev_period: string | null;
    ndc_value: string | null;
    ndc_mult: string | null;
    ndc_period: string | null;
    margin_value: string | null;
    margin_period: string | null;
    metric_count: number;
  }>(
    `WITH rev AS (
       SELECT DISTINCT ON (mvc.entity_id) mvc.entity_id,
              mvc.value_numeric::text AS val,
              mvc.unit_multiplier::text AS mult,
              mvc.currency, fx.eur_rate::text AS rate,
              p.display_name AS period
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       LEFT JOIN LATERAL (
         SELECT f.eur_rate FROM fx_rates f
         WHERE f.currency_code = COALESCE(UPPER(mvc.currency), 'EUR')
           AND f.rate_date <= p.end_date
         ORDER BY f.rate_date DESC LIMIT 1
       ) fx ON true
       WHERE m.code = 'revenue'
         AND mvc.entity_id IS NOT NULL AND mvc.market_id IS NULL
         AND mvc.value_numeric IS NOT NULL
         AND mvc.disclosure_status IN ('disclosed','partially_disclosed','derived')
       ORDER BY mvc.entity_id, p.start_date DESC
     ),
     ndc AS (
       SELECT DISTINCT ON (mvc.entity_id) mvc.entity_id,
              mvc.value_numeric::text AS val,
              mvc.unit_multiplier::text AS mult,
              p.display_name AS period
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       WHERE m.code = 'ndc'
         AND mvc.entity_id IS NOT NULL AND mvc.market_id IS NULL
         AND mvc.value_numeric IS NOT NULL
       ORDER BY mvc.entity_id, p.start_date DESC
     ),
     margin AS (
       SELECT DISTINCT ON (mvc.entity_id) mvc.entity_id,
              mvc.value_numeric::text AS val,
              p.display_name AS period
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       WHERE m.code = 'ebitda_margin'
         AND mvc.entity_id IS NOT NULL AND mvc.market_id IS NULL
         AND mvc.value_numeric IS NOT NULL
       ORDER BY mvc.entity_id, p.start_date DESC
     ),
     counts AS (
       SELECT entity_id, COUNT(*)::int AS metric_count
       FROM metric_value_canonical
       WHERE entity_id IS NOT NULL AND market_id IS NULL
       GROUP BY entity_id
     )
     SELECT e.id, e.slug, e.name, e.ticker, e.exchange,
            rev.val AS rev_value, rev.mult AS rev_mult,
            rev.currency AS rev_currency, rev.rate AS rev_rate,
            rev.period AS rev_period,
            ndc.val AS ndc_value, ndc.mult AS ndc_mult,
            ndc.period AS ndc_period,
            margin.val AS margin_value, margin.period AS margin_period,
            COALESCE(counts.metric_count, 0) AS metric_count
     FROM entities e
     JOIN entity_type_assignments eta ON eta.entity_id = e.id
     JOIN entity_types et ON et.id = eta.entity_type_id
     LEFT JOIN rev ON rev.entity_id = e.id
     LEFT JOIN ndc ON ndc.entity_id = e.id
     LEFT JOIN margin ON margin.entity_id = e.id
     LEFT JOIN counts ON counts.entity_id = e.id
     WHERE et.code = 'affiliate'
       AND e.is_active = true
       AND COALESCE(e.metadata->>'status','') <> 'auto_added_needs_review'
     ORDER BY COALESCE(counts.metric_count, 0) DESC, e.name`,
  );

  return rows.map((r) => {
    const revEur = nativeToEur(r.rev_value, r.rev_mult, r.rev_rate);
    const ndc = scaledNumeric(r.ndc_value, r.ndc_mult);
    const margin = r.margin_value != null ? Number(r.margin_value) : null;
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      ticker: r.ticker,
      exchange: r.exchange,
      revenue_eur: revEur,
      revenue_period: r.rev_period,
      ndc_latest: ndc,
      ndc_period: r.ndc_period,
      ebitda_margin_pct: margin,
      ebitda_margin_period: r.margin_period,
      metric_count: r.metric_count,
    };
  });
}

// Aggregate KPIs for the /affiliates index hero strip.
//   - total_revenue_eur: Σ(latest disclosed revenue EUR)
//   - total_ndc: Σ(latest disclosed NDCs)
//   - weighted_ebitda_margin_pct: Σ(EBITDA_EUR) / Σ(Revenue_EUR), when both
//     are disclosed for matching periods. Falls back to null when
//     coverage is too thin.
//   - affiliate_count: distinct active affiliate entities
//   - reporting_count: affiliates with ≥1 metric_value row
export async function getAffiliateAggregateKpis(): Promise<{
  total_revenue_eur: number | null;
  total_ndc: number | null;
  weighted_ebitda_margin_pct: number | null;
  affiliate_count: number;
  reporting_count: number;
}> {
  const row = await queryOne<{
    total_revenue_eur: string | null;
    total_ndc: string | null;
    total_ebitda_eur: string | null;
    total_revenue_for_margin_eur: string | null;
    affiliate_count: number;
    reporting_count: number;
  }>(
    `WITH aff AS (
       SELECT e.id
       FROM entities e
       JOIN entity_type_assignments eta ON eta.entity_id = e.id
       JOIN entity_types et ON et.id = eta.entity_type_id
       WHERE et.code = 'affiliate'
         AND e.is_active = true
         AND COALESCE(e.metadata->>'status','') <> 'auto_added_needs_review'
     ),
     rev AS (
       SELECT DISTINCT ON (mvc.entity_id) mvc.entity_id,
              (mvc.value_numeric::numeric *
                CASE mvc.unit_multiplier
                  WHEN 'billions' THEN 1000000000
                  WHEN 'millions' THEN 1000000
                  WHEN 'thousands' THEN 1000
                  ELSE 1
                END
                / NULLIF(fx.eur_rate::numeric, 0)) AS eur
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       JOIN aff a ON a.id = mvc.entity_id
       LEFT JOIN LATERAL (
         SELECT f.eur_rate FROM fx_rates f
         WHERE f.currency_code = COALESCE(UPPER(mvc.currency), 'EUR')
           AND f.rate_date <= p.end_date
         ORDER BY f.rate_date DESC LIMIT 1
       ) fx ON true
       WHERE m.code = 'revenue'
         AND mvc.market_id IS NULL
         AND mvc.value_numeric IS NOT NULL
         AND mvc.disclosure_status IN ('disclosed','partially_disclosed','derived')
       ORDER BY mvc.entity_id, p.start_date DESC
     ),
     ebit AS (
       SELECT DISTINCT ON (mvc.entity_id) mvc.entity_id,
              (mvc.value_numeric::numeric *
                CASE mvc.unit_multiplier
                  WHEN 'billions' THEN 1000000000
                  WHEN 'millions' THEN 1000000
                  WHEN 'thousands' THEN 1000
                  ELSE 1
                END
                / NULLIF(fx.eur_rate::numeric, 0)) AS eur,
              p.start_date
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       JOIN aff a ON a.id = mvc.entity_id
       LEFT JOIN LATERAL (
         SELECT f.eur_rate FROM fx_rates f
         WHERE f.currency_code = COALESCE(UPPER(mvc.currency), 'EUR')
           AND f.rate_date <= p.end_date
         ORDER BY f.rate_date DESC LIMIT 1
       ) fx ON true
       WHERE m.code = 'ebitda'
         AND mvc.market_id IS NULL
         AND mvc.value_numeric IS NOT NULL
         AND mvc.disclosure_status IN ('disclosed','partially_disclosed')
       ORDER BY mvc.entity_id, p.start_date DESC
     ),
     ndc AS (
       SELECT DISTINCT ON (mvc.entity_id) mvc.entity_id,
              (mvc.value_numeric::numeric *
                CASE mvc.unit_multiplier
                  WHEN 'billions' THEN 1000000000
                  WHEN 'millions' THEN 1000000
                  WHEN 'thousands' THEN 1000
                  ELSE 1
                END) AS total
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       JOIN aff a ON a.id = mvc.entity_id
       WHERE m.code = 'ndc'
         AND mvc.market_id IS NULL
         AND mvc.value_numeric IS NOT NULL
         AND mvc.disclosure_status IN ('disclosed','partially_disclosed')
       ORDER BY mvc.entity_id, p.start_date DESC
     ),
     reporting AS (
       SELECT DISTINCT entity_id
       FROM metric_value_canonical
       WHERE entity_id IN (SELECT id FROM aff)
     )
     SELECT
       (SELECT SUM(eur)::text FROM rev) AS total_revenue_eur,
       (SELECT SUM(total)::text FROM ndc) AS total_ndc,
       (SELECT SUM(eur)::text FROM ebit) AS total_ebitda_eur,
       (SELECT SUM(rev.eur)::text FROM rev
          WHERE rev.entity_id IN (SELECT entity_id FROM ebit)
       ) AS total_revenue_for_margin_eur,
       (SELECT COUNT(*)::int FROM aff) AS affiliate_count,
       (SELECT COUNT(*)::int FROM reporting) AS reporting_count`,
  );

  if (!row)
    return {
      total_revenue_eur: null,
      total_ndc: null,
      weighted_ebitda_margin_pct: null,
      affiliate_count: 0,
      reporting_count: 0,
    };

  const totalEbitda =
    row.total_ebitda_eur != null ? Number(row.total_ebitda_eur) : null;
  const marginDenom =
    row.total_revenue_for_margin_eur != null
      ? Number(row.total_revenue_for_margin_eur)
      : null;
  const weightedMargin =
    totalEbitda != null && marginDenom != null && marginDenom > 0
      ? (totalEbitda / marginDenom) * 100
      : null;

  return {
    total_revenue_eur:
      row.total_revenue_eur != null ? Number(row.total_revenue_eur) : null,
    total_ndc: row.total_ndc != null ? Number(row.total_ndc) : null,
    weighted_ebitda_margin_pct: weightedMargin,
    affiliate_count: row.affiliate_count ?? 0,
    reporting_count: row.reporting_count ?? 0,
  };
}

// Affiliate-tagged narratives across all affiliate entities. Used on the
// /affiliates index "Recent commentary" panel — pulls the latest
// narrative excerpts from Trailblaze reports that mention an affiliate
// entity.
export async function getAffiliateCommentary(limit = 8): Promise<
  (Narrative & {
    entity_name: string;
    entity_slug: string;
    published: string | null;
  })[]
> {
  return await query<
    Narrative & {
      entity_name: string;
      entity_slug: string;
      published: string | null;
    }
  >(
    `SELECT n.id, n.report_id, n.entity_id, n.market_id, n.section_code, n.content,
            e.name AS entity_name, e.slug AS entity_slug,
            r.published_timestamp::text AS published
     FROM narratives n
     JOIN entities e ON e.id = n.entity_id
     JOIN entity_type_assignments eta ON eta.entity_id = e.id
     JOIN entity_types et ON et.id = eta.entity_type_id
     JOIN reports r ON r.id = n.report_id
     WHERE et.code = 'affiliate'
       AND e.is_active = true
     ORDER BY r.published_timestamp DESC NULLS LAST, n.id DESC
     LIMIT $1`,
    [limit],
  );
}

// Reports mentioning any affiliate entity, for the index "Recent reports"
// strip. Dedup on report_id so a single report that touches multiple
// affiliates is listed once.
export async function getAffiliateReports(limit = 10): Promise<Report[]> {
  return await query<Report>(
    `SELECT DISTINCT ON (r.id)
            r.id, r.filename, r.document_type, r.published_timestamp,
            r.parse_status, r.metric_count, r.parser_version, r.parsed_at
     FROM reports r
     JOIN report_entities re ON re.report_id = r.id
     JOIN entities e ON e.id = re.entity_id
     JOIN entity_type_assignments eta ON eta.entity_id = e.id
     JOIN entity_types et ON et.id = eta.entity_type_id
     WHERE et.code = 'affiliate' AND e.is_active = true
     ORDER BY r.id, r.published_timestamp DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );
}

// Helpers -----------------------------------------------------------------

function nativeToEur(
  value: string | null,
  mult: string | null,
  rate: string | null,
): number | null {
  if (value == null) return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const scale =
    mult === "billions"
      ? 1_000_000_000
      : mult === "millions"
      ? 1_000_000
      : mult === "thousands"
      ? 1_000
      : 1;
  const r = rate != null && Number(rate) > 0 ? Number(rate) : 1;
  return (v * scale) / r;
}

function scaledNumeric(
  value: string | null,
  mult: string | null,
): number | null {
  if (value == null) return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const scale =
    mult === "billions"
      ? 1_000_000_000
      : mult === "millions"
      ? 1_000_000
      : mult === "thousands"
      ? 1_000
      : 1;
  return v * scale;
}
