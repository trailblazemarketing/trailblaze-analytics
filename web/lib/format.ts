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

// Metric codes whose disclosed values are expected to be large
// monetary amounts (millions / billions of EUR / USD / etc.). When a
// metric_values row for one of these metrics carries `unit_multiplier
// IS NULL` AND the raw value sits in the small-decimal range that
// matches "stored in millions but multiplier dropped during
// extraction", we infer `millions` rather than letting the formatter
// render "€236.65" for what's really €236.65M. Parser-side root cause
// is logged in COMPANY_AUDIT_PARSER_TODOS.md.
const SCALE_IMPLIED_METRICS: ReadonlySet<string> = new Set([
  "revenue",
  "ngr",
  "ggr",
  "online_ggr",
  "online_ngr",
  "online_revenue",
  "casino_ggr",
  "casino_revenue",
  "sportsbook_ggr",
  "sportsbook_revenue",
  "sportsbook_handle",
  "sportsbook_turnover",
  "lottery_revenue",
  "ebitda",
  "adjusted_ebitda",
  "marketing_spend",
  "market_cap",
  "net_income",
  "operating_profit",
  "revenue_guidance",
  "ebitda_guidance",
  "b2b_revenue",
  "b2c_revenue",
  "other_revenue",
  "customer_deposits",
  "handle",
]);

// Defensive multiplier inference. Use only when `unit_multiplier IS
// NULL` on a row whose metric_code is in SCALE_IMPLIED_METRICS and
// whose value sits in the 0.01..100000 band — that band is what
// values stored in millions / billions look like before scaling, and
// it's small enough that we won't accidentally inflate an already-
// converted figure. Returns the inferred multiplier or null if no
// safe inference is possible.
export function inferUnitMultiplier(
  rawValue: number | null | undefined,
  metricCode: string | null | undefined,
  currentMultiplier: UnitMultiplier,
): UnitMultiplier {
  if (currentMultiplier) return currentMultiplier;
  if (rawValue == null) return null;
  if (!metricCode || !SCALE_IMPLIED_METRICS.has(metricCode)) return null;
  const abs = Math.abs(rawValue);
  if (abs >= 0.01 && abs < 100_000) return "millions";
  return null;
}

// Compact relative-time formatter for "updated X ago" displays. No
// dependency — covers seconds → weeks; coarser anchors past that point
// would belong on a calendar date instead. Returns "—" when input
// can't be parsed.
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const now = Date.now();
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return `${Math.floor(day / 7)}w ago`;
}

// Standardise the human label for a period across detail-page "AS OF"
// pills so spacing/casing is consistent regardless of which seed-time
// `display_name` happens to be on the row. Most period_types already
// have a clean display_name (FY 2025, H1 2025, Q1 2026, Jan 2026,
// 9M 2025, YTD Mar 2026). LTM is the awkward case: codes like
// LTM-Q1-25 render as "LTM Q1 2025" which reads ambiguously, so we
// promote them to "LTM (ending Q1 2025)" for transparency on the
// rolling-window endpoint. Everything else falls through to the
// display_name with the code as a final fallback.
export function formatPeriodLabel(
  code: string,
  displayName?: string | null,
): string {
  // LTM-Q1-25 / LTM-Q2-25 / LTM-25 patterns
  if (code.startsWith("LTM")) {
    const tail = code.slice(4); // strip "LTM-"
    // LTM-Q1-25 → "Q1 2025"; LTM-25 → "2025"
    const qMatch = tail.match(/^(Q[1-4])-(\d{2})$/);
    if (qMatch) {
      const qLabel = qMatch[1];
      const yr = `20${qMatch[2]}`;
      return `LTM (ending ${qLabel} ${yr})`;
    }
    const yMatch = tail.match(/^(\d{2})$/);
    if (yMatch) return `LTM (ending ${`20${yMatch[1]}`})`;
    // Fall back to whatever display_name carries
  }
  return displayName ?? code;
}

// Truncate a long body of text near `maxLen` chars, but preferring the
// last full sentence within the limit so excerpts don't trail off
// mid-word ("...at the time of the CMD i..." → "...at the time of the
// CMD…"). Falls back to a clean word boundary, then to a hard cut, in
// that order. Always appends an ellipsis when the original was longer.
export function truncateAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const head = text.slice(0, maxLen);
  // Find last sentence-ending punctuation within the head
  const sentenceEnds = [
    head.lastIndexOf(". "),
    head.lastIndexOf("? "),
    head.lastIndexOf("! "),
    head.lastIndexOf(".\n"),
  ];
  const sentenceCut = Math.max(...sentenceEnds);
  if (sentenceCut > maxLen * 0.6) {
    return head.slice(0, sentenceCut + 1) + "…";
  }
  // Fall back to last whitespace
  const wordCut = head.lastIndexOf(" ");
  if (wordCut > maxLen * 0.6) {
    return head.slice(0, wordCut) + "…";
  }
  return head + "…";
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
