// Adapters: raw SQL rows → primitive-ready row shapes.

import type { LeaderboardRow } from "@/components/primitives/leaderboard";
import type {
  LeaderboardRowRaw,
  MarketLeaderboardRawRow,
} from "@/lib/queries/analytics";
import {
  nativeToEur,
  toRawNumeric,
  yoyPctGated,
} from "@/lib/queries/analytics";
import { formatEur, formatNative } from "@/lib/format";
import { nativeToEurInferred } from "@/lib/queries/analytics";
import type { UnitType, UnitMultiplier } from "@/lib/types";

// Format a scalar for display. Monetary → EUR abbreviated; others use their
// natural unit.
function displayValue(opts: {
  eurValue: number | null;
  rawValue: number | null;
  unit: UnitType;
}): string {
  if (opts.unit === "currency") {
    if (opts.eurValue == null) return "—";
    return formatEur(opts.eurValue);
  }
  if (opts.rawValue == null) return "—";
  if (opts.unit === "percentage") return `${opts.rawValue.toFixed(1)}%`;
  if (opts.unit === "ratio") return opts.rawValue.toFixed(2);
  // count
  const abs = Math.abs(opts.rawValue);
  const sign = opts.rawValue < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function nativeTooltip(opts: {
  value: string | null;
  mult: UnitMultiplier;
  currency: string | null;
  rate: string | null;
  unit: UnitType;
}): string | null {
  if (opts.unit !== "currency") return null;
  if (opts.value == null || !opts.currency) return null;
  const raw = toRawNumeric(opts.value, opts.mult);
  if (raw == null) return null;
  const nat = formatNative(raw, opts.currency);
  if (opts.rate) {
    const r = Number(opts.rate);
    return `${nat} @ ${r.toFixed(4)} ${opts.currency}/EUR`;
  }
  return nat;
}

// Batch-aware detection: when the MEDIAN raw value_numeric in this set of
// leaderboard rows already sits in the 10^5–10^8 band, the rows are stored
// as RAW currency units (e.g. NJ DGE regulator output: FanDuel =
// 62_683_138 USD). A tiny outlier in the same batch (Betinia =
// 4_873 USD) was being re-interpreted by inferUnitMultiplier as "millions"
// and inflated to $4.87B, poisoning `totalEur` and crushing every other
// operator's share to ~1%. When the batch clearly stores raw units, we
// must suppress the per-row millions inference — the NULL multiplier is
// correct in that context.
function rawDollarScale(rows: LeaderboardRowRaw[]): boolean {
  const vals: number[] = [];
  for (const r of rows) {
    if (r.unit_type !== "currency") continue;
    if (r.latest_value == null) continue;
    // Only consider rows where the multiplier is absent — those are the
    // ambiguous ones. Rows with an explicit multiplier are already scaled
    // correctly and irrelevant to the heuristic.
    if (r.unit_multiplier) continue;
    const n = Math.abs(Number(r.latest_value));
    if (Number.isFinite(n) && n > 0) vals.push(n);
  }
  if (vals.length < 3) return false;
  vals.sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)];
  // Threshold: 10^5 (100 000). A median above that implies raw units; below
  // it the classic "stored as millions, multiplier dropped" shape rules.
  return median >= 100_000;
}

export function adaptEntityLeaderboardRows(
  raw: LeaderboardRowRaw[],
  opts?: { hrefBase?: string; totalBasis?: "sum" | null },
): {
  rows: LeaderboardRow[];
  total: { valueFormatted: string; yoy: number | null } | null;
} {
  const hrefBase = opts?.hrefBase ?? "/companies";

  const suppressInference = rawDollarScale(raw);

  const withEur = raw.map((r) => {
    const isCurrency = r.unit_type === "currency";
    const eur = isCurrency
      ? suppressInference
        ? nativeToEur(r.latest_value, r.unit_multiplier, r.latest_eur_rate)
        : nativeToEurInferred(
            r.latest_value,
            r.unit_multiplier,
            r.latest_eur_rate,
            r.metric_code,
          )
      : null;
    const rawVal = toRawNumeric(r.latest_value, r.unit_multiplier);
    const yoy = yoyPctGated({
      cur: r.latest_value,
      curMult: r.unit_multiplier,
      curCcy: r.currency,
      curRate: r.latest_eur_rate,
      curDisclosure: r.disclosure_status,
      prev: r.prev_year_value,
      prevMult: r.prev_year_multiplier,
      prevCcy: r.prev_year_currency,
      prevRate: r.prev_year_eur_rate,
      prevDisclosure: r.prev_year_disclosure,
      unitType: r.unit_type,
    });
    return { raw: r, eur, rawVal, yoy };
  });

  const totalEur = withEur.reduce((s, r) => s + (r.eur ?? 0), 0);
  const totalRaw = withEur.reduce((s, r) => s + (r.rawVal ?? 0), 0);

  const rows: LeaderboardRow[] = withEur.map((w) => {
    const r = w.raw;
    const spark =
      r.spark_raw?.map((s) =>
        r.unit_type === "currency"
          ? nativeToEur(s.value_numeric, s.unit_multiplier, s.eur_rate)
          : toRawNumeric(s.value_numeric, s.unit_multiplier),
      ) ?? null;
    const beaconMask =
      r.spark_raw?.map(
        (s) =>
          s.disclosure_status === "beacon_estimate" ||
          s.disclosure_status === "derived",
      ) ?? undefined;

    return {
      id: r.entity_id,
      href: `${hrefBase}/${r.slug}`,
      name: r.name,
      typeChip: r.entity_type_codes?.[0]
        ? chipFor(r.entity_type_codes[0])
        : null,
      value: r.unit_type === "currency" ? w.eur : w.rawVal,
      valueFormatted: displayValue({
        eurValue: w.eur,
        rawValue: w.rawVal,
        unit: r.unit_type,
      }),
      nativeTooltip: nativeTooltip({
        value: r.latest_value,
        mult: r.unit_multiplier,
        currency: r.currency,
        rate: r.latest_eur_rate,
        unit: r.unit_type,
      }),
      share:
        r.unit_type === "currency" && totalEur > 0 && w.eur != null
          ? (w.eur / totalEur) * 100
          : r.unit_type !== "currency" && totalRaw > 0 && w.rawVal != null
          ? (w.rawVal / totalRaw) * 100
          : null,
      yoy: w.yoy,
      sparkline: spark,
      beaconMask,
      ticker: r.ticker,
      disclosureStatus: r.disclosure_status,
    };
  });

  const total =
    opts?.totalBasis === null
      ? null
      : {
          valueFormatted:
            withEur[0]?.raw.unit_type === "currency"
              ? formatEur(totalEur)
              : displayValue({
                  eurValue: null,
                  rawValue: totalRaw,
                  unit: withEur[0]?.raw.unit_type ?? "count",
                }),
          yoy: null,
        };

  return { rows, total };
}

export function adaptMarketLeaderboardRows(
  raw: MarketLeaderboardRawRow[],
): {
  rows: LeaderboardRow[];
  total: { valueFormatted: string; yoy: number | null } | null;
} {
  const withEur = raw.map((r) => {
    const isCurrency = r.unit_type === "currency";
    const eur = isCurrency
      ? nativeToEurInferred(
          r.latest_value,
          r.unit_multiplier,
          r.latest_eur_rate,
          r.metric_code,
        )
      : null;
    const rawVal = toRawNumeric(r.latest_value, r.unit_multiplier);
    const yoy = yoyPctGated({
      cur: r.latest_value,
      curMult: r.unit_multiplier,
      curCcy: r.currency,
      curRate: r.latest_eur_rate,
      curDisclosure: r.disclosure_status,
      prev: r.prev_year_value,
      prevMult: r.prev_year_multiplier,
      prevCcy: r.prev_year_currency,
      prevRate: r.prev_year_eur_rate,
      prevDisclosure: r.prev_year_disclosure,
      unitType: r.unit_type,
    });
    return { raw: r, eur, rawVal, yoy };
  });

  const totalEur = withEur.reduce((s, r) => s + (r.eur ?? 0), 0);
  const totalRaw = withEur.reduce((s, r) => s + (r.rawVal ?? 0), 0);

  const rows: LeaderboardRow[] = withEur.map((w) => {
    const r = w.raw;
    const spark =
      r.spark_raw?.map((s) =>
        r.unit_type === "currency"
          ? nativeToEur(s.value_numeric, s.unit_multiplier, s.eur_rate)
          : toRawNumeric(s.value_numeric, s.unit_multiplier),
      ) ?? null;
    const beaconMask =
      r.spark_raw?.map(
        (s) =>
          s.disclosure_status === "beacon_estimate" ||
          s.disclosure_status === "derived",
      ) ?? undefined;
    return {
      id: r.market_id,
      href: `/markets/${r.slug}`,
      name: r.name,
      typeChip: r.market_type,
      value: r.unit_type === "currency" ? w.eur : w.rawVal,
      valueFormatted: displayValue({
        eurValue: w.eur,
        rawValue: w.rawVal,
        unit: r.unit_type,
      }),
      nativeTooltip: nativeTooltip({
        value: r.latest_value,
        mult: r.unit_multiplier,
        currency: r.currency,
        rate: r.latest_eur_rate,
        unit: r.unit_type,
      }),
      share:
        r.unit_type === "currency" && totalEur > 0 && w.eur != null
          ? (w.eur / totalEur) * 100
          : r.unit_type !== "currency" && totalRaw > 0 && w.rawVal != null
          ? (w.rawVal / totalRaw) * 100
          : null,
      yoy: w.yoy,
      sparkline: spark,
      beaconMask,
      disclosureStatus: r.disclosure_status,
      beaconCoveragePct:
        r.beacon_coverage_pct != null ? Number(r.beacon_coverage_pct) : null,
      extra: r.operator_count > 0 ? `${r.operator_count} ops` : undefined,
      // Surface the period that this row's value is sourced from so
      // /markets index doesn't silently mix Sweden's monthly figure
      // with UK's LTM in the same sorted table (round 9 flag). The
      // period_code ("Nov-25", "LTM-Q1-26", etc.) is short enough to
      // render inline next to the name without stealing the layout.
      period: r.latest_period ?? null,
    };
  });
  const total =
    withEur.length > 0
      ? {
          valueFormatted:
            withEur[0].raw.unit_type === "currency"
              ? formatEur(totalEur)
              : displayValue({
                  eurValue: null,
                  rawValue: totalRaw,
                  unit: withEur[0].raw.unit_type,
                }),
          yoy: null,
        }
      : null;
  return { rows, total };
}

function chipFor(code: string): string {
  switch (code) {
    case "operator":
      return "OP";
    case "affiliate":
      return "AFF";
    case "b2b_platform":
      return "B2B";
    case "b2b_supplier":
      return "B2B";
    case "lottery":
      return "LOT";
    case "dfs":
      return "DFS";
    case "media":
      return "MEDIA";
    case "regulator":
      return "REG";
    case "payment_provider":
      return "PAY";
    default:
      return code.toUpperCase().slice(0, 3);
  }
}
