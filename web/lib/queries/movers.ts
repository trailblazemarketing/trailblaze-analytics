import "server-only";
import { query } from "@/lib/db";

export interface MoverRow {
  entity_id: string;
  slug: string;
  name: string;
  value_pct: number | null; // YoY % or absolute margin %, depending on source
  latest_display: string | null;
  period_code: string | null;
}

// Biggest Revenue Growers: entities with largest YoY % change on `revenue`
// (or NGR fallback), over the most recent disclosed period that has a prior
// year companion. Gates: both sides disclosed, apples-to-apples currency.
export async function getBiggestRevenueGrowers(limit = 6): Promise<MoverRow[]> {
  const rows = await query<{
    entity_id: string;
    slug: string;
    name: string;
    yoy_pct: string | null;
    latest_value: string | null;
    latest_mult: string | null;
    latest_ccy: string | null;
    latest_eur: string | null;
    period_code: string;
  }>(
    `WITH scoped AS (
       SELECT mvc.entity_id, mvc.value_numeric, mvc.unit_multiplier, mvc.currency,
              mvc.disclosure_status,
              p.start_date, p.end_date, p.code AS period_code,
              fx.eur_rate::numeric AS eur_rate,
              ROW_NUMBER() OVER (
                PARTITION BY mvc.entity_id, p.start_date
                ORDER BY CASE mvc.disclosure_status WHEN 'disclosed' THEN 1 ELSE 2 END
              ) AS drn
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
       WHERE m.code IN ('revenue', 'ngr')
         AND mvc.entity_id IS NOT NULL AND mvc.market_id IS NULL
         AND e.is_active = true
         AND (e.metadata->>'status' IS DISTINCT FROM 'auto_added_needs_review')
         AND mvc.disclosure_status = 'disclosed'
         AND p.period_type IN ('quarter','half_year','full_year','ltm')
     ),
     per_entity AS (
       SELECT s.*, ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY start_date DESC) AS rn
       FROM scoped s WHERE drn = 1
     )
     SELECT e.id AS entity_id, e.slug, e.name,
            (100.0 * (
               (cur.value_numeric / NULLIF(cur.eur_rate::numeric, 0)) -
               (prev.value_numeric / NULLIF(prev.eur_rate::numeric, 0))
             ) / NULLIF(ABS(prev.value_numeric / NULLIF(prev.eur_rate::numeric, 0)), 0))::text AS yoy_pct,
            cur.value_numeric::text AS latest_value,
            cur.unit_multiplier AS latest_mult,
            cur.currency AS latest_ccy,
            cur.eur_rate AS latest_eur,
            cur.period_code
     FROM entities e
     JOIN per_entity cur ON cur.entity_id = e.id AND cur.rn = 1
     JOIN per_entity prev ON prev.entity_id = e.id
       AND prev.start_date <= (cur.start_date - INTERVAL '330 days')::date
       AND prev.start_date >= (cur.start_date - INTERVAL '400 days')::date
       AND prev.rn = (SELECT MIN(rn) FROM per_entity WHERE entity_id = e.id AND
                      start_date <= (cur.start_date - INTERVAL '330 days')::date
                      AND start_date >= (cur.start_date - INTERVAL '400 days')::date)
     WHERE cur.value_numeric IS NOT NULL AND prev.value_numeric IS NOT NULL
       AND prev.value_numeric <> 0
     ORDER BY (
       (cur.value_numeric / NULLIF(cur.eur_rate, 0)) -
       (prev.value_numeric / NULLIF(prev.eur_rate, 0))
     ) / NULLIF(ABS(prev.value_numeric / NULLIF(prev.eur_rate, 0)), 0) DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    entity_id: r.entity_id,
    slug: r.slug,
    name: r.name,
    value_pct:
      r.yoy_pct != null && Number.isFinite(Number(r.yoy_pct))
        ? Math.max(-500, Math.min(500, Number(r.yoy_pct)))
        : null,
    latest_display: null,
    period_code: r.period_code,
  }));
}

// Margin Expansion Leaders: entities with the largest YoY *change* in
// `ebitda_margin` percentage points (pp), over the most recent reported
// period that has a prior year companion. Sign-agnostic description — the
// chart shows ↑ for positive expansion.
export async function getMarginExpansionLeaders(limit = 6): Promise<MoverRow[]> {
  const rows = await query<{
    entity_id: string;
    slug: string;
    name: string;
    pp_change: string | null;
    latest_value: string | null;
    period_code: string;
  }>(
    `WITH scoped AS (
       SELECT mvc.entity_id, mvc.value_numeric, mvc.disclosure_status,
              p.start_date, p.code AS period_code,
              ROW_NUMBER() OVER (
                PARTITION BY mvc.entity_id, p.start_date
                ORDER BY CASE mvc.disclosure_status WHEN 'disclosed' THEN 1 ELSE 2 END
              ) AS drn
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       JOIN entities e ON e.id = mvc.entity_id
       WHERE m.code = 'ebitda_margin'
         AND mvc.entity_id IS NOT NULL AND mvc.market_id IS NULL
         AND e.is_active = true
         AND (e.metadata->>'status' IS DISTINCT FROM 'auto_added_needs_review')
         AND p.period_type IN ('quarter','half_year','full_year','ltm')
     ),
     per_entity AS (
       SELECT s.*, ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY start_date DESC) AS rn
       FROM scoped s WHERE drn = 1
     )
     SELECT e.id AS entity_id, e.slug, e.name,
            (cur.value_numeric - prev.value_numeric)::text AS pp_change,
            cur.value_numeric::text AS latest_value,
            cur.period_code
     FROM entities e
     JOIN per_entity cur ON cur.entity_id = e.id AND cur.rn = 1
     JOIN per_entity prev ON prev.entity_id = e.id
       AND prev.start_date <= (cur.start_date - INTERVAL '330 days')::date
       AND prev.start_date >= (cur.start_date - INTERVAL '400 days')::date
       AND prev.rn = (SELECT MIN(rn) FROM per_entity WHERE entity_id = e.id AND
                      start_date <= (cur.start_date - INTERVAL '330 days')::date
                      AND start_date >= (cur.start_date - INTERVAL '400 days')::date)
     WHERE cur.value_numeric IS NOT NULL AND prev.value_numeric IS NOT NULL
     ORDER BY (cur.value_numeric - prev.value_numeric) DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    entity_id: r.entity_id,
    slug: r.slug,
    name: r.name,
    value_pct:
      r.pp_change != null && Number.isFinite(Number(r.pp_change))
        ? Number(r.pp_change)
        : null,
    latest_display:
      r.latest_value != null ? `${Number(r.latest_value).toFixed(1)}%` : null,
    period_code: r.period_code,
  }));
}

// Recent Commentary: latest narratives from Investment View / Forecast &
// Strategy sections, truncated to 1 line per row. Entity-scoped preferred;
// otherwise fall back to any narrative.
export async function getRecentCommentary(limit = 5) {
  // Dedup the same narrative content appearing across multiple
  // source reports — same problem as recentCommentaryCards in
  // queries/overview. md5 hash of the leading 200 chars (whitespace-
  // collapsed) partitions duplicates; the most-recent published
  // timestamp wins per (entity_or_self, body_hash) bucket.
  return await query<{
    narrative_id: string;
    section_code: string;
    content: string;
    entity_name: string | null;
    entity_slug: string | null;
    report_id: string;
    published_timestamp: string | null;
  }>(
    `WITH ranked AS (
       SELECT n.id, n.section_code, n.content, n.entity_id, n.report_id,
              r.published_timestamp,
              ROW_NUMBER() OVER (
                PARTITION BY
                  COALESCE(n.entity_id, n.id),
                  md5(
                    regexp_replace(
                      trim(substring(n.content from 1 for 200)),
                      '\\s+', ' ', 'g'
                    )
                  )
                ORDER BY r.published_timestamp DESC NULLS LAST, n.id
              ) AS dup_rn
       FROM narratives n
       JOIN reports r ON r.id = n.report_id
       WHERE n.section_code IN ('investment_view','forecast_strategy')
     )
     SELECT ranked.id AS narrative_id, ranked.section_code, ranked.content,
            e.name AS entity_name, e.slug AS entity_slug,
            ranked.report_id, ranked.published_timestamp
     FROM ranked
     LEFT JOIN entities e ON e.id = ranked.entity_id
     WHERE ranked.dup_rn = 1
     ORDER BY ranked.published_timestamp DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );
}
