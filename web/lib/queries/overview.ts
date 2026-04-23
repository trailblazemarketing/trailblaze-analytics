import "server-only";
import { query, queryOne } from "@/lib/db";

// Aggregations powering the redesigned Overview "command centre" page.
// All currency aggregates EUR-convert per source-period FX rate before
// summing — same convention as queries/analytics.ts.

export interface HeroKpiRow {
  code: string;
  label: string;
  subtitle?: string | null;
  value: number | null;
  valueFormatted: string;
  yoyPct: number | null;
}

// COMPANIES TRACKED — canonical entities (excludes auto_added_needs_review).
export async function countCanonicalEntities(): Promise<number> {
  const r = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n
     FROM entities
     WHERE is_active = true
       AND COALESCE(metadata->>'status','') <> 'auto_added_needs_review'`,
  );
  return r?.n ?? 0;
}

// MARKETS TRACKED — countries + US states (sub-country admin units).
export async function countTrackedMarkets(): Promise<{
  total: number;
  countries: number;
  states: number;
}> {
  const r = await queryOne<{ total: number; countries: number; states: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE market_type IN ('country','state','province','territory'))::int AS total,
       COUNT(*) FILTER (WHERE market_type = 'country')::int AS countries,
       COUNT(*) FILTER (WHERE market_type IN ('state','province','territory'))::int AS states
     FROM markets`,
  );
  return r ?? { total: 0, countries: 0, states: 0 };
}

// Sum the latest-period value per entity for a given metric, EUR-converted
// across all canonical entities. Used for "TOTAL REVENUE TRACKED" hero tile.
// Returns the EUR sum and the prior-year EUR sum for YoY computation; YoY
// only computed when both sides have meaningful coverage and the
// quarter-cadence prev exists for the same entity.
export async function sumLatestPerEntity(metricCode: string): Promise<{
  eur: number;
  prevEur: number | null;
  entityCount: number;
}> {
  const r = await queryOne<{
    eur: string | null;
    prev_eur: string | null;
    n: number;
  }>(
    `WITH per_entity AS (
       SELECT mvc.entity_id,
              mvc.value_numeric, mvc.unit_multiplier, mvc.currency,
              p.start_date, p.period_type, p.end_date,
              ROW_NUMBER() OVER (
                PARTITION BY mvc.entity_id
                ORDER BY p.start_date DESC
              ) AS rn,
              fx.eur_rate
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
         AND mvc.entity_id IS NOT NULL
         AND mvc.value_numeric IS NOT NULL
         AND e.is_active = true
         AND COALESCE(e.metadata->>'status','') <> 'auto_added_needs_review'
         AND p.period_type IN ('quarter','full_year','half_year','ltm')
     ),
     latest AS (SELECT * FROM per_entity WHERE rn = 1),
     prev AS (
       SELECT DISTINCT ON (pe.entity_id) pe.*
       FROM per_entity pe JOIN latest l ON l.entity_id = pe.entity_id
       WHERE pe.start_date <= (l.start_date - INTERVAL '270 days')::date
         AND pe.start_date >= (l.start_date - INTERVAL '430 days')::date
         AND pe.period_type = l.period_type
       ORDER BY pe.entity_id, pe.start_date DESC
     )
     SELECT
       SUM((latest.value_numeric / NULLIF(latest.eur_rate, 0)) *
           CASE latest.unit_multiplier
             WHEN 'billions' THEN 1000000000
             WHEN 'millions' THEN 1000000
             WHEN 'thousands' THEN 1000
             ELSE 1
           END)::text AS eur,
       (SELECT SUM((prev.value_numeric / NULLIF(prev.eur_rate, 0)) *
           CASE prev.unit_multiplier
             WHEN 'billions' THEN 1000000000
             WHEN 'millions' THEN 1000000
             WHEN 'thousands' THEN 1000
             ELSE 1
           END)::text FROM prev) AS prev_eur,
       COUNT(*)::int AS n
     FROM latest`,
    [metricCode],
  );
  return {
    eur: Number(r?.eur ?? 0),
    prevEur: r?.prev_eur != null ? Number(r.prev_eur) : null,
    entityCount: r?.n ?? 0,
  };
}

// Sum the latest-period value per market for a given metric, EUR-converted
// across all country-scope markets. Used for ONLINE/CASINO/SPORTSBOOK GGR
// hero tiles.
export async function sumLatestPerMarket(metricCode: string): Promise<{
  eur: number;
  prevEur: number | null;
  marketCount: number;
}> {
  const r = await queryOne<{
    eur: string | null;
    prev_eur: string | null;
    n: number;
  }>(
    `WITH per_market AS (
       SELECT mvc.market_id,
              mvc.value_numeric, mvc.unit_multiplier, mvc.currency,
              p.start_date, p.period_type, p.end_date,
              ROW_NUMBER() OVER (
                PARTITION BY mvc.market_id
                ORDER BY p.start_date DESC
              ) AS rn,
              fx.eur_rate
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       JOIN markets mk ON mk.id = mvc.market_id
       LEFT JOIN LATERAL (
         SELECT f.eur_rate FROM fx_rates f
         WHERE f.currency_code = COALESCE(UPPER(mvc.currency), 'EUR')
           AND f.rate_date <= p.end_date
         ORDER BY f.rate_date DESC LIMIT 1
       ) fx ON true
       WHERE m.code = $1
         AND mvc.entity_id IS NULL
         AND mvc.value_numeric IS NOT NULL
         AND mk.market_type = 'country'
         AND p.period_type IN ('quarter','full_year','half_year','ltm','month')
     ),
     latest AS (SELECT * FROM per_market WHERE rn = 1),
     prev AS (
       SELECT DISTINCT ON (pm.market_id) pm.*
       FROM per_market pm JOIN latest l ON l.market_id = pm.market_id
       WHERE pm.start_date <= (l.start_date - INTERVAL '270 days')::date
         AND pm.start_date >= (l.start_date - INTERVAL '430 days')::date
         AND pm.period_type = l.period_type
       ORDER BY pm.market_id, pm.start_date DESC
     )
     SELECT
       SUM((latest.value_numeric / NULLIF(latest.eur_rate, 0)) *
           CASE latest.unit_multiplier
             WHEN 'billions' THEN 1000000000
             WHEN 'millions' THEN 1000000
             WHEN 'thousands' THEN 1000
             ELSE 1
           END)::text AS eur,
       (SELECT SUM((prev.value_numeric / NULLIF(prev.eur_rate, 0)) *
           CASE prev.unit_multiplier
             WHEN 'billions' THEN 1000000000
             WHEN 'millions' THEN 1000000
             WHEN 'thousands' THEN 1000
             ELSE 1
           END)::text FROM prev) AS prev_eur,
       COUNT(*)::int AS n
     FROM latest`,
    [metricCode],
  );
  return {
    eur: Number(r?.eur ?? 0),
    prevEur: r?.prev_eur != null ? Number(r.prev_eur) : null,
    marketCount: r?.n ?? 0,
  };
}

// Treemap data: top N canonical entities by latest revenue, EUR-converted,
// with entity_type for colouring.
export interface TreemapEntity {
  id: string;
  slug: string;
  name: string;
  entityType: string | null;
  revenueEur: number;
  yoyPct: number | null;
}

export async function topEntitiesByRevenue(limit = 30): Promise<TreemapEntity[]> {
  const rows = await query<{
    id: string;
    slug: string;
    name: string;
    entity_type: string | null;
    eur: string;
    prev_eur: string | null;
  }>(
    `WITH per_entity AS (
       SELECT mvc.entity_id,
              mvc.value_numeric, mvc.unit_multiplier, mvc.currency,
              p.start_date, p.period_type, p.end_date,
              ROW_NUMBER() OVER (
                PARTITION BY mvc.entity_id
                ORDER BY p.start_date DESC
              ) AS rn,
              fx.eur_rate
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
         AND mvc.entity_id IS NOT NULL
         AND mvc.value_numeric IS NOT NULL
         AND e.is_active = true
         AND COALESCE(e.metadata->>'status','') <> 'auto_added_needs_review'
         AND p.period_type IN ('quarter','full_year','half_year','ltm')
     ),
     latest AS (SELECT * FROM per_entity WHERE rn = 1),
     prev AS (
       SELECT DISTINCT ON (pe.entity_id) pe.*
       FROM per_entity pe JOIN latest l ON l.entity_id = pe.entity_id
       WHERE pe.start_date <= (l.start_date - INTERVAL '270 days')::date
         AND pe.start_date >= (l.start_date - INTERVAL '430 days')::date
         AND pe.period_type = l.period_type
       ORDER BY pe.entity_id, pe.start_date DESC
     )
     SELECT e.id, e.slug, e.name,
            (SELECT et.code FROM entity_type_assignments eta
              JOIN entity_types et ON et.id = eta.entity_type_id
              WHERE eta.entity_id = e.id LIMIT 1) AS entity_type,
            ((latest.value_numeric / NULLIF(latest.eur_rate, 0)) *
             CASE latest.unit_multiplier
               WHEN 'billions' THEN 1000000000
               WHEN 'millions' THEN 1000000
               WHEN 'thousands' THEN 1000
               ELSE 1
             END)::text AS eur,
            ((prev.value_numeric / NULLIF(prev.eur_rate, 0)) *
             CASE prev.unit_multiplier
               WHEN 'billions' THEN 1000000000
               WHEN 'millions' THEN 1000000
               WHEN 'thousands' THEN 1000
               ELSE 1
             END)::text AS prev_eur
     FROM latest
     JOIN entities e ON e.id = latest.entity_id
     LEFT JOIN prev ON prev.entity_id = latest.entity_id
     ORDER BY ((latest.value_numeric / NULLIF(latest.eur_rate, 0)) *
               CASE latest.unit_multiplier
                 WHEN 'billions' THEN 1000000000
                 WHEN 'millions' THEN 1000000
                 WHEN 'thousands' THEN 1000
                 ELSE 1
               END) DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );
  return rows.map((r) => {
    const eur = Number(r.eur);
    const prev = r.prev_eur != null ? Number(r.prev_eur) : null;
    let yoy: number | null = null;
    if (prev != null && prev > 0) {
      const pct = ((eur - prev) / Math.abs(prev)) * 100;
      // Same ±80% sanity bound as the rest of the app — see commit b6d89ce
      if (Number.isFinite(pct) && Math.abs(pct) <= 80) yoy = pct;
    }
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      entityType: r.entity_type,
      revenueEur: eur,
      yoyPct: yoy,
    };
  });
}

// World-map data: country-scope markets with their latest online_ggr in EUR
// plus operator count and YoY (cadence-matched, ±80% clamp).
export interface CountryMapPoint {
  marketId: string;
  slug: string;
  name: string;
  isoCountry: string | null;
  onlineGgrEur: number | null;
  yoyPct: number | null;
  operatorCount: number;
  latestPeriodCode: string | null;
}

export async function countryMapPoints(): Promise<CountryMapPoint[]> {
  return await query<CountryMapPoint>(
    `WITH per_market AS (
       SELECT mvc.market_id, mk.slug, mk.name, mk.iso_country,
              mvc.value_numeric, mvc.unit_multiplier, mvc.currency,
              p.code AS period_code, p.start_date, p.period_type, p.end_date,
              ROW_NUMBER() OVER (
                PARTITION BY mvc.market_id
                ORDER BY p.start_date DESC
              ) AS rn,
              fx.eur_rate
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       JOIN markets mk ON mk.id = mvc.market_id
       LEFT JOIN LATERAL (
         SELECT f.eur_rate FROM fx_rates f
         WHERE f.currency_code = COALESCE(UPPER(mvc.currency), 'EUR')
           AND f.rate_date <= p.end_date
         ORDER BY f.rate_date DESC LIMIT 1
       ) fx ON true
       WHERE m.code = 'online_ggr'
         AND mvc.entity_id IS NULL
         AND mvc.value_numeric IS NOT NULL
         AND mk.market_type = 'country'
         AND p.period_type IN ('quarter','full_year','half_year','ltm','month')
     ),
     latest AS (SELECT * FROM per_market WHERE rn = 1),
     prev AS (
       SELECT DISTINCT ON (pm.market_id) pm.*
       FROM per_market pm JOIN latest l ON l.market_id = pm.market_id
       WHERE pm.start_date <= (l.start_date - INTERVAL '270 days')::date
         AND pm.start_date >= (l.start_date - INTERVAL '430 days')::date
         AND pm.period_type = l.period_type
       ORDER BY pm.market_id, pm.start_date DESC
     )
     SELECT latest.market_id AS "marketId", latest.slug, latest.name,
            latest.iso_country AS "isoCountry",
            ((latest.value_numeric / NULLIF(latest.eur_rate, 0)) *
             CASE latest.unit_multiplier
               WHEN 'billions' THEN 1000000000
               WHEN 'millions' THEN 1000000
               WHEN 'thousands' THEN 1000
               ELSE 1
             END)::float8 AS "onlineGgrEur",
            CASE
              WHEN prev.value_numeric IS NULL OR prev.eur_rate IS NULL THEN NULL
              ELSE LEAST(80.0, GREATEST(-80.0,
                (((latest.value_numeric / NULLIF(latest.eur_rate, 0)) *
                  CASE latest.unit_multiplier
                    WHEN 'billions' THEN 1000000000
                    WHEN 'millions' THEN 1000000
                    WHEN 'thousands' THEN 1000
                    ELSE 1
                  END)
                 - (prev.value_numeric / NULLIF(prev.eur_rate, 0)) *
                   CASE prev.unit_multiplier
                     WHEN 'billions' THEN 1000000000
                     WHEN 'millions' THEN 1000000
                     WHEN 'thousands' THEN 1000
                     ELSE 1
                   END
                ) / NULLIF(ABS((prev.value_numeric / NULLIF(prev.eur_rate, 0)) *
                   CASE prev.unit_multiplier
                     WHEN 'billions' THEN 1000000000
                     WHEN 'millions' THEN 1000000
                     WHEN 'thousands' THEN 1000
                     ELSE 1
                   END), 0) * 100
              ))
            END::float8 AS "yoyPct",
            (SELECT COUNT(DISTINCT mvc2.entity_id)::int
             FROM metric_value_canonical mvc2
             WHERE mvc2.market_id = latest.market_id
               AND mvc2.entity_id IS NOT NULL) AS "operatorCount",
            latest.period_code AS "latestPeriodCode"
     FROM latest
     LEFT JOIN prev ON prev.market_id = latest.market_id`,
  );
}

// Recent commentary cards: 3 most recent narratives from analyst-note
// sources. Card = entity name, date, first ~120 chars, "read more →" link.
export interface CommentaryCard {
  id: string;
  reportId: string;
  entityName: string | null;
  marketName: string | null;
  publishedAt: string | null;
  content: string;
}

export async function recentCommentaryCards(limit = 3): Promise<CommentaryCard[]> {
  return await query<CommentaryCard>(
    `SELECT n.id, n.report_id AS "reportId",
            e.name AS "entityName",
            mk.name AS "marketName",
            r.published_timestamp::text AS "publishedAt",
            n.content
     FROM narratives n
     JOIN reports r ON r.id = n.report_id
     LEFT JOIN entities e ON e.id = n.entity_id
     LEFT JOIN markets mk ON mk.id = n.market_id
     LEFT JOIN sources s ON s.id = r.source_id
     WHERE n.content IS NOT NULL AND length(trim(n.content)) > 60
       AND COALESCE(s.source_type,'') IN ('trailblaze_pdf','analyst_note','industry_trade')
     ORDER BY r.published_timestamp DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );
}

// Biggest movers: top N entities by abs(YoY%) within the post-Fix-A bounds
// (±80% clamp already applied, so this naturally excludes the suppressed
// implausible deltas). Includes both sign-positive and sign-negative.
export interface MoverRow {
  slug: string;
  name: string;
  revenueEur: number;
  yoyPct: number;
}

export async function biggestMovers(limit = 5): Promise<MoverRow[]> {
  const rows = await query<{
    slug: string;
    name: string;
    eur: string;
    yoy: string;
  }>(
    `WITH per_entity AS (
       SELECT mvc.entity_id,
              mvc.value_numeric, mvc.unit_multiplier, mvc.currency,
              p.start_date, p.period_type, p.end_date,
              ROW_NUMBER() OVER (
                PARTITION BY mvc.entity_id
                ORDER BY p.start_date DESC
              ) AS rn,
              fx.eur_rate
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
         AND mvc.entity_id IS NOT NULL
         AND mvc.value_numeric IS NOT NULL
         AND e.is_active = true
         AND COALESCE(e.metadata->>'status','') <> 'auto_added_needs_review'
         AND p.period_type IN ('quarter','full_year','half_year')
     ),
     latest AS (SELECT * FROM per_entity WHERE rn = 1),
     prev AS (
       SELECT DISTINCT ON (pe.entity_id) pe.*
       FROM per_entity pe JOIN latest l ON l.entity_id = pe.entity_id
       WHERE pe.start_date <= (l.start_date - INTERVAL '270 days')::date
         AND pe.start_date >= (l.start_date - INTERVAL '430 days')::date
         AND pe.period_type = l.period_type
       ORDER BY pe.entity_id, pe.start_date DESC
     )
     SELECT e.slug, e.name,
            ((latest.value_numeric / NULLIF(latest.eur_rate, 0)) *
             CASE latest.unit_multiplier
               WHEN 'billions' THEN 1000000000
               WHEN 'millions' THEN 1000000
               WHEN 'thousands' THEN 1000
               ELSE 1
             END)::text AS eur,
            (((latest.value_numeric / NULLIF(latest.eur_rate, 0)) *
              CASE latest.unit_multiplier
                WHEN 'billions' THEN 1000000000
                WHEN 'millions' THEN 1000000
                WHEN 'thousands' THEN 1000
                ELSE 1
              END
              - (prev.value_numeric / NULLIF(prev.eur_rate, 0)) *
                CASE prev.unit_multiplier
                  WHEN 'billions' THEN 1000000000
                  WHEN 'millions' THEN 1000000
                  WHEN 'thousands' THEN 1000
                  ELSE 1
                END
             ) / NULLIF(ABS((prev.value_numeric / NULLIF(prev.eur_rate, 0)) *
                CASE prev.unit_multiplier
                  WHEN 'billions' THEN 1000000000
                  WHEN 'millions' THEN 1000000
                  WHEN 'thousands' THEN 1000
                  ELSE 1
                END), 0) * 100)::text AS yoy
     FROM latest
     JOIN entities e ON e.id = latest.entity_id
     JOIN prev ON prev.entity_id = latest.entity_id`,
  );
  const withYoy = rows
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      revenueEur: Number(r.eur),
      yoyPct: Number(r.yoy),
    }))
    .filter((r) => Number.isFinite(r.yoyPct) && Math.abs(r.yoyPct) <= 80);
  withYoy.sort((a, b) => Math.abs(b.yoyPct) - Math.abs(a.yoyPct));
  return withYoy.slice(0, limit);
}
