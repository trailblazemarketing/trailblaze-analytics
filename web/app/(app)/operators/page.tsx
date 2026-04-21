import Link from "next/link";
import {
  getEntityLeaderboard,
} from "@/lib/queries/analytics";
import { getOperatorStockHeatmap } from "@/lib/queries/operators";
import { adaptEntityLeaderboardRows } from "@/lib/adapters";
import { StockHeatmap } from "@/components/overview/stock-heatmap";
import { Leaderboard } from "@/components/primitives/leaderboard";
import { DeltaChip } from "@/components/beacon/delta-chip";

export const dynamic = "force-dynamic";

export default async function OperatorsPage() {
  const [revRaw, marginRaw, activesRaw, arpuRaw, heatmap] = await Promise.all([
    getEntityLeaderboard({
      metricCode: "revenue",
      entityTypeCode: "operator",
      limit: 30,
    }),
    getEntityLeaderboard({
      metricCode: "ebitda_margin",
      entityTypeCode: "operator",
      limit: 30,
    }),
    getEntityLeaderboard({
      metricCode: "active_customers",
      entityTypeCode: "operator",
      limit: 30,
    }),
    getEntityLeaderboard({
      metricCode: "arpu",
      entityTypeCode: "operator",
      limit: 30,
    }),
    getOperatorStockHeatmap(),
  ]);

  const revenue = adaptEntityLeaderboardRows(revRaw);
  // Top YoY growers
  const growers = [...revRaw]
    .map((r) => ({
      raw: r,
      yoy:
        r.latest_value != null && r.prev_year_value != null
          ? ((Number(r.latest_value) - Number(r.prev_year_value)) /
              Math.abs(Number(r.prev_year_value))) *
            100
          : null,
    }))
    .filter((x) => x.yoy != null && Number.isFinite(x.yoy))
    .sort((a, b) => (b.yoy ?? 0) - (a.yoy ?? 0))
    .slice(0, 5);

  // Margin leaders — sort by absolute latest margin value
  const marginLeaders = marginRaw
    .map((r) => ({
      raw: r,
      pct: r.latest_value != null ? Number(r.latest_value) : null,
    }))
    .filter((x) => x.pct != null && Number.isFinite(x.pct))
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">Operators</h1>
        <p className="text-xs text-tb-muted">
          Listed B2C operators — stock heatmap, rankings, and delta movers.
        </p>
      </header>

      {/* Stock heatmap */}
      <div className="rounded-md border border-tb-border bg-tb-surface">
        <div className="flex items-center justify-between border-b border-tb-border px-3 py-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
              Stock heatmap
            </h3>
            <span className="text-[10px] text-tb-muted">
              sized by revenue · colored by day change
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

      {/* Operator leaderboard */}
      <Leaderboard
        title="Operator leaderboard"
        subtitle="Ranked by latest revenue"
        valueLabel="REVENUE"
        rows={revenue.rows}
        total={revenue.total}
        columns={[
          "rank",
          "name",
          "value",
          "share",
          "yoy",
          "sparkline",
          "ticker",
        ]}
        maxRows={25}
      />

      {/* Delta movers */}
      <div className="grid gap-4 lg:grid-cols-3">
        <DeltaCard
          title="Biggest revenue growers"
          items={growers.map((g) => ({
            name: g.raw.name,
            slug: g.raw.slug,
            badge: <DeltaChip pct={g.yoy} />,
          }))}
        />
        <DeltaCard
          title="Margin expansion leaders"
          items={marginLeaders.map((m) => ({
            name: m.raw.name,
            slug: m.raw.slug,
            badge: (
              <span className="font-mono text-[11px] text-tb-success">
                {m.pct!.toFixed(1)}%
              </span>
            ),
          }))}
        />
        <div className="rounded-md border border-tb-border bg-tb-surface">
          <div className="border-b border-tb-border px-3 py-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
              Recent news
            </h3>
          </div>
          <div className="p-4 text-[11px] text-tb-muted">
            News feed pending — hooks into the company IR scraper will
            populate this once the scraper is queueing items.
          </div>
        </div>
      </div>
    </div>
  );
}

function DeltaCard({
  title,
  items,
}: {
  title: string;
  items: { name: string; slug: string; badge: React.ReactNode }[];
}) {
  return (
    <div className="rounded-md border border-tb-border bg-tb-surface">
      <div className="border-b border-tb-border px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
          {title}
        </h3>
      </div>
      <ul className="divide-y divide-tb-border/60">
        {items.length === 0 && (
          <li className="p-4 text-[11px] text-tb-muted">No data yet.</li>
        )}
        {items.map((i, idx) => (
          <li key={idx} className="flex items-center justify-between px-3 py-1.5">
            <Link
              href={`/companies/${i.slug}`}
              className="truncate text-[11px] text-tb-text hover:text-tb-blue"
            >
              {i.name}
            </Link>
            {i.badge}
          </li>
        ))}
      </ul>
    </div>
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
