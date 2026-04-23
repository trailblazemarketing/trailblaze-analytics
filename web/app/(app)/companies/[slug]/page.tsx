import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  getCompanyBySlug,
  getCompanyReports,
  getCompanyNarratives,
  findCanonicalSlugForAlias,
} from "@/lib/queries/companies";
import { getBeaconEstimatesForValues } from "@/lib/queries/markets";
import {
  getScorecardSeries,
  getEntityLeaderboard,
  nativeToEur,
  toRawNumeric,
  preferAggregateForCurrencyTile,
  fillCadenceGaps,
} from "@/lib/queries/analytics";
import {
  listPopulatedPeriods,
  groupPeriodsForSelector,
} from "@/lib/queries/periods";
import { adaptEntityLeaderboardRows } from "@/lib/adapters";
import {
  buildPanelTiles,
  PANELS,
  type PanelKind,
  augmentDerivedEbitdaMargin,
} from "@/lib/scorecard-builder";
import { Leaderboard } from "@/components/primitives/leaderboard";
import { TimeMatrix } from "@/components/primitives/time-matrix";
import type {
  TimeMatrixRow,
  TimeMatrixCell,
} from "@/components/primitives/time-matrix";
import {
  MetricTimeseries,
  type TimeseriesPoint,
  type BeaconFlags,
} from "@/components/charts/metric-timeseries";
import { Sparkline } from "@/components/beacon/sparkline";
import { DeltaChip } from "@/components/beacon/delta-chip";
import { SourceLabel } from "@/components/beacon/source-label";
import { PeriodSelector } from "@/components/layout/period-selector";
import { ReportLink } from "@/components/reports/report-link";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TH, TD, TR } from "@/components/ui/table";
import {
  formatDate,
  formatEur,
  formatNative,
  truncateAtSentence,
  formatPeriodLabel,
  relativeTime,
  inferUnitMultiplier,
} from "@/lib/format";
import { displayReportFilename } from "@/lib/formatters/reportFilename";
import { query } from "@/lib/db";
import type { MetricValueRow } from "@/lib/types";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

const GEO_METRIC_CODES = [
  "revenue",
  "online_ggr",
  "online_revenue",
  "ggr",
  "ngr",
  "sportsbook_ggr",
  "sportsbook_revenue",
  "casino_ggr",
  "casino_revenue",
  "market_share_ggr",
];

const METRICS_MATRIX_CODES = [
  "revenue",
  "ngr",
  "ebitda",
  "ebitda_margin",
  "operating_profit",
  "active_customers",
  "monthly_actives",
  "arpu",
  "ftd",
  "ndc",
  "marketing_spend",
  "marketing_pct_revenue",
];

function panelKindFor(codes: string[]): PanelKind {
  if (codes.includes("operator")) return "operator";
  if (codes.includes("affiliate")) return "affiliate";
  if (codes.includes("b2b_platform")) return "b2b_platform";
  if (codes.includes("b2b_supplier")) return "b2b_supplier";
  if (codes.includes("lottery")) return "lottery";
  if (codes.includes("dfs")) return "dfs";
  return "operator";
}

function typeChipLabel(kind: PanelKind): string {
  switch (kind) {
    case "operator":
      return "OPERATOR";
    case "affiliate":
      return "AFFILIATE";
    case "b2b_platform":
      return "B2B PLATFORM";
    case "b2b_supplier":
      return "B2B SUPPLIER";
    case "lottery":
      return "LOTTERY";
    case "dfs":
      return "DFS";
    case "market":
      return "MARKET";
  }
}

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { period?: string };
}) {
  let company = await getCompanyBySlug(params.slug);
  if (!company) {
    // The requested slug isn't canonical. Try alias / name-normalised
    // lookup so common variants like /companies/flutter-entertainment
    // resolve to the canonical /companies/flutter rather than 404'ing.
    const canonical = await findCanonicalSlugForAlias(params.slug);
    if (canonical && canonical.slug !== params.slug) {
      redirect(`/companies/${canonical.slug}`);
    }
    notFound();
  }
  // Defensive: hint to TS that company is non-null after this point.
  company = company as NonNullable<typeof company>;

  const periodCode = searchParams.period ?? null;
  const kind = panelKindFor(company.entity_type_codes);
  const panel = PANELS[kind];
  const scorecardCodes = [
    ...panel.primary.map((r) => r.code),
    ...panel.secondary.map((r) => r.code),
  ];

  const [
    byCode,
    populatedPeriods,
    reports,
    narratives,
    primaryMarketRow,
    marketsForEntity,
  ] = await Promise.all([
    getScorecardSeries({ entityId: company.id, metricCodes: scorecardCodes }),
    listPopulatedPeriods(),
    getCompanyReports(company.id, 25),
    getCompanyNarratives(company.id),
    query<{ market_id: string; slug: string; name: string; vals: number }>(
      `SELECT mv.market_id, mk.slug, mk.name, COUNT(*)::int AS vals
       FROM metric_values mv
       JOIN markets mk ON mk.id = mv.market_id
       WHERE mv.entity_id = $1 AND mv.market_id IS NOT NULL
       GROUP BY mv.market_id, mk.slug, mk.name
       ORDER BY vals DESC
       LIMIT 5`,
      [company.id],
    ),
    query<{ market_id: string; slug: string; name: string }>(
      `SELECT DISTINCT mv.market_id, mk.slug, mk.name
       FROM metric_values mv
       JOIN markets mk ON mk.id = mv.market_id
       WHERE mv.entity_id = $1 AND mv.market_id IS NOT NULL`,
      [company.id],
    ),
  ]);

  const periodGroups = groupPeriodsForSelector(populatedPeriods);
  const primaryMarket = primaryMarketRow[0] ?? null;
  const primaryMarketsList = primaryMarketRow.map((m) => m.name);

  // Recent periods this entity actually reports in. Pulled wide across the
  // candidate cadences so the cadence picker below can pick a single
  // cohort. Excludes `ltm` and `nine_months` (overlapping aggregates that
  // confuse a breakdown column header) and `custom` /
  // `trading_update_window`. Same pattern as commit f6de180 on the markets
  // page time-matrix.
  const entityPeriodRows = await query<{
    code: string;
    display_name: string | null;
    start_date: string;
    period_type: string;
  }>(
    `SELECT p.code, p.display_name, p.start_date::text, p.period_type
     FROM periods p
     WHERE p.id IN (
       SELECT DISTINCT period_id FROM metric_values WHERE entity_id = $1
     )
       AND p.period_type IN ('quarter','half_year','full_year','month')
     ORDER BY p.start_date DESC
     LIMIT 60`,
    [company.id],
  );
  // Cadence picker — same pattern as f6de180 (markets time-matrix).
  // Preferred cadence = quarter; fall back to half_year, then full_year,
  // finally month so US-state-style monthly-only feeds still render.
  const TM_CADENCE_PREF: {
    pt: "quarter" | "half_year" | "full_year" | "month";
    label: string;
    n: number;
  }[] = [
    { pt: "quarter", label: "Quarters", n: 12 },
    { pt: "half_year", label: "Half-years", n: 8 },
    { pt: "full_year", label: "Years", n: 6 },
    { pt: "month", label: "Months", n: 12 },
  ];
  let recentPeriods: typeof entityPeriodRows = [];
  let tmCadenceLabel = "Periods";
  for (const { pt, label, n } of TM_CADENCE_PREF) {
    const cohort = entityPeriodRows.filter((p) => p.period_type === pt);
    if (cohort.length >= 3) {
      // Dedup by start_date — periods table carries multiple aliased
      // codes per calendar month (Jan-26 + M2026-01 both 2026-01-01)
      // which would otherwise render the same column twice in the
      // breakdown matrix. Keep the lexicographically first code per
      // start_date.
      const byStart = new Map<string, (typeof cohort)[number]>();
      for (const p of cohort) {
        const existing = byStart.get(p.start_date);
        if (!existing || p.code.localeCompare(existing.code) < 0) {
          byStart.set(p.start_date, p);
        }
      }
      recentPeriods = [...byStart.values()]
        .sort((a, b) => b.start_date.localeCompare(a.start_date)) // DESC
        .slice(0, n) // newest n
        .sort((a, b) => a.start_date.localeCompare(b.start_date)); // ASC for render
      tmCadenceLabel = label;
      break;
    }
  }
  // Fall back to the raw newest-first set so widgets don't go empty for
  // entities with fewer than 3 periods of any single cadence (very early
  // stage entities, single-report coverage, etc.).
  if (recentPeriods.length === 0) {
    recentPeriods = [...entityPeriodRows]
      .slice(0, 12)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  }

  // T2 small-fix 2: augment byCode with derived ebitda_margin rows where
  // disclosed values are missing but ebitda + revenue both exist. All
  // downstream consumers (primary tile, quarterly table) read through this.
  const byCodeAug = augmentDerivedEbitdaMargin(byCode);

  // CD-AGG: For each currency-aggregate series feeding a KPI tile,
  // promote a real "total" (LTM > derived 4-quarter LTM > current-year
  // FY) to the headline rather than letting the latest single-quarter
  // row mislabel itself as Total Revenue / Total NGR / etc. Generalises
  // the markets-page LTM fix (commit 8b106a6) to every currency tile on
  // the company panel. Non-currency series (active users, FTDs, ratios)
  // pass through untouched.
  const aggCodes = new Set<string>();
  for (const r of [...panel.primary, ...panel.secondary]) aggCodes.add(r.code);
  for (const code of aggCodes) {
    const rs = byCodeAug.get(code);
    if (!rs || rs.length === 0) continue;
    const promoted = preferAggregateForCurrencyTile(rs);
    if (promoted !== rs) byCodeAug.set(code, promoted);
  }

  // CD-DEDUP: When an aggregate tile's headline EUR value is within 1%
  // of its online-only counterpart (or its sibling alias) for the same
  // period, the source only disclosed one of them and the parser
  // likely cloned the value into the alias metric. Showing both tiles
  // with identical numbers misleads — suppress the secondary tile
  // (em-dash). The pair list covers:
  //   - aggregate vs online sibling (Total vs Online of GGR/NGR/Revenue)
  //   - revenue vs ngr (PrizePicks-class collision where parser maps
  //     the same disclosed line to both metrics)
  // Pairs are ordered (suppress, keep): the second of each pair is the
  // canonical surviving tile.
  const TOTAL_VS_ONLINE_PAIRS: [string, string][] = [
    ["revenue", "online_revenue"],
    ["ngr", "online_ngr"],
    ["ggr", "online_ggr"],
    // PrizePicks-class: when revenue == ngr (no bonus deductions
    // disclosed), keep the more-recognised "revenue" tile; suppress
    // the redundant ngr tile.
    ["ngr", "revenue"],
  ];
  for (const [totalCode, onlineCode] of TOTAL_VS_ONLINE_PAIRS) {
    const totalRows = byCodeAug.get(totalCode) ?? [];
    const onlineRows = byCodeAug.get(onlineCode) ?? [];
    if (totalRows.length === 0 || onlineRows.length === 0) continue;
    const totalLatest = totalRows[0];
    const onlineMatch = onlineRows.find(
      (r) => r.period_code === totalLatest.period_code,
    );
    if (!onlineMatch) continue;
    const totalEur = nativeToEur(
      totalLatest.value_numeric,
      totalLatest.unit_multiplier,
      totalLatest.eur_rate,
    );
    const onlineEur = nativeToEur(
      onlineMatch.value_numeric,
      onlineMatch.unit_multiplier,
      onlineMatch.eur_rate,
    );
    if (
      totalEur != null &&
      onlineEur != null &&
      Math.abs(totalEur - onlineEur) / Math.max(Math.abs(totalEur), 1) < 0.01
    ) {
      byCodeAug.set(totalCode, []);
    }
  }

  const allBeaconIds: string[] = [];
  byCodeAug.forEach((rows) => {
    for (const r of rows) {
      // Derived rows synthesised above have synthetic IDs; skip them here
      // so we don't join against beacon_estimates for a non-existent row.
      if (r.metric_value_id.startsWith("derived:")) continue;
      if (
        r.disclosure_status === "beacon_estimate" ||
        r.disclosure_status === "derived"
      )
        allBeaconIds.push(r.metric_value_id);
    }
  });
  const beacon = await getBeaconEstimatesForValues(allBeaconIds);
  const tiles = buildPanelTiles(kind, byCodeAug, beacon);

  // CD5: Revenue chart + "<Cadence> breakdown" table share a single
  // period-type cohort so half_year / nine_months / full_year / ltm rows
  // don't create a sawtooth (annual values tower over quarterly on the
  // same axis). Cadence is resolved hierarchically: quarter → half_year
  // → full_year, so quarterly reporters (Flutter) keep their quarterly
  // view while semi-annual reporters (Playtech) still see their data.
  //
  // Entity-type-aware metric pref: lottery operators (Allwyn, FDJ
  // United etc.) typically don't disclose `revenue` separately — they
  // disclose GGR and lottery_revenue. Fall back through a kind-specific
  // priority list and surface the chosen metric in the chart title so
  // the substitution is transparent.
  const REVENUE_CHART_PREF: Record<PanelKind, string[]> = {
    operator: ["revenue", "ngr", "online_revenue"],
    affiliate: ["revenue", "ngr"],
    b2b_platform: ["revenue", "ngr"],
    b2b_supplier: ["revenue", "ngr"],
    lottery: ["revenue", "ggr", "lottery_revenue", "online_ggr"],
    dfs: ["revenue", "ngr", "ggr"],
    market: ["ggr", "online_ggr", "revenue"],
  };
  let revChartCode = "revenue";
  let revChartLabel = "Revenue";
  for (const code of REVENUE_CHART_PREF[kind] ?? ["revenue"]) {
    const rs = byCodeAug.get(code) ?? [];
    if (rs.length >= 1) {
      revChartCode = code;
      revChartLabel = rs[0]?.metric_display_name ?? code;
      break;
    }
  }
  const revRows = byCodeAug.get(revChartCode) ?? [];
  const quarterRows = revRows.filter((r) => r.period_type === "quarter");
  const halfYearRows = revRows.filter((r) => r.period_type === "half_year");
  const fullYearRows = revRows.filter((r) => r.period_type === "full_year");
  const { preferredRevRows, cadenceLabel } =
    quarterRows.length > 0
      ? { preferredRevRows: quarterRows, cadenceLabel: "Quarterly" }
      : halfYearRows.length > 0
      ? { preferredRevRows: halfYearRows, cadenceLabel: "Half-Year" }
      : fullYearRows.length > 0
      ? { preferredRevRows: fullYearRows, cadenceLabel: "Annual" }
      : { preferredRevRows: [] as typeof revRows, cadenceLabel: "Quarterly" };
  const sortedRev = [...preferredRevRows].sort((a, b) =>
    a.period_start.localeCompare(b.period_start),
  );
  const chartRows = sortedRev.slice(-12);
  const chartCadence: "quarter" | "half_year" | "full_year" =
    cadenceLabel === "Quarterly"
      ? "quarter"
      : cadenceLabel === "Half-Year"
      ? "half_year"
      : "full_year";
  const chartDataDense: TimeseriesPoint[] = chartRows.map((r) => ({
    period: r.period_code,
    period_start: r.period_start,
    [revChartLabel]:
      r.metric_unit_type === "currency"
        ? nativeToEur(r.value_numeric, r.unit_multiplier, r.eur_rate)
        : toRawNumeric(r.value_numeric, r.unit_multiplier),
  }));
  // Insert null entries at missing period slots so the chart renders
  // broken segments at gaps (Recharts connectNulls={false}) instead of
  // smoothing across — e.g. BetMGM Q4-25 missing between Q3-25 and
  // Q1-26 should visibly break the line, not draw straight through.
  const chartData = fillCadenceGaps(chartDataDense, chartCadence, [revChartLabel]);
  const beaconFlags: BeaconFlags = {
    [revChartLabel]: new Set(
      chartRows
        .filter(
          (r) =>
            r.disclosure_status === "beacon_estimate" ||
            r.disclosure_status === "derived",
        )
        .map((r) => r.period_code),
    ),
  };

  // CD6: Breakdown table (cadence from `cadenceLabel`) — columns from scorecard byCode
  // Period · Revenue · YoY · QoQ · EBITDA Margin · Active Users · Source · Confidence
  const qPeriods = sortedRev.slice(-6); // six most recent (already single-cadence via sortedRev)
  const quarterlyRows = qPeriods.map((pRow, idx) => {
    const prevYear = sortedRev.find((r) => {
      const d = new Date(r.period_start).getTime();
      const cur = new Date(pRow.period_start).getTime();
      return (
        Math.abs(d - (cur - 365 * 86400 * 1000)) <
        45 * 86400 * 1000
      );
    });
    const prevQ = idx > 0 ? qPeriods[idx - 1] : null;

    const revEur =
      pRow.metric_unit_type === "currency"
        ? nativeToEur(pRow.value_numeric, pRow.unit_multiplier, pRow.eur_rate)
        : null;
    const prevYrEur =
      prevYear && prevYear.metric_unit_type === "currency"
        ? nativeToEur(
            prevYear.value_numeric,
            prevYear.unit_multiplier,
            prevYear.eur_rate,
          )
        : null;
    const prevQEur =
      prevQ && prevQ.metric_unit_type === "currency"
        ? nativeToEur(prevQ.value_numeric, prevQ.unit_multiplier, prevQ.eur_rate)
        : null;

    const yoy =
      revEur != null && prevYrEur != null && prevYrEur !== 0
        ? ((revEur - prevYrEur) / Math.abs(prevYrEur)) * 100
        : null;
    const qoq =
      revEur != null && prevQEur != null && prevQEur !== 0
        ? ((revEur - prevQEur) / Math.abs(prevQEur)) * 100
        : null;

    const marginRow = (byCodeAug.get("ebitda_margin") ?? []).find(
      (r) => r.period_code === pRow.period_code,
    );
    const actUsersRow = (byCodeAug.get("active_customers") ?? []).find(
      (r) => r.period_code === pRow.period_code,
    );
    const margin =
      marginRow?.value_numeric != null ? Number(marginRow.value_numeric) : null;
    const marginDerived = marginRow?.disclosure_status === "derived";
    const actUsers =
      actUsersRow != null
        ? toRawNumeric(actUsersRow.value_numeric, actUsersRow.unit_multiplier)
        : null;

    const isBeacon =
      pRow.disclosure_status === "beacon_estimate" ||
      pRow.disclosure_status === "derived";
    return {
      periodCode: pRow.period_display_name ?? pRow.period_code,
      revDisplay:
        revEur != null
          ? formatEur(revEur)
          : pRow.value_numeric != null
          ? formatNative(Number(pRow.value_numeric), pRow.currency ?? "EUR")
          : "—",
      yoy,
      qoq,
      margin: margin != null ? `${margin.toFixed(1)}%` : "—",
      marginDerived,
      actUsers: actUsers != null ? abbreviate(actUsers) : "—",
      source: pRow.source_type,
      confidence:
        pRow.confidence_score != null
          ? `${(Number(pRow.confidence_score) * 100).toFixed(0)}%`
          : isBeacon
          ? "Modeled"
          : "Verified",
      isBeacon,
      // Used by the table render to drop rows where every value column
      // came back null/em-dash. A row with only a period label and a
      // source chip is noise — typically signals the period exists in
      // the metric_values table but the value_numeric was empty
      // (parser planted a row for a header it couldn't extract).
      hasAnyValue:
        revEur != null ||
        pRow.value_numeric != null ||
        margin != null ||
        actUsers != null,
    };
  }).filter((r) => r.hasAnyValue);

  // Time matrices (kept from prior version) — geographic breakdown + metrics
  const periodCodes = recentPeriods.map((p) => p.code);
  const periodLabels = Object.fromEntries(
    recentPeriods.map((p) => [p.code, p.display_name ?? p.code]),
  );
  const orderedPeriods = [...recentPeriods]
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map((p) => p.code);

  const geoRaw = await query<
    MetricValueRow & {
      market_name: string;
      market_slug: string;
      eur_rate: string | null;
    }
  >(
    `SELECT mvc.metric_value_id, mvc.entity_id, mvc.market_id, mvc.metric_id,
            m.code AS metric_code, m.display_name AS metric_display_name,
            m.unit_type AS metric_unit_type,
            mvc.period_id, p.code AS period_code, p.display_name AS period_display_name,
            p.start_date AS period_start, p.end_date AS period_end,
            mvc.report_id, mvc.source_type, mvc.value_numeric, mvc.value_text,
            mvc.currency, mvc.unit_multiplier, mvc.disclosure_status,
            mvc.confidence_score, mvc.published_timestamp,
            mk.name AS market_name, mk.slug AS market_slug,
            fx.eur_rate::text AS eur_rate
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
     WHERE mvc.entity_id = $1 AND mvc.market_id IS NOT NULL
       AND m.code = ANY($2::text[])
       AND p.code = ANY($3::text[])`,
    [company.id, GEO_METRIC_CODES, periodCodes],
  );

  const geoByMetric = new Map<string, typeof geoRaw>();
  for (const r of geoRaw) {
    if (!geoByMetric.has(r.metric_code)) geoByMetric.set(r.metric_code, []);
    geoByMetric.get(r.metric_code)!.push(r);
  }
  let topGeoCode: string | null = null;
  let topGeoCount = 0;
  for (const code of GEO_METRIC_CODES) {
    const rs = geoByMetric.get(code);
    if (rs && rs.length > topGeoCount) {
      topGeoCount = rs.length;
      topGeoCode = code;
    }
  }
  const geoMarketIds = new Map<
    string,
    { name: string; slug: string; cells: Record<string, TimeMatrixCell | null> }
  >();
  if (topGeoCode) {
    for (const r of geoByMetric.get(topGeoCode) ?? []) {
      if (!r.market_id) continue;
      if (!geoMarketIds.has(r.market_id)) {
        geoMarketIds.set(r.market_id, {
          name: r.market_name,
          slug: r.market_slug,
          cells: {},
        });
      }
      const nativeNumeric = r.value_numeric != null ? Number(r.value_numeric) : null;
      // Defensive multiplier inference for parser rows that came in
      // without a unit_multiplier on a metric whose values are
      // expected to be large monetary amounts. Without this, US-state
      // rows like online_ggr=272.1 (millions, multiplier dropped)
      // displayed as "€254.40" instead of "€254.40M". Parser-side
      // root cause logged in COMPANY_AUDIT_PARSER_TODOS.md.
      const inferredMult = inferUnitMultiplier(
        nativeNumeric,
        r.metric_code,
        r.unit_multiplier,
      );
      const scaleFactor =
        inferredMult === "billions"
          ? 1_000_000_000
          : inferredMult === "millions"
          ? 1_000_000
          : inferredMult === "thousands"
          ? 1_000
          : 1;
      const scaledNative = nativeNumeric != null ? nativeNumeric * scaleFactor : null;
      const sortVal =
        r.metric_unit_type === "currency" && scaledNative != null && r.eur_rate
          ? scaledNative / Number(r.eur_rate)
          : scaledNative;
      const display =
        r.metric_unit_type === "currency" && scaledNative != null && r.eur_rate
          ? formatEur(scaledNative / Number(r.eur_rate))
          : scaledNative != null
          ? abbreviate(scaledNative)
          : "—";
      geoMarketIds.get(r.market_id)!.cells[r.period_code] = {
        value: sortVal,
        valueFormatted: display,
        disclosureStatus: r.disclosure_status,
        source: r.source_type,
      };
    }
  }
  const geoRows: TimeMatrixRow[] = Array.from(geoMarketIds.entries()).map(
    ([id, m]) => ({
      id,
      name: m.name,
      href: `/markets/${m.slug}`,
      cells: m.cells,
    }),
  );
  const geoMetricLabel =
    topGeoCode && geoByMetric.get(topGeoCode)?.[0]?.metric_display_name;

  // Competitive position — operators only, in their primary market
  let peersLb: ReturnType<typeof adaptEntityLeaderboardRows> | null = null;
  let peersMetric: string | null = null;
  let peersScaleWarning: string | null = null;
  if (primaryMarket && kind === "operator") {
    const candidate = await query<{ code: string; n: number }>(
      `SELECT m.code, COUNT(DISTINCT mvc.entity_id)::int AS n
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       WHERE mvc.market_id = $1 AND mvc.entity_id IS NOT NULL
         AND m.code = ANY($2::text[])
       GROUP BY m.code ORDER BY n DESC NULLS LAST LIMIT 1`,
      [
        primaryMarket.market_id,
        [
          "online_ggr",
          "sportsbook_ggr",
          "sportsbook_revenue",
          "casino_ggr",
          "revenue",
        ],
      ],
    );
    peersMetric = candidate[0]?.code ?? "online_ggr";
    const peersRawAll = await getEntityLeaderboard({
      metricCode: peersMetric,
      marketSlug: primaryMarket.slug,
      entityTypeCode: "operator",
      periodCode,
      limit: 10,
    });
    // Hide the company's children (operational sub-brands, already
    // folded into the parent's rollup revenue) and its parent (the
    // current page is a subset of the parent's numbers). Keep the
    // page entity itself — on /companies/flutter the only US
    // operator-typed peers with revenue rows are Flutter + FanDuel, so
    // the previous self-exclusion collapsed the widget entirely; this
    // way Flutter still appears and sits alongside whichever other
    // real peers the market has.
    const relatedIds = await query<{ id: string }>(
      `SELECT id FROM entities WHERE parent_entity_id = $1
       UNION
       SELECT parent_entity_id AS id FROM entities
         WHERE id = $1 AND parent_entity_id IS NOT NULL`,
      [company.id],
    );
    const excludeIds = new Set(relatedIds.map((r) => r.id));
    const peersRaw = peersRawAll.filter((r) => !excludeIds.has(r.entity_id));
    peersLb = adaptEntityLeaderboardRows(peersRaw);

    // Scale-sanity check: compare the leaderboard's summed EUR total
    // against the disclosed market-level total for the same metric and
    // (if any peers were returned) the latest period the leaderboard
    // is actually showing. If the operator-sum is < 1% or > 110% of the
    // disclosed national/market total, surface a ⚠ badge so analysts
    // know the absolute scale may be off (e.g. Sweden online_ggr where
    // Kindred + Betsson rows came in at 1/100th of the actual scale due
    // to a units-multiplier extraction error). The widget still
    // renders — relative ranking is useful even when scale is off.
    if (peersLb.rows.length > 0 && peersLb.total) {
      const latestPeriodForPeers = peersRaw[0]?.latest_period;
      const marketTotalRow = latestPeriodForPeers
        ? await query<{
            value_numeric: string | null;
            unit_multiplier: string | null;
            currency: string | null;
            eur_rate: string | null;
          }>(
            `SELECT mvc.value_numeric::text AS value_numeric,
                    mvc.unit_multiplier, mvc.currency,
                    fx.eur_rate::text AS eur_rate
             FROM metric_value_canonical mvc
             JOIN metrics m ON m.id = mvc.metric_id
             JOIN periods p ON p.id = mvc.period_id
             LEFT JOIN LATERAL (
               SELECT f.eur_rate FROM fx_rates f
               WHERE f.currency_code = COALESCE(UPPER(mvc.currency), 'EUR')
                 AND f.rate_date <= p.end_date
               ORDER BY f.rate_date DESC LIMIT 1
             ) fx ON true
             WHERE mvc.market_id = $1
               AND mvc.entity_id IS NULL
               AND m.code = $2
               AND p.code = $3
             LIMIT 1`,
            [primaryMarket.market_id, peersMetric, latestPeriodForPeers],
          )
        : [];
      const marketTotalEur = marketTotalRow[0]
        ? nativeToEur(
            marketTotalRow[0].value_numeric,
            marketTotalRow[0].unit_multiplier as
              | "units"
              | "thousands"
              | "millions"
              | "billions"
              | null,
            marketTotalRow[0].eur_rate,
          )
        : null;
      const peerSumEur = peersRaw.reduce((s, r) => {
        const v =
          r.unit_type === "currency"
            ? nativeToEur(r.latest_value, r.unit_multiplier, r.latest_eur_rate)
            : null;
        return s + (v ?? 0);
      }, 0);
      if (marketTotalEur != null && marketTotalEur > 0 && peerSumEur > 0) {
        const ratio = peerSumEur / marketTotalEur;
        if (ratio < 0.01) {
          peersScaleWarning = `Operator sum is ${(ratio * 100).toFixed(2)}% of disclosed market total — values likely under-scaled by a units-multiplier extraction error. Relative ranking still informative.`;
        } else if (ratio > 1.1) {
          peersScaleWarning = `Operator sum is ${(ratio * 100).toFixed(0)}% of disclosed market total — values likely over-scaled or double-counted across operators. Relative ranking still informative.`;
        }
      }
    }
  }

  // Stock row (CD4) — only for entities with a ticker
  const stockSnapshot = company.ticker
    ? await getStockSnapshot(company.id)
    : null;

  // Narratives — prefer forecast_strategy + investment_view for the sidebar
  const narrBySection = new Map<string, typeof narratives>();
  for (const n of narratives) {
    if (!narrBySection.has(n.section_code))
      narrBySection.set(n.section_code, []);
    narrBySection.get(n.section_code)!.push(n);
  }
  const forecast = narrBySection.get("forecast_strategy")?.[0] ?? null;
  const investment = narrBySection.get("investment_view")?.[0] ?? null;

  const primaryTiles = tiles.primary.slice(0, 4);
  const secondaryTiles = tiles.secondary.slice(0, 8);

  const subtitleParts = [
    company.headquarters_country ? `HQ ${company.headquarters_country}` : null,
    marketsForEntity.length > 0
      ? `${marketsForEntity.length} market${marketsForEntity.length === 1 ? "" : "s"}`
      : null,
    primaryMarketsList.length > 0
      ? `Primary: ${primaryMarketsList.slice(0, 3).join(", ")}`
      : null,
  ].filter(Boolean);

  // Header period is the most recent period across all metric series, not
  // whichever metric happens to be first in the byCode insertion order
  // (which is alphabetical by metric_code from getScorecardSeries — so
  // the original "As of" date often pinned to active_customers' or
  // arpu's stalest snapshot rather than the freshest aggregate).
  let latestPeriodEnd: string | null = null;
  let headerCode: string | null = null;
  let headerDisplay: string | null = null;
  for (const rows of byCodeAug.values()) {
    for (const r of rows) {
      if (r.period_end && (!latestPeriodEnd || r.period_end > latestPeriodEnd)) {
        latestPeriodEnd = r.period_end;
        headerCode = r.period_code;
        headerDisplay = r.period_display_name ?? r.period_code;
      }
    }
  }
  // Standardise via formatPeriodLabel so LTM windows render as
  // "LTM (ending Q1 2025)" consistently with the markets page.
  const headerPeriod = headerCode
    ? formatPeriodLabel(headerCode, headerDisplay)
    : null;

  return (
    <div className="space-y-3">
      {/* CD1: header row with chips + period selector */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="blue">{typeChipLabel(kind)}</Badge>
            <Badge variant={company.ticker ? "blue" : "muted"}>
              {company.ticker ? "LISTED" : "PRIVATE"}
            </Badge>
            {company.ticker && (
              <Badge variant="blue" className="font-mono">
                {company.exchange ? `${company.exchange}:` : ""}
                {company.ticker}
              </Badge>
            )}
          </div>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-tb-text">
            {company.name}
          </h1>
          {subtitleParts.length > 0 && (
            <p className="mt-0.5 text-[11px] text-tb-muted">
              {subtitleParts.join(" · ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerPeriod && (
            <div className="rounded-md border border-tb-border px-2 py-1 text-[10px] text-tb-muted">
              <span className="uppercase tracking-wider">As of</span>{" "}
              <span className="font-mono text-tb-text">{headerPeriod}</span>
            </div>
          )}
          <span className="rounded-md border border-tb-border bg-tb-surface px-2 py-1 font-mono text-[10px] text-tb-muted">
            € EUR
          </span>
          <PeriodSelector groups={periodGroups} currentCode={periodCode} />
          <Link
            href={`/companies/compare?slugs=${company.slug}`}
            className="rounded-md border border-tb-border px-3 py-1.5 text-xs text-tb-text hover:border-tb-blue"
          >
            Compare →
          </Link>
        </div>
      </header>

      {/* CD2: Primary KPI scorecard — 4 large tiles.
          T2 small-fix 3: operator panel swaps the last two recipe tiles
          (Active Users + ARPU — which moved to secondary) for custom
          Market Cap + Stock Price tiles driven by the live stock snapshot.
          Private (ticker-less) operators render the PRIVATE fallback so
          prime real estate is not wasted on em-dashes. Other panel kinds
          (affiliate / b2b_* / lottery / dfs) keep their existing primary
          layout since their non-stock metrics are more informative. */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-tb-border bg-tb-border sm:grid-cols-2 lg:grid-cols-4">
        {primaryTiles.map((t) => (
          <PrimaryKpiTile
            key={t.code}
            label={t.label}
            value={t.valueFormatted}
            yoy={t.yoy}
            spark={t.spark}
            beaconMask={t.beaconMask}
            source={t.source}
            disclosureStatus={t.disclosureStatus}
            tooltip={t.nativeTooltip}
          />
        ))}
        {kind === "operator" && (
          <>
            <MarketCapTile
              ticker={company.ticker}
              snapshot={stockSnapshot}
            />
            <StockPriceTile
              ticker={company.ticker}
              snapshot={stockSnapshot}
            />
          </>
        )}
      </div>

      {/* CD3: Secondary KPI row — 8 smaller single-line tiles */}
      {secondaryTiles.length > 0 && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-tb-border bg-tb-border sm:grid-cols-4 lg:grid-cols-8">
          {secondaryTiles.map((t) => (
            <SecondaryKpiTile
              key={t.code}
              label={t.label}
              value={t.valueFormatted}
              yoy={t.yoy}
              beacon={t.disclosureStatus === "beacon_estimate"}
              derived={t.disclosureStatus === "derived"}
            />
          ))}
        </div>
      )}

      {/* CD4: Stock row (listed only) */}
      {stockSnapshot && company.ticker && (
        <StockRow
          ticker={`${company.exchange ? `${company.exchange}:` : ""}${company.ticker}`}
          snapshot={stockSnapshot}
        />
      )}

      {/* CD5: Main body — two columns. items-start so the chart panel doesn't
          stretch to match the (taller) narrative stack on the right. */}
      <div className="grid items-start gap-3 lg:grid-cols-5">
        <div className="rounded-md border border-tb-border bg-tb-surface lg:col-span-3">
          <div className="flex items-center justify-between border-b border-tb-border px-3 py-2">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                {revChartLabel}{revChartCode !== "revenue" ? " (revenue proxy)" : ""} — {cadenceLabel}
              </h3>
              <p className="mt-0.5 text-[10px] text-tb-muted">
                {(() => {
                  const dataPts = chartData.filter(
                    (d) => d[revChartLabel] != null,
                  ).length;
                  return `Last ${dataPts} ${dataPts === 1 ? "period" : "periods"} · solid = disclosed · dotted = Beacon™`;
                })()}
              </p>
            </div>
            <span className="font-mono text-[10px] text-tb-muted">EUR</span>
          </div>
          <div className="p-2">
            {chartData.length > 0 ? (
              <MetricTimeseries
                data={chartData}
                series={[{ key: revChartLabel, label: revChartLabel }]}
                beaconFlags={beaconFlags}
                height={260}
              />
            ) : (
              <p className="p-6 text-center text-[11px] text-tb-muted">
                No revenue history for this entity yet.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <NarrativeCard
            title="Forecast & strategy"
            narrative={forecast}
          />
          <NarrativeCard title="Investment view" narrative={investment} />
        </div>
      </div>

      {/* CD6: Breakdown table — cadence chosen by hierarchical fallback */}
      <div className="rounded-md border border-tb-border bg-tb-surface">
        <div className="border-b border-tb-border px-3 py-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
            {cadenceLabel} breakdown
          </h3>
          <p className="mt-0.5 text-[10px] text-tb-muted">
            {`Last ${quarterlyRows.length} reported ${quarterlyRows.length === 1 ? "period" : "periods"} · revenue, YoY/QoQ, EBITDA margin, actives`}
          </p>
        </div>
        <Table>
          <THead>
            <tr>
              <TH>Period</TH>
              <TH className="text-right">Revenue</TH>
              <TH className="text-right">YoY</TH>
              <TH className="text-right">QoQ</TH>
              <TH className="text-right">EBITDA Margin</TH>
              <TH className="text-right">Active Users</TH>
              <TH>Source</TH>
              <TH className="text-right">Confidence</TH>
            </tr>
          </THead>
          <TBody>
            {quarterlyRows.length === 0 && (
              <TR>
                <TD colSpan={8} className="py-6 text-center text-tb-muted">
                  No quarterly revenue history.
                </TD>
              </TR>
            )}
            {quarterlyRows.map((r, i) => (
              <TR
                key={i}
                className={
                  r.isBeacon
                    ? "border-l-2 border-l-tb-beacon bg-tb-beacon/5"
                    : ""
                }
              >
                <TD className="font-mono text-[11px] text-tb-text">
                  {r.periodCode}
                </TD>
                <TD className="text-right font-mono text-tb-text">
                  {r.revDisplay}
                  {r.isBeacon && <sup className="beacon-tm">™</sup>}
                </TD>
                <TD className="text-right">
                  <DeltaChip pct={r.yoy} size="xs" />
                </TD>
                <TD className="text-right">
                  <DeltaChip pct={r.qoq} size="xs" />
                </TD>
                <TD className="text-right font-mono">
                  {r.margin}
                  {r.marginDerived && r.margin !== "—" && (
                    <span
                      className="ml-1 rounded border border-tb-border px-1 text-[8px] uppercase tracking-wider text-tb-muted"
                      title="Derived from disclosed EBITDA ÷ Revenue (same period)"
                    >
                      D
                    </span>
                  )}
                </TD>
                <TD className="text-right font-mono">{r.actUsers}</TD>
                <TD>
                  <SourceLabel source={r.source} />
                </TD>
                <TD className="text-right font-mono text-[10px] text-tb-muted">
                  {r.confidence}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {/* Geographic breakdown + metrics matrix */}
      <div className="grid gap-3 lg:grid-cols-2">
        {geoRows.length > 0 && (
          <TimeMatrix
            title={`Geographic breakdown${geoMetricLabel ? ` — ${geoMetricLabel}` : ""} (last ${orderedPeriods.length} ${tmCadenceLabel.toLowerCase()})`}
            periods={orderedPeriods}
            periodLabels={periodLabels}
            rows={geoRows}
            csvFilename={`${company.slug}-geo.csv`}
          />
        )}
        {/* Competitive position — this is a peer subset (the top operators
            the canonical view surfaces for the market), not every operator
            in the market. Round-7 flagged that the "Total €10M / 100.0%"
            row implied a market-wide denominator on /companies/betsson's
            Sweden widget when Sweden's real online_ggr total is ~€210M.
            Label the total "Peer subset total" and drop the 100% share
            cell so the per-row shares read as "vs peer subset", not "vs
            market". */}
        {peersLb && peersLb.rows.length > 0 && primaryMarket && (
          <Leaderboard
            title={`Competitive position — ${primaryMarket.name}`}
            subtitle={`${company.name} vs peer subset · ${(peersMetric ?? "revenue").replace(/_/g, " ")}`}
            valueLabel={(peersMetric ?? "revenue").toUpperCase()}
            rows={peersLb.rows}
            total={
              peersLb.total
                ? {
                    ...peersLb.total,
                    scaleWarning: peersScaleWarning,
                    label: "Peer subset total",
                    suppressShare: true,
                  }
                : null
            }
            columns={["rank", "name", "value", "share", "yoy", "sparkline"]}
            maxRows={10}
          />
        )}
      </div>

      {/* CD7: Source reports strip */}
      <div className="rounded-md border border-tb-border bg-tb-surface">
        <div className="flex items-center justify-between border-b border-tb-border px-3 py-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
            Source reports ({reports.length})
          </h3>
          <Link
            href={`/reports?q=${encodeURIComponent(company.name)}`}
            className="text-[10px] text-tb-blue hover:underline"
          >
            All reports →
          </Link>
        </div>
        {reports.length === 0 ? (
          <p className="p-4 text-[11px] text-tb-muted">
            No reports reference this company yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 px-3 py-2">
            {reports.slice(0, 12).map((r) => (
              <ReportLink
                key={r.id}
                reportId={r.id}
                className="inline-flex items-center gap-1.5 rounded border border-tb-border bg-tb-bg px-2 py-1 font-mono text-[10px] text-tb-text hover:border-tb-blue hover:text-tb-blue"
              >
                <FileText className="h-3 w-3 shrink-0 text-tb-muted" aria-hidden />
                <span className="truncate">{displayReportFilename(r.filename)}</span>
                <span className="text-tb-muted">
                  {formatDate(r.published_timestamp)}
                </span>
              </ReportLink>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ——— Helpers ——————————————————————————————————————————————————————

function abbreviate(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function PrimaryKpiTile({
  label,
  value,
  yoy,
  spark,
  beaconMask,
  source,
  disclosureStatus,
  tooltip,
}: {
  label: string;
  value: string | null;
  yoy: number | null | undefined;
  spark?: (number | null)[];
  beaconMask?: boolean[];
  source?: import("@/lib/types").SourceType | null;
  disclosureStatus?: import("@/lib/types").DisclosureStatus;
  tooltip?: string | null;
}) {
  const isBeacon = disclosureStatus === "beacon_estimate";
  const isDerived = disclosureStatus === "derived";
  return (
    <div
      className={
        "flex flex-col justify-between gap-1 bg-tb-surface px-4 py-3 " +
        (isBeacon
          ? "border-l-2 border-l-tb-beacon"
          : isDerived
          ? "border-l-2 border-l-tb-border"
          : "")
      }
    >
      <span className="text-[10px] uppercase tracking-wider text-tb-muted">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5" title={tooltip ?? undefined}>
        <span
          className={
            "font-mono text-2xl font-semibold " +
            (value ? "text-tb-text" : "text-tb-muted")
          }
        >
          {value ?? "—"}
        </span>
        {isBeacon && value && <sup className="beacon-tm">™</sup>}
        {isDerived && value && (
          <span
            className="rounded border border-tb-border px-1 text-[8px] uppercase tracking-wider text-tb-muted"
            title="Derived from disclosed inputs (EBITDA ÷ Revenue)"
          >
            Derived
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <DeltaChip pct={yoy ?? null} />
        {spark && spark.length >= 2 && (
          <Sparkline
            values={spark}
            beaconMask={beaconMask}
            width={60}
            height={16}
          />
        )}
      </div>
      {source && (
        <div>
          <SourceLabel source={source} />
        </div>
      )}
    </div>
  );
}

// T2 small-fix 3: custom Market Cap + Stock Price tiles for the operator
// primary scorecard. Use the same visual shell as PrimaryKpiTile so the
// scorecard reads uniformly. Private (no ticker) entities get a PRIVATE
// badge and em-dash value instead of wasted blank real estate.

function MarketCapTile({
  ticker,
  snapshot,
}: {
  ticker: string | null;
  snapshot: StockSnap | null;
}) {
  const isPrivate = !ticker;
  const mc = snapshot?.market_cap_eur ?? null;
  return (
    <div className="flex flex-col justify-between gap-1 bg-tb-surface px-4 py-3">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-tb-muted">
        Market cap
        {isPrivate && (
          <span
            className="rounded border border-tb-border px-1 text-[8px] uppercase tracking-wider text-tb-muted"
            title="Private entity — no listed equity"
          >
            Private
          </span>
        )}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={
            "font-mono text-2xl font-semibold " +
            (mc != null ? "text-tb-text" : "text-tb-muted")
          }
        >
          {mc != null ? formatEur(mc) : "—"}
        </span>
      </div>
      <div className="text-[10px] text-tb-muted">
        {isPrivate ? "Unlisted" : snapshot ? "EUR-converted" : "—"}
      </div>
    </div>
  );
}

function StockPriceTile({
  ticker,
  snapshot,
}: {
  ticker: string | null;
  snapshot: StockSnap | null;
}) {
  const isPrivate = !ticker;
  const price = snapshot?.latest_price ?? null;
  const ccy = snapshot?.currency ?? null;
  const dcp = snapshot?.day_change_pct ?? null;
  return (
    <div className="flex flex-col justify-between gap-1 bg-tb-surface px-4 py-3">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-tb-muted">
        Stock price
        {isPrivate && (
          <span
            className="rounded border border-tb-border px-1 text-[8px] uppercase tracking-wider text-tb-muted"
            title="Private entity — no traded stock"
          >
            Private
          </span>
        )}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={
            "font-mono text-2xl font-semibold " +
            (price != null ? "text-tb-text" : "text-tb-muted")
          }
        >
          {price != null
            ? ccy
              ? formatNative(price, ccy)
              : price.toFixed(2)
            : "—"}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <DeltaChip pct={dcp} />
        {ticker && (
          <span className="font-mono text-[10px] text-tb-muted">{ticker}</span>
        )}
      </div>
    </div>
  );
}

function SecondaryKpiTile({
  label,
  value,
  yoy,
  beacon,
  derived,
}: {
  label: string;
  value: string | null;
  yoy: number | null | undefined;
  beacon: boolean;
  derived?: boolean;
}) {
  return (
    <div
      className={
        "flex flex-col justify-between gap-0.5 bg-tb-surface px-3 py-2 " +
        (beacon
          ? "border-l-2 border-l-tb-beacon"
          : derived
          ? "border-l-2 border-l-tb-border"
          : "")
      }
    >
      <span className="truncate text-[9px] uppercase tracking-wider text-tb-muted">
        {label}
      </span>
      <span className="truncate font-mono text-sm font-semibold text-tb-text">
        {value ?? "—"}
        {beacon && value && <sup className="beacon-tm text-[8px]">™</sup>}
        {derived && value && (
          <span
            className="ml-1 text-[7px] uppercase tracking-wider text-tb-muted"
            title="Derived from disclosed inputs"
          >
            D
          </span>
        )}
      </span>
      <DeltaChip pct={yoy ?? null} size="xs" />
    </div>
  );
}

interface StockSnap {
  latest_price: number | null;
  prev_price: number | null;
  day_change_pct: number | null;
  day_change_abs: number | null;
  market_cap_eur: number | null;
  ev_ebitda: number | null;
  pe_ratio: number | null;
  currency: string | null;
  history: { period_code: string; value: number | null }[];
  fetched_at: string | null;
}

async function getStockSnapshot(entityId: string): Promise<StockSnap> {
  const [priceRows, marketCapRow, evmRow, peRow] = await Promise.all([
    query<{
      period_code: string;
      value: string | null;
      currency: string | null;
      start_date: string;
      created_at: string;
    }>(
      `SELECT p.code AS period_code, mv.value_numeric::text AS value,
              mv.currency, p.start_date::text, mv.created_at::text
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       JOIN periods p ON p.id = mv.period_id
       WHERE m.code = 'stock_price' AND mv.entity_id = $1
         AND mv.value_numeric IS NOT NULL
       ORDER BY p.start_date DESC
       LIMIT 60`,
      [entityId],
    ),
    query<{
      value: string | null;
      currency: string | null;
      unit_multiplier: string | null;
      eur_rate: string | null;
    }>(
      `SELECT mv.value_numeric::text AS value, mv.currency, mv.unit_multiplier,
              fx.eur_rate::text AS eur_rate
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       JOIN periods p ON p.id = mv.period_id
       LEFT JOIN LATERAL (
         SELECT f.eur_rate FROM fx_rates f
         WHERE f.currency_code = COALESCE(UPPER(mv.currency), 'EUR')
           AND f.rate_date <= p.end_date
         ORDER BY f.rate_date DESC LIMIT 1
       ) fx ON true
       WHERE m.code = 'market_cap' AND mv.entity_id = $1
         AND mv.value_numeric IS NOT NULL
       ORDER BY p.start_date DESC
       LIMIT 1`,
      [entityId],
    ),
    query<{ value: string | null }>(
      `SELECT mv.value_numeric::text AS value
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       JOIN periods p ON p.id = mv.period_id
       WHERE m.code = 'ev_ebitda_multiple' AND mv.entity_id = $1
         AND mv.value_numeric IS NOT NULL
       ORDER BY p.start_date DESC LIMIT 1`,
      [entityId],
    ),
    query<{ value: string | null }>(
      `SELECT mv.value_numeric::text AS value
       FROM metric_values mv
       JOIN metrics m ON m.id = mv.metric_id
       JOIN periods p ON p.id = mv.period_id
       WHERE m.code = 'pe_ratio' AND mv.entity_id = $1
         AND mv.value_numeric IS NOT NULL
       ORDER BY p.start_date DESC LIMIT 1`,
      [entityId],
    ),
  ]);

  const latest = priceRows[0] ? Number(priceRows[0].value) : null;
  const prev = priceRows[1] ? Number(priceRows[1].value) : null;
  const dcp =
    latest != null && prev != null && prev !== 0
      ? ((latest - prev) / prev) * 100
      : null;
  const dchange = latest != null && prev != null ? latest - prev : null;
  const mc = marketCapRow[0];
  const mcRaw = mc?.value != null ? Number(mc.value) : null;
  const scale =
    mc?.unit_multiplier === "billions"
      ? 1_000_000_000
      : mc?.unit_multiplier === "millions"
      ? 1_000_000
      : mc?.unit_multiplier === "thousands"
      ? 1_000
      : 1;
  const mcNative = mcRaw != null ? mcRaw * scale : null;
  const mcEur =
    mcNative != null && mc?.eur_rate && Number(mc.eur_rate) > 0
      ? mcNative / Number(mc.eur_rate)
      : mcNative;

  const history = priceRows
    .slice(0, 30)
    .reverse()
    .map((r) => ({
      period_code: r.period_code,
      value: r.value != null ? Number(r.value) : null,
    }));

  // Most-recent ingest timestamp across the price rows — represents
  // when the stock_price metric was last refreshed for this entity.
  // Renders as "updated X ago" beside the TODAY label so the freshness
  // is visible (was previously implicit; users had no way to tell if a
  // weekend stock figure was stale).
  const fetchedAt = priceRows.reduce<string | null>((latest, r) => {
    if (!r.created_at) return latest;
    if (!latest) return r.created_at;
    return r.created_at > latest ? r.created_at : latest;
  }, null);

  return {
    latest_price: latest,
    prev_price: prev,
    day_change_pct: dcp,
    day_change_abs: dchange,
    market_cap_eur: mcEur,
    ev_ebitda: evmRow[0]?.value != null ? Number(evmRow[0].value) : null,
    pe_ratio: peRow[0]?.value != null ? Number(peRow[0].value) : null,
    currency: priceRows[0]?.currency ?? null,
    history,
    fetched_at: fetchedAt,
  };
}

function StockRow({
  ticker,
  snapshot,
}: {
  ticker: string;
  snapshot: StockSnap;
}) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-tb-border bg-tb-border md:grid-cols-3">
      {/* Left — ticker + price + day change */}
      <div className="flex items-center gap-3 bg-tb-surface px-4 py-3">
        <div className="flex-1">
          <div className="font-mono text-[11px] text-tb-muted">{ticker}</div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xl font-semibold text-tb-text">
              {snapshot.latest_price != null
                ? snapshot.currency
                  ? formatNative(snapshot.latest_price, snapshot.currency)
                  : snapshot.latest_price.toFixed(2)
                : "—"}
            </span>
            {snapshot.day_change_abs != null && snapshot.currency && (
              <span
                className={
                  "font-mono text-[11px] " +
                  (snapshot.day_change_abs > 0
                    ? "text-tb-success"
                    : snapshot.day_change_abs < 0
                    ? "text-tb-danger"
                    : "text-tb-muted")
                }
              >
                {snapshot.day_change_abs > 0 ? "+" : ""}
                {formatNative(snapshot.day_change_abs, snapshot.currency)}
              </span>
            )}
            <DeltaChip pct={snapshot.day_change_pct} size="xs" />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-wider text-tb-muted">
            <span>Today</span>
            {snapshot.fetched_at && (
              <span
                className="font-mono normal-case tracking-normal text-tb-muted"
                title={`Stock data ingested ${snapshot.fetched_at}`}
              >
                · updated {relativeTime(snapshot.fetched_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Center — 30d sparkline */}
      <div className="flex flex-col justify-center gap-1 bg-tb-surface px-4 py-3">
        <div className="text-[9px] uppercase tracking-wider text-tb-muted">
          30-day
        </div>
        {snapshot.history.length >= 2 ? (
          <Sparkline
            values={snapshot.history.map((h) => h.value)}
            width={220}
            height={40}
          />
        ) : (
          <span className="font-mono text-[10px] text-tb-muted">
            Insufficient history
          </span>
        )}
      </div>

      {/* Right — multiples */}
      <div className="grid grid-cols-3 gap-px bg-tb-border">
        <MiniStat
          label="Market cap"
          value={
            snapshot.market_cap_eur != null
              ? formatEur(snapshot.market_cap_eur)
              : "—"
          }
        />
        <MiniStat
          label="EV / EBITDA"
          value={
            snapshot.ev_ebitda != null
              ? `${snapshot.ev_ebitda.toFixed(1)}×`
              : "—"
          }
        />
        <MiniStat
          label="P / E"
          value={
            snapshot.pe_ratio != null
              ? `${snapshot.pe_ratio.toFixed(1)}`
              : "—"
          }
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-center gap-0.5 bg-tb-surface px-3 py-3">
      <span className="text-[9px] uppercase tracking-wider text-tb-muted">
        {label}
      </span>
      <span className="font-mono text-sm font-semibold text-tb-text">
        {value}
      </span>
    </div>
  );
}

function NarrativeCard({
  title,
  narrative,
}: {
  title: string;
  narrative:
    | {
        id: string;
        report_id: string;
        content: string;
      }
    | null
    | undefined;
}) {
  return (
    <div className="rounded-md border border-tb-border bg-tb-surface">
      <div className="border-b border-tb-border px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
          {title}
        </h3>
      </div>
      {narrative ? (
        <div className="p-3">
          <p className="text-[11px] leading-relaxed text-tb-text">
            {truncateAtSentence(narrative.content, 560)}
          </p>
          <ReportLink
            reportId={narrative.report_id}
            className="mt-2 inline-block text-[10px] text-tb-blue hover:underline"
          >
            → source report
          </ReportLink>
        </div>
      ) : (
        <p className="p-3 text-[11px] text-tb-muted">
          No {title.toLowerCase()} excerpt for this entity yet.
        </p>
      )}
    </div>
  );
}
