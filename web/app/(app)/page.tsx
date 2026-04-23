import Link from "next/link";
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
import type { LeaderboardRow } from "@/components/primitives/leaderboard";
import { TickerStrip } from "@/components/overview/ticker-strip";
import { HeroTile } from "@/components/overview/hero-tile";
import { PeriodSelector } from "@/components/layout/period-selector";
import { ReportLink } from "@/components/reports/report-link";
import { formatEur } from "@/lib/format";
import { getCountryRollupValues } from "@/lib/queries/markets";
import {
  countCanonicalEntities,
  countTrackedMarkets,
  sumLatestPerEntity,
  sumLatestPerMarket,
  topEntitiesByRevenue,
  countryMapPoints,
  recentCommentaryCards,
  biggestMovers,
} from "@/lib/queries/overview";
import { CompaniesTreemap } from "@/components/overview/companies-treemap";
import { WorldHeatmap } from "@/components/overview/world-heatmap";

// Source for the world country boundaries used by the heatmap. Hosted
// on jsDelivr; ~80KB. Keeps the topojson out of the npm bundle.
const WORLD_TOPOJSON_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const periodCode = searchParams.period ?? null;

  const [
    marketRaw,
    entityRaw,
    ticker,
    dataDrops,
    populatedPeriods,
    countryRollup,
    heroEntities,
    heroMarkets,
    heroRevenue,
    heroOnlineGgr,
    heroCasinoGgr,
    heroSportsbookGgr,
  ] = await Promise.all([
    // Top Markets right-rail data — country-scope online_ggr leaderboard
    // augmented below with country-rollups for US / Canada whose native
    // country row has no online_ggr entry.
    getMarketLeaderboard({
      metricCode: "online_ggr",
      periodCode,
      limit: 15,
      marketType: "country",
    }),
    // Top Operators right-rail data.
    getEntityLeaderboard({
      metricCode: "revenue",
      entityTypeCode: "operator",
      periodCode,
      limit: 15,
    }),
    getTickerStrip(15),
    getDataDrops(6),
    listPopulatedPeriods(),
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
  // Bottom-band content for the redesign — fetched here so they're
  // included in the same Promise-driven page render rather than waterfall.
  const [commentaryCards, moverRows] = await Promise.all([
    recentCommentaryCards(3),
    biggestMovers(5),
  ]);
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
            {/* Top Markets — compact 10-row rail. Re-uses the
                already-fetched markets.rows (which include
                country-rollup augmentation, see Panel A merge above). */}
            <Leaderboard
              title="Top markets"
              subtitle="By online GGR (latest)"
              valueLabel="ONLINE GGR"
              nameLabel="Country"
              rows={markets.rows.slice(0, 10)}
              total={null}
              columns={["rank", "name", "value", "yoy", "sparkline"]}
              maxRows={10}
              showViewAll
              viewAllHref="/markets"
            />

            {/* Top Operators — compact 10-row rail. Re-uses the
                already-fetched entityRaw via the operator sub-tab,
                falling back to the operator type explicitly so the
                rail stays operator-focused regardless of which
                sub-tab is active below. */}
            <Leaderboard
              title="Top operators"
              subtitle="By latest revenue"
              valueLabel="REVENUE"
              nameLabel="Entity"
              rows={entities.rows.slice(0, 10)}
              total={null}
              columns={["rank", "name", "value", "yoy", "sparkline"]}
              maxRows={10}
              showViewAll
              viewAllHref="/companies?type=operator"
            />
          </aside>
        </div>

        {/* Bottom band — three equal-width columns: Recent Commentary
            (3 cards), Data Drops (compact list), Biggest Movers (top
            5 by abs(YoY%) within the post-Fix-A bounds). The brief's
            command-centre layout. */}
        <div className="grid items-start gap-3 lg:grid-cols-3">
          <RecentCommentaryColumn cards={commentaryCards} />
          <DataDropsCard drops={dataDrops} />
          <BiggestMoversCard rows={moverRows} />
        </div>
      </div>
    </div>
  );
}

// DATA DROPS — synthesised from most recent activity across pipelines
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

// Recent Commentary column — three cards, one per most-recent
// narrative from analyst-note / trailblaze-pdf / industry-trade
// sources. Each card shows the entity (or market) name, a date, the
// first ~120 chars of the body, and a "read more →" link to the
// source report.
function RecentCommentaryColumn({
  cards,
}: {
  cards: import("@/lib/queries/overview").CommentaryCard[];
}) {
  return (
    <div className="rounded-md border border-tb-border bg-tb-surface">
      <div className="border-b border-tb-border px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
          Recent commentary
        </h3>
        <p className="mt-0.5 text-[10px] text-tb-muted">
          Latest analyst notes across covered entities + markets
        </p>
      </div>
      {cards.length === 0 ? (
        <p className="p-4 text-[11px] text-tb-muted">
          No recent commentary indexed.
        </p>
      ) : (
        <ul className="divide-y divide-tb-border/60">
          {cards.map((c) => {
            const subject = c.entityName ?? c.marketName ?? "—";
            const dt = c.publishedAt ? new Date(c.publishedAt) : null;
            const dateLabel = dt
              ? dt.toLocaleDateString(undefined, {
                  month: "short",
                  year: "numeric",
                })
              : "";
            const snippet =
              c.content.length > 140
                ? c.content.slice(0, 140).replace(/\s+\S*$/, "") + "…"
                : c.content;
            return (
              <li key={c.id} className="p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[11px] font-semibold text-tb-text">
                    {subject}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] text-tb-muted">
                    {dateLabel}
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-tb-muted">
                  {snippet}
                </p>
                <ReportLink
                  reportId={c.reportId}
                  className="mt-1.5 inline-block text-[10px] text-tb-blue hover:underline"
                >
                  read more →
                </ReportLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Biggest Movers — small table, top 5 entities ranked by abs(YoY%)
// within the post-Fix-A bounds. Positive movement renders with the
// success colour, negative with danger; revenue cell shows EUR.
function BiggestMoversCard({
  rows,
}: {
  rows: import("@/lib/queries/overview").MoverRow[];
}) {
  return (
    <div className="rounded-md border border-tb-border bg-tb-surface">
      <div className="border-b border-tb-border px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
          Biggest movers
        </h3>
        <p className="mt-0.5 text-[10px] text-tb-muted">
          Top {rows.length} entities by |YoY %| · revenue cadence-matched
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-[11px] text-tb-muted">
          No comparable revenue periods yet.
        </p>
      ) : (
        <table className="w-full text-[11px]">
          <thead className="text-[9px] uppercase tracking-wider text-tb-muted">
            <tr>
              <th className="px-3 py-1.5 text-left">Entity</th>
              <th className="px-3 py-1.5 text-right font-mono">Revenue</th>
              <th className="px-3 py-1.5 text-right font-mono">YoY</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tb-border/60">
            {rows.map((r) => (
              <tr key={r.slug} className="hover:bg-tb-border/20">
                <td className="px-3 py-1.5">
                  <Link
                    href={`/companies/${r.slug}`}
                    className="text-tb-text hover:text-tb-blue"
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-tb-text">
                  {formatEur(r.revenueEur)}
                </td>
                <td
                  className={
                    "px-3 py-1.5 text-right font-mono " +
                    (r.yoyPct > 0
                      ? "text-tb-success"
                      : r.yoyPct < 0
                        ? "text-tb-danger"
                        : "text-tb-muted")
                  }
                >
                  {r.yoyPct > 0 ? "+" : ""}
                  {r.yoyPct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
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
