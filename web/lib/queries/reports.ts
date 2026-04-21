import "server-only";
import { query, queryOne } from "@/lib/db";
import type { Report, MetricValueRow, Narrative } from "@/lib/types";

export async function listRecentReports(limit = 25): Promise<
  (Report & {
    entity_names: string[] | null;
    market_names: string[] | null;
  })[]
> {
  return await query(
    `SELECT r.id, r.filename, r.document_type, r.published_timestamp,
            r.parse_status, r.metric_count, r.parser_version, r.parsed_at,
            (SELECT array_agg(e.name ORDER BY e.name)
             FROM report_entities re JOIN entities e ON e.id = re.entity_id
             WHERE re.report_id = r.id) AS entity_names,
            (SELECT array_agg(m.name ORDER BY m.name)
             FROM report_markets rm JOIN markets m ON m.id = rm.market_id
             WHERE rm.report_id = r.id) AS market_names
     FROM reports r
     WHERE r.parse_status <> 'failed'
     ORDER BY r.published_timestamp DESC NULLS LAST, r.parsed_at DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );
}

export async function getDiscrepancies(limit = 10) {
  return await query<{
    entity_id: string | null;
    market_id: string | null;
    metric_id: string;
    period_id: string;
    entity_name: string | null;
    entity_slug: string | null;
    market_name: string | null;
    market_slug: string | null;
    metric_display_name: string;
    metric_code: string;
    period_code: string;
    min_value: string;
    max_value: string;
    variance_pct: string;
    source_count: number;
  }>(
    `SELECT d.entity_id, d.market_id, d.metric_id, d.period_id,
            e.name AS entity_name, e.slug AS entity_slug,
            mk.name AS market_name, mk.slug AS market_slug,
            m.display_name AS metric_display_name, m.code AS metric_code,
            p.code AS period_code,
            d.min_value, d.max_value, d.variance_pct, d.source_count
     FROM metric_value_discrepancies d
     JOIN metrics m ON m.id = d.metric_id
     JOIN periods p ON p.id = d.period_id
     LEFT JOIN entities e ON e.id = d.entity_id
     LEFT JOIN markets mk ON mk.id = d.market_id
     ORDER BY d.variance_pct DESC
     LIMIT $1`,
    [limit],
  );
}

export async function getReportById(id: string): Promise<Report | null> {
  return await queryOne<Report>(
    `SELECT r.id, r.filename, r.document_type, r.published_timestamp,
            r.parse_status, r.metric_count, r.parser_version, r.parsed_at
     FROM reports r
     WHERE r.id = $1`,
    [id],
  );
}

export async function getReportMetricValues(
  reportId: string,
  limit = 500,
): Promise<MetricValueRow[]> {
  return await query<MetricValueRow>(
    `SELECT mv.id AS metric_value_id, mv.entity_id, mv.market_id,
            mv.metric_id, m.code AS metric_code, m.display_name AS metric_display_name,
            m.unit_type AS metric_unit_type,
            mv.period_id, p.code AS period_code, p.display_name AS period_display_name,
            p.start_date AS period_start, p.end_date AS period_end,
            mv.report_id, s.source_type, mv.value_numeric, mv.value_text,
            mv.currency, mv.unit_multiplier, mv.disclosure_status,
            mv.confidence_score, NULL::timestamptz AS published_timestamp
     FROM metric_values mv
     JOIN metrics m ON m.id = mv.metric_id
     JOIN periods p ON p.id = mv.period_id
     JOIN sources s ON s.id = mv.source_id
     WHERE mv.report_id = $1
     ORDER BY m.category NULLS LAST, m.display_name, p.start_date DESC
     LIMIT $2`,
    [reportId, limit],
  );
}

export async function getReportNarratives(
  reportId: string,
  limit = 200,
): Promise<Narrative[]> {
  return await query<Narrative>(
    `SELECT id, report_id, entity_id, market_id, section_code, content
     FROM narratives
     WHERE report_id = $1
     ORDER BY section_code
     LIMIT $2`,
    [reportId, limit],
  );
}

export async function getReportAssociations(reportId: string) {
  const [entities, markets] = await Promise.all([
    query<{ id: string; name: string; slug: string; is_primary: boolean }>(
      `SELECT e.id, e.name, e.slug, re.is_primary_subject AS is_primary
       FROM report_entities re JOIN entities e ON e.id = re.entity_id
       WHERE re.report_id = $1
       ORDER BY re.is_primary_subject DESC, e.name`,
      [reportId],
    ),
    query<{ id: string; name: string; slug: string; is_primary: boolean }>(
      `SELECT m.id, m.name, m.slug, rm.is_primary_subject AS is_primary
       FROM report_markets rm JOIN markets m ON m.id = rm.market_id
       WHERE rm.report_id = $1
       ORDER BY rm.is_primary_subject DESC, m.name`,
      [reportId],
    ),
  ]);
  return { entities, markets };
}

export async function listReports(
  filters: {
    document_type?: string;
    parse_status?: string;
    search?: string;
  } = {},
  limit = 200,
) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.document_type) {
    params.push(filters.document_type);
    clauses.push(`document_type = $${params.length}`);
  }
  if (filters.parse_status) {
    params.push(filters.parse_status);
    clauses.push(`parse_status = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    clauses.push(`filename ILIKE $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(limit);
  return await query<Report>(
    `SELECT id, filename, document_type, published_timestamp, parse_status,
            metric_count, parser_version, parsed_at
     FROM reports
     ${where}
     ORDER BY published_timestamp DESC NULLS LAST, parsed_at DESC NULLS LAST
     LIMIT $${params.length}`,
    params,
  );
}
