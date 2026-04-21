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
  // Pass 4: saturated flat colors matching the Gemini mockup.
  // 4-bucket mapping on abs(dcp) — ≤0.5% / ≤1.5% / ≤3% / >3% — keeps tiles
  // visually distinct at a glance instead of blending into surface color.
  const dcp = day_change_pct;
  const abs = dcp != null ? Math.abs(dcp) : 0;
  const bucket = abs <= 0.5 ? 0 : abs <= 1.5 ? 1 : abs <= 3 ? 2 : 3;
  const bg = !has_price
    ? "#1A1D24"
    : dcp == null
    ? "var(--tb-surface)"
    : dcp > 0
    ? GAIN[bucket]
    : dcp < 0
    ? LOSS[bucket]
    : "var(--tb-surface)";
  const fg = !has_price || dcp == null || Math.abs(dcp) <= 0.5
    ? "text-tb-text"
    : "text-white";

  const tileTitle = `${name} (${ticker})${
    latest_price != null ? ` · ${latest_price.toFixed(2)}` : ""
  }${dcp != null ? ` · ${dcp > 0 ? "+" : ""}${dcp.toFixed(2)}%` : ""}`;

  return (
    <Link
      href={`/companies/${slug}`}
      title={tileTitle}
      className={
        "relative flex flex-col justify-between overflow-hidden p-1.5 transition-opacity hover:opacity-90 " +
        fg
      }
      style={{
        background: bg,
        gridColumn: `span ${colSpan} / span ${colSpan}`,
        gridRow: `span ${rowSpan} / span ${rowSpan}`,
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-mono text-[11px] font-semibold">
          {ticker}
        </span>
        {dcp != null && (
          <span className="shrink-0 font-mono text-[10px] opacity-95">
            {dcp > 0 ? "+" : ""}
            {dcp.toFixed(1)}%
          </span>
        )}
        {dcp == null && has_price && (
          <span className="font-mono text-[9px] opacity-70">—</span>
        )}
      </div>
      {(colSpan >= 2 || rowSpan >= 2) && (
        <span className="truncate text-[9px] leading-tight opacity-85">
          {name}
        </span>
      )}
      {(colSpan >= 3 || rowSpan >= 2) && latest_price != null && (
        <span className="font-mono text-[9px] opacity-75">
          {latest_price < 1000
            ? latest_price.toFixed(2)
            : latest_price.toFixed(0)}
        </span>
      )}
    </Link>
  );
}

// Flat saturated palette — aligns to the Gemini Finviz-style treemap.
// Small moves stay subtle; big moves saturate. Text flips to white at bucket 1+.
const GAIN = ["#123922", "#15803D", "#16A34A", "#10B981"];
const LOSS = ["#3A1414", "#991B1B", "#DC2626", "#EF4444"];
