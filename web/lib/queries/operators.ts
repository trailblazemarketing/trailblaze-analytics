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
  size_value: number | null; // latest revenue in EUR (for treemap size)
  size_currency: string | null;
  has_price: boolean;
}

// Listed operators with stock price (when available) and a size metric
// (latest revenue in EUR) for the treemap. We always include every listed
// operator — if there's no price, the tile shows grey so the company is
// still visible on the map.
export async function getOperatorStockHeatmap(): Promise<HeatmapCell[]> {
  const rows = await query<{
    entity_id: string;
    name: string;
    slug: string;
    ticker: string;
    latest_price: string | null;
    prev_price: string | null;
    rev_value: string | null;
    rev_multiplier: string | null;
    rev_currency: string | null;
    rev_eur_rate: string | null;
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
     rev_ranked AS (
       SELECT mvc.entity_id, mvc.value_numeric::text AS rev,
              mvc.unit_multiplier, mvc.currency AS rev_currency,
              p.end_date, fx.eur_rate::text AS eur_rate,
              ROW_NUMBER() OVER (PARTITION BY mvc.entity_id ORDER BY p.start_date DESC) AS rn
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       LEFT JOIN LATERAL (
         SELECT f.eur_rate FROM fx_rates f
         WHERE f.currency_code = COALESCE(UPPER(mvc.currency), 'EUR')
           AND f.rate_date <= p.end_date
         ORDER BY f.rate_date DESC LIMIT 1
       ) fx ON true
       WHERE m.code = 'revenue' AND mvc.market_id IS NULL AND mvc.value_numeric IS NOT NULL
     )
     SELECT e.id AS entity_id, e.name, e.slug, e.ticker,
            p1.price AS latest_price, p2.price AS prev_price,
            r.rev AS rev_value, r.unit_multiplier AS rev_multiplier,
            r.rev_currency, r.eur_rate AS rev_eur_rate
     FROM entities e
     JOIN entity_type_assignments eta ON eta.entity_id = e.id
     JOIN entity_types et ON et.id = eta.entity_type_id
     LEFT JOIN price_ranked p1 ON p1.entity_id = e.id AND p1.rn = 1
     LEFT JOIN price_ranked p2 ON p2.entity_id = e.id AND p2.rn = 2
     LEFT JOIN rev_ranked r ON r.entity_id = e.id AND r.rn = 1
     WHERE et.code = 'operator' AND e.ticker IS NOT NULL AND e.is_active = true
     ORDER BY e.name`,
  );

  return rows.map((r) => {
    const price = r.latest_price != null ? Number(r.latest_price) : null;
    const prev = r.prev_price != null ? Number(r.prev_price) : null;
    const dcp =
      price != null && prev != null && prev !== 0
        ? ((price - prev) / prev) * 100
        : null;

    // Convert revenue to EUR for tile size
    const revRaw = r.rev_value != null ? Number(r.rev_value) : null;
    const mult = r.rev_multiplier;
    const scale =
      mult === "billions"
        ? 1_000_000_000
        : mult === "millions"
        ? 1_000_000
        : mult === "thousands"
        ? 1_000
        : 1;
    const revNative = revRaw != null ? revRaw * scale : null;
    const eurRate =
      r.rev_eur_rate != null && Number(r.rev_eur_rate) > 0
        ? Number(r.rev_eur_rate)
        : 1;
    const revEur = revNative != null ? revNative / eurRate : null;

    return {
      entity_id: r.entity_id,
      name: r.name,
      slug: r.slug,
      ticker: r.ticker,
      latest_price: price,
      prev_price: prev,
      day_change_pct: dcp,
      size_value: revEur,
      size_currency: "EUR",
      has_price: price != null,
    };
  });
}
