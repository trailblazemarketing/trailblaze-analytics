import type { MetricValueRow, UnitMultiplier, UnitType, DisclosureStatus } from "./types";

const MULT: Record<NonNullable<UnitMultiplier>, number> = {
  units: 1,
  thousands: 1_000,
  millions: 1_000_000,
  billions: 1_000_000_000,
};

// Scale a numeric value from its stored (unit_multiplier) form into raw units.
export function toRaw(value: number, mult: UnitMultiplier): number {
  if (!mult) return value;
  return value * MULT[mult];
}

function abbreviate(n: number, currency: string | null): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const prefix = currency ? formatCurrencySymbol(currency) : "";
  if (abs >= 1_000_000_000)
    return `${sign}${prefix}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${prefix}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${prefix}${(abs / 1_000).toFixed(2)}K`;
  return `${sign}${prefix}${abs.toFixed(2)}`;
}

function formatCurrencySymbol(code: string): string {
  switch (code.toUpperCase()) {
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "SEK":
    case "NOK":
    case "DKK":
      return `${code} `;
    default:
      return `${code} `;
  }
}

export function formatValue(v: MetricValueRow): string {
  if (v.value_numeric == null) {
    if (v.value_text) return v.value_text;
    return "—";
  }
  const raw = toRaw(Number(v.value_numeric), v.unit_multiplier);
  switch (v.metric_unit_type) {
    case "currency":
      return abbreviate(raw, v.currency);
    case "count":
      return abbreviate(raw, null);
    case "percentage":
      return `${Number(v.value_numeric).toFixed(2)}%`;
    case "ratio":
      return Number(v.value_numeric).toFixed(3);
    case "text":
      return v.value_text ?? "—";
  }
}

export function isBeacon(v: { disclosure_status: string }): boolean {
  return (
    v.disclosure_status === "beacon_estimate" ||
    v.disclosure_status === "derived"
  );
}

export function isNotDisclosed(v: { disclosure_status: string }): boolean {
  return v.disclosure_status === "not_disclosed";
}

export function formatPct(n: string | number | null): string {
  if (n == null) return "—";
  const v = typeof n === "string" ? Number(n) : n;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function metricUnitLabel(t: UnitType): string {
  switch (t) {
    case "currency":
      return "€";
    case "count":
      return "#";
    case "percentage":
      return "%";
    case "ratio":
      return "×";
    case "text":
      return "";
  }
}

// EUR-first formatter for MetricValueRow + eur_rate. Falls back to native
// if the row isn't a currency or no rate is known.
export function formatMetricValueEur(
  v: Pick<MetricValueRow, "value_numeric" | "value_text" | "metric_unit_type" | "currency" | "unit_multiplier">,
  eurRate: string | null,
): { display: string; tooltip: string | null } {
  if (v.value_numeric == null) {
    if (v.value_text) return { display: v.value_text, tooltip: null };
    return { display: "—", tooltip: null };
  }
  const raw = toRaw(Number(v.value_numeric), v.unit_multiplier);
  if (v.metric_unit_type === "currency") {
    const rate = eurRate != null ? Number(eurRate) : null;
    if (rate != null && rate > 0) {
      const eur = raw / rate;
      const tooltip = v.currency
        ? `${formatNative(raw, v.currency)} @ ${rate.toFixed(4)} ${v.currency}/EUR`
        : null;
      return { display: formatEur(eur), tooltip };
    }
    // No rate — show native
    return {
      display: v.currency ? formatNative(raw, v.currency) : "—",
      tooltip: null,
    };
  }
  return { display: formatValue(v as MetricValueRow), tooltip: null };
}

// EUR-formatted monetary value with smart abbreviation. `n` is in EUR units.
export function formatEur(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}€${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}€${(abs / 1_000).toFixed(1)}K`;
  return `${sign}€${abs.toFixed(2)}`;
}

// Native-currency formatter used in tooltips to show the source value.
export function formatNative(n: number | null, currency: string): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const sym = (() => {
    switch (currency.toUpperCase()) {
      case "USD":
        return "$";
      case "EUR":
        return "€";
      case "GBP":
        return "£";
      case "JPY":
        return "¥";
      default:
        return "";
    }
  })();
  const pre = sym ? sym : "";
  const suf = sym ? "" : ` ${currency}`;
  if (abs >= 1_000_000_000) return `${sign}${pre}${(abs / 1_000_000_000).toFixed(2)}B${suf}`;
  if (abs >= 1_000_000) return `${sign}${pre}${(abs / 1_000_000).toFixed(1)}M${suf}`;
  if (abs >= 1_000) return `${sign}${pre}${(abs / 1_000).toFixed(1)}K${suf}`;
  return `${sign}${pre}${abs.toFixed(2)}${suf}`;
}
