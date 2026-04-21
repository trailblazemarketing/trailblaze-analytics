import Link from "next/link";
import {
  listRecentReports,
  getDiscrepancies,
} from "@/lib/queries/reports";
import {
  getEntityLeaderboard,
  getMarketLeaderboard,
} from "@/lib/queries/analytics";
import {
  listPopulatedPeriods,
  groupPeriodsForSelector,
} from "@/lib/queries/periods";
import { getTickerStrip } from "@/lib/queries/stocks";
import {
  adaptEntityLeaderboardRows,
  adaptMarketLeaderboardRows,
} from "@/lib/adapters";
import { query } from "@/lib/db";
import { Leaderboard } from "@/components/primitives/leaderboard";
import { TickerStrip } from "@/components/overview/ticker-strip";
import { PeriodSelector } from "@/components/layout/period-selector";
import { Badge } from "@/components/ui/badge";
import { ReportLink } from "@/components/reports/report-link";
import { SourceLabel } from "@/components/beacon/source-label";
import { OperatorsSubTabs } from "./operators-sub-tabs";
import { formatDate } from "@/lib/format";
import type { SourceType } from "@/lib/types";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Which entity-type code each sub-tab of Panel C maps to
const SUB_TABS = [
  { code: "operator", label: "Operators", metric: "revenue" },
  { code: "affiliate", label: "Affiliates", metric: "revenue" },
  { code: "b2b_platform", label: "B2B", metric: "revenue" },
] as const;

export default async function HomePage({
  searchParams,
}: {
  searchParams: { sub?: string; period?: string };
}) {
  const sub =
    SUB_TABS.find((s) => s.code === searchParams.sub) ?? SUB_TABS[0];
  const periodCode = searchParams.period ?? null;

  const [
    marketRaw,
    entityRaw,
    recentReports,
    discrepancies,
    ticker,
    dataDrops,
    populatedPeriods,
  ] = await Promise.all([
    getMarketLeaderboard({
      metricCode: "online_ggr",
      periodCode,
      limit: 15,
    }),
    getEntityLeaderboard({
      metricCode: sub.metric,
      entityTypeCode: sub.code,
      periodCode,
      limit: 15,
    }),
    listRecentReports(10),
    getDiscrepancies(5),
    getTickerStrip(15),
    getDataDrops(8),
    listPopulatedPeriods(),
  ]);
  const periodGroups = groupPeriodsForSelector(populatedPeriods);

  const markets = adaptMarketLeaderboardRows(marketRaw);
  const entities = adaptEntityLeaderboardRows(entityRaw);

  return (
    <div className="-mx-6 -mt-5">
      <TickerStrip rows={ticker} />

      <div className="space-y-4 px-6 py-4">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-lg font-semibold">Overview</h1>
            <p className="text-xs text-tb-muted">
              Live analyst home — what's new, what's biggest, what's moving.
              All monetary values in EUR (hover for native).
            </p>
          </div>
          <PeriodSelector groups={periodGroups} currentCode={periodCode} />
        </header>

        {/* Panel A + B: Markets leaderboard (2/3) · Recent reports (1/3) */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Leaderboard
            className="lg:col-span-2"
            title="Markets"
            subtitle="Top markets by online GGR (latest period)"
            valueLabel="ONLINE GGR"
            rows={markets.rows}
            total={markets.total}
            columns={[
              "rank",
              "name",
              "value",
              "share",
              "yoy",
              "sparkline",
              "beacon_coverage",
            ]}
            maxRows={15}
            showViewAll
            viewAllHref="/markets"
          />

          {/* Recent reports */}
          <div className="rounded-md border border-tb-border bg-tb-surface">
            <div className="flex items-center justify-between border-b border-tb-border px-3 py-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                Recent reports
              </h3>
              <Link
                href="/reports"
                className="text-[10px] text-tb-blue hover:underline"
              >
                View all →
              </Link>
            </div>
            <ul className="divide-y divide-tb-border/60">
              {recentReports.length === 0 && (
                <li className="p-4 text-[11px] text-tb-muted">
                  No reports yet.
                </li>
              )}
              {recentReports.map((r) => {
                const subjects: string[] = [
                  ...(r.entity_names ?? []).slice(0, 2),
                  ...(r.market_names ?? []).slice(0, 2),
                ];
                return (
                  <li
                    key={r.id}
                    className="px-3 py-2 transition-colors hover:bg-tb-border/25"
                  >
                    <ReportLink
                      reportId={r.id}
                      className="block w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-medium text-tb-text">
                          {r.filename}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-tb-muted">
                          {formatDate(r.published_timestamp)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-tb-muted">
                        <Badge variant="muted">{r.document_type}</Badge>
                        {subjects.length > 0 && (
                          <span className="truncate">
                            {subjects.slice(0, 3).join(" · ")}
                          </span>
                        )}
                      </div>
                    </ReportLink>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Panel C: Operators / Affiliates / B2B leaderboard */}
        <div>
          <OperatorsSubTabs active={sub.code} />
          <Leaderboard
            title={`${sub.label} leaderboard`}
            subtitle={`Top ${sub.label.toLowerCase()} by most recent ${sub.metric}`}
            valueLabel={sub.metric.toUpperCase()}
            rows={entities.rows}
            total={entities.total}
            columns={[
              "rank",
              "name",
              "value",
              "share",
              "yoy",
              "sparkline",
              "ticker",
            ]}
            maxRows={15}
            showViewAll
            viewAllHref={`/companies?type=${sub.code}`}
          />
        </div>

        {/* Panel D: Data drops feed + discrepancies */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-md border border-tb-border bg-tb-surface lg:col-span-2">
            <div className="border-b border-tb-border px-3 py-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                Recent data drops
              </h3>
            </div>
            <ul className="divide-y divide-tb-border/60">
              {dataDrops.length === 0 && (
                <li className="p-4 text-[11px] text-tb-muted">
                  No recent data.
                </li>
              )}
              {dataDrops.map((d, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      d.is_beacon ? "bg-tb-beacon" : "bg-tb-success"
                    }`}
                  />
                  <span className="flex-1 truncate text-[11px]">
                    <span className="text-tb-muted">
                      {relativeTime(d.created_at)} —{" "}
                    </span>
                    {d.subject_slug ? (
                      <Link
                        href={
                          d.subject_kind === "entity"
                            ? `/companies/${d.subject_slug}`
                            : `/markets/${d.subject_slug}`
                        }
                        className="text-tb-text hover:text-tb-blue"
                      >
                        {d.subject_name}
                      </Link>
                    ) : (
                      <span>{d.subject_name ?? "—"}</span>
                    )}{" "}
                    <span className="text-tb-text">
                      {d.metric_name} {d.period_label}
                    </span>
                    : <span className="font-mono text-tb-text">{d.value_display}</span>
                    {d.is_beacon && <sup className="beacon-tm">™</sup>}
                  </span>
                  <SourceLabel source={d.source_type} />
                </li>
              ))}
            </ul>
          </div>

          {/* Discrepancy alerts */}
          <div className="rounded-md border border-tb-border bg-tb-surface">
            <div className="flex items-center gap-1.5 border-b border-tb-border px-3 py-2">
              <AlertTriangle className="h-3 w-3 text-tb-danger" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                Discrepancies
              </h3>
              <span className="ml-auto font-mono text-[10px] text-tb-muted">
                {discrepancies.length}
              </span>
            </div>
            <ul className="divide-y divide-tb-border/60">
              {discrepancies.length === 0 && (
                <li className="p-4 text-[11px] text-tb-muted">
                  No discrepancies &gt;5% between sources.
                </li>
              )}
              {discrepancies.map((d, i) => (
                <li key={i} className="px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] font-medium">
                      {d.metric_display_name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-tb-danger">
                      Δ {Number(d.variance_pct).toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-tb-muted">
                    {d.entity_slug ? (
                      <Link
                        href={`/companies/${d.entity_slug}`}
                        className="hover:text-tb-blue"
                      >
                        {d.entity_name}
                      </Link>
                    ) : d.market_slug ? (
                      <Link
                        href={`/markets/${d.market_slug}`}
                        className="hover:text-tb-blue"
                      >
                        {d.market_name}
                      </Link>
                    ) : null}
                    {" · "}
                    <span className="font-mono">{d.period_code}</span>
                    {" · "}
                    <span className="font-mono">
                      {d.source_count} sources
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// Data drops: most recently created metric_values, enriched with subject.
async function getDataDrops(limit = 8) {
  return await query<{
    created_at: string;
    metric_code: string;
    metric_name: string;
    period_label: string;
    value_display: string;
    source_type: SourceType;
    disclosure_status: string;
    is_beacon: boolean;
    subject_kind: "entity" | "market" | null;
    subject_name: string | null;
    subject_slug: string | null;
  }>(
    `SELECT mv.created_at,
            m.code AS metric_code,
            m.display_name AS metric_name,
            COALESCE(p.display_name, p.code) AS period_label,
            CASE
              WHEN m.unit_type = 'percentage' THEN
                COALESCE(ROUND(mv.value_numeric, 2)::text || '%', '—')
              WHEN m.unit_type = 'currency' AND mv.unit_multiplier = 'millions' THEN
                COALESCE(CONCAT(COALESCE(mv.currency, ''), ROUND(mv.value_numeric, 1)::text, 'M'), '—')
              WHEN m.unit_type = 'currency' AND mv.unit_multiplier = 'billions' THEN
                COALESCE(CONCAT(COALESCE(mv.currency, ''), ROUND(mv.value_numeric, 2)::text, 'B'), '—')
              WHEN m.unit_type = 'currency' THEN
                COALESCE(CONCAT(COALESCE(mv.currency, ''), ROUND(mv.value_numeric, 2)::text), '—')
              WHEN m.unit_type = 'count' AND mv.unit_multiplier IN ('thousands','millions','billions') THEN
                COALESCE(CONCAT(ROUND(mv.value_numeric, 1)::text, LEFT(UPPER(mv.unit_multiplier), 1)), '—')
              ELSE COALESCE(mv.value_numeric::text, mv.value_text, '—')
            END AS value_display,
            s.source_type,
            mv.disclosure_status,
            (mv.disclosure_status IN ('beacon_estimate','derived')) AS is_beacon,
            CASE
              WHEN mv.entity_id IS NOT NULL THEN 'entity'::text
              WHEN mv.market_id IS NOT NULL THEN 'market'::text
              ELSE NULL
            END AS subject_kind,
            COALESCE(e.name, mk.name) AS subject_name,
            COALESCE(e.slug, mk.slug) AS subject_slug
     FROM metric_values mv
     JOIN metrics m ON m.id = mv.metric_id
     JOIN periods p ON p.id = mv.period_id
     JOIN sources s ON s.id = mv.source_id
     LEFT JOIN entities e ON e.id = mv.entity_id
     LEFT JOIN markets mk ON mk.id = mv.market_id
     WHERE mv.value_numeric IS NOT NULL
     ORDER BY mv.created_at DESC
     LIMIT $1`,
    [limit],
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
