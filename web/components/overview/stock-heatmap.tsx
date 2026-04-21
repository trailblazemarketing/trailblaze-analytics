"use client";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import Link from "next/link";
import type { HeatmapCell } from "@/lib/queries/operators";
import { useRouter } from "next/navigation";

export function StockHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const router = useRouter();

  // Treemap wants {name, size, ...} — we pass our whole row as extra.
  // Include every listed operator so the map shows the universe; tiles with
  // no price render grey. Size tile by revenue (EUR) or a floor so the tile
  // still shows.
  const data = cells.map((c) => ({
    name: c.ticker,
    size: Math.max(c.size_value ?? 0, 50_000_000),
    fullName: c.name,
    slug: c.slug,
    price: c.latest_price,
    dcp: c.day_change_pct,
    hasPrice: c.has_price,
  }));

  if (data.length === 0) {
    return (
      <div className="p-6 text-[11px] text-tb-muted">
        No listed operators have tickers assigned yet.
      </div>
    );
  }

  return (
    <div className="h-[320px] w-full p-1">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="size"
          stroke="var(--tb-border)"
          isAnimationActive={false}
          content={<HeatCell router={router} />}
        >
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const p = payload[0].payload as {
                fullName: string;
                name: string;
                price: number | null;
                dcp: number | null;
              };
              return (
                <div className="rounded-md border border-tb-border bg-tb-surface p-2 text-[11px]">
                  <div className="font-semibold">{p.fullName}</div>
                  <div className="font-mono text-tb-muted">{p.name}</div>
                  {p.price != null && (
                    <div className="font-mono">${p.price.toFixed(2)}</div>
                  )}
                  {p.dcp != null && (
                    <div
                      className={`font-mono ${
                        p.dcp > 0 ? "text-tb-success" : p.dcp < 0 ? "text-tb-danger" : "text-tb-muted"
                      }`}
                    >
                      {p.dcp > 0 ? "+" : ""}
                      {p.dcp.toFixed(2)}%
                    </div>
                  )}
                </div>
              );
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}

// Recharts-friendly custom content renderer. It passes x/y/width/height
// plus all the original data fields — we draw a rect + label + delta.
function HeatCell(props: {
  router: ReturnType<typeof useRouter>;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  fullName?: string;
  slug?: string;
  price?: number | null;
  dcp?: number | null;
  hasPrice?: boolean;
}) {
  const { router, x = 0, y = 0, width = 0, height = 0, name, slug, dcp, hasPrice } = props;
  if (width <= 0 || height <= 0) return <g />;

  // Color: magnitude mapped to a sqrt curve so small moves still show
  const intensity = dcp != null ? Math.min(1, Math.sqrt(Math.abs(dcp) / 6)) : 0;
  const fill = !hasPrice
    ? "color-mix(in srgb, var(--tb-border) 60%, var(--tb-surface))"
    : dcp == null
    ? "var(--tb-border)"
    : dcp > 0.05
    ? `color-mix(in srgb, var(--tb-success) ${(intensity * 70).toFixed(0)}%, var(--tb-surface))`
    : dcp < -0.05
    ? `color-mix(in srgb, var(--tb-danger) ${(intensity * 70).toFixed(0)}%, var(--tb-surface))`
    : "var(--tb-surface)";

  const showLabel = width > 56 && height > 34;
  const showDelta = width > 56 && height > 48;

  return (
    <g
      onClick={() => slug && router.push(`/companies/${slug}`)}
      style={{ cursor: slug ? "pointer" : "default" }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="var(--tb-border)"
        strokeWidth={0.5}
      />
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2 - (showDelta ? 6 : 0)}
          textAnchor="middle"
          fill="var(--tb-text)"
          fontFamily="JetBrains Mono"
          fontSize={Math.min(12, Math.max(10, width / 8))}
          fontWeight="600"
        >
          {name}
        </text>
      )}
      {showDelta && dcp != null && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 10}
          textAnchor="middle"
          fill={dcp > 0 ? "var(--tb-success)" : dcp < 0 ? "var(--tb-danger)" : "var(--tb-muted)"}
          fontFamily="JetBrains Mono"
          fontSize={10}
        >
          {dcp > 0 ? "+" : ""}
          {dcp.toFixed(1)}%
        </text>
      )}
      {showDelta && dcp == null && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 10}
          textAnchor="middle"
          fill="var(--tb-text-muted)"
          fontFamily="JetBrains Mono"
          fontSize={9}
        >
          no price
        </text>
      )}
    </g>
  );
}
