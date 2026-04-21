import "server-only";
import { query } from "@/lib/db";

export interface TickerRow {
  ticker: string;
  name: string;
  slug: string;
  price: number;
  currency: string | null;
  day_change_pct: number | null;
  period_code: string;
}

// Get the most recent stock price per ticker with a day-over-day change %.
export async function getTickerStrip(limit = 20): Promise<TickerRow[]> {
  const rows = await query<{
    ticker: string;
    name: string;
    slug: string;
    price: string;
    currency: string | null;
    period_code: string;
    prev_price: string | null;
  }>(
    `WITH ranked AS (
       SELECT e.ticker, e.name, e.slug, mv.value_numeric::text AS price,
              mv.currency, p.code AS period_code, p.start_date,
              ROW_NUMBER() OVER (PARTITION BY e.ticker ORDER BY p.start_date DESC) AS rn
       FROM metric_values mv
       JOIN entities e ON e.id = mv.entity_id
       JOIN periods p ON p.id = mv.period_id
       JOIN metrics m ON m.id = mv.metric_id
       WHERE m.code = 'stock_price'
         AND e.ticker IS NOT NULL
         AND e.is_active = true
         AND mv.value_numeric IS NOT NULL
     )
     SELECT latest.ticker, latest.name, latest.slug, latest.price,
            latest.currency, latest.period_code, prev.price AS prev_price
     FROM ranked latest
     LEFT JOIN ranked prev ON prev.ticker = latest.ticker AND prev.rn = 2
     WHERE latest.rn = 1
     ORDER BY latest.ticker
     LIMIT $1`,
    [limit],
  );

  return rows.map((r) => {
    const p = Number(r.price);
    const prev = r.prev_price != null ? Number(r.prev_price) : null;
    const day_change_pct =
      prev != null && prev !== 0 ? ((p - prev) / prev) * 100 : null;
    return {
      ticker: r.ticker,
      name: r.name,
      slug: r.slug,
      price: p,
      currency: r.currency,
      day_change_pct,
      period_code: r.period_code,
    };
  });
}
