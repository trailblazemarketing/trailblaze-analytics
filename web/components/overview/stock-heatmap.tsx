"use client";
import Link from "next/link";
import type { HeatmapCell } from "@/lib/queries/operators";

// OP1: Custom dense heatmap. Not Recharts Treemap — that adds recursive
// padding we can't kill cleanly. Plain CSS grid: tiles sized by relative
// market cap via grid-template row/col spans, colored by day change.
//
// Layout strategy: sort by market cap desc. Compute a "weight" per tile
// from sqrt(cap / max_cap) — that keeps the biggest cos from dominating
// while still visually rewarding scale. Then bucket into span classes.
export function StockHeatmap({ cells }: { cells: HeatmapCell[] }) {
  if (cells.length === 0) {
    return (
      <div className="p-6 text-[11px] text-tb-muted">
        No listed operators have tickers assigned yet.
      </div>
    );
  }

  // Sort by market cap desc, nulls last
  const sorted = [...cells].sort((a, b) => {
    const ac = a.market_cap_eur ?? 0;
    const bc = b.market_cap_eur ?? 0;
    return bc - ac;
  });

  const maxCap = Math.max(...sorted.map((c) => c.market_cap_eur ?? 0), 1);

  // Assign row and column spans based on market cap bucket. Brief says tiles
  // should touch neighbors with 1px borders — we use `gap-px` and let
  // background show through as the border.
  function span(cap: number | null): { colSpan: number; rowSpan: number } {
    if (cap == null || cap <= 0) return { colSpan: 1, rowSpan: 1 };
    const ratio = cap / maxCap;
    if (ratio > 0.5) return { colSpan: 3, rowSpan: 2 };
    if (ratio > 0.25) return { colSpan: 2, rowSpan: 2 };
    if (ratio > 0.1) return { colSpan: 2, rowSpan: 1 };
    return { colSpan: 1, rowSpan: 1 };
  }

  return (
    <div className="grid auto-rows-[56px] grid-cols-12 gap-px bg-tb-border p-px">
      {sorted.map((c) => {
        const s = span(c.market_cap_eur);
        return (
          <HeatTile key={c.entity_id} cell={c} colSpan={s.colSpan} rowSpan={s.rowSpan} />
        );
      })}
    </div>
  );
}

function HeatTile({
  cell,
  colSpan,
  rowSpan,
}: {
  cell: HeatmapCell;
  colSpan: number;
  rowSpan: number;
}) {
  const { ticker, name, slug, latest_price, day_change_pct, has_price } = cell;
  // Color by day change. Intensity mapped to sqrt so a ±1% move shows color.
  const dcp = day_change_pct;
  const intensity = dcp != null ? Math.min(1, Math.sqrt(Math.abs(dcp) / 6)) : 0;
  const bg = !has_price
    ? "color-mix(in srgb, var(--tb-border) 55%, var(--tb-surface))"
    : dcp == null
    ? "var(--tb-surface)"
    : dcp > 0.05
    ? `color-mix(in srgb, var(--tb-success) ${(intensity * 70).toFixed(0)}%, var(--tb-surface))`
    : dcp < -0.05
    ? `color-mix(in srgb, var(--tb-danger) ${(intensity * 70).toFixed(0)}%, var(--tb-surface))`
    : "var(--tb-surface)";

  const tileTitle = `${name} (${ticker})${
    latest_price != null ? ` · ${latest_price.toFixed(2)}` : ""
  }${dcp != null ? ` · ${dcp > 0 ? "+" : ""}${dcp.toFixed(2)}%` : ""}`;

  return (
    <Link
      href={`/companies/${slug}`}
      title={tileTitle}
      className="relative flex flex-col justify-between overflow-hidden p-1.5 transition-opacity hover:opacity-90"
      style={{
        background: bg,
        gridColumn: `span ${colSpan} / span ${colSpan}`,
        gridRow: `span ${rowSpan} / span ${rowSpan}`,
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-mono text-[11px] font-semibold text-tb-text">
          {ticker}
        </span>
        {dcp != null && (
          <span
            className={
              "shrink-0 font-mono text-[10px] " +
              (dcp > 0
                ? "text-tb-success"
                : dcp < 0
                ? "text-tb-danger"
                : "text-tb-muted")
            }
          >
            {dcp > 0 ? "+" : ""}
            {dcp.toFixed(1)}%
          </span>
        )}
        {dcp == null && has_price && (
          <span className="font-mono text-[9px] text-tb-muted">—</span>
        )}
      </div>
      {/* Show company short-name only if the tile is wide enough */}
      {(colSpan >= 2 || rowSpan >= 2) && (
        <span className="truncate text-[9px] leading-tight text-tb-text/80">
          {name}
        </span>
      )}
    </Link>
  );
}
