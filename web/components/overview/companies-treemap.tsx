"use client";
import * as React from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { useRouter } from "next/navigation";
import { formatEur } from "@/lib/format";

// Per-entity-type colour palette. Cyan family for B2B (platform vs
// supplier shaded apart), blue for operator, teal for affiliate, amber
// for lottery, purple for DFS. Falls through to grey for entities with
// no entity_type assignment (the 508/555 backlog noted in the parser
// TODOs).
const COLOR_BY_TYPE: Record<string, string> = {
  operator: "#00b4d8",
  b2b_platform: "#4cc9f0",
  b2b_supplier: "#90e0ef",
  affiliate: "#2ec4b6",
  lottery: "#ffb703",
  dfs: "#7209b7",
};
const FALLBACK = "#3a3a4a";

export interface TreemapDatum {
  name: string;
  slug: string;
  size: number;
  entityType: string | null;
  yoyPct: number | null;
}

export function CompaniesTreemap({
  data,
  height = 450,
}: {
  data: TreemapDatum[];
  height?: number;
}) {
  const router = useRouter();
  // Single root; Treemap expects a hierarchical input.
  const treemapData = React.useMemo(
    () => [{ name: "root", children: data }],
    [data],
  );
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap
        data={treemapData}
        dataKey="size"
        stroke="var(--tb-bg)"
        animationDuration={300}
        content={
          <TreemapCell
            onSelect={(slug) => router.push(`/companies/${slug}`)}
          />
        }
      >
        <Tooltip
          contentStyle={{
            background: "var(--tb-surface)",
            border: "1px solid var(--tb-border)",
            borderRadius: 4,
            fontSize: 11,
            fontFamily: "JetBrains Mono",
            color: "var(--tb-text)",
          }}
          formatter={(value: unknown, _name: string, payload) => {
            const p = (payload as { payload?: TreemapDatum })?.payload;
            const yoy =
              p?.yoyPct != null
                ? ` · YoY ${p.yoyPct > 0 ? "+" : ""}${p.yoyPct.toFixed(1)}%`
                : "";
            return [`${formatEur(Number(value))}${yoy}`, p?.name ?? ""];
          }}
        />
      </Treemap>
    </ResponsiveContainer>
  );
}

// Custom cell — Recharts spreads the leaf node's data fields directly
// onto the cell-content props (NOT nested under `payload` for Treemap
// in Recharts 2.x — that was the cause of every cell rendering €0.00,
// since `payload?.size` was always undefined and the formatter
// interpreted that as 0). Read fields from props directly with
// `value` (Recharts' computed dataKey value) as the size source-of-
// truth, falling back to the original `size` if Recharts changes.
type CellProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  index?: number;
  // Spread by Recharts from the leaf node:
  name?: string;
  value?: number; // computed from dataKey
  size?: number; // original
  slug?: string;
  entityType?: string | null;
  yoyPct?: number | null;
  payload?: Partial<TreemapDatum>;
  onSelect?: (slug: string) => void;
};

function TreemapCell(props: CellProps) {
  const { x = 0, y = 0, width = 0, height = 0, depth = 0, onSelect } = props;
  if (depth === 0) return null; // root container
  // Read every datum field with multi-source fallback. `value` is the
  // canonical numeric (Recharts uses dataKey to populate it); `size`
  // is the original. Strings + extra fields come straight off props or
  // through payload.
  const name = props.name ?? props.payload?.name ?? "";
  const slug = props.slug ?? props.payload?.slug;
  const entityType = props.entityType ?? props.payload?.entityType ?? null;
  const yoyPct = props.yoyPct ?? props.payload?.yoyPct ?? null;
  const sizeRaw = props.value ?? props.size ?? props.payload?.size ?? 0;
  const fill = entityType
    ? (COLOR_BY_TYPE[entityType] ?? FALLBACK)
    : FALLBACK;
  // Label visibility scales: only render text when there is room for
  // it. Cells smaller than the threshold render plain coloured rects
  // (still hoverable for tooltip).
  const showLabel = width > 80 && height > 30;
  const showValue = width > 110 && height > 50;
  const showYoy = width > 130 && height > 70;
  // Char budget is a function of width. Inter-600 at 11px renders at
  // ~8px/char worst-case on bold Latin letters — previous formula
  // (width-12)/7 over-estimated the budget and the SVG clipped
  // mid-glyph, producing "Allwyn Interna" with no ellipsis hint.
  // Tighter divisor here guarantees the visible string always fits the
  // cell, and truncate() appends the ellipsis for any name the cell
  // cannot fully show. Full name is available on hover via the
  // Recharts Tooltip above + the <title> SVG element below (belt-and-
  // suspenders for screen readers / non-JS accessibility).
  const charBudget = Math.max(6, Math.floor((width - 12) / 8));
  const labelText = truncate(name, charBudget);
  const yoyText =
    yoyPct != null
      ? `YoY ${yoyPct > 0 ? "+" : ""}${yoyPct.toFixed(1)}%`
      : "";
  // Native SVG tooltip — shows full entity name + current period value +
  // YoY when the Recharts <Tooltip> above isn't triggered (headless
  // rendering, screen readers, touch devices that don't hover).
  const nativeTitle = [
    name,
    sizeRaw ? formatEur(sizeRaw) : null,
    yoyText || null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <g
      style={{ cursor: slug ? "pointer" : "default" }}
      onClick={() => slug && onSelect?.(slug)}
    >
      <title>{nativeTitle}</title>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill,
          stroke: "var(--tb-bg)",
          strokeWidth: 1,
          opacity: 0.92,
        }}
      />
      {showLabel && (
        <text
          x={x + 6}
          y={y + 14}
          fill="#0a0a0f"
          fontSize={11}
          fontWeight={600}
          fontFamily="Inter, sans-serif"
        >
          {labelText}
        </text>
      )}
      {showValue && (
        <text
          x={x + 6}
          y={y + 30}
          fill="#0a0a0f"
          fontSize={10}
          fontFamily="JetBrains Mono, monospace"
          opacity={0.85}
        >
          {formatEur(sizeRaw)}
        </text>
      )}
      {showYoy && yoyText && (
        <text
          x={x + 6}
          y={y + 44}
          fill="#0a0a0f"
          fontSize={9}
          fontFamily="JetBrains Mono, monospace"
          opacity={0.7}
        >
          {yoyText}
        </text>
      )}
    </g>
  );
}

function truncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  if (maxChars < 4) return s.slice(0, maxChars);
  return s.slice(0, maxChars - 1) + "…";
}
