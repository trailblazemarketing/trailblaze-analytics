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

// Custom cell — Recharts gives x/y/width/height/index/depth/payload.
// We render coloured rect + label only when the cell is large enough
// for the label to be legible (>~80px wide and >~30px tall). Click
// navigates to /companies/<slug>.
type CellProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  index?: number;
  name?: string;
  payload?: TreemapDatum;
  onSelect?: (slug: string) => void;
};

function TreemapCell(props: CellProps) {
  const { x = 0, y = 0, width = 0, height = 0, depth = 0, payload, onSelect } = props;
  if (depth === 0) return null; // root container
  const datum = payload as TreemapDatum | undefined;
  const fill = datum?.entityType
    ? (COLOR_BY_TYPE[datum.entityType] ?? FALLBACK)
    : FALLBACK;
  const showLabel = width > 80 && height > 30;
  const showValue = width > 110 && height > 50;
  const showYoy = width > 130 && height > 70;
  const yoyText =
    datum?.yoyPct != null
      ? `YoY ${datum.yoyPct > 0 ? "+" : ""}${datum.yoyPct.toFixed(1)}%`
      : "";
  return (
    <g
      style={{ cursor: datum?.slug ? "pointer" : "default" }}
      onClick={() => datum?.slug && onSelect?.(datum.slug)}
    >
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
          {truncate(datum?.name ?? "", Math.max(8, Math.floor(width / 7)))}
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
          {formatEur(datum?.size ?? 0)}
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
