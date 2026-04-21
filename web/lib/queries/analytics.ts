import "server-only";
import { query } from "@/lib/db";
import type {
  MetricValueRow,
  SourceType,
  DisclosureStatus,
  UnitMultiplier,
  UnitType,
} from "@/lib/types";
import { toRaw } from "@/lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanonicalRow {
  metric_value_id: string;
  entity_id: string | null;
  market_id: string | null;
  metric_id: string;
  metric_code: string;
  metric_display_name: string;
  metric_unit_type: UnitType;
  period_id: string;
  period_code: string;
  period_display_name: string | null;
  period_start: string;
  period_end: string;
  period_type: string;
  fiscal_year: number | null;
  quarter: number | null;
  report_id: string | null;
  source_type: SourceType;
  value_numeric: string | null;
  value_text: string | null;
  currency: string | null;
  unit_multiplier: UnitMultiplier;
  disclosure_status: DisclosureStatus;
  confidence_score: string | null;
  published_timestamp: string | null;
  eur_rate: string | null; // fx rate at period_end
}

// ---------------------------------------------------------------------------
// Scorecard: per-entity / per-market series for a set of metric codes
// ---------------------------------------------------------------------------

export async function getScorecardSeries(
  opts:
    | { entityId: string; metricCodes: string[] }
    | { marketId: string; metricCodes: string[] },
): Promise<Map<string, CanonicalRow[]>> {
  const isEntity = "entityId" in opts;
  const dimId = isEntity ? opts.entityId : opts.marketId;
  const dimCol = isEntity ? "entity_id" : "market_id";
  const otherNull = isEntity ? "mvc.market_id IS NULL" : "mvc.entity_id IS NULL";

  const rows = await query<CanonicalRow>(
    `SELECT mvc.metric_value_id, mvc.entity_id, mvc.market_id, mvc.metric_id,
            m.code AS metric_code, m.display_name AS metric_display_name,
            m.unit_type AS metric_unit_type,
            mvc.period_id, p.code AS period_code, p.display_name AS period_display_name,
            p.start_date AS period_start, p.end_date AS period_end,
            p.period_type, p.fiscal_year, p.quarter,
            mvc.report_id, mvc.source_type, mvc.value_numeric, mvc.value_text,
            mvc.currency, mvc.unit_multiplier, mvc.disclosure_status,
            mvc.confidence_score, mvc.published_timestamp,
            fx.eur_rate::text AS eur_rate
     FROM metric_value_canonical mvc
     JOIN metrics m ON m.id = mvc.metric_id
     JOIN periods p ON p.id = mvc.period_id
     LEFT JOIN LATERAL (
       SELECT f.eur_rate FROM fx_rates f
       WHERE f.currency_code = COALESCE(UPPER(mvc.currency), 'EUR')
         AND f.rate_date <= p.end_date
       ORDER BY f.rate_date DESC LIMIT 1
     ) fx ON true
     WHERE mvc.${dimCol} = $1 AND ${otherNull}
       AND m.code = ANY($2::text[])
     ORDER BY m.code, p.start_date DESC
     LIMIT 2000`,
    [dimId, opts.metricCodes],
  );

  const byCode = new Map<string, CanonicalRow[]>();
  for (const r of rows) {
    if (!byCode.has(r.metric_code)) byCode.set(r.metric_code, []);
    byCode.get(r.metric_code)!.push(r);
  }
  return byCode;
}

// ---------------------------------------------------------------------------
// Entity leaderboard — with DEDUP via DISTINCT ON, EUR values, period filter
// ---------------------------------------------------------------------------

export interface LeaderboardRowRaw {
  entity_id: string;
  name: string;
  slug: string;
  ticker: string | null;
  exchange: string | null;
  latest_value: string | null;
  unit_multiplier: UnitMultiplier;
  currency: string | null;
  disclosure_status: DisclosureStatus;
  source_type: SourceType;
  latest_period: string;
  latest_period_end: string | null;
  latest_eur_rate: string | null;
  unit_type: UnitType;
  prev_year_value: string | null;
  prev_year_multiplier: UnitMultiplier;
  prev_year_currency: string | null;
  prev_year_eur_rate: string | null;
  prev_year_period_end: string | null;
  prev_year_disclosure: DisclosureStatus | null;
  spark_raw:
    | {
        value_numeric: string | null;
        unit_multiplier: UnitMultiplier;
        currency: string | null;
        eur_rate: string | null;
        disclosure_status: DisclosureStatus;
        start_date: string;
        period_code: string;
      }[]
    | null;
  entity_type_codes: string[] | null;
}

export async function getEntityLeaderboard(opts: {
  metricCode: string;
  entityTypeCode?: string;
  marketSlug?: string;
  periodCode?: string | null;
  limit?: number;
  sparkLen?: number;
}): Promise<LeaderboardRowRaw[]> {
  const sparkLen = opts.sparkLen ?? 8;

  const marketJoin = opts.marketSlug
    ? `AND mvc.market_id = (SELECT id FROM markets WHERE slug = $3)`
    : `AND mvc.market_id IS NULL`;

  const typeFilter = opts.entityTypeCode
    ? `AND EXISTS (
         SELECT 1 FROM entity_type_assignments eta
         JOIN entity_types et ON et.id = eta.entity_type_id
         WHERE eta.entity_id = e.id AND et.code = $${opts.marketSlug ? 4 : 3}
       )`
    : "";

  const params: unknown[] = [opts.metricCode, sparkLen];
  if (opts.marketSlug) params.push(opts.marketSlug);
  if (opts.entityTypeCode) params.push(opts.entityTypeCode);

  // Period filter — when set, pin the "latest" to this period; otherwise newest available
  const periodParamIdx = params.length + 1;
  if (opts.periodCode) params.push(opts.periodCode);
  const periodFilter = opts.periodCode
    ? `AND p.code = $${periodParamIdx}`
    : "";

  // Dedup: within scoped rows, pick exactly one row per entity using ROW_NUMBER
  // over (entity_id, period start desc, source precedence). If period is pinned,
  // we only include that period and still take 1 per entity.
  const sql = `
    WITH scoped AS (
      SELECT mvc.entity_id, mvc.metric_id, mvc.period_id,
             mvc.value_numeric, mvc.unit_multiplier, mvc.currency,
             mvc.disclosure_status, mvc.source_type,
             p.start_date, p.end_date, p.code AS period_code,
             m.unit_type, m.code AS metric_code,
             fx.eur_rate::text AS eur_rate,
             ROW_NUMBER() OVER (
               PARTITION BY mvc.entity_id, p.start_date
               ORDER BY
                 CASE mvc.source_type
                   WHEN 'trailblaze_pdf' THEN 1
                   WHEN 'regulator_filing' THEN 2
                   WHEN 'sec_filing' THEN 3
                   WHEN 'company_ir' THEN 4
                   WHEN 'beacon_estimate' THEN 9
                   ELSE 5
                 END,
                 CASE mvc.disclosure_status
                   WHEN 'disclosed' THEN 1
                   WHEN 'derived' THEN 2
                   WHEN 'partially_disclosed' THEN 3
                   WHEN 'beacon_estimate' THEN 4
                   ELSE 5
                 END
             ) AS dedup_rn
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
      WHERE m.code = $1
        AND e.is_active = true
        ${marketJoin}
        ${typeFilter}
        ${periodFilter}
        AND mvc.entity_id IS NOT NULL
    ),
    per_entity AS (
      SELECT s.*,
             ROW_NUMBER() OVER (
               PARTITION BY entity_id
               ORDER BY start_date DESC
             ) AS rn
      FROM scoped s
      WHERE s.dedup_rn = 1
    )
    SELECT e.id AS entity_id, e.name, e.slug, e.ticker, e.exchange,
           latest.value_numeric::text AS latest_value,
           latest.unit_multiplier, latest.currency,
           latest.disclosure_status, latest.source_type,
           latest.period_code AS latest_period,
           latest.end_date::text AS latest_period_end,
           latest.eur_rate AS latest_eur_rate,
           latest.unit_type,
           prev.value_numeric::text AS prev_year_value,
           prev.unit_multiplier AS prev_year_multiplier,
           prev.currency AS prev_year_currency,
           prev.eur_rate AS prev_year_eur_rate,
           prev.end_date::text AS prev_year_period_end,
           prev.disclosure_status AS prev_year_disclosure,
           (SELECT json_agg(to_jsonb(sp.*)) FROM (
             SELECT value_numeric, unit_multiplier, currency, eur_rate, disclosure_status, start_date, period_code
             FROM per_entity pe WHERE pe.entity_id = e.id AND pe.rn <= $2
             ORDER BY start_date ASC
           ) sp) AS spark_raw,
           (SELECT array_agg(et.code) FROM entity_type_assignments eta
            JOIN entity_types et ON et.id = eta.entity_type_id
            WHERE eta.entity_id = e.id) AS entity_type_codes
    FROM entities e
    JOIN per_entity latest ON latest.entity_id = e.id AND latest.rn = 1
    LEFT JOIN per_entity prev ON prev.entity_id = e.id
      AND prev.start_date <= (latest.start_date - INTERVAL '330 days')::date
      AND prev.start_date >= (latest.start_date - INTERVAL '400 days')::date
      AND prev.rn = (SELECT MIN(rn) FROM per_entity WHERE entity_id = e.id AND
                     start_date <= (latest.start_date - INTERVAL '330 days')::date
                     AND start_date >= (latest.start_date - INTERVAL '400 days')::date)
    WHERE e.is_active = true
    ORDER BY (latest.value_numeric / NULLIF(latest.eur_rate::numeric, 0) * COALESCE(
      CASE latest.unit_multiplier
        WHEN 'billions' THEN 1000000000
        WHEN 'millions' THEN 1000000
        WHEN 'thousands' THEN 1000
        ELSE 1
      END, 1)) DESC NULLS LAST
    LIMIT ${opts.limit ?? 25}
  `;

  return await query<LeaderboardRowRaw>(sql, params);
}

// ---------------------------------------------------------------------------
// Market leaderboard — same dedup + EUR treatment
// ---------------------------------------------------------------------------

export interface MarketLeaderboardRawRow {
  market_id: string;
  name: string;
  slug: string;
  market_type: string;
  iso_country: string | null;
  regulator_name: string | null;
  is_regulated: boolean | null;
  tax_rate_igaming: string | null;
  latest_value: string | null;
  unit_multiplier: UnitMultiplier;
  currency: string | null;
  disclosure_status: DisclosureStatus;
  source_type: SourceType;
  latest_period: string;
  latest_period_end: string | null;
  latest_eur_rate: string | null;
  unit_type: UnitType;
  prev_year_value: string | null;
  prev_year_multiplier: UnitMultiplier;
  prev_year_currency: string | null;
  prev_year_eur_rate: string | null;
  prev_year_period_end: string | null;
  prev_year_disclosure: DisclosureStatus | null;
  spark_raw:
    | {
        value_numeric: string | null;
        unit_multiplier: UnitMultiplier;
        currency: string | null;
        eur_rate: string | null;
        disclosure_status: DisclosureStatus;
        start_date: string;
        period_code: string;
      }[]
    | null;
  operator_count: number;
  beacon_coverage_pct: number | null;
}

export async function getMarketLeaderboard(opts: {
  metricCode: string;
  periodCode?: string | null;
  sparkLen?: number;
  limit?: number;
  marketType?: string | null;
}): Promise<MarketLeaderboardRawRow[]> {
  const sparkLen = opts.sparkLen ?? 8;
  const params: unknown[] = [opts.metricCode, sparkLen];
  let idx = 3;
  const periodFilter = opts.periodCode
    ? (params.push(opts.periodCode), `AND p.code = $${idx++}`)
    : "";
  const typeFilter = opts.marketType
    ? (params.push(opts.marketType), `AND mk.market_type = $${idx++}`)
    : "";

  const sql = `
    WITH scoped AS (
      SELECT mvc.market_id, mvc.period_id, mvc.value_numeric, mvc.unit_multiplier,
             mvc.currency, mvc.disclosure_status, mvc.source_type,
             p.start_date, p.end_date, p.code AS period_code,
             m.unit_type, m.code AS metric_code,
             fx.eur_rate::text AS eur_rate,
             ROW_NUMBER() OVER (
               PARTITION BY mvc.market_id, p.start_date
               ORDER BY
                 CASE mvc.source_type
                   WHEN 'trailblaze_pdf' THEN 1
                   WHEN 'regulator_filing' THEN 2
                   WHEN 'sec_filing' THEN 3
                   WHEN 'company_ir' THEN 4
                   ELSE 5
                 END,
                 CASE mvc.disclosure_status
                   WHEN 'disclosed' THEN 1
                   WHEN 'derived' THEN 2
                   ELSE 3
                 END
             ) AS dedup_rn
      FROM metric_value_canonical mvc
      JOIN metrics m ON m.id = mvc.metric_id
      JOIN periods p ON p.id = mvc.period_id
      LEFT JOIN LATERAL (
        SELECT f.eur_rate FROM fx_rates f
        WHERE f.currency_code = COALESCE(UPPER(mvc.currency), 'EUR')
          AND f.rate_date <= p.end_date
        ORDER BY f.rate_date DESC LIMIT 1
      ) fx ON true
      WHERE m.code = $1
        AND mvc.market_id IS NOT NULL
        AND mvc.entity_id IS NULL
        ${periodFilter}
    ),
    per_market AS (
      SELECT s.*,
             ROW_NUMBER() OVER (
               PARTITION BY market_id
               ORDER BY start_date DESC
             ) AS rn
      FROM scoped s
      WHERE s.dedup_rn = 1
    )
    SELECT mk.id AS market_id, mk.name, mk.slug, mk.market_type, mk.iso_country,
           mk.regulator_name, mk.is_regulated, mk.tax_rate_igaming::text,
           latest.value_numeric::text AS latest_value, latest.unit_multiplier,
           latest.currency, latest.disclosure_status, latest.source_type,
           latest.period_code AS latest_period,
           latest.end_date::text AS latest_period_end,
           latest.eur_rate AS latest_eur_rate,
           latest.unit_type,
           prev.value_numeric::text AS prev_year_value,
           prev.unit_multiplier AS prev_year_multiplier,
           prev.currency AS prev_year_currency,
           prev.eur_rate AS prev_year_eur_rate,
           prev.end_date::text AS prev_year_period_end,
           prev.disclosure_status AS prev_year_disclosure,
           (SELECT json_agg(to_jsonb(sp.*)) FROM (
             SELECT value_numeric, unit_multiplier, currency, eur_rate, disclosure_status, start_date, period_code
             FROM per_market pm WHERE pm.market_id = mk.id AND pm.rn <= $2
             ORDER BY start_date ASC
           ) sp) AS spark_raw,
           (SELECT COUNT(DISTINCT mvc2.entity_id)::int
            FROM metric_value_canonical mvc2
            WHERE mvc2.market_id = mk.id AND mvc2.entity_id IS NOT NULL) AS operator_count,
           (SELECT ROUND(
              100.0 * SUM(CASE WHEN mvc3.disclosure_status IN ('beacon_estimate','derived') THEN 1 ELSE 0 END) /
              NULLIF(COUNT(*), 0), 1)::float
            FROM metric_value_canonical mvc3
            WHERE mvc3.market_id = mk.id) AS beacon_coverage_pct
    FROM markets mk
    JOIN per_market latest ON latest.market_id = mk.id AND latest.rn = 1
    LEFT JOIN per_market prev ON prev.market_id = mk.id
      AND prev.start_date <= (latest.start_date - INTERVAL '330 days')::date
      AND prev.start_date >= (latest.start_date - INTERVAL '400 days')::date
      AND prev.rn = (SELECT MIN(rn) FROM per_market WHERE market_id = mk.id AND
                     start_date <= (latest.start_date - INTERVAL '330 days')::date
                     AND start_date >= (latest.start_date - INTERVAL '400 days')::date)
    WHERE 1=1 ${typeFilter}
    ORDER BY (latest.value_numeric / NULLIF(latest.eur_rate::numeric, 0) * COALESCE(
      CASE latest.unit_multiplier
        WHEN 'billions' THEN 1000000000
        WHEN 'millions' THEN 1000000
        WHEN 'thousands' THEN 1000
        ELSE 1
      END, 1)) DESC NULLS LAST
    LIMIT ${opts.limit ?? 25}
  `;

  return await query<MarketLeaderboardRawRow>(sql, params);
}

// ---------------------------------------------------------------------------
// Time matrix — rows across multiple periods
// ---------------------------------------------------------------------------

export async function getTimeMatrix(opts: {
  metricCode: string;
  periods: string[];
  entityIds?: string[];
  marketIds?: string[];
}): Promise<
  (MetricValueRow & {
    eur_rate: string | null;
    period_end: string;
  })[]
> {
  const byDim: string[] = [];
  const params: unknown[] = [opts.metricCode, opts.periods];
  let pIdx = 3;
  if (opts.entityIds && opts.entityIds.length > 0) {
    params.push(opts.entityIds);
    byDim.push(`mvc.entity_id = ANY($${pIdx++}::uuid[])`);
  }
  if (opts.marketIds && opts.marketIds.length > 0) {
    params.push(opts.marketIds);
    byDim.push(`mvc.market_id = ANY($${pIdx++}::uuid[])`);
  }
  if (byDim.length === 0) return [];

  return await query(
    `SELECT mvc.metric_value_id, mvc.entity_id, mvc.market_id, mvc.metric_id,
            m.code AS metric_code, m.display_name AS metric_display_name,
            m.unit_type AS metric_unit_type,
            mvc.period_id, p.code AS period_code, p.display_name AS period_display_name,
            p.start_date AS period_start, p.end_date AS period_end,
            mvc.report_id, mvc.source_type, mvc.value_numeric, mvc.value_text,
            mvc.currency, mvc.unit_multiplier, mvc.disclosure_status,
            mvc.confidence_score, mvc.published_timestamp,
            fx.eur_rate::text AS eur_rate
     FROM metric_value_canonical mvc
     JOIN metrics m ON m.id = mvc.metric_id
     JOIN periods p ON p.id = mvc.period_id
     LEFT JOIN LATERAL (
       SELECT f.eur_rate FROM fx_rates f
       WHERE f.currency_code = COALESCE(UPPER(mvc.currency), 'EUR')
         AND f.rate_date <= p.end_date
       ORDER BY f.rate_date DESC LIMIT 1
     ) fx ON true
     WHERE m.code = $1 AND p.code = ANY($2::text[])
       AND (${byDim.join(" OR ")})
     ORDER BY p.start_date ASC`,
    params,
  );
}

export async function getMostRecentPeriods(limit = 12): Promise<
  {
    code: string;
    display_name: string | null;
    start_date: string;
    period_type: string;
  }[]
> {
  return await query(
    `SELECT code, display_name, start_date, period_type
     FROM periods
     WHERE period_type IN ('quarter','month','full_year','half_year','ltm')
     ORDER BY start_date DESC
     LIMIT $1`,
    [limit],
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toRawNumeric(
  v: string | null,
  mult: UnitMultiplier,
): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return toRaw(n, mult);
}

// Convert a native-currency amount to EUR using the provided fx rate.
// ECB convention: 1 EUR = rate (native). So eur = native / rate.
export function nativeToEur(
  v: string | null,
  mult: UnitMultiplier,
  rate: string | null,
): number | null {
  const raw = toRawNumeric(v, mult);
  if (raw == null) return null;
  if (rate == null) return null;
  const r = Number(rate);
  if (!Number.isFinite(r) || r === 0) return null;
  return raw / r;
}

// Gated YoY: both sides must be present, disclosed, and apples-to-apples.
// Returns null when any precondition fails — the UI then shows em-dash.
export function yoyPctGated(opts: {
  cur: string | null;
  curMult: UnitMultiplier;
  curCcy: string | null;
  curRate: string | null;
  curDisclosure: DisclosureStatus;
  prev: string | null;
  prevMult: UnitMultiplier;
  prevCcy: string | null;
  prevRate: string | null;
  prevDisclosure: DisclosureStatus | null;
  unitType: UnitType;
}): number | null {
  // Both sides must be disclosed
  if (opts.curDisclosure !== "disclosed" || opts.prevDisclosure !== "disclosed")
    return null;
  if (opts.cur == null || opts.prev == null) return null;

  // For currency metrics, compare in EUR; for others compare raw
  const isCurrency = opts.unitType === "currency";
  const cur = isCurrency
    ? nativeToEur(opts.cur, opts.curMult, opts.curRate)
    : toRawNumeric(opts.cur, opts.curMult);
  const prev = isCurrency
    ? nativeToEur(opts.prev, opts.prevMult, opts.prevRate)
    : toRawNumeric(opts.prev, opts.prevMult);

  if (cur == null || prev == null) return null;
  if (Math.abs(prev) < 0.01) return null; // divide-by-zero guard

  const pct = ((cur - prev) / Math.abs(prev)) * 100;

  // Sanity: suppress absurd outliers that nearly always indicate a unit or
  // segment mismatch. Real YoYs are rarely beyond ±500%.
  if (!Number.isFinite(pct)) return null;
  if (Math.abs(pct) > 500) return null;

  return pct;
}
