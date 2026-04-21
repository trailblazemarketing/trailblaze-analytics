import "server-only";
import { query } from "@/lib/db";

export interface PeriodRow {
  id: string;
  code: string;
  period_type: string;
  display_name: string | null;
  start_date: string;
  end_date: string;
  fiscal_year: number | null;
  quarter: number | null;
  val_count: number;
}

// All periods that have at least one metric_values row. Ordered newest first.
// Only returns periods with ≥5 rows so we don't surface one-off noise periods.
export async function listPopulatedPeriods(minRows = 5): Promise<PeriodRow[]> {
  return await query<PeriodRow>(
    `SELECT p.id, p.code, p.period_type, p.display_name,
            p.start_date, p.end_date, p.fiscal_year, p.quarter,
            COUNT(mv.id)::int AS val_count
     FROM periods p
     LEFT JOIN metric_values mv ON mv.period_id = p.id
     GROUP BY p.id
     HAVING COUNT(mv.id) >= $1
     ORDER BY p.start_date DESC, p.period_type`,
    [minRows],
  );
}

// Resolve a period by its code. Null if not found.
export async function getPeriodByCode(
  code: string,
): Promise<PeriodRow | null> {
  const rows = await query<PeriodRow>(
    `SELECT p.id, p.code, p.period_type, p.display_name,
            p.start_date, p.end_date, p.fiscal_year, p.quarter, 0 AS val_count
     FROM periods p
     WHERE p.code = $1
     LIMIT 1`,
    [code],
  );
  return rows[0] ?? null;
}

// Most recent period for a given dimension that has at least one metric value
// in any of the candidate metric codes. Used to default the period selector to
// a period that's *relevant to what's on screen* (e.g. the most recent quarter
// for which this entity reported revenue).
export async function mostRecentRelevantPeriod(opts: {
  metricCodes: string[];
  entityId?: string;
  marketId?: string;
}): Promise<PeriodRow | null> {
  const dimClause = opts.entityId
    ? "mvc.entity_id = $2 AND mvc.market_id IS NULL"
    : opts.marketId
    ? "mvc.market_id = $2 AND mvc.entity_id IS NULL"
    : "1=1";
  const params: unknown[] = [opts.metricCodes];
  if (opts.entityId) params.push(opts.entityId);
  else if (opts.marketId) params.push(opts.marketId);

  const rows = await query<PeriodRow>(
    `SELECT p.id, p.code, p.period_type, p.display_name,
            p.start_date, p.end_date, p.fiscal_year, p.quarter, 0 AS val_count
     FROM periods p
     JOIN metric_value_canonical mvc ON mvc.period_id = p.id
     JOIN metrics m ON m.id = mvc.metric_id
     WHERE m.code = ANY($1::text[])
       AND ${dimClause}
     ORDER BY p.start_date DESC
     LIMIT 1`,
    params,
  );
  return rows[0] ?? null;
}

// Group periods for the selector UI. Rules:
//   - Recent Quarters: last 6 quarter periods
//   - Trailing: ltm / ytd / half_year
//   - Full Years: full_year
//   - Monthly: month (recent 12)
export function groupPeriodsForSelector(rows: PeriodRow[]): {
  quarters: PeriodRow[];
  trailing: PeriodRow[];
  fullYears: PeriodRow[];
  months: PeriodRow[];
  other: PeriodRow[];
} {
  const quarters: PeriodRow[] = [];
  const trailing: PeriodRow[] = [];
  const fullYears: PeriodRow[] = [];
  const months: PeriodRow[] = [];
  const other: PeriodRow[] = [];
  for (const r of rows) {
    if (r.period_type === "quarter") quarters.push(r);
    else if (r.period_type === "month") months.push(r);
    else if (r.period_type === "full_year") fullYears.push(r);
    else if (
      r.period_type === "ltm" ||
      r.period_type === "half_year" ||
      r.period_type === "nine_months" ||
      r.period_type === "custom" ||
      r.period_type === "trading_update_window"
    )
      trailing.push(r);
    else other.push(r);
  }
  return {
    quarters: quarters.slice(0, 8),
    trailing: trailing.slice(0, 8),
    fullYears: fullYears.slice(0, 6),
    months: months.slice(0, 12),
    other: other.slice(0, 10),
  };
}
