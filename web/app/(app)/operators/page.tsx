import {
  getEntityLeaderboard,
} from "@/lib/queries/analytics";
import { getOperatorStockHeatmap } from "@/lib/queries/operators";
import {
  listPopulatedPeriods,
  groupPeriodsForSelector,
} from "@/lib/queries/periods";
import {
  getBiggestRevenueGrowers,
  getMarginExpansionLeaders,
  getRecentCommentary,
} from "@/lib/queries/movers";
import { adaptEntityLeaderboardRows } from "@/lib/adapters";
import { StockHeatmap } from "@/components/overview/stock-heatmap";
import { Leaderboard } from "@/components/primitives/leaderboard";
import type {
  LeaderboardRow,
  LeaderboardColumn,
} from "@/components/primitives/leaderboard";
import { PeriodSelector } from "@/components/layout/period-selector";
import { MoversRow } from "@/components/overview/movers-row";
import { DeltaChip } from "@/components/beacon/delta-chip";
import { formatEur, formatNative } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OperatorsPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const periodCode = searchParams.period ?? null;

  const [
    revRaw,
    heatmap,
    populatedPeriods,
    growers,
    marginLeaders,
    commentary,
  ] = await Promise.all([
    getEntityLeaderboard({
      metricCode: "revenue",
      entityTypeCode: "operator",
      periodCode,
      limit: 30,
    }),
    getOperatorStockHeatmap(),
    listPopulatedPeriods(),
    getBiggestRevenueGrowers(6),
    getMarginExpansionLeaders(6),
    getRecentCommentary(5),
  ]);
  const periodGroups = groupPeriodsForSelector(populatedPeriods);

  const revenue = adaptEntityLeaderboardRows(revRaw);

  // OP3: join stock columns (price, day%, market cap, EV/EBITDA) onto the
  // revenue leaderboard rows using the heatmap data which already carries them.
  const byEntity = new Map(heatmap.map((h) => [h.entity_id, h]));
  const enrichedRows: LeaderboardRow[] = revenue.rows.map((r) => {
    const stock = byEntity.get(r.id);
    if (!stock) return { ...r };
    return {
      ...r,
      extra: <StockColumns stock={stock} />,
    };
  });
  const columns: LeaderboardColumn[] = [
    "rank",
    "name",
    "value",
    "share",
    "yoy",
    "sparkline",
    "ticker",
    "extra",
  ];

  return (
    <div className="space-y-3">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold">Operators</h1>
          <p className="text-xs text-tb-muted">
            Listed B2C operators — stock heatmap, rankings, and delta movers.
          </p>
        </div>
        <PeriodSelector groups={periodGroups} currentCode={periodCode} />
      </header>

      {/* Stock heatmap */}
      <div className="rounded-md border border-tb-border bg-tb-surface">
        <div className="flex items-center justify-between border-b border-tb-border px-3 py-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
              Stock heatmap
            </h3>
            <span className="text-[10px] text-tb-muted">
              sized by market cap · colored by day change
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-tb-muted">
            <LegendDot label="Gain" className="bg-tb-success" />
            <LegendDot label="Loss" className="bg-tb-danger" />
            <LegendDot label="No price" className="bg-tb-border" />
          </div>
        </div>
        <StockHeatmap cells={heatmap} />
      </div>

      {/* Operator leaderboard with stock columns */}
      <Leaderboard
        title="Operator leaderboard"
        subtitle="Ranked by latest revenue · stock figures live"
        valueLabel="REVENUE"
        rows={enrichedRows}
        total={revenue.total}
        columns={columns}
        maxRows={25}
        extraHeader={
          <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-tb-muted">
            <span>Price</span>
            <span>·</span>
            <span>Day %</span>
            <span>·</span>
            <span>Market cap</span>
            <span>·</span>
            <span>EV/EBITDA</span>
          </span>
        }
      />

      {/* OP2: delta movers */}
      <MoversRow
        growers={growers}
        marginLeaders={marginLeaders}
        commentary={commentary}
      />
    </div>
  );
}

// Packed stock columns for the leaderboard `extra` cell — PRICE / DAY% /
// MARKET CAP / EV·EBITDA, em-dash for missing pieces.
function StockColumns({
  stock,
}: {
  stock: import("@/lib/queries/operators").HeatmapCell;
}) {
  return (
    <span className="inline-flex items-center gap-3 font-mono text-[10px]">
      <Col label="Price">
        {stock.latest_price != null
          ? stock.native_price_currency
            ? formatNative(stock.latest_price, stock.native_price_currency)
            : stock.latest_price.toFixed(2)
          : "—"}
      </Col>
      <Col label="Day %">
        {stock.day_change_pct != null ? (
          <DeltaChip pct={stock.day_change_pct} size="xs" />
        ) : (
          <span className="text-tb-muted">—</span>
        )}
      </Col>
      <Col label="Market cap">
        {stock.market_cap_eur != null ? formatEur(stock.market_cap_eur) : "—"}
      </Col>
      <Col label="EV/EBITDA">
        {stock.ev_ebitda != null ? `${stock.ev_ebitda.toFixed(1)}×` : "—"}
      </Col>
    </span>
  );
}

function Col({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="text-[8px] uppercase tracking-wider text-tb-muted">
        {label}
      </span>
      <span className="text-tb-text">{children}</span>
    </span>
  );
}

function LegendDot({ label, className }: { label: string; className: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-sm ${className}`} />
      {label}
    </span>
  );
}
