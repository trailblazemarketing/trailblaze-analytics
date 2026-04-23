import Link from "next/link";
import {
  listRecentReports,
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
  getBiggestRevenueGrowers,
  getMarginExpansionLeaders,
  getRecentCommentary,
} from "@/lib/queries/movers";
import {
  adaptEntityLeaderboardRows,
  adaptMarketLeaderboardRows,
} from "@/lib/adapters";
import { query } from "@/lib/db";
import { Leaderboard } from "@/components/primitives/leaderboard";
import type { LeaderboardRow } from "@/components/primitives/leaderboard";
import { TickerStrip } from "@/components/overview/ticker-strip";
import { MoversRow } from "@/components/overview/movers-row";
import { HeroTile } from "@/components/overview/hero-tile";
import { PeriodSelector } from "@/components/layout/period-selector";
import { Badge } from "@/components/ui/badge";
import { ReportLink } from "@/components/reports/report-link";
import { OperatorsSubTabs } from "./operators-sub-tabs";
import { formatDate, formatEur } from "@/lib/format";
import { displayReportFilename } from "@/lib/formatters/reportFilename";
import type { Report } from "@/lib/types";
import { getCountryRollupValues } from "@/lib/queries/markets";
import { MarketBarChart } from "@/components/charts/market-bar";
import {
  countCanonicalEntities,
  countTrackedMarkets,
  sumLatestPerEntity,
  sumLatestPerMarket,
  topEntitiesByRevenue,
  countryMapPoints,
} from "@/lib/queries/overview";
import { CompaniesTreemap } from "@/components/overview/companies-treemap";
import { WorldHeatmap } from "@/components/overview/world-heatmap";

// Source for the world country boundaries used by the heatmap. Hosted
// on jsDelivr; ~80KB. Keeps the topojson out of the npm bundle.
const WORLD_TOPOJSON_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

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
    ticker,
    dataDrops,
    populatedPeriods,
    growers,
    marginLeaders,
    commentary,
    countryRollup,
    heroEntities,
    heroMarkets,
    heroRevenue,
    heroOnlineGgr,
    heroCasinoGgr,
    heroSportsbookGgr,
  ] = await Promise.all([
    // M2: default back to online_ggr — primary Markets KPI per UI_SPEC_2 Panel 7.
    // Country scope + rollup (M4) augments coverage for US / Canada from
    // sub-market data. Raw-country-row shortage is explicit in the helper text.
    getMarketLeaderboard({
      metricCode: "online_ggr",
      periodCode,
      limit: 15,
      marketType: "country",
    }),
    getEntityLeaderboard({
      metricCode: sub.metric,
      entityTypeCode: sub.code,
      periodCode,
      limit: 15,
    }),
    listRecentReports(7),
    getTickerStrip(15),
    getDataDrops(6),
    listPopulatedPeriods(),
    getBiggestRevenueGrowers(6),
    getMarginExpansionLeaders(6),
    getRecentCommentary(5),
    // O1 + M4: country-rollup companion — sum-of-children used to augment the
    // markets leaderboard for countries without a native online_ggr row.
    getCountryRollupValues({ metricCode: "online_ggr" }),
    // Hero band aggregates — counts + EUR-converted sums across the
    // canonical entity / country-market sets. YoY computed cadence-matched
    // and ±80% clamped (consistent with Fix A in commit b6d89ce).
    countCanonicalEntities(),
    countTrackedMarkets(),
    sumLatestPerEntity("revenue"),
    sumLatestPerMarket("online_ggr"),
    sumLatestPerMarket("casino_ggr"),
    sumLatestPerMarket("sportsbook_ggr"),
  ]);

  // Companies treemap data — top 30 canonical entities by revenue.
  const treemapEntities = await topEntitiesByRevenue(30);
  const treemapData = treemapEntities
    .filter((e) => e.revenueEur > 0)
    .map((e) => ({
      name: e.name,
      slug: e.slug,
      size: e.revenueEur,
      entityType: e.entityType,
      yoyPct: e.yoyPct,
    }));
  // World heatmap — country-scope online_ggr per market with YoY +
  // operator counts. Filtered to rows with a usable iso_country (the
  // map keys by ISO numeric → alpha-2; markets without alpha-2 codes
  // can't be coloured).
  const mapPoints = (await countryMapPoints())
    .filter((p) => p.isoCountry)
    .map((p) => ({
      iso2: p.isoCountry as string,
      slug: p.slug,
      name: p.name,
      onlineGgrEur: p.onlineGgrEur,
      yoyPct: p.yoyPct,
      operatorCount: p.operatorCount,
      latestPeriodCode: p.latestPeriodCode,
    }));

  // Compute hero YoYs only when both sides are present and within bounds
  function heroYoy(eur: number, prev: number | null): number | null {
    if (prev == null || prev <= 0) return null;
    const pct = ((eur - prev) / Math.abs(prev)) * 100;
    if (!Number.isFinite(pct) || Math.abs(pct) > 80) return null;
    return pct;
  }
  const periodGroups = groupPeriodsForSelector(populatedPeriods);

  const markets = adaptMarketLeaderboardRows(marketRaw);
  // M4: merge country rollups into overview markets module, matching the
  // Markets index behaviour so the two surfaces agree.
  {
    const existing = new Set(markets.rows.map((r) => r.id));
    const rollupRows: LeaderboardRow[] = countryRollup
      .filter((r) => !existing.has(r.market_id))
      .map((r) => ({
        id: r.market_id,
        href: `/markets/${r.slug}`,
        name: r.name,
        typeChip: "country",
        value: r.latest_value_eur,
        valueFormatted:
          r.latest_value_eur != null ? formatEur(r.latest_value_eur) : "—",
        nativeTooltip: null,
        share: null,
        yoy: null,
        sparkline: null,
        disclosureStatus: "disclosed",
        extra: `rollup · ${r.child_count} sub-market${r.child_count === 1 ? "" : "s"}`,
        isRollup: true,
      }));
    const merged = [...markets.rows, ...rollupRows].sort(
      (a, b) => (b.value ?? 0) - (a.value ?? 0),
    );
    const denom = merged.reduce((s, r) => s + (r.value ?? 0), 0);
    if (denom > 0) {
      for (const r of merged) {
        r.share = r.value != null ? (r.value / denom) * 100 : null;
      }
    }
    markets.rows = merged;
    if (markets.total) markets.total.valueFormatted = formatEur(denom);
  }
  // O1: bar-chart data — top 10 of the merged markets list
  const chartPoints = markets.rows
    .filter((r) => r.value != null)
    .slice(0, 10)
    .map((r) => ({
      name: r.name,
      value: r.value as number,
      isRollup: r.isRollup ?? false,
    }));
  const entities = adaptEntityLeaderboardRows(entityRaw);

  return (
    <div className="-mx-6 -mt-3">
      <TickerStrip rows={ticker} />

      <div className="space-y-3 px-6 py-3">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-tb-text">
              Overview
            </h1>
            <p className="mt-0.5 text-[11px] text-tb-muted">
              Command centre — live iGaming intelligence
            </p>
          </div>
          <PeriodSelector groups={periodGroups} currentCode={periodCode} />
        </header>

        {/* Hero KPI band — six tiles. Counts on the left (Companies /
            Markets) carry no YoY; the four currency aggregates render
            EUR-converted sums of latest-period values across the
            canonical entity (Total Revenue) or country-scope market
            (Online / Casino / Sportsbook GGR) sets. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <HeroTile
            label="Companies tracked"
            value={heroEntities.toLocaleString()}
            subtitle="operators · affiliates · B2B"
          />
          <HeroTile
            label="Markets tracked"
            value={heroMarkets.total.toLocaleString()}
            subtitle={`${heroMarkets.countries} countries + ${heroMarkets.states} states`}
          />
          <HeroTile
            label="Total revenue tracked"
            value={formatEur(heroRevenue.eur)}
            subtitle={`${heroRevenue.entityCount} entities · latest period each`}
            yoyPct={heroYoy(heroRevenue.eur, heroRevenue.prevEur)}
          />
          <HeroTile
            label="Online GGR (global)"
            value={formatEur(heroOnlineGgr.eur)}
            subtitle={`${heroOnlineGgr.marketCount} country markets`}
            yoyPct={heroYoy(heroOnlineGgr.eur, heroOnlineGgr.prevEur)}
          />
          <HeroTile
            label="Casino GGR"
            value={formatEur(heroCasinoGgr.eur)}
            subtitle={`${heroCasinoGgr.marketCount} country markets`}
            yoyPct={heroYoy(heroCasinoGgr.eur, heroCasinoGgr.prevEur)}
          />
          <HeroTile
            label="Sportsbook GGR"
            value={formatEur(heroSportsbookGgr.eur)}
            subtitle={`${heroSportsbookGgr.marketCount} country markets`}
            yoyPct={heroYoy(heroSportsbookGgr.eur, heroSportsbookGgr.prevEur)}
          />
        </div>

        {/* Main visuals row — 70/30 grid. LEFT 70%: world heatmap
            (top, online_ggr by country) + companies treemap (bottom,
            top 30 entities by revenue). RIGHT 30%: persistent rail
            (Top Markets + Top Operators) — landing in the next
            commit; for now this side reuses the existing Markets
            leaderboard composition below. */}
        <div className="grid items-start gap-3 lg:grid-cols-10">
          <div className="space-y-3 lg:col-span-7">
            {/* World heatmap — countries shaded by latest online_ggr.
                Hover for tooltip, click opens the market in a new tab. */}
            {mapPoints.length > 0 && (
              <div className="rounded-md border border-tb-border bg-tb-surface">
                <div className="flex items-center justify-between border-b border-tb-border px-3 py-2">
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                      Online GGR by country
                    </h3>
                    <p className="mt-0.5 text-[10px] text-tb-muted">
                      {mapPoints.length} countries · cyan gradient is
                      log-scaled (dark = low, bright = high) · hover for
                      values · click to drill in
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-tb-muted">EUR</span>
                </div>
                <WorldHeatmap
                  geoUrl={WORLD_TOPOJSON_URL}
                  countries={mapPoints}
                  height={450}
                />
              </div>
            )}

            {/* Companies treemap */}
            {treemapData.length > 0 && (
              <div className="rounded-md border border-tb-border bg-tb-surface">
                <div className="flex items-center justify-between border-b border-tb-border px-3 py-2">
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                      Companies — top {treemapData.length} by revenue
                    </h3>
                    <p className="mt-0.5 text-[10px] text-tb-muted">
                      Cell size = latest revenue · colour = entity type · click to drill in
                    </p>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[9px] text-tb-muted">
                    <LegendDot color="#00b4d8" label="operator" />
                    <LegendDot color="#4cc9f0" label="b2b" />
                    <LegendDot color="#2ec4b6" label="affiliate" />
                    <LegendDot color="#ffb703" label="lottery" />
                    <LegendDot color="#7209b7" label="dfs" />
                  </div>
                </div>
                <CompaniesTreemap data={treemapData} height={450} />
              </div>
            )}
          </div>

          <aside className="lg:col-span-3 space-y-3">
            {/* Right rail placeholder — populated with Top Markets +
                Top Operators in the next commit. Inline note keeps
                this slot reserved without leaving the column visually
                empty during the staged rollout. */}
            <div className="rounded-md border border-dashed border-tb-border/60 bg-tb-surface/40 p-4 text-[10px] text-tb-muted">
              Right rail — Top Markets + Top Operators land in the next
              commit. The full leaderboard composition continues below
              for now.
            </div>
          </aside>
        </div>

        {/* Panel A + B: Markets leaderboard (2/3) · Right column stacked (1/3)
            items-start: each panel takes its natural content height. Without
            this, the grid forces panels to match the tallest column, leaving
            an empty band below the leaderboard's TOTAL row before "View all". */}
        <div className="grid items-start gap-3 lg:grid-cols-3">
          <Leaderboard
            className="lg:col-span-2"
            title="Markets"
            subtitle="Top countries by online GGR (latest period · country-rollup)"
            valueLabel="ONLINE GGR"
            nameLabel="Market"
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
            maxRows={12}
            showViewAll
            viewAllHref="/markets"
          />

          {/* Right column: Recent reports stacked with Data drops (O1) */}
          <div className="space-y-3">
            <RecentReportsCard reports={recentReports} />
            <DataDropsCard drops={dataDrops} />
          </div>
        </div>

        {/* O1 (T2 polish 3): Global iGaming GGR bar chart — top 10 countries
            by Online GGR. Includes country-rollups (Σ) so US / Canada appear
            even when their native country row has no online_ggr entry. */}
        {chartPoints.length > 0 && (
          <div className="rounded-md border border-tb-border bg-tb-surface">
            <div className="flex items-center justify-between border-b border-tb-border px-3 py-2">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                  Global iGaming — top markets by Online GGR
                </h3>
                <p className="mt-0.5 text-[10px] text-tb-muted">
                  Top {chartPoints.length} countries · latest reported period ·
                  Σ indicates rolled-up from sub-markets
                </p>
              </div>
              <span className="font-mono text-[10px] text-tb-muted">EUR</span>
            </div>
            <div className="p-2">
              <MarketBarChart
                data={chartPoints}
                valueLabel="ONLINE GGR"
                height={Math.max(220, chartPoints.length * 24 + 40)}
              />
            </div>
          </div>
        )}

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
            maxRows={12}
            showViewAll
            viewAllHref={`/companies?type=${sub.code}`}
          />
        </div>

        {/* Panel D: Revenue growers · Margin leaders · Recent commentary (O2) */}
        <MoversRow
          growers={growers}
          marginLeaders={marginLeaders}
          commentary={commentary}
        />
      </div>
    </div>
  );
}

// Recent reports compact list — 7 rows, tighter density.
function RecentReportsCard({
  reports,
}: {
  reports: (Report & {
    entity_names: string[] | null;
    market_names: string[] | null;
  })[];
}) {
  return (
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
        {reports.length === 0 && (
          <li className="p-3 text-[11px] text-tb-muted">No reports yet.</li>
        )}
        {reports.map((r) => {
          const subjects: string[] = [
            ...(r.entity_names ?? []).slice(0, 2),
            ...(r.market_names ?? []).slice(0, 2),
          ];
          return (
            <li
              key={r.id}
              className="px-3 py-1.5 transition-colors hover:bg-tb-border/25"
            >
              <ReportLink
                reportId={r.id}
                className="block w-full text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium text-tb-text">
                    {displayReportFilename(r.filename)}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] text-tb-muted">
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
  );
}

// O1 — DATA DROPS. Synthesized from most recent activity across pipelines
// (no dedicated activity_log table exists). One row per pipeline event,
// newest first. Green dot = last 24h, grey = older.
type DataDropRow = {
  timestamp: string;
  pipeline: string;
  detail: string;
};

function DataDropsCard({ drops }: { drops: DataDropRow[] }) {
  const now = Date.now();
  return (
    <div className="rounded-md border border-tb-border bg-tb-surface">
      <div className="border-b border-tb-border px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
          Data drops
        </h3>
        <p className="mt-0.5 text-[10px] text-tb-muted">
          Recent ingest activity across pipelines
        </p>
      </div>
      <ul className="divide-y divide-tb-border/60">
        {drops.length === 0 && (
          <li className="p-3 text-[11px] text-tb-muted">
            No recent activity.
          </li>
        )}
        {drops.map((d, i) => {
          const t = new Date(d.timestamp).getTime();
          const isFresh = !Number.isNaN(t) && now - t < 24 * 3600 * 1000;
          return (
            <li
              key={i}
              className="flex items-start gap-2 px-3 py-1.5 text-[11px]"
            >
              <span
                className={
                  "mt-1 h-1.5 w-1.5 shrink-0 rounded-full " +
                  (isFresh ? "bg-tb-success" : "bg-tb-border")
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium text-tb-text">
                    {d.pipeline}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] text-tb-muted">
                    {relativeTime(d.timestamp)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-tb-muted">
                  {d.detail}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Synthesize DataDrops from recent ingest activity. No activity_log table
// exists, so we roll up: (a) newest parsed report, (b) newest regulator
// filing ingest, (c) newest stock API ingest, (d) entity auto-add burst, etc.
async function getDataDrops(limit = 6): Promise<DataDropRow[]> {
  // 1) Most recent parser run — bucket reports in the last 24h as one "drop"
  const recentReports = await query<{
    created_at: string;
    n: number;
  }>(
    `SELECT MAX(parsed_at) AS created_at, COUNT(*)::int AS n
     FROM reports
     WHERE parsed_at IS NOT NULL
       AND parsed_at > NOW() - INTERVAL '7 days'`,
  );
  // 2) Latest regulator-filing metric value — scraper output
  const recentReg = await query<{
    created_at: string;
    market_name: string | null;
    n: number;
  }>(
    `SELECT MAX(mv.created_at) AS created_at,
            (SELECT mk.name FROM markets mk
             JOIN metric_values mv2 ON mv2.market_id = mk.id
             JOIN sources s ON s.id = mv2.source_id
             WHERE s.source_type = 'regulator_filing'
             ORDER BY mv2.created_at DESC LIMIT 1) AS market_name,
            COUNT(*)::int AS n
     FROM metric_values mv
     JOIN sources s ON s.id = mv.source_id
     WHERE s.source_type = 'regulator_filing'
       AND mv.created_at > NOW() - INTERVAL '30 days'`,
  );
  // 3) Latest stock price ingest
  const recentStock = await query<{
    created_at: string;
    n: number;
  }>(
    `SELECT MAX(mv.created_at) AS created_at, COUNT(DISTINCT mv.entity_id)::int AS n
     FROM metric_values mv
     JOIN metrics m ON m.id = mv.metric_id
     WHERE m.code IN ('stock_price', 'market_cap')
       AND mv.created_at > NOW() - INTERVAL '7 days'`,
  );
  // 4) New entity auto-additions (needs_review flag)
  const recentEntities = await query<{
    created_at: string;
    n: number;
  }>(
    `SELECT MAX(created_at) AS created_at, COUNT(*)::int AS n
     FROM entities
     WHERE metadata->>'status' = 'auto_added_needs_review'
       AND created_at > NOW() - INTERVAL '30 days'`,
  );
  // 5) Narrative extraction — parser secondary output
  const recentNarr = await query<{
    created_at: string;
    n: number;
  }>(
    `SELECT MAX(n.created_at) AS created_at, COUNT(*)::int AS n
     FROM narratives n
     WHERE n.created_at > NOW() - INTERVAL '7 days'`,
  );

  const drops: DataDropRow[] = [];
  if (recentReports[0]?.created_at && recentReports[0].n > 0) {
    drops.push({
      timestamp: recentReports[0].created_at,
      pipeline: "Parser reprocess",
      detail: `${recentReports[0].n} report${recentReports[0].n === 1 ? "" : "s"} · last 7d`,
    });
  }
  if (recentReg[0]?.created_at && recentReg[0].n > 0) {
    drops.push({
      timestamp: recentReg[0].created_at,
      pipeline: `Regulator scrape${recentReg[0].market_name ? ` · ${recentReg[0].market_name}` : ""}`,
      detail: `${recentReg[0].n} row${recentReg[0].n === 1 ? "" : "s"} · last 30d`,
    });
  }
  if (recentStock[0]?.created_at && recentStock[0].n > 0) {
    drops.push({
      timestamp: recentStock[0].created_at,
      pipeline: "Stock prices refreshed",
      detail: `${recentStock[0].n} ticker${recentStock[0].n === 1 ? "" : "s"}`,
    });
  }
  if (recentNarr[0]?.created_at && recentNarr[0].n > 0) {
    drops.push({
      timestamp: recentNarr[0].created_at,
      pipeline: "Narrative extraction",
      detail: `${recentNarr[0].n} narrative${recentNarr[0].n === 1 ? "" : "s"} extracted`,
    });
  }
  if (recentEntities[0]?.created_at && recentEntities[0].n > 0) {
    drops.push({
      timestamp: recentEntities[0].created_at,
      pipeline: "Entity auto-add",
      detail: `${recentEntities[0].n} new entities pending review`,
    });
  }
  drops.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  return drops.slice(0, limit);
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-2 w-2 rounded-sm"
        style={{ background: color }}
      />
      <span>{label}</span>
    </span>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
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
