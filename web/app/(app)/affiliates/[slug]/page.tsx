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
  nativeToEur,
  nativeToEurInferred,
  toRawNumeric,
  preferAggregateForCurrencyTile,
} from "@/lib/queries/analytics";
import {
  buildPanelTiles,
  PANELS,
  augmentDerivedEbitdaMargin,
} from "@/lib/scorecard-builder";
import { ScorecardV2 } from "@/components/primitives/scorecard-v2";
import type { KpiTileV2 } from "@/components/primitives/scorecard-v2";
import { TimeMatrix } from "@/components/primitives/time-matrix";
import type {
  TimeMatrixRow,
  TimeMatrixCell,
} from "@/components/primitives/time-matrix";
import { DeepDive } from "@/components/primitives/deep-dive";
import type {
  DeepDivePoint,
  DeepDiveNarrative,
} from "@/components/primitives/deep-dive";
import { ReportLink } from "@/components/reports/report-link";
import { displayReportFilename } from "@/lib/formatters/reportFilename";
import {
  formatEur,
  formatMetricValueEur,
  formatPct,
  inferUnitMultiplier,
} from "@/lib/format";
import type { KpiTile } from "@/components/primitives/scorecard";

export const dynamic = "force-dynamic";

const MATRIX_METRIC_CODES = [
  "revenue",
  "ebitda",
  "ebitda_margin",
  "ndc",
  "ftd",
] as const;

const MATRIX_DISPLAY: { code: (typeof MATRIX_METRIC_CODES)[number]; label: string }[] = [
  { code: "revenue", label: "Revenue" },
  { code: "ebitda", label: "EBITDA" },
  { code: "ebitda_margin", label: "EBITDA Margin" },
  { code: "ndc", label: "NDCs" },
  { code: "ftd", label: "FTDs" },
];

export default async function AffiliateDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  let entity = await getCompanyBySlug(params.slug);
  if (!entity) {
    const canonical = await findCanonicalSlugForAlias(params.slug);
    if (canonical && canonical.slug !== params.slug) {
      redirect(`/affiliates/${canonical.slug}`);
    }
    notFound();
  }
  entity = entity as NonNullable<typeof entity>;

  // Guard: redirect non-affiliate entities to /companies/[slug]. The page
  // is an affiliate-specialised surface; a ticker that turns out to be a
  // B2B supplier or lottery shouldn't 404 — it should route correctly.
  const isAffiliate = entity.entity_type_codes.includes("affiliate");
  if (!isAffiliate) {
    redirect(`/companies/${entity.slug}`);
  }

  const panel = PANELS.affiliate;
  const scorecardCodes = [
    ...panel.primary.map((r) => r.code),
    ...panel.secondary.map((r) => r.code),
  ];

  const [byCode, reports, narratives] = await Promise.all([
    getScorecardSeries({ entityId: entity.id, metricCodes: scorecardCodes }),
    getCompanyReports(entity.id, 25),
    getCompanyNarratives(entity.id),
  ]);

  const byCodeAug = augmentDerivedEbitdaMargin(byCode);

  // Promote LTM / aggregate rows to the headline so Revenue Hero doesn't
  // mis-label a single-quarter figure as LTM revenue.
  const aggCodes = new Set<string>(scorecardCodes);
  for (const code of aggCodes) {
    const rs = byCodeAug.get(code);
    if (!rs || rs.length === 0) continue;
    const promoted = preferAggregateForCurrencyTile(rs);
    if (promoted !== rs) byCodeAug.set(code, promoted);
  }

  const allBeaconIds: string[] = [];
  byCodeAug.forEach((rows) => {
    for (const r of rows) {
      if (r.metric_value_id.startsWith("derived:")) continue;
      if (
        r.disclosure_status === "beacon_estimate" ||
        r.disclosure_status === "derived"
      )
        allBeaconIds.push(r.metric_value_id);
    }
  });
  const beacon = await getBeaconEstimatesForValues(allBeaconIds);
  const tiles = buildPanelTiles("affiliate", byCodeAug, beacon);

  const primaryV2 = tiles.primary.map(toKpiTileV2);
  const secondaryV2 = tiles.secondary.map(toKpiTileV2);

  // Derived "Revenue per NDC" — compute from latest revenue + latest NDC
  // row when both are for the same period. Replaces the generic `arpu`
  // placeholder that the PANELS.affiliate recipe carries by default.
  const revPerNdc = deriveRevenuePerNdc(byCodeAug);
  if (revPerNdc) {
    // Replace the ARPU-shaped "Revenue / NDC" tile if present; otherwise append.
    const idx = primaryV2.findIndex((t) => t.code === "arpu");
    if (idx >= 0) primaryV2[idx] = revPerNdc;
    else primaryV2.push(revPerNdc);
  }

  // Deep Dive — revenue series for the last ~12 quarter rows.
  const revSeries = buildRevenueDeepDivePoints(byCodeAug);
  const deepDiveNarratives: DeepDiveNarrative[] = narratives
    .slice(0, 4)
    .map((n) => ({
      section: n.section_code ?? "narrative",
      content: n.content,
      report_id: n.report_id,
    }));

  // Time Matrix — quarterly cadence preferred. Rows: Revenue, EBITDA,
  // EBITDA Margin, NDCs, FTDs. Columns: last 8 periods of the chosen
  // cadence.
  const {
    periods: matrixPeriods,
    periodLabels: matrixLabels,
    rows: matrixRows,
  } = buildTimeMatrix(byCodeAug);

  const primaryMarkets = extractPrimaryMarkets(narratives);

  return (
    <div className="space-y-3">
      <nav className="text-xs text-tb-muted">
        <Link href="/affiliates" className="hover:text-tb-blue">
          Affiliates
        </Link>{" "}
        · <span className="text-tb-text">{entity.name}</span>
      </nav>

      <ScorecardV2
        entity={{
          name: entity.name,
          type: "AFFILIATE",
          ticker: entity.ticker,
          exchange: entity.exchange,
          markets: primaryMarkets,
          subtitle:
            primaryMarkets.length > 0
              ? `Affiliate · ${
                  entity.ticker
                    ? `${entity.exchange ? entity.exchange + ":" : ""}${
                        entity.ticker
                      } · `
                    : ""
                }${primaryMarkets.slice(0, 4).join(", ")}`
              : `Affiliate${
                  entity.ticker
                    ? ` · ${entity.exchange ? entity.exchange + ":" : ""}${
                        entity.ticker
                      }`
                    : ""
                }`,
        }}
        period={latestPeriod(byCodeAug)}
        primaryKpis={primaryV2}
        secondaryKpis={secondaryV2}
      />

      {/* Deep Dive — Revenue metric composition */}
      {revSeries.length > 0 && (
        <DeepDive
          title={`${entity.name} — Revenue`}
          subtitle="Disclosed and modeled values across reporting periods"
          series={revSeries}
          narratives={deepDiveNarratives}
          sourceReports={reports.slice(0, 12).map((r) => ({
            id: r.id,
            filename: r.filename,
            published: r.published_timestamp,
          }))}
        />
      )}

      {/* Time Matrix — metrics × periods */}
      {matrixPeriods.length > 0 && matrixRows.length > 0 && (
        <TimeMatrix
          title={`${entity.name} — metrics over time`}
          periods={matrixPeriods}
          periodLabels={matrixLabels}
          rows={matrixRows}
          valueLabel="Latest periods"
          csvFilename={`${entity.slug}_metrics_matrix.csv`}
        />
      )}

      {/* Source reports — full listing */}
      {reports.length > 0 && (
        <div className="rounded-md border border-tb-border bg-tb-surface">
          <div className="border-b border-tb-border px-3 py-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
              Source reports ({reports.length})
            </h3>
            <p className="mt-0.5 text-[10px] text-tb-muted">
              Published Trailblaze reports mentioning {entity.name}
            </p>
          </div>
          <ul className="divide-y divide-tb-border/50">
            {reports.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-3 py-1.5 text-[11px]"
              >
                <ReportLink
                  reportId={r.id}
                  className="truncate text-tb-text hover:text-tb-blue"
                >
                  {displayReportFilename(r.filename)}
                </ReportLink>
                <span className="whitespace-nowrap font-mono text-[10px] text-tb-muted">
                  {r.published_timestamp
                    ? new Date(r.published_timestamp).toLocaleDateString(
                        undefined,
                        { year: "numeric", month: "short", day: "numeric" },
                      )
                    : "—"}
                  {r.metric_count != null ? ` · ${r.metric_count} metrics` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function toKpiTileV2(t: KpiTile): KpiTileV2 {
  return {
    code: t.code,
    label: t.label,
    value: t.valueFormatted,
    unit: t.unitHint ?? null,
    yoy: t.yoy,
    sparkline: t.spark,
    beaconMask: t.beaconMask,
    source: t.source,
    disclosureStatus: t.disclosureStatus,
    beacon: t.beacon ?? null,
    nativeTooltip: t.nativeTooltip,
    period: t.period,
  };
}

function latestPeriod(byCode: Map<string, CanonicalRowLite[]> | undefined):
  | { code: string; label: string; source?: string | null }
  | null {
  if (!byCode) return null;
  // Pick the newest period across revenue / ebitda / ndc — whichever has
  // the most recent published entry.
  let best: { code: string; label: string; start: string } | null = null;
  const preferred = ["revenue", "ebitda", "ndc", "ebitda_margin"];
  for (const code of preferred) {
    const rs = byCode.get(code) ?? [];
    if (rs.length === 0) continue;
    const latest = rs[0];
    if (!latest) continue;
    const candidate = {
      code: latest.period_code,
      label: latest.period_display_name ?? latest.period_code,
      start: latest.period_start,
    };
    if (!best || candidate.start > best.start) best = candidate;
  }
  if (!best) return null;
  return { code: best.code, label: best.label };
}

// Minimal CanonicalRow shape — matches analytics.ts, reimported here just
// for local types without pulling the full shape.
type CanonicalRowLite = {
  metric_value_id: string;
  metric_code: string;
  metric_display_name: string;
  metric_unit_type: string;
  period_code: string;
  period_display_name: string | null;
  period_start: string;
  period_end: string;
  period_type: string;
  source_type: string;
  value_numeric: string | null;
  value_text: string | null;
  currency: string | null;
  unit_multiplier: "units" | "thousands" | "millions" | "billions" | null;
  disclosure_status:
    | "disclosed"
    | "not_disclosed"
    | "partially_disclosed"
    | "beacon_estimate"
    | "derived";
  confidence_score: string | null;
  eur_rate: string | null;
};

function deriveRevenuePerNdc(
  byCode: Map<string, CanonicalRowLite[]>,
): KpiTileV2 | null {
  const revRows = byCode.get("revenue") ?? [];
  const ndcRows = byCode.get("ndc") ?? [];
  if (revRows.length === 0 || ndcRows.length === 0) return null;
  // Find a shared period with both disclosed (or partially_disclosed).
  const ndcByPeriod = new Map<string, CanonicalRowLite>();
  for (const n of ndcRows) ndcByPeriod.set(n.period_code, n);
  for (const r of revRows) {
    const n = ndcByPeriod.get(r.period_code);
    if (!n) continue;
    if (r.value_numeric == null || n.value_numeric == null) continue;
    const okDisc = (s: string) =>
      s === "disclosed" || s === "partially_disclosed" || s === "derived";
    if (!okDisc(r.disclosure_status) || !okDisc(n.disclosure_status)) continue;
    const revEur = nativeToEurInferred(
      r.value_numeric,
      r.unit_multiplier,
      r.eur_rate,
      r.metric_code,
    );
    const ndcRaw = toRawNumeric(n.value_numeric, n.unit_multiplier);
    if (revEur == null || ndcRaw == null || ndcRaw <= 0) continue;
    const ratio = revEur / ndcRaw;
    return {
      code: "revenue_per_ndc_derived",
      label: "Revenue / NDC",
      value: formatEur(ratio),
      unit: "EUR",
      yoy: null,
      sparkline: [],
      period: r.period_display_name ?? r.period_code,
      source: r.source_type as KpiTileV2["source"],
      disclosureStatus: "derived",
      beacon: false,
    };
  }
  return null;
}

function buildRevenueDeepDivePoints(
  byCode: Map<string, CanonicalRowLite[]>,
): DeepDivePoint[] {
  const raw = byCode.get("revenue") ?? [];
  if (raw.length === 0) return [];
  // Pick the dominant cadence — quarter preferred; fall back half_year / full_year.
  const quarter = raw.filter((r) => r.period_type === "quarter");
  const half = raw.filter((r) => r.period_type === "half_year");
  const full = raw.filter((r) => r.period_type === "full_year");
  const chosen =
    quarter.length >= 3 ? quarter : half.length >= 3 ? half : full.length >= 3 ? full : raw;
  const sorted = [...chosen].sort((a, b) =>
    a.period_start.localeCompare(b.period_start),
  );
  return sorted.slice(-12).map<DeepDivePoint>((r) => {
    const mult = inferUnitMultiplier(
      r.value_numeric != null ? Number(r.value_numeric) : null,
      r.metric_code,
      r.unit_multiplier,
    );
    const eur = nativeToEur(r.value_numeric, mult, r.eur_rate);
    const { display } = formatMetricValueEur(
      {
        value_numeric: r.value_numeric,
        value_text: r.value_text,
        metric_unit_type: r.metric_unit_type as "currency",
        currency: r.currency,
        unit_multiplier: mult,
      },
      r.eur_rate,
    );
    return {
      period: r.period_code,
      periodLabel: r.period_display_name ?? r.period_code,
      periodStart: r.period_start,
      value: eur,
      valueFormatted: display,
      disclosureStatus: r.disclosure_status,
      source: r.source_type as DeepDivePoint["source"],
      confidence: r.confidence_score != null ? Number(r.confidence_score) : null,
      report_id: null,
    };
  });
}

function buildTimeMatrix(byCode: Map<string, CanonicalRowLite[]>): {
  periods: string[];
  periodLabels: Record<string, string>;
  rows: TimeMatrixRow[];
} {
  // Determine the shared period cohort — union of periods across our
  // target metrics, filtered to the preferred cadence, last 8.
  const targetMetrics = MATRIX_DISPLAY;
  const periodInfo = new Map<
    string,
    { code: string; label: string; start: string; type: string }
  >();
  for (const m of targetMetrics) {
    const rows = byCode.get(m.code) ?? [];
    for (const r of rows) {
      if (!periodInfo.has(r.period_code))
        periodInfo.set(r.period_code, {
          code: r.period_code,
          label: r.period_display_name ?? r.period_code,
          start: r.period_start,
          type: r.period_type,
        });
    }
  }
  const all = [...periodInfo.values()];
  // Prefer quarter cadence; fall back
  const qOnly = all.filter((p) => p.type === "quarter");
  const hOnly = all.filter((p) => p.type === "half_year");
  const yOnly = all.filter((p) => p.type === "full_year");
  const chosen =
    qOnly.length >= 3 ? qOnly : hOnly.length >= 3 ? hOnly : yOnly.length >= 3 ? yOnly : all;
  const cohort = [...chosen]
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 8)
    .sort((a, b) => a.start.localeCompare(b.start));

  const periods = cohort.map((p) => p.code);
  const periodLabels: Record<string, string> = Object.fromEntries(
    cohort.map((p) => [p.code, p.label]),
  );

  const rows: TimeMatrixRow[] = [];
  for (const m of targetMetrics) {
    const rawRows = byCode.get(m.code) ?? [];
    if (rawRows.length === 0) continue;
    const cells: Record<string, TimeMatrixCell | null> = {};
    for (const p of periods) {
      const matched = rawRows.find((r) => r.period_code === p);
      if (!matched || matched.value_numeric == null) {
        cells[p] = null;
        continue;
      }
      const isCurrency = matched.metric_unit_type === "currency";
      const isPct = matched.metric_unit_type === "percentage";
      const mult = inferUnitMultiplier(
        Number(matched.value_numeric),
        matched.metric_code,
        matched.unit_multiplier,
      );
      const value = isCurrency
        ? nativeToEur(matched.value_numeric, mult, matched.eur_rate)
        : toRawNumeric(matched.value_numeric, mult);
      if (isCurrency) {
        cells[p] = {
          value,
          valueFormatted: value != null ? formatEur(value) : "—",
          disclosureStatus: matched.disclosure_status,
          source: matched.source_type as any,
        };
      } else if (isPct) {
        cells[p] = {
          value,
          valueFormatted:
            value != null ? formatPct(matched.value_numeric) : "—",
          disclosureStatus: matched.disclosure_status,
          source: matched.source_type as any,
        };
      } else {
        cells[p] = {
          value,
          valueFormatted: value != null ? abbreviate(value) : "—",
          disclosureStatus: matched.disclosure_status,
          source: matched.source_type as any,
        };
      }
    }
    rows.push({
      id: m.code,
      name: m.label,
      cells,
    });
  }
  return { periods, periodLabels, rows };
}

function extractPrimaryMarkets(narratives: { market_id: string | null }[]): string[] {
  // Narratives don't carry market name — upstream query returns market_id
  // only. For the page subtitle we fall back to narrative market_ids being
  // empty for most affiliates anyway. Leave empty; the ScorecardV2 subtitle
  // still renders type + ticker.
  return [];
}

function abbreviate(n: number | null): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}
