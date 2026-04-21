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
} from "@/lib/queries/analytics";
import {
  listPopulatedPeriods,
  groupPeriodsForSelector,
  mostRecentRelevantPeriod,
} from "@/lib/queries/periods";
import { adaptEntityLeaderboardRows } from "@/lib/adapters";
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
import { formatDate, formatMetricValueEur } from "@/lib/format";
import { query } from "@/lib/db";
import type { MetricValueRow } from "@/lib/types";

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

  const [byCode, reports, taxHistory, operatorsRaw, narratives, tmRowsRaw] =
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
    <div className="space-y-4">
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

      {/* 2-col: operators in market | time matrix */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Leaderboard
          title={`Operators in ${market.name}`}
          subtitle={`Ranked by latest ${operatorMetric.replace(/_/g, " ")}`}
          valueLabel={operatorMetric.toUpperCase()}
          rows={operators.rows}
          total={operators.total}
          columns={["rank", "name", "value", "share", "yoy", "sparkline"]}
          maxRows={20}
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

      {/* Regulatory activity */}
      {taxHistory.length > 0 && (
        <div className="rounded-md border border-tb-border bg-tb-surface">
          <div className="flex items-center justify-between border-b border-tb-border px-3 py-2">
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
      )}
    </div>
  );
}
