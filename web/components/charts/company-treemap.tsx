"use client";
import Link from "next/link";
import { formatEur } from "@/lib/format";

export type TreemapCell = {
  id: string;
  name: string;
  slug: string;
  value: number | null; // revenue in EUR
  typeCode: string | null; // "OP" | "B2B" | "AFF" | "LOT" | "DFS" | ...
  ticker?: string | null;
  disclosureStatus?: string;
};

// C3: Company treemap — sized by revenue, colored by entity type.
// Shares layout DNA with the Operators stock heatmap (grid + span buckets)
// so the two surfaces read consistently.
export function CompanyTreemap({ cells }: { cells: TreemapCell[] }) {
  const sized = cells.filter((c) => (c.value ?? 0) > 0);
  if (sized.length === 0) {
    return (
      <div className="p-6 text-[11px] text-tb-muted">
        No companies with revenue data yet.
      </div>
    );
  }
  const sorted = [...sized].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const maxVal = Math.max(...sorted.map((c) => c.value ?? 0), 1);

  function span(v: number | null): { colSpan: number; rowSpan: number } {
    if (v == null || v <= 0) return { colSpan: 1, rowSpan: 1 };
    const ratio = v / maxVal;
    if (ratio > 0.5) return { colSpan: 3, rowSpan: 2 };
    if (ratio > 0.2) return { colSpan: 2, rowSpan: 2 };
    if (ratio > 0.08) return { colSpan: 2, rowSpan: 1 };
    return { colSpan: 1, rowSpan: 1 };
  }

  return (
    <div className="grid auto-rows-[52px] grid-cols-12 gap-px bg-tb-border p-px">
      {sorted.map((c) => {
        const s = span(c.value);
        return (
          <TreemapTile key={c.id} cell={c} colSpan={s.colSpan} rowSpan={s.rowSpan} />
        );
      })}
    </div>
  );
}

function TreemapTile({
  cell,
  colSpan,
  rowSpan,
}: {
  cell: TreemapCell;
  colSpan: number;
  rowSpan: number;
}) {
  const { name, slug, value, typeCode, ticker } = cell;
  const { bg, fg } = palette(typeCode);
  const isBeacon =
    cell.disclosureStatus === "beacon_estimate" ||
    cell.disclosureStatus === "derived";
  const title = `${name}${ticker ? ` (${ticker})` : ""} · ${value != null ? formatEur(value) : "—"}${typeCode ? ` · ${typeCode}` : ""}`;

  return (
    <Link
      href={`/companies/${slug}`}
      title={title}
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
        <span className="truncate text-[11px] font-semibold">
          {ticker ?? name.slice(0, 14)}
        </span>
        {typeCode && (
          <span className="shrink-0 font-mono text-[9px] opacity-80">
            {typeCode}
          </span>
        )}
      </div>
      {(colSpan >= 2 || rowSpan >= 2) && (
        <span className="truncate text-[9px] leading-tight opacity-85">
          {name}
        </span>
      )}
      {(colSpan >= 2 || rowSpan >= 2) && value != null && (
        <span className="font-mono text-[9px] opacity-80">
          {formatEur(value)}
          {isBeacon ? " ™" : ""}
        </span>
      )}
    </Link>
  );
}

// Palette mirrors the EntityTypeChip colors in the leaderboard primitive so
// the treemap and the leaderboard reinforce each other visually.
function palette(code: string | null): { bg: string; fg: string } {
  const c = (code ?? "").toUpperCase();
  if (c === "OP" || c === "OPERATOR") return { bg: "#1D3558", fg: "text-slate-100" };
  if (c === "B2B" || c === "B2B_PLATFORM" || c === "B2B_SUPPLIER")
    return { bg: "#2E2A28", fg: "text-stone-100" };
  if (c === "AFF" || c === "AFFILIATE")
    return { bg: "#18452B", fg: "text-emerald-100" };
  if (c === "LOT" || c === "LOTTERY")
    return { bg: "#2D1E49", fg: "text-violet-100" };
  if (c === "DFS") return { bg: "#3A2F18", fg: "text-amber-100" };
  if (c === "MEDIA") return { bg: "#2A1B2E", fg: "text-pink-100" };
  return { bg: "#262A31", fg: "text-slate-200" };
}
