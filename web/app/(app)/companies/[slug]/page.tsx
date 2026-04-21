import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCompanyBySlug,
  getCompanyReports,
  getCompanyNarratives,
} from "@/lib/queries/companies";
import { getBeaconEstimatesForValues } from "@/lib/queries/markets";
import {
  getScorecardSeries,
  getEntityLeaderboard,
} from "@/lib/queries/analytics";
import {
  listPopulatedPeriods,
  groupPeriodsForSelector,
} from "@/lib/queries/periods";
import { adaptEntityLeaderboardRows } from "@/lib/adapters";
import { buildPanelTiles, PANELS, type PanelKind } from "@/lib/scorecard-builder";
import { Scorecard } from "@/components/primitives/scorecard";
import { Leaderboard } from "@/components/primitives/leaderboard";
import { TimeMatrix } from "@/components/primitives/time-matrix";
import type {
  TimeMatrixRow,
  TimeMatrixCell,
} from "@/components/primitives/time-matrix";
import { PeriodSelector } from "@/components/layout/period-selector";
import { ReportLink } from "@/components/reports/report-link";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TH, TD, TR } from "@/components/ui/table";
import { formatDate, formatMetricValueEur } from "@/lib/format";
import { query } from "@/lib/db";
import type { MetricValueRow } from "@/lib/types";

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

const SECTION_LABEL: Record<string, string> = {
  executive_summary: "Executive summary",
  company_insights_interpretation: "Insights & interpretation",
  market_deep_dive: "Market deep-dive",
  affiliate_benchmarking: "Affiliate benchmarking",
  forecast_strategy: "Forecast & strategy",
  investment_view: "Investment view",
  valuation_downside: "Valuation — downside",
  valuation_base: "Valuation — base",
  valuation_upside: "Valuation — upside",
};

function panelKindFor(codes: string[]): PanelKind {
  if (codes.includes("operator")) return "operator";
  if (codes.includes("affiliate")) return "affiliate";
  if (codes.includes("b2b_platform")) return "b2b_platform";
  if (codes.includes("b2b_supplier")) return "b2b_supplier";
  if (codes.includes("lottery")) return "lottery";
  if (codes.includes("dfs")) return "dfs";
  return "operator"; // default
}

function typeChipFor(kind: PanelKind): string {
  switch (kind) {
    case "operator":
      return "B2C OPERATOR";
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
  const company = await getCompanyBySlug(params.slug);
  if (!company) notFound();

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
       LIMIT 1`,
      [company.id],
    ),
  ]);

  const periodGroups = groupPeriodsForSelector(populatedPeriods);

  // Recent periods that THIS entity actually has values in. Mixing global
  // recentness with entity-relevance avoids the trap where the entity's most
  // recent reporting period (e.g. Q3-25) gets pushed out by global FY-27 noise.
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
       AND p.period_type IN ('month','quarter','full_year','half_year','ltm')
     ORDER BY p.start_date DESC
     LIMIT 12`,
    [company.id],
  );
  const recentPeriods = entityPeriodRows;
  const primaryMarket = primaryMarketRow[0] ?? null;

  // Beacon lookup for scorecard tiles
  const allBeaconIds: string[] = [];
  byCode.forEach((rows) => {
    for (const r of rows) {
      if (
        r.disclosure_status === "beacon_estimate" ||
        r.disclosure_status === "derived"
      )
        allBeaconIds.push(r.metric_value_id);
    }
  });
  const beacon = await getBeaconEstimatesForValues(allBeaconIds);
  const tiles = buildPanelTiles(kind, byCode, beacon);

  // Time matrices
  const periodCodes = recentPeriods.map((p) => p.code);
  const periodLabels = Object.fromEntries(
    recentPeriods.map((p) => [p.code, p.display_name ?? p.code]),
  );
  const orderedPeriods = [...recentPeriods]
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map((p) => p.code);

  // Geographic time matrix — rows = markets where company has data, col = periods
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

  // Take the single best geographic metric (highest row count)
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
      const fmt = formatMetricValueEur(r, r.eur_rate);
      const native = r.value_numeric != null ? Number(r.value_numeric) : null;
      const sortVal =
        r.metric_unit_type === "currency" && native != null && r.eur_rate
          ? native / Number(r.eur_rate)
          : native;
      geoMarketIds.get(r.market_id)!.cells[r.period_code] = {
        value: sortVal,
        valueFormatted: fmt.display,
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

  // Metrics time matrix — rows = metrics, periods = columns (single dim = entity, no market scope)
  const metRaw = await query<MetricValueRow & { eur_rate: string | null }>(
    `SELECT mvc.metric_value_id, mvc.entity_id, mvc.market_id, mvc.metric_id,
            m.code AS metric_code, m.display_name AS metric_display_name,
            m.unit_type AS metric_unit_type,
            mvc.period_id, p.code AS period_code, p.display_name AS period_display_name,
            p.start_date AS period_start, p.end_date AS period_end,
            mvc.report_id, mvc.source_type, mvc.value_numeric, mvc.value_text,
            mvc.currency, mvc.unit_multiplier, mvc.disclosure_status,
            mvc.confidence_score, mvc.published_timestamp,
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
     WHERE mvc.entity_id = $1 AND mvc.market_id IS NULL
       AND m.code = ANY($2::text[])
       AND p.code = ANY($3::text[])`,
    [company.id, METRICS_MATRIX_CODES, periodCodes],
  );
  const metByMetric = new Map<string, typeof metRaw>();
  for (const r of metRaw) {
    if (!metByMetric.has(r.metric_code)) metByMetric.set(r.metric_code, []);
    metByMetric.get(r.metric_code)!.push(r);
  }
  const metRows: TimeMatrixRow[] = [];
  for (const code of METRICS_MATRIX_CODES) {
    const rs = metByMetric.get(code);
    if (!rs || rs.length === 0) continue;
    const cells: Record<string, TimeMatrixCell | null> = {};
    for (const r of rs) {
      const fmt = formatMetricValueEur(r, r.eur_rate);
      const native = r.value_numeric != null ? Number(r.value_numeric) : null;
      const sortVal =
        r.metric_unit_type === "currency" && native != null && r.eur_rate
          ? native / Number(r.eur_rate)
          : native;
      cells[r.period_code] = {
        value: sortVal,
        valueFormatted: fmt.display,
        disclosureStatus: r.disclosure_status,
        source: r.source_type,
      };
    }
    metRows.push({
      id: code,
      name: rs[0].metric_display_name,
      cells,
    });
  }

  // Competitive position: peers in the primary market, same entity type, ranked by best-coverage metric
  let peersLb: ReturnType<typeof adaptEntityLeaderboardRows> | null = null;
  let peersMetric: string | null = null;
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
        ["online_ggr", "sportsbook_ggr", "sportsbook_revenue", "casino_ggr", "revenue"],
      ],
    );
    peersMetric = candidate[0]?.code ?? "online_ggr";
    const peersRaw = await getEntityLeaderboard({
      metricCode: peersMetric,
      marketSlug: primaryMarket.slug,
      entityTypeCode: "operator",
      periodCode,
      limit: 10,
    });
    peersLb = adaptEntityLeaderboardRows(peersRaw);
  }

  const narrativesBySection = new Map<string, typeof narratives>();
  for (const n of narratives) {
    if (!narrativesBySection.has(n.section_code))
      narrativesBySection.set(n.section_code, []);
    narrativesBySection.get(n.section_code)!.push(n);
  }

  const subtitle = [
    primaryMarket ? `Primary market: ${primaryMarket.name}` : null,
    company.country_of_listing
      ? `Listed in ${company.country_of_listing}`
      : null,
    company.headquarters_country ? `HQ ${company.headquarters_country}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      <Scorecard
        name={company.name}
        typeChip={typeChipFor(kind)}
        ticker={company.ticker}
        exchange={company.exchange}
        subtitle={subtitle}
        period={
          Array.from(byCode.values())[0]?.[0]?.period_display_name ??
          Array.from(byCode.values())[0]?.[0]?.period_code ??
          undefined
        }
        primary={tiles.primary}
        secondary={tiles.secondary}
        actions={
          <div className="flex items-center gap-2">
            <PeriodSelector groups={periodGroups} currentCode={periodCode} />
            <Link
              href={`/companies/compare?slugs=${company.slug}`}
              className="rounded-md border border-tb-border px-3 py-1.5 text-xs text-tb-text hover:border-tb-blue"
            >
              Compare →
            </Link>
          </div>
        }
      />

      {/* 2-col: geographic breakdown | metrics over time */}
      <div className="grid gap-4 lg:grid-cols-2">
        {geoRows.length > 0 ? (
          <TimeMatrix
            title={`Geographic breakdown${geoMetricLabel ? ` — ${geoMetricLabel}` : ""}`}
            periods={orderedPeriods}
            periodLabels={periodLabels}
            rows={geoRows}
            csvFilename={`${company.slug}-geo.csv`}
          />
        ) : (
          <div className="rounded-md border border-tb-border bg-tb-surface p-6 text-[11px] text-tb-muted">
            No per-market breakdown data yet.
          </div>
        )}
        {metRows.length > 0 ? (
          <TimeMatrix
            title="Metrics over time"
            periods={orderedPeriods}
            periodLabels={periodLabels}
            rows={metRows}
            csvFilename={`${company.slug}-metrics.csv`}
          />
        ) : (
          <div className="rounded-md border border-tb-border bg-tb-surface p-6 text-[11px] text-tb-muted">
            No entity-level time series yet.
          </div>
        )}
      </div>

      {/* Competitive position */}
      {peersLb && peersLb.rows.length > 0 && primaryMarket && (
        <Leaderboard
          title={`Competitive position — ${primaryMarket.name}`}
          subtitle={`${company.name} vs peers ranked by ${(peersMetric ?? "revenue").replace(/_/g, " ")}`}
          valueLabel={(peersMetric ?? "revenue").toUpperCase()}
          rows={peersLb.rows}
          total={peersLb.total}
          columns={["rank", "name", "value", "share", "yoy", "sparkline", "ticker"]}
          maxRows={10}
        />
      )}

      {/* Narratives */}
      {narratives.length > 0 && (
        <div className="rounded-md border border-tb-border bg-tb-surface">
          <div className="border-b border-tb-border px-3 py-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
              Narratives ({narratives.length})
            </h3>
          </div>
          <div className="space-y-3 p-3">
            {Array.from(narrativesBySection.entries()).map(([section, ns]) => (
              <details
                key={section}
                open
                className="group rounded-md border border-tb-border bg-tb-bg"
              >
                <summary className="flex cursor-pointer items-center justify-between border-b border-tb-border px-3 py-2 text-[10px] uppercase tracking-wider text-tb-muted group-open:text-tb-text">
                  <span>{SECTION_LABEL[section] ?? section}</span>
                  <span className="font-mono">{ns.length}</span>
                </summary>
                <div className="space-y-3 p-3">
                  {ns.slice(0, 3).map((n) => (
                    <div
                      key={n.id}
                      className="border-l-2 border-tb-border pl-3 text-[11px] leading-relaxed text-tb-text"
                    >
                      {n.content.length > 480
                        ? n.content.slice(0, 480) + "…"
                        : n.content}
                      <div className="mt-1 text-[10px] text-tb-muted">
                        <ReportLink
                          reportId={n.report_id}
                          className="hover:text-tb-blue"
                        >
                          → view source
                        </ReportLink>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Source reports */}
      <div className="rounded-md border border-tb-border bg-tb-surface">
        <div className="flex items-center justify-between border-b border-tb-border px-3 py-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
            Source reports ({reports.length})
          </h3>
        </div>
        {reports.length === 0 ? (
          <p className="p-4 text-[11px] text-tb-muted">
            No reports reference this company yet.
          </p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Filename</TH>
                <TH>Type</TH>
                <TH>Published</TH>
                <TH className="text-right">Metrics</TH>
              </tr>
            </THead>
            <TBody>
              {reports.slice(0, 15).map((r) => (
                <TR key={r.id}>
                  <TD>
                    <ReportLink
                      reportId={r.id}
                      className="text-tb-text hover:text-tb-blue"
                    >
                      {r.filename}
                    </ReportLink>
                  </TD>
                  <TD>
                    <Badge variant="muted">{r.document_type}</Badge>
                  </TD>
                  <TD className="font-mono text-tb-muted">
                    {formatDate(r.published_timestamp)}
                  </TD>
                  <TD className="text-right font-mono">
                    {r.metric_count ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
