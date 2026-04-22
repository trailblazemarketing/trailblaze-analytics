"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { formatEur } from "@/lib/format";

export type MarketBarPoint = {
  name: string;
  value: number;
  isRollup?: boolean;
};

// O1: horizontal market-size bar chart — top N markets by a currency metric.
// Flat blue palette; rolled-up rows get a muted overlay to visually separate
// summed-from-children rows from native country reports.
export function MarketBarChart({
  data,
  valueLabel,
  height = 260,
}: {
  data: MarketBarPoint[];
  valueLabel: string;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="p-6 text-[11px] text-tb-muted">
        No markets with {valueLabel.toLowerCase()} data for the current period.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 8, right: 32, left: 4, bottom: 4 }}
        barCategoryGap={2}
      >
        <CartesianGrid
          stroke="var(--tb-border)"
          strokeDasharray="2 4"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{
            fill: "var(--tb-text-muted)",
            fontSize: 10,
            fontFamily: "JetBrains Mono",
          }}
          axisLine={{ stroke: "var(--tb-border)" }}
          tickLine={false}
          tickFormatter={(v: number) => formatEur(v)}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{
            fill: "var(--tb-text)",
            fontSize: 10,
            fontFamily: "JetBrains Mono",
          }}
          axisLine={{ stroke: "var(--tb-border)" }}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "var(--tb-surface)",
            border: "1px solid var(--tb-border)",
            borderRadius: 4,
            fontSize: 11,
            fontFamily: "JetBrains Mono",
            color: "var(--tb-text)",
          }}
          cursor={{ fill: "var(--tb-border)", fillOpacity: 0.2 }}
          formatter={(value: unknown, _name: string, payload) => {
            const isRollup = (
              payload as { payload?: { isRollup?: boolean } }
            )?.payload?.isRollup;
            return [
              `${formatEur(Number(value))}${isRollup ? " (Σ rolled up)" : ""}`,
              valueLabel,
            ];
          }}
        />
        <Bar dataKey="value">
          {data.map((d, i) => (
            <Cell
              key={`bar-${i}`}
              fill={d.isRollup ? "#1F4FC7" : "#2BA8E0"}
              fillOpacity={d.isRollup ? 0.75 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
