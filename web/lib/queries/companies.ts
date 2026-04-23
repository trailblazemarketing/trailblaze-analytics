import "server-only";
import { query, queryOne } from "@/lib/db";
import type {
  Entity,
  MetricValueRow,
  Report,
  Narrative,
} from "@/lib/types";

// Pre-canonical entity-type codes we surface as chips.
// Actual codes come from the `entity_types` table; these are the common ones.
export const ENTITY_TYPE_CODES = [
  "operator",
  "affiliate",
  "b2b",
  "supplier",
  "platform",
  "media",
] as const;

export async function listCompanies(filters: {
  search?: string;
  entity_type?: string;
  country?: string;
  exchange?: string;
  include_pending?: boolean; // default false: hide auto_added_needs_review
} = {}): Promise<Entity[]> {
  const clauses: string[] = ["e.is_active = true"];
  if (!filters.include_pending) {
    clauses.push(
      "(e.metadata->>'status' IS DISTINCT FROM 'auto_added_needs_review')",
    );
  }
  const params: unknown[] = [];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    const n = params.length;
    clauses.push(
      `(e.name ILIKE $${n} OR e.slug ILIKE $${n} OR e.ticker ILIKE $${n})`,
    );
  }
  if (filters.country) {
    params.push(filters.country);
    clauses.push(`e.headquarters_country = $${params.length}`);
  }
  if (filters.exchange) {
    params.push(filters.exchange);
    clauses.push(`e.exchange = $${params.length}`);
  }

  let typeFilter = "";
  if (filters.entity_type) {
    params.push(filters.entity_type);
    typeFilter = `AND EXISTS (
      SELECT 1 FROM entity_type_assignments eta
      JOIN entity_types et ON et.id = eta.entity_type_id
      WHERE eta.entity_id = e.id AND et.code = $${params.length}
    )`;
  }

  const where = `WHERE ${clauses.join(" AND ")} ${typeFilter}`;

  const rows = await query<Entity & { entity_type_codes: string[] | null }>(
    `SELECT e.id, e.name, e.slug, e.ticker, e.exchange, e.country_of_listing,
            e.headquarters_country, e.description, e.is_active,
            COALESCE(
              (SELECT array_agg(et.code ORDER BY et.code)
               FROM entity_type_assignments eta
               JOIN entity_types et ON et.id = eta.entity_type_id
               WHERE eta.entity_id = e.id),
              ARRAY[]::text[]
            ) AS entity_type_codes
     FROM entities e
     ${where}
     ORDER BY e.name ASC
     LIMIT 500`,
    params,
  );

  return rows.map((r) => ({ ...r, entity_type_codes: r.entity_type_codes ?? [] }));
}

export async function getCompanyBySlug(slug: string): Promise<Entity | null> {
  const row = await queryOne<Entity & { entity_type_codes: string[] | null }>(
    `SELECT e.id, e.name, e.slug, e.ticker, e.exchange, e.country_of_listing,
            e.headquarters_country, e.description, e.is_active,
            COALESCE(
              (SELECT array_agg(et.code ORDER BY et.code)
               FROM entity_type_assignments eta
               JOIN entity_types et ON et.id = eta.entity_type_id
               WHERE eta.entity_id = e.id),
              ARRAY[]::text[]
            ) AS entity_type_codes
     FROM entities e
     WHERE e.slug = $1`,
    [slug],
  );
  if (!row) return null;
  return { ...row, entity_type_codes: row.entity_type_codes ?? [] };
}

// Best-effort alias lookup for a slug that didn't match canonical.
// Used by the company detail page to redirect URLs like
// /companies/flutter-entertainment → /companies/flutter when the
// long-form slug is not the canonical one. Tries:
//   1. The entity's `aliases` text[] column (if any are seeded)
//   2. Name-normalised match: e.g. "flutter-entertainment" → match
//      WHERE lower(regexp_replace(name, '[^a-z0-9]+', '-', 'gi')) = $1
// Returns just the canonical slug + name so the caller can redirect
// without paying for the full entity load.
export async function findCanonicalSlugForAlias(
  alias: string,
): Promise<{ slug: string; name: string } | null> {
  const aliasMatch = await queryOne<{ slug: string; name: string }>(
    `SELECT slug, name FROM entities
     WHERE is_active = true AND $1 = ANY(aliases)
     LIMIT 1`,
    [alias],
  );
  if (aliasMatch) return aliasMatch;
  // Name-normalised lookup. Postgres regex_replace lowercase + collapse
  // non-alphanumeric to "-". Trim leading/trailing hyphens to mirror
  // standard slugify output. Returns the row whose normalised name
  // equals the requested alias.
  const nameMatch = await queryOne<{ slug: string; name: string }>(
    `SELECT slug, name FROM entities
     WHERE is_active = true
       AND trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) = $1
     ORDER BY length(name) ASC
     LIMIT 1`,
    [alias.toLowerCase()],
  );
  return nameMatch;
}

export async function getCompanyMetricsCanonical(
  entityId: string,
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
     WHERE mvc.entity_id = $1
     ORDER BY m.category NULLS LAST, m.display_name, p.start_date DESC`,
    [entityId],
  );
}

export async function getCompanyReports(
  entityId: string,
  limit = 25,
): Promise<Report[]> {
  return await query<Report>(
    `SELECT r.id, r.filename, r.document_type, r.published_timestamp,
            r.parse_status, r.metric_count, r.parser_version, r.parsed_at
     FROM reports r
     JOIN report_entities re ON re.report_id = r.id
     WHERE re.entity_id = $1
     ORDER BY r.published_timestamp DESC NULLS LAST
     LIMIT $2`,
    [entityId, limit],
  );
}

export async function getCompanyNarratives(
  entityId: string,
): Promise<Narrative[]> {
  return await query<Narrative>(
    `SELECT n.id, n.report_id, n.entity_id, n.market_id, n.section_code, n.content
     FROM narratives n
     JOIN reports r ON r.id = n.report_id
     WHERE n.entity_id = $1
     ORDER BY r.published_timestamp DESC NULLS LAST
     LIMIT 30`,
    [entityId],
  );
}

export async function getEntityTypeCountsAll(): Promise<
  { code: string; count: number }[]
> {
  return await query(
    `SELECT et.code, COUNT(DISTINCT eta.entity_id)::int AS count
     FROM entity_types et
     LEFT JOIN entity_type_assignments eta ON eta.entity_type_id = et.id
     LEFT JOIN entities e ON e.id = eta.entity_id AND e.is_active = true
     GROUP BY et.code
     ORDER BY count DESC, et.code`,
  );
}

// C1 + C2 (T2 polish 3): aggregate KPIs for the Companies index.
// Primary row (C1):
//   total_companies, combined_revenue_eur, weighted_ebitda_margin, listed/private
// Secondary row (C2 — industry snapshot):
//   total_active_customers   — Σ latest active_customers disclosed per entity
//   blended_arpu_eur         — Σ(revenue_eur) / Σ(active_customers) for entities with both
//   top5_concentration_pct   — sum(top-5 revenue_eur) / sum(all revenue_eur) * 100
//   companies_reporting      — count of entities with at least one metric_value
//                              in the latest quarter/half/full-year period
export async function getCompaniesAggregateKpis(): Promise<{
  total_companies: number;
  combined_revenue_eur: number | null;
  weighted_ebitda_margin: number | null;
  listed: number;
  private_count: number;
  total_active_customers: number | null;
  blended_arpu_eur: number | null;
  top5_concentration_pct: number | null;
  companies_reporting: number;
}> {
  const rows = await query<{
    total: number;
    listed: number;
    private_count: number;
    combined_rev_eur: string | null;
    weighted_margin: string | null;
    total_active_customers: string | null;
    blended_arpu_eur: string | null;
    top5_concentration_pct: string | null;
    companies_reporting: number;
  }>(
    `WITH latest_rev AS (
       -- Hero "Total Combined Revenue (LTM)" must align with the table
       -- TOTAL further down the page. Both use the same canonical
       -- entity set: is_active = true AND status != auto_added_needs_review.
       -- Restricted to revenue only (was previously revenue OR ngr,
       -- which inflated the sum for entities that disclose both).
       SELECT DISTINCT ON (mvc.entity_id) mvc.entity_id,
              mvc.value_numeric, mvc.unit_multiplier, mvc.currency,
              p.end_date,
              fx.eur_rate::numeric AS eur_rate
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       JOIN entities e ON e.id = mvc.entity_id
       LEFT JOIN LATERAL (
         SELECT f.eur_rate FROM fx_rates f
         WHERE f.currency_code = COALESCE(UPPER(mvc.currency), 'EUR')
           AND f.rate_date <= p.end_date
         ORDER BY f.rate_date DESC LIMIT 1
       ) fx ON true
       WHERE m.code = 'revenue'
         AND mvc.entity_id IS NOT NULL AND mvc.market_id IS NULL
         AND e.is_active = true
         AND COALESCE(e.metadata->>'status','') <> 'auto_added_needs_review'
         AND mvc.value_numeric IS NOT NULL
         AND mvc.disclosure_status = 'disclosed'
         AND p.period_type IN ('quarter','half_year','full_year','ltm')
       ORDER BY mvc.entity_id, p.start_date DESC
     ),
     latest_margin AS (
       SELECT DISTINCT ON (mvc.entity_id) mvc.entity_id,
              mvc.value_numeric AS margin_pct
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       JOIN entities e ON e.id = mvc.entity_id
       WHERE m.code = 'ebitda_margin'
         AND mvc.entity_id IS NOT NULL AND mvc.market_id IS NULL
         AND e.is_active = true
         AND COALESCE(e.metadata->>'status','') <> 'auto_added_needs_review'
         AND mvc.value_numeric IS NOT NULL
         AND mvc.disclosure_status = 'disclosed'
       ORDER BY mvc.entity_id, p.start_date DESC
     ),
     rev_in_eur AS (
       SELECT lr.entity_id,
              (lr.value_numeric *
                CASE lr.unit_multiplier
                  WHEN 'billions' THEN 1000000000
                  WHEN 'millions' THEN 1000000
                  WHEN 'thousands' THEN 1000
                  ELSE 1
                END / NULLIF(lr.eur_rate, 0)) AS rev_eur
       FROM latest_rev lr
     )
     ,
     latest_cust AS (
       SELECT DISTINCT ON (mvc.entity_id) mvc.entity_id,
              (mvc.value_numeric *
                CASE mvc.unit_multiplier
                  WHEN 'billions' THEN 1000000000
                  WHEN 'millions' THEN 1000000
                  WHEN 'thousands' THEN 1000
                  ELSE 1
                END) AS customers
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       JOIN entities e ON e.id = mvc.entity_id
       WHERE m.code = 'active_customers'
         AND mvc.entity_id IS NOT NULL AND mvc.market_id IS NULL
         AND e.is_active = true
         AND COALESCE(e.metadata->>'status','') <> 'auto_added_needs_review'
         AND mvc.value_numeric IS NOT NULL
         AND mvc.disclosure_status = 'disclosed'
       ORDER BY mvc.entity_id, p.start_date DESC
     ),
     top5 AS (
       SELECT COALESCE(SUM(rev_eur), 0) AS top5_sum
       FROM (
         SELECT rev_eur FROM rev_in_eur
         WHERE rev_eur IS NOT NULL
         ORDER BY rev_eur DESC NULLS LAST LIMIT 5
       ) t5
     ),
     -- "Companies reporting this period" was previously the count of
     -- entities with a metric_value at the EXACT MAX(start_date) — too
     -- strict (only 3 entities had reported the absolute latest period
     -- when ~28 had reported within the last cohort window). Loosen
     -- to: distinct canonical entities with any disclosed metric_value
     -- within the last 180 days. Aligned with the table's "active
     -- companies" set (is_active + non-pending).
     latest_period AS (
       SELECT MAX(p.start_date) AS dt
       FROM periods p
       WHERE p.period_type IN ('quarter','half_year','full_year','ltm')
         AND EXISTS (
           SELECT 1 FROM metric_value_canonical mvc
           WHERE mvc.period_id = p.id AND mvc.entity_id IS NOT NULL
         )
     ),
     reporting_window AS (
       SELECT COUNT(DISTINCT mvc.entity_id)::int AS n
       FROM metric_value_canonical mvc
       JOIN periods p ON p.id = mvc.period_id
       JOIN entities e ON e.id = mvc.entity_id
       WHERE mvc.entity_id IS NOT NULL
         AND e.is_active = true
         AND COALESCE(e.metadata->>'status','') <> 'auto_added_needs_review'
         AND mvc.disclosure_status = 'disclosed'
         AND p.start_date >= (CURRENT_DATE - INTERVAL '180 days')::date
     )
     SELECT
       (SELECT COUNT(*)::int FROM entities
         WHERE is_active = true
           AND (metadata->>'status' IS DISTINCT FROM 'auto_added_needs_review')) AS total,
       (SELECT COUNT(*)::int FROM entities
         WHERE is_active = true AND ticker IS NOT NULL
           AND (metadata->>'status' IS DISTINCT FROM 'auto_added_needs_review')) AS listed,
       (SELECT COUNT(*)::int FROM entities
         WHERE is_active = true AND ticker IS NULL
           AND (metadata->>'status' IS DISTINCT FROM 'auto_added_needs_review')) AS private_count,
       (SELECT SUM(rev_eur)::text FROM rev_in_eur) AS combined_rev_eur,
       (SELECT (SUM(lm.margin_pct * re.rev_eur) / NULLIF(SUM(re.rev_eur), 0))::text
          FROM latest_margin lm JOIN rev_in_eur re ON re.entity_id = lm.entity_id) AS weighted_margin,
       (SELECT SUM(customers)::text FROM latest_cust) AS total_active_customers,
       (SELECT (SUM(re.rev_eur) / NULLIF(SUM(lc.customers), 0))::text
          FROM rev_in_eur re JOIN latest_cust lc ON lc.entity_id = re.entity_id) AS blended_arpu_eur,
       (SELECT ((SELECT top5_sum FROM top5) / NULLIF(SUM(rv.rev_eur), 0) * 100)::text
          FROM rev_in_eur rv) AS top5_concentration_pct,
       (SELECT n FROM reporting_window) AS companies_reporting`,
  );
  const r = rows[0];
  return {
    total_companies: r?.total ?? 0,
    combined_revenue_eur: r?.combined_rev_eur ? Number(r.combined_rev_eur) : null,
    weighted_ebitda_margin: r?.weighted_margin ? Number(r.weighted_margin) : null,
    listed: r?.listed ?? 0,
    private_count: r?.private_count ?? 0,
    total_active_customers: r?.total_active_customers
      ? Number(r.total_active_customers)
      : null,
    blended_arpu_eur: r?.blended_arpu_eur ? Number(r.blended_arpu_eur) : null,
    top5_concentration_pct: r?.top5_concentration_pct
      ? Number(r.top5_concentration_pct)
      : null,
    companies_reporting: r?.companies_reporting ?? 0,
  };
}
