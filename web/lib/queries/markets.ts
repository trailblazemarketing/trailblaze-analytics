import "server-only";
import { query, queryOne } from "@/lib/db";
import type {
  Market,
  MetricValueRow,
  BeaconEstimate,
  Report,
} from "@/lib/types";

export async function listMarkets(filters: {
  search?: string;
  market_type?: string;
  iso_country?: string;
  is_regulated?: "true" | "false";
} = {}): Promise<Market[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    clauses.push(`(name ILIKE $${params.length} OR slug ILIKE $${params.length})`);
  }
  if (filters.market_type) {
    params.push(filters.market_type);
    clauses.push(`market_type = $${params.length}`);
  }
  if (filters.iso_country) {
    params.push(filters.iso_country);
    clauses.push(`iso_country = $${params.length}`);
  }
  if (filters.is_regulated === "true") clauses.push("is_regulated = true");
  if (filters.is_regulated === "false") clauses.push("is_regulated = false");

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  return await query<Market>(
    `SELECT id, name, slug, market_type, iso_country, iso_subdivision,
            regulator_name, regulator_url, is_regulated, regulation_date,
            currency, tax_rate_igaming, tax_rate_osb, parent_market_id
     FROM markets
     ${where}
     ORDER BY name ASC
     LIMIT 500`,
    params,
  );
}

export async function getMarketBySlug(slug: string): Promise<Market | null> {
  return await queryOne<Market>(
    `SELECT id, name, slug, market_type, iso_country, iso_subdivision,
            regulator_name, regulator_url, is_regulated, regulation_date,
            currency, tax_rate_igaming, tax_rate_osb, parent_market_id
     FROM markets
     WHERE slug = $1`,
    [slug],
  );
}

export async function getMarketTypesWithCounts(): Promise<
  { market_type: string; count: number }[]
> {
  return await query(
    `SELECT market_type, COUNT(*)::int AS count
     FROM markets
     GROUP BY market_type
     ORDER BY count DESC`,
  );
}

export async function getMarketMetricsCanonical(
  marketId: string,
): Promise<MetricValueRow[]> {
  return await query<MetricValueRow>(
    `SELECT mvc.metric_value_id, mvc.entity_id, mvc.market_id,
            mvc.metric_id, m.code AS metric_code, m.display_name AS metric_display_name,
            m.unit_type AS metric_unit_type,
            mvc.period_id, p.code AS period_code, p.display_name AS period_display_name,
            p.start_date AS period_start, p.end_date AS period_end,
            mvc.report_id, mvc.source_type, mvc.value_numeric, mvc.value_text,
            mvc.currency, mvc.unit_multiplier, mvc.disclosure_status,
            mvc.confidence_score, mvc.published_timestamp
     FROM metric_value_canonical mvc
     JOIN metrics m ON m.id = mvc.metric_id
     JOIN periods p ON p.id = mvc.period_id
     WHERE mvc.market_id = $1 AND mvc.entity_id IS NULL
     ORDER BY m.category NULLS LAST, m.display_name, p.start_date DESC`,
    [marketId],
  );
}

export async function getMarketReports(
  marketId: string,
  limit = 25,
): Promise<Report[]> {
  return await query<Report>(
    `SELECT r.id, r.filename, r.document_type, r.published_timestamp,
            r.parse_status, r.metric_count, r.parser_version, r.parsed_at
     FROM reports r
     JOIN report_markets rm ON rm.report_id = r.id
     WHERE rm.market_id = $1
     ORDER BY r.published_timestamp DESC NULLS LAST
     LIMIT $2`,
    [marketId, limit],
  );
}

export async function getMarketTaxHistory(marketId: string) {
  return await query<{
    id: string;
    vertical: string | null;
    tax_rate: string;
    tax_basis: string | null;
    effective_from: string;
    effective_to: string | null;
    notes: string | null;
    source_url: string | null;
  }>(
    `SELECT id, vertical, tax_rate, tax_basis, effective_from, effective_to, notes, source_url
     FROM market_tax_history
     WHERE market_id = $1
     ORDER BY effective_from DESC`,
    [marketId],
  );
}

// ---------------------------------------------------------------------------
// M4: Country rollup — sum sub-market values per period for a metric.
// Used when a country has no native-row value for the selected metric but
// its children (states/provinces) do. Returns one row per country with a
// latest-period rollup, converted to EUR at the source-period FX rate.
//
// Returned rows are synthetic leaderboard rows: no spark, no YoY (would
// require the same rollup across the prior year — non-trivial; future work).
// The UI marks them with an explicit "rolled-up" chevron via `is_rollup`.
// ---------------------------------------------------------------------------

export interface CountryRollupRow {
  market_id: string;
  name: string;
  slug: string;
  market_type: string;
  iso_country: string | null;
  regulator_name: string | null;
  is_regulated: boolean | null;
  tax_rate_igaming: string | null;
  latest_value_eur: number | null;
  latest_period: string;
  latest_period_end: string | null;
  unit_type: string;
  child_count: number;
}

export async function getCountryRollupValues(opts: {
  metricCode: string;
}): Promise<CountryRollupRow[]> {
  return await query<CountryRollupRow>(
    `WITH child_sums AS (
       SELECT
         parent.id AS parent_id, parent.name, parent.slug, parent.market_type,
         parent.iso_country, parent.regulator_name, parent.is_regulated,
         parent.tax_rate_igaming::text AS tax_rate_igaming,
         p.code AS period_code, p.start_date, p.end_date::text AS end_date_t,
         m.unit_type,
         SUM(mvc.value_numeric *
             CASE
               WHEN mvc.unit_multiplier = 'billions' THEN 1000000000::numeric
               WHEN mvc.unit_multiplier = 'millions' THEN 1000000::numeric
               WHEN mvc.unit_multiplier = 'thousands' THEN 1000::numeric
               -- Defensive multiplier inference: parser sometimes drops
               -- unit_multiplier on currency rows (US-state online_ggr
               -- in particular). For metrics whose disclosed values
               -- are expected to be large monetary amounts, infer
               -- millions when the raw value sits in the 0.01..100k
               -- band that matches "stored in millions, multiplier
               -- dropped". Mirrors lib/format.ts inferUnitMultiplier.
               -- Parser fix tracked in COMPANY_AUDIT_PARSER_TODOS.md.
               WHEN mvc.unit_multiplier IS NULL
                    AND m.code IN (
                      'revenue','ngr','ggr','online_ggr','online_ngr',
                      'online_revenue','casino_ggr','casino_revenue',
                      'sportsbook_ggr','sportsbook_revenue','sportsbook_handle',
                      'sportsbook_turnover','lottery_revenue','ebitda',
                      'adjusted_ebitda','marketing_spend','market_cap',
                      'net_income','operating_profit','revenue_guidance',
                      'ebitda_guidance','b2b_revenue','b2c_revenue',
                      'other_revenue','customer_deposits','handle'
                    )
                    AND ABS(mvc.value_numeric) >= 0.01
                    AND ABS(mvc.value_numeric) < 100000
                 THEN 1000000::numeric
               ELSE 1::numeric
             END /
             COALESCE(NULLIF(fx.eur_rate::numeric, 0), 1)
         ) AS sum_eur,
         COUNT(DISTINCT child.id) AS children_in_period
       FROM markets parent
       JOIN markets child ON child.parent_market_id = parent.id
       JOIN metric_value_canonical mvc ON mvc.market_id = child.id AND mvc.entity_id IS NULL
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       LEFT JOIN LATERAL (
         SELECT f.eur_rate FROM fx_rates f
         WHERE f.currency_code = COALESCE(UPPER(mvc.currency), 'EUR')
           AND f.rate_date <= p.end_date
         ORDER BY f.rate_date DESC LIMIT 1
       ) fx ON true
       WHERE m.code = $1
         AND parent.market_type = 'country'
         AND mvc.value_numeric IS NOT NULL
       GROUP BY parent.id, parent.name, parent.slug, parent.market_type,
                parent.iso_country, parent.regulator_name, parent.is_regulated,
                parent.tax_rate_igaming, p.code, p.start_date, p.end_date, m.unit_type
     ),
     ranked AS (
       SELECT *, ROW_NUMBER() OVER (PARTITION BY parent_id ORDER BY start_date DESC) AS rn
       FROM child_sums
     )
     SELECT parent_id AS market_id, name, slug, market_type, iso_country,
            regulator_name, is_regulated, tax_rate_igaming,
            sum_eur::float8 AS latest_value_eur,
            period_code AS latest_period, end_date_t AS latest_period_end,
            unit_type, children_in_period::int AS child_count
     FROM ranked WHERE rn = 1
     ORDER BY sum_eur DESC NULLS LAST`,
    [opts.metricCode],
  );
}

// Returns set of market ids that have at least one child (country/region with
// sub-markets). Used by the Markets leaderboard to render a chevron indicator.
export async function getParentMarketIds(): Promise<Set<string>> {
  const rows = await query<{ parent_market_id: string }>(
    `SELECT DISTINCT parent_market_id FROM markets WHERE parent_market_id IS NOT NULL`,
  );
  return new Set(rows.map((r) => r.parent_market_id));
}

export async function getBeaconEstimatesForValues(
  metricValueIds: string[],
): Promise<Map<string, BeaconEstimate>> {
  if (metricValueIds.length === 0) return new Map();
  const rows = await query<BeaconEstimate>(
    `SELECT metric_value_id, methodology_code, model_version,
            confidence_score, confidence_band_low, confidence_band_high,
            methodology_notes, inputs
     FROM beacon_estimates
     WHERE metric_value_id = ANY($1::uuid[])`,
    [metricValueIds],
  );
  return new Map(rows.map((r) => [r.metric_value_id, r]));
}
