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
