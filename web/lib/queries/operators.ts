import "server-only";
import { query } from "@/lib/db";

export interface HeatmapCell {
  entity_id: string;
  name: string;
  slug: string;
  ticker: string;
  latest_price: number | null;
  prev_price: number | null;
  day_change_pct: number | null;
  size_value: number | null; // market cap in EUR (for treemap size)
  size_currency: string | null;
  has_price: boolean;
  // For leaderboard (OP3)
  market_cap_eur: number | null;
  market_cap_native: number | null;
  market_cap_currency: string | null;
  ev_ebitda: number | null;
  native_price_currency: string | null;
}

// Listed operators with stock price, market cap, EV/EBITDA multiple, and
// sizing by market cap (EUR). Listed operators with no live price get a
// grey tile so they remain visible on the heatmap universe.
export async function getOperatorStockHeatmap(): Promise<HeatmapCell[]> {
  const rows = await query<{
    entity_id: string;
    name: string;
    slug: string;
    ticker: string;
    latest_price: string | null;
    prev_price: string | null;
    price_currency: string | null;
    mc_value: string | null;
    mc_multiplier: string | null;
    mc_currency: string | null;
    mc_eur_rate: string | null;
    evm: string | null;
  }>(
    `WITH price_ranked AS (
       SELECT mv.entity_id, mv.value_numeric::text AS price, mv.currency,
              p.start_date,
              ROW_NUMBER() OVER (PARTITION BY mv.entity_id ORDER BY p.start_date DESC) AS rn
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       JOIN periods p ON p.id = mv.period_id
       WHERE m.code = 'stock_price' AND mv.value_numeric IS NOT NULL
     ),
     mc_ranked AS (
       SELECT mv.entity_id, mv.value_numeric::text AS mc,
              mv.unit_multiplier, mv.currency AS mc_currency,
              p.end_date, fx.eur_rate::text AS eur_rate,
              ROW_NUMBER() OVER (PARTITION BY mv.entity_id ORDER BY p.start_date DESC) AS rn
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       JOIN periods p ON p.id = mv.period_id
       LEFT JOIN LATERAL (
         SELECT f.eur_rate FROM fx_rates f
         WHERE f.currency_code = COALESCE(UPPER(mv.currency), 'EUR')
           AND f.rate_date <= p.end_date
         ORDER BY f.rate_date DESC LIMIT 1
       ) fx ON true
       WHERE m.code = 'market_cap' AND mv.value_numeric IS NOT NULL
     ),
     ev_ranked AS (
       SELECT mv.entity_id, mv.value_numeric::text AS evm,
              ROW_NUMBER() OVER (PARTITION BY mv.entity_id ORDER BY mv.period_id DESC) AS rn
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       WHERE m.code = 'ev_ebitda_multiple' AND mv.value_numeric IS NOT NULL
     )
     SELECT e.id AS entity_id, e.name, e.slug, e.ticker,
            p1.price AS latest_price, p2.price AS prev_price,
            p1.currency AS price_currency,
            mc.mc AS mc_value, mc.unit_multiplier AS mc_multiplier,
            mc.mc_currency, mc.eur_rate AS mc_eur_rate,
            ev.evm AS evm
     FROM entities e
     JOIN entity_type_assignments eta ON eta.entity_id = e.id
     JOIN entity_types et ON et.id = eta.entity_type_id
     LEFT JOIN price_ranked p1 ON p1.entity_id = e.id AND p1.rn = 1
     LEFT JOIN price_ranked p2 ON p2.entity_id = e.id AND p2.rn = 2
     LEFT JOIN mc_ranked mc ON mc.entity_id = e.id AND mc.rn = 1
     LEFT JOIN ev_ranked ev ON ev.entity_id = e.id AND ev.rn = 1
     WHERE et.code = 'operator' AND e.ticker IS NOT NULL AND e.is_active = true
       AND (e.metadata->>'status' IS DISTINCT FROM 'auto_added_needs_review')
     ORDER BY e.name`,
  );

  return rows.map((r) => {
    const price = r.latest_price != null ? Number(r.latest_price) : null;
    const prev = r.prev_price != null ? Number(r.prev_price) : null;
    const dcp =
      price != null && prev != null && prev !== 0
        ? ((price - prev) / prev) * 100
        : null;

    const mcRaw = r.mc_value != null ? Number(r.mc_value) : null;
    const mult = r.mc_multiplier;
    const scale =
      mult === "billions"
        ? 1_000_000_000
        : mult === "millions"
        ? 1_000_000
        : mult === "thousands"
        ? 1_000
        : 1;
    const mcNative = mcRaw != null ? mcRaw * scale : null;
    const eurRate =
      r.mc_eur_rate != null && Number(r.mc_eur_rate) > 0
        ? Number(r.mc_eur_rate)
        : 1;
    const mcEur = mcNative != null ? mcNative / eurRate : null;

    return {
      entity_id: r.entity_id,
      name: r.name,
      slug: r.slug,
      ticker: r.ticker,
      latest_price: price,
      prev_price: prev,
      day_change_pct: dcp,
      size_value: mcEur,
      size_currency: "EUR",
      has_price: price != null,
      market_cap_eur: mcEur,
      market_cap_native: mcNative,
      market_cap_currency: r.mc_currency,
      ev_ebitda: r.evm != null ? Number(r.evm) : null,
      native_price_currency: r.price_currency,
    };
  });
}
