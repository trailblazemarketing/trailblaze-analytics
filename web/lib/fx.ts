import "server-only";
import { query } from "@/lib/db";

// Core conversion rule: ECB quotes "1 EUR = rate <ccy>".
// To convert a native amount into EUR: eur = native / rate.
// For EUR source → rate = 1 → eur = native. (Seeded that way.)

// Get the FX rate for a currency on or before a given date.
// Falls back to the nearest-earlier date if the exact date isn't published.
export async function getEurRateOnOrBefore(
  currency: string,
  onOrBefore: string,
): Promise<number | null> {
  const rows = await query<{ eur_rate: string }>(
    `SELECT eur_rate::text
     FROM fx_rates
     WHERE currency_code = $1 AND rate_date <= $2::date
     ORDER BY rate_date DESC
     LIMIT 1`,
    [currency.toUpperCase(), onOrBefore],
  );
  if (rows.length === 0) return null;
  return Number(rows[0].eur_rate);
}

// Batch lookup — map of (currency, date) → rate. Efficient when many values.
export async function getEurRatesMap(
  pairs: { currency: string; date: string }[],
): Promise<Map<string, number>> {
  if (pairs.length === 0) return new Map();
  const unique = Array.from(
    new Set(pairs.map((p) => `${p.currency.toUpperCase()}|${p.date}`)),
  ).map((s) => {
    const [currency, date] = s.split("|");
    return { currency, date };
  });

  const rows = await query<{
    currency_code: string;
    rate_date: string;
    eur_rate: string;
  }>(
    `SELECT DISTINCT ON (q.currency_code, q.rate_date)
            q.currency_code, q.rate_date::text, f.eur_rate::text
     FROM (SELECT unnest($1::text[]) AS currency_code,
                  unnest($2::date[]) AS rate_date) q
     JOIN LATERAL (
       SELECT eur_rate FROM fx_rates
       WHERE currency_code = q.currency_code AND rate_date <= q.rate_date
       ORDER BY rate_date DESC LIMIT 1
     ) f ON true`,
    [unique.map((u) => u.currency), unique.map((u) => u.date)],
  );

  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(`${r.currency_code}|${r.rate_date}`, Number(r.eur_rate));
  }
  return map;
}

// Synchronous conversion — call with a rate you already fetched.
export function convertToEur(
  nativeAmount: number,
  rate: number | null | undefined,
): number | null {
  if (rate == null || rate === 0) return null;
  return nativeAmount / rate;
}

// Reusable SQL snippet: JOIN a fx_rates lookup on (currency, end_date).
// Use in queries that need to expose an `eur_value` column. Pattern:
//   SELECT ..., mv.value_numeric, mv.currency,
//          mv.value_numeric / NULLIF(fx.eur_rate, 0) AS eur_per_unit,
//          fx.eur_rate AS eur_rate_used
//   FROM metric_values mv
//   LEFT JOIN LATERAL (
//     SELECT eur_rate FROM fx_rates
//     WHERE currency_code = COALESCE(UPPER(mv.currency), 'EUR')
//       AND rate_date <= p.end_date
//     ORDER BY rate_date DESC LIMIT 1
//   ) fx ON mv.currency IS NOT NULL
//
// Always remember to multiply by unit_multiplier scale AFTER conversion or
// leave the native unit_multiplier and let formatters handle the scale.

export const FX_LATERAL_JOIN = `
  LEFT JOIN LATERAL (
    SELECT f.eur_rate
    FROM fx_rates f
    WHERE f.currency_code = COALESCE(UPPER(mv.currency), 'EUR')
      AND f.rate_date <= p.end_date
    ORDER BY f.rate_date DESC
    LIMIT 1
  ) fx ON true
`;
