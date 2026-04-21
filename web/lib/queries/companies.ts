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
} = {}): Promise<Entity[]> {
  const clauses: string[] = ["e.is_active = true"];
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
