import type { MetricValueRow } from "@/lib/types";
import { toRaw } from "@/lib/format";

// Pivot a flat list of MetricValueRows into the row-shape Recharts wants:
// one row per period, one column per series (entity slug or metric code).
export type PivotKeyFn = (v: MetricValueRow) => string;

export interface PivotResult {
  data: {
    period: string;
    period_start: string;
    [seriesKey: string]: string | number | null;
  }[];
  beaconFlags: Record<string, Set<string>>;
  series: { key: string; label: string }[];
}

export function pivotTimeseries(
  values: MetricValueRow[],
  seriesKeyFn: PivotKeyFn,
  seriesLabelFn: (v: MetricValueRow) => string,
): PivotResult {
  const periodMap = new Map<
    string,
    { period: string; period_start: string; [k: string]: string | number | null }
  >();
  const seriesMap = new Map<string, string>(); // key → label
  const beaconFlags: Record<string, Set<string>> = {};

  for (const v of values) {
    const seriesKey = seriesKeyFn(v);
    seriesMap.set(seriesKey, seriesLabelFn(v));

    if (!periodMap.has(v.period_code)) {
      periodMap.set(v.period_code, {
        period: v.period_code,
        period_start: v.period_start,
      });
    }
    const row = periodMap.get(v.period_code)!;

    const rawNumeric =
      v.value_numeric != null
        ? toRaw(Number(v.value_numeric), v.unit_multiplier)
        : null;

    row[seriesKey] = rawNumeric;

    if (
      v.disclosure_status === "beacon_estimate" ||
      v.disclosure_status === "derived"
    ) {
      if (!beaconFlags[seriesKey]) beaconFlags[seriesKey] = new Set();
      beaconFlags[seriesKey].add(v.period_code);
    }
  }

  const data = Array.from(periodMap.values()).sort((a, b) =>
    a.period_start.localeCompare(b.period_start),
  );
  const series = Array.from(seriesMap.entries()).map(([key, label]) => ({
    key,
    label,
  }));

  return { data, beaconFlags, series };
}
