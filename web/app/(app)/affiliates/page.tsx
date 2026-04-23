import Link from "next/link";
import {
  getAffiliateList,
  getAffiliateAggregateKpis,
  getAffiliateCommentary,
  getAffiliateReports,
} from "@/lib/queries/affiliates";
import { getEntityLeaderboard } from "@/lib/queries/analytics";
import { LeaderboardV2 } from "@/components/primitives/leaderboard-v2";
import type { LeaderboardV2Row } from "@/components/primitives/leaderboard-v2";
import { formatEur } from "@/lib/format";
import { truncateAtSentence } from "@/lib/format";
import { ReportLink } from "@/components/reports/report-link";
import { displayReportFilename } from "@/lib/formatters/reportFilename";
import {
  nativeToEurInferred,
  toRawNumeric,
  yoyPctGated,
} from "@/lib/queries/analytics";

export const dynamic = "force-dynamic";

export default async function AffiliatesIndexPage() {
  const [kpis, affiliates, lbRaw, commentary, reports] = await Promise.all([
    getAffiliateAggregateKpis(),
    getAffiliateList(),
    getEntityLeaderboard({
      metricCode: "revenue",
      entityTypeCode: "affiliate",
      limit: 25,
    }),
    getAffiliateCommentary(8),
    getAffiliateReports(10),
  ]);

  // Build LeaderboardV2 rows directly from the raw leaderboard rows.
  // Reusing the existing adapter would force the existing Leaderboard
  // shape; we want to prove the v2 primitive end-to-end.
  const withEur = lbRaw.map((r) => {
    const eur =
      r.unit_type === "currency"
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
  const rows: LeaderboardV2Row[] = withEur.map((w) => {
    const r = w.raw;
    const spark =
      r.spark_raw?.map((s) =>
        r.unit_type === "currency"
          ? nativeToEurInferred(
              s.value_numeric,
              s.unit_multiplier,
              s.eur_rate,
              r.metric_code,
            )
          : toRawNumeric(s.value_numeric, s.unit_multiplier),
      ) ?? null;
    const beaconMask =
      r.spark_raw?.map(
        (s) =>
          s.disclosure_status === "beacon_estimate" ||
          s.disclosure_status === "derived",
      ) ?? null;
    return {
      id: r.entity_id,
      entity: {
        name: r.name,
        typeChip: "AFF",
        href: `/affiliates/${r.slug}`,
        ticker: r.ticker,
      },
      value: {
        raw: w.eur,
        formatted: w.eur != null ? formatEur(w.eur) : "—",
      },
      share:
        totalEur > 0 && w.eur != null ? (w.eur / totalEur) * 100 : null,
      yoy: w.yoy,
      sparkline: spark,
      beaconMask,
      disclosureStatus: r.disclosure_status,
    };
  });
  const lbTotal =
    totalEur > 0
      ? { formattedValue: formatEur(totalEur), yoy: null as number | null }
      : null;

  return (
    <div className="space-y-3">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold">Affiliates</h1>
          <p className="text-xs text-tb-muted">
            {kpis.affiliate_count.toLocaleString()} tracked ·{" "}
            {kpis.reporting_count.toLocaleString()} reporting
          </p>
        </div>
        <div className="text-xs text-tb-muted">
          Lead generators, SEO publishers, subscription media for iGaming
        </div>
      </header>

      {/* Hero KPI band — aggregate industry snapshot */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-tb-border bg-tb-border md:grid-cols-4">
        <KpiAggTile
          label="Total affiliate revenue"
          value={formatEur(kpis.total_revenue_eur)}
          hint="Sum of latest disclosed revenue, EUR"
        />
        <KpiAggTile
          label="Total NDCs"
          value={abbreviate(kpis.total_ndc)}
          hint="New depositing customers referred (latest disclosed)"
        />
        <KpiAggTile
          label="Weighted EBITDA margin"
          value={
            kpis.weighted_ebitda_margin_pct != null
              ? `${kpis.weighted_ebitda_margin_pct.toFixed(1)}%`
              : "—"
          }
          hint="Σ EBITDA ÷ Σ revenue across reporting affiliates"
        />
        <KpiAggTile
          label="Affiliates tracked"
          value={kpis.affiliate_count.toLocaleString()}
          hint={`${kpis.reporting_count} with disclosed metrics`}
        />
      </div>

      {/* Leaderboard + Recent reports split */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LeaderboardV2
            title="Affiliates — revenue (LTM)"
            subtitle="Ranked by latest disclosed revenue, EUR-converted"
            primaryMetricLabel="REVENUE"
            variant="ranked"
            columns={[
              "rank",
              "entity",
              "value",
              "share",
              "yoy",
              "sparkline",
              "ticker",
            ]}
            rows={rows}
            total={lbTotal}
            maxRows={25}
          />
        </div>

        <div className="rounded-md border border-tb-border bg-tb-surface">
          <div className="border-b border-tb-border px-3 py-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
              Recent affiliate reports
            </h3>
            <p className="mt-0.5 text-[10px] text-tb-muted">
              Trailblaze reports mentioning any affiliate
            </p>
          </div>
          <ul className="divide-y divide-tb-border/60">
            {reports.length === 0 && (
              <li className="px-3 py-4 text-center text-[11px] text-tb-muted">
                No reports yet.
              </li>
            )}
            {reports.map((r) => (
              <li key={r.id} className="px-3 py-1.5 text-[11px]">
                <ReportLink
                  reportId={r.id}
                  className="block truncate text-tb-text hover:text-tb-blue"
                >
                  {displayReportFilename(r.filename)}
                </ReportLink>
                <div className="font-mono text-[9px] text-tb-muted">
                  {r.published_timestamp
                    ? new Date(r.published_timestamp).toLocaleDateString(
                        undefined,
                        { year: "numeric", month: "short", day: "numeric" },
                      )
                    : "—"}
                  {r.metric_count != null
                    ? ` · ${r.metric_count} metrics`
                    : ""}
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-tb-border px-3 py-1 text-right">
            <Link
              href="/reports"
              className="text-[10px] text-tb-blue hover:underline"
            >
              All reports →
            </Link>
          </div>
        </div>
      </div>

      {/* Affiliate summary roster — quick per-entity card. Lightweight
          alternative to the full leaderboard when the analyst wants to
          see each affiliate individually with its latest KPI trio. */}
      <div className="rounded-md border border-tb-border bg-tb-surface">
        <div className="border-b border-tb-border px-3 py-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
            Affiliate roster
          </h3>
          <p className="mt-0.5 text-[10px] text-tb-muted">
            Latest Revenue · NDCs · EBITDA margin, per entity
          </p>
        </div>
        <ul className="divide-y divide-tb-border/50">
          {affiliates.length === 0 && (
            <li className="px-3 py-6 text-center text-[11px] text-tb-muted">
              No affiliates tracked.
            </li>
          )}
          {affiliates.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/affiliates/${a.slug}`}
                  className="truncate text-xs text-tb-text hover:text-tb-blue"
                >
                  {a.name}
                </Link>
                {a.ticker && (
                  <span className="ml-2 font-mono text-[10px] text-tb-muted">
                    {a.exchange ? `${a.exchange}:` : ""}
                    {a.ticker}
                  </span>
                )}
                {a.metric_count === 0 && (
                  <span className="ml-2 rounded border border-tb-border px-1 font-mono text-[9px] uppercase tracking-wider text-tb-muted">
                    No data
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 font-mono text-[11px] text-tb-muted">
                <span title="Latest disclosed Revenue (EUR)">
                  <span className="mr-1 text-[9px] uppercase">Rev</span>
                  <span className="text-tb-text">
                    {a.revenue_eur != null ? formatEur(a.revenue_eur) : "—"}
                  </span>
                </span>
                <span title="Latest disclosed NDCs">
                  <span className="mr-1 text-[9px] uppercase">NDC</span>
                  <span className="text-tb-text">
                    {a.ndc_latest != null ? abbreviate(a.ndc_latest) : "—"}
                  </span>
                </span>
                <span title="Latest disclosed EBITDA margin">
                  <span className="mr-1 text-[9px] uppercase">Margin</span>
                  <span className="text-tb-text">
                    {a.ebitda_margin_pct != null
                      ? `${a.ebitda_margin_pct.toFixed(1)}%`
                      : "—"}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Recent affiliate-tagged commentary */}
      <div className="rounded-md border border-tb-border bg-tb-surface">
        <div className="border-b border-tb-border px-3 py-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
            Recent commentary
          </h3>
          <p className="mt-0.5 text-[10px] text-tb-muted">
            Narrative excerpts mentioning affiliates in Trailblaze reports
          </p>
        </div>
        <ul className="divide-y divide-tb-border/50">
          {commentary.length === 0 && (
            <li className="px-3 py-6 text-center text-[11px] text-tb-muted">
              No narrative excerpts yet.
            </li>
          )}
          {commentary.map((n) => (
            <li key={n.id} className="px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
                  <Link
                    href={`/affiliates/${n.entity_slug}`}
                    className="text-tb-text hover:text-tb-blue"
                  >
                    {n.entity_name}
                  </Link>
                  <span className="text-tb-muted">· {humaniseSection(n.section_code)}</span>
                </div>
                {n.report_id && (
                  <ReportLink
                    reportId={n.report_id}
                    className="text-[10px] text-tb-blue hover:underline"
                  >
                    source →
                  </ReportLink>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-tb-text">
                {truncateAtSentence(n.content, 320)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function KpiAggTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 bg-tb-surface px-4 py-3">
      <span className="text-[10px] uppercase tracking-wider text-tb-muted">
        {label}
      </span>
      <span className="font-mono text-lg font-semibold text-tb-text">
        {value}
      </span>
      {hint && (
        <span className="text-[10px] text-tb-muted">{hint}</span>
      )}
    </div>
  );
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

function humaniseSection(code: string | null): string {
  if (!code) return "—";
  const map: Record<string, string> = {
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
  return map[code] ?? code.replace(/_/g, " ");
}
