import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getMarketBySlug,
  getMarketReports,
  getMarketTaxHistory,
  getBeaconEstimatesForValues,
} from "@/lib/queries/markets";
import {
  getScorecardSeries,
  getEntityLeaderboard,
  getMarketLeaderboard,
} from "@/lib/queries/analytics";
import {
  listPopulatedPeriods,
  groupPeriodsForSelector,
  mostRecentRelevantPeriod,
} from "@/lib/queries/periods";
import {
  adaptEntityLeaderboardRows,
  adaptMarketLeaderboardRows,
} from "@/lib/adapters";
import { buildPanelTiles, PANELS } from "@/lib/scorecard-builder";
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
import {
  MetricTimeseries,
  type TimeseriesPoint,
  type BeaconFlags,
} from "@/components/charts/metric-timeseries";
import { formatDate, formatMetricValueEur } from "@/lib/format";
import { query } from "@/lib/db";
import type { MetricValueRow } from "@/lib/types";
import { nativeToEur, toRawNumeric } from "@/lib/queries/analytics";

export const dynamic = "force-dynamic";

const TIME_MATRIX_METRICS = [
  "online_ggr",
  "online_ngr",
  "sportsbook_ggr",
  "sportsbook_revenue",
  "sportsbook_handle",
  "casino_ggr",
  "casino_revenue",
  "ggr",
  "ngr",
  "market_share_ggr",
  "market_share_handle",
  "active_customers",
  "ftd",
];

// Operator leaderboard candidate metrics — fall back to first one with coverage
const OPERATOR_LEADERBOARD_METRICS = [
  "online_ggr",
  "sportsbook_ggr",
  "sportsbook_revenue",
  "casino_ggr",
  "revenue",
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

export default async function MarketDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { period?: string };
}) {
  const market = await getMarketBySlug(params.slug);
  if (!market) notFound();

  const periodCode = searchParams.period ?? null;

  const primaryCodes = PANELS.market.primary.map((r) => r.code);
  const secondaryCodes = PANELS.market.secondary.map((r) => r.code);
  const scorecardCodes = [...primaryCodes, ...secondaryCodes];

  // Pick the operator leaderboard metric that has the most entity coverage
  const opMetricRow = await query<{ metric_code: string; n: number }>(
    `SELECT m.code AS metric_code, COUNT(DISTINCT mvc.entity_id)::int AS n
     FROM metric_value_canonical mvc
     JOIN metrics m ON m.id = mvc.metric_id
     WHERE mvc.market_id = $1 AND mvc.entity_id IS NOT NULL
       AND m.code = ANY($2::text[])
     GROUP BY m.code
     ORDER BY n DESC NULLS LAST
     LIMIT 1`,
    [market.id, OPERATOR_LEADERBOARD_METRICS],
  );
  const operatorMetric = opMetricRow[0]?.metric_code ?? "online_ggr";

  // Periods: most recent 12 with data, ordered.
  const populatedPeriods = await listPopulatedPeriods();
  const periodGroups = groupPeriodsForSelector(populatedPeriods);

  // Recent periods scoped to this market — keeps the matrix focused on
  // periods this market actually reports in.
  const tmPeriodsRaw = await query<{
    code: string;
    display_name: string | null;
    start_date: string;
    period_type: string;
  }>(
    `SELECT p.code, p.display_name, p.start_date::text, p.period_type
     FROM periods p
     WHERE p.id IN (
       SELECT DISTINCT period_id FROM metric_values WHERE market_id = $1
     )
       AND p.period_type IN ('month','quarter','full_year','half_year','ltm')
     ORDER BY p.start_date DESC
     LIMIT 12`,
    [market.id],
  );
  const tmPeriods = tmPeriodsRaw.sort((a, b) =>
    a.start_date.localeCompare(b.start_date),
  );
  const periodCodes = tmPeriods.map((p) => p.code);
  const periodLabels = Object.fromEntries(
    tmPeriods.map((p) => [p.code, p.display_name ?? p.code]),
  );

  // B4: load direct sub-markets so the page can show a "Sub-markets" links
  // strip when this is a country/region. Strict children only — no recursion.
  const subMarkets = await query<{
    id: string;
    name: string;
    slug: string;
    market_type: string;
    val_count: number;
  }>(
    `SELECT mk.id, mk.name, mk.slug, mk.market_type,
            (SELECT COUNT(*)::int FROM metric_values mv WHERE mv.market_id = mk.id) AS val_count
     FROM markets mk
     WHERE mk.parent_market_id = $1
     ORDER BY mk.name`,
    [market.id],
  );

  // M5: pick a sub-markets-leaderboard metric — the one with the best coverage
  // across this country's direct children. Falls back through a preference list.
  const SUB_METRIC_PREF = [
    "online_ggr",
    "sportsbook_ggr",
    "sportsbook_handle",
    "casino_ggr",
    "ggr",
    "online_revenue",
    "sportsbook_revenue",
  ];
  let subMarketMetric: string | null = null;
  if (subMarkets.length > 0) {
    const covRow = await query<{ metric_code: string; n: number }>(
      `SELECT m.code AS metric_code, COUNT(DISTINCT mvc.market_id)::int AS n
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN markets child ON child.id = mvc.market_id
       WHERE child.parent_market_id = $1
         AND mvc.entity_id IS NULL
         AND m.code = ANY($2::text[])
       GROUP BY m.code
       ORDER BY n DESC LIMIT 1`,
      [market.id, SUB_METRIC_PREF],
    );
    subMarketMetric = covRow[0]?.metric_code ?? null;
  }
  const subMarketRowsRaw = subMarketMetric
    ? await getMarketLeaderboard({
        metricCode: subMarketMetric,
        parentMarketId: market.id,
        limit: 50,
      })
    : [];
  const subMarketLb = adaptMarketLeaderboardRows(subMarketRowsRaw);

  const [byCode, reports, taxHistory, operatorsRaw, narratives, tmRowsRaw, regulatoryFilings] =
    await Promise.all([
      getScorecardSeries({ marketId: market.id, metricCodes: scorecardCodes }),
      getMarketReports(market.id, 25),
      getMarketTaxHistory(market.id),
      getEntityLeaderboard({
        metricCode: operatorMetric,
        marketSlug: market.slug,
        periodCode,
        limit: 25,
      }),
      query<{
        id: string;
        report_id: string;
        section_code: string;
        content: string;
        report_filename: string;
        published_timestamp: string | null;
      }>(
        `SELECT n.id, n.report_id, n.section_code, n.content,
                r.filename AS report_filename, r.published_timestamp
         FROM narratives n
         JOIN reports r ON r.id = n.report_id
         WHERE n.market_id = $1
         ORDER BY r.published_timestamp DESC NULLS LAST
         LIMIT 30`,
        [market.id],
      ),
      query<MetricValueRow & { eur_rate: string | null }>(
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
         WHERE mvc.market_id = $1 AND mvc.entity_id IS NULL
           AND m.code = ANY($2::text[])
           AND p.code = ANY($3::text[])`,
        [market.id, TIME_MATRIX_METRICS, periodCodes],
      ),
      // MD2: Regulatory filings — reports with a regulator-linked source that
      // reference this market, newest first. Small list module in the right
      // column alongside tax history.
      query<{
        id: string;
        filename: string;
        document_type: string;
        published_timestamp: string | null;
      }>(
        `SELECT DISTINCT r.id, r.filename, r.document_type, r.published_timestamp
         FROM reports r
         JOIN report_markets rm ON rm.report_id = r.id
         WHERE rm.market_id = $1
           AND r.document_type IN ('regulatory_update','market_update')
         ORDER BY r.published_timestamp DESC NULLS LAST
         LIMIT 10`,
        [market.id],
      ),
    ]);

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
  const tiles = buildPanelTiles("market", byCode, beacon);

  // Build time matrix rows
  const tmRows: TimeMatrixRow[] = [];
  const byMetric = new Map<string, (MetricValueRow & { eur_rate: string | null })[]>();
  for (const r of tmRowsRaw) {
    if (!byMetric.has(r.metric_code)) byMetric.set(r.metric_code, []);
    byMetric.get(r.metric_code)!.push(r);
  }

  // Opt-pass 2: primary market time-series chart. Pick the best-covered
  // metric we have for this market from a prioritized list, then render a
  // line chart with solid-disclosed + dotted-Beacon segments.
  const CHART_PREF = [
    "online_ggr",
    "online_ngr",
    "sportsbook_handle",
    "sportsbook_ggr",
    "sportsbook_revenue",
    "ggr",
  ];
  let chartMetricCode: string | null = null;
  for (const code of CHART_PREF) {
    if ((byMetric.get(code) ?? []).length >= 3) {
      chartMetricCode = code;
      break;
    }
  }
  let chartData: TimeseriesPoint[] = [];
  let chartBeaconFlags: BeaconFlags = {};
  let chartLabel = "";
  if (chartMetricCode) {
    const rs = [...(byMetric.get(chartMetricCode) ?? [])].sort((a, b) =>
      a.period_start.localeCompare(b.period_start),
    );
    chartLabel = rs[0]?.metric_display_name ?? chartMetricCode;
    chartData = rs.map((r) => ({
      period: r.period_code,
      period_start: r.period_start,
      [chartLabel]:
        r.metric_unit_type === "currency"
          ? nativeToEur(r.value_numeric, r.unit_multiplier, r.eur_rate)
          : toRawNumeric(r.value_numeric, r.unit_multiplier),
    }));
    chartBeaconFlags = {
      [chartLabel]: new Set(
        rs
          .filter(
            (r) =>
              r.disclosure_status === "beacon_estimate" ||
              r.disclosure_status === "derived",
          )
          .map((r) => r.period_code),
      ),
    };
  }
  for (const code of TIME_MATRIX_METRICS) {
    const rs = byMetric.get(code);
    if (!rs || rs.length === 0) continue;
    const cells: Record<string, TimeMatrixCell | null> = {};
    for (const r of rs) {
      const fmt = formatMetricValueEur(r, r.eur_rate);
      // For sorting/heat, use EUR-converted value when monetary, raw otherwise
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
    tmRows.push({
      id: code,
      name: rs[0].metric_display_name,
      cells,
    });
  }

  const operators = adaptEntityLeaderboardRows(operatorsRaw, {
    hrefBase: "/companies",
  });

  const narrativesBySection = new Map<string, typeof narratives>();
  for (const n of narratives) {
    if (!narrativesBySection.has(n.section_code))
      narrativesBySection.set(n.section_code, []);
    narrativesBySection.get(n.section_code)!.push(n);
  }

  const scorecardSubtitle = [
    market.market_type,
    market.iso_country,
    market.iso_subdivision,
    market.regulator_name,
    market.regulation_date
      ? `Regulated from ${formatDate(market.regulation_date)}`
      : null,
    market.tax_rate_igaming != null
      ? `iGaming tax ${Number(market.tax_rate_igaming).toFixed(1)}%`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Header period label — use the latest period from the scorecard data
  const headerPeriod =
    Array.from(byCode.values())[0]?.[0]?.period_display_name ??
    Array.from(byCode.values())[0]?.[0]?.period_code ??
    undefined;

  return (
    <div className="space-y-3">
      <Scorecard
        name={market.name}
        typeChip={market.market_type}
        subtitle={scorecardSubtitle}
        period={headerPeriod}
        primary={tiles.primary}
        secondary={tiles.secondary}
        actions={
          <div className="flex items-center gap-2">
            <PeriodSelector groups={periodGroups} currentCode={periodCode} />
            <Link
              href={`/markets/compare?slugs=${market.slug}`}
              className="rounded-md border border-tb-border px-3 py-1.5 text-xs text-tb-text hover:border-tb-blue"
            >
              Compare →
            </Link>
          </div>
        }
      />

      {/* M5: Sub-markets module — when this country has direct children (US
          → 28 states, Canada → 2 provinces), render a ranked leaderboard of
          them against the best-covered metric. Falls back to a chip strip
          when no metric-level data is available for any sub-market yet. */}
      {subMarkets.length > 0 && subMarketLb.rows.length > 0 && subMarketMetric && (
        <Leaderboard
          title={`Sub-markets of ${market.name}`}
          subtitle={`Ranked by ${subMarketMetric.replace(/_/g, " ")} · click a row to drill into that market`}
          valueLabel={subMarketMetric.toUpperCase()}
          nameLabel="Sub-market"
          rows={subMarketLb.rows}
          total={subMarketLb.total}
          columns={[
            "rank",
            "name",
            "value",
            "share",
            "yoy",
            "sparkline",
            "extra",
          ]}
          maxRows={40}
        />
      )}
      {subMarkets.length > 0 && subMarketLb.rows.length === 0 && (
        <div className="rounded-md border border-tb-border bg-tb-surface">
          <div className="flex items-center justify-between border-b border-tb-border px-3 py-2">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                Sub-markets ({subMarkets.length})
              </h3>
              <p className="mt-0.5 text-[10px] text-tb-muted">
                Direct children of {market.name} — no covered metric to rank yet; click to drill in
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 px-3 py-2">
            {subMarkets.map((s) => (
              <Link
                key={s.id}
                href={`/markets/${s.slug}`}
                className="inline-flex items-center gap-1.5 rounded border border-tb-border bg-tb-bg px-2 py-1 text-[10px] text-tb-text hover:border-tb-blue hover:text-tb-blue"
              >
                <span>{s.name}</span>
                {s.val_count > 0 && (
                  <span className="font-mono text-[9px] text-tb-muted">
                    {s.val_count}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Primary time-series chart (opt-pass 2) — solid disclosed, dotted Beacon */}
      {chartMetricCode && chartData.length >= 3 && (
        <div className="rounded-md border border-tb-border bg-tb-surface">
          <div className="flex items-center justify-between border-b border-tb-border px-3 py-2">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                {chartLabel} — time series
              </h3>
              <p className="mt-0.5 text-[10px] text-tb-muted">
                Last {chartData.length} periods · solid = disclosed · dotted = Beacon™
              </p>
            </div>
            <span className="font-mono text-[10px] text-tb-muted">EUR</span>
          </div>
          <div className="p-2">
            <MetricTimeseries
              data={chartData}
              series={[{ key: chartLabel, label: chartLabel }]}
              beaconFlags={chartBeaconFlags}
              height={220}
            />
          </div>
        </div>
      )}

      {/* 2-col: operators in market (cap 15, MD1) | time matrix */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Leaderboard
          title={`Operators in ${market.name}`}
          subtitle={`Ranked by latest ${operatorMetric.replace(/_/g, " ")}`}
          valueLabel={operatorMetric.toUpperCase()}
          rows={operators.rows}
          total={operators.total}
          columns={["rank", "name", "value", "share", "yoy", "sparkline"]}
          maxRows={15}
          showViewAll
          viewAllHref={`/companies?market=${market.slug}`}
        />

        <TimeMatrix
          title={`${market.name} — last 12 periods`}
          periods={periodCodes}
          periodLabels={periodLabels}
          rows={tmRows}
          csvFilename={`${market.slug}-metrics.csv`}
          valueLabel="€"
        />
      </div>

      {/* MD2: Regulatory filings — compact list in side panel alongside
          tax history so market page carries the full regulator story */}
      <div className="grid items-start gap-3 lg:grid-cols-3">
        {regulatoryFilings.length > 0 ? (
          <div className="rounded-md border border-tb-border bg-tb-surface">
            <div className="border-b border-tb-border px-3 py-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                Regulatory filings
              </h3>
              <p className="mt-0.5 text-[10px] text-tb-muted">
                Regulator-linked reports, newest first
              </p>
            </div>
            <ul className="divide-y divide-tb-border/60">
              {regulatoryFilings.map((f) => (
                <li key={f.id} className="px-3 py-1.5">
                  <ReportLink
                    reportId={f.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-sm bg-tb-border" />
                      <span className="truncate text-[11px] text-tb-text hover:text-tb-blue">
                        {f.filename}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[9px] text-tb-muted">
                      {formatDate(f.published_timestamp)}
                    </span>
                  </ReportLink>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-md border border-tb-border bg-tb-surface p-4 text-[11px] text-tb-muted">
            No regulatory filings indexed for this market.
          </div>
        )}

        {/* Tax history — moved here to pair visually with the filings list */}
        {taxHistory.length > 0 ? (
          <div className="rounded-md border border-tb-border bg-tb-surface lg:col-span-2">
            <div className="border-b border-tb-border px-3 py-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                Regulatory activity — tax history
              </h3>
            </div>
            <Table>
              <THead>
                <tr>
                  <TH>Vertical</TH>
                  <TH>Rate</TH>
                  <TH>Basis</TH>
                  <TH>From</TH>
                  <TH>To</TH>
                  <TH>Notes</TH>
                </tr>
              </THead>
              <TBody>
                {taxHistory.map((t) => (
                  <TR key={t.id}>
                    <TD>
                      <Badge variant="muted">{t.vertical ?? "all"}</Badge>
                    </TD>
                    <TD className="font-mono">
                      {Number(t.tax_rate).toFixed(2)}%
                    </TD>
                    <TD className="text-tb-muted">{t.tax_basis ?? "—"}</TD>
                    <TD className="font-mono text-tb-muted">
                      {formatDate(t.effective_from)}
                    </TD>
                    <TD className="font-mono text-tb-muted">
                      {t.effective_to ? formatDate(t.effective_to) : "current"}
                    </TD>
                    <TD className="text-tb-muted">{t.notes ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        ) : (
          <div className="lg:col-span-2" />
        )}
      </div>

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
                          → {n.report_filename} · {formatDate(n.published_timestamp)}
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
          <span className="font-mono text-[10px] text-tb-muted">
            last 25 referencing {market.name}
          </span>
        </div>
        {reports.length === 0 ? (
          <p className="p-4 text-[11px] text-tb-muted">
            No reports reference this market yet.
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
