"use client";
import * as React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceDot,
} from "recharts";
import { formatEur } from "@/lib/format";

export type TimeseriesPoint = {
  period: string;
  period_start: string;
  [seriesKey: string]: string | number | null;
};

export type BeaconFlags = {
  [seriesKey: string]: Set<string>; // period codes where the value is beacon
};

// Default Y-axis / tooltip formatter — EUR-compact (€3.6B, €247.2M, €812K).
// Callers override via `valueFormatter` to switch currency or unit (e.g. %).
function defaultFormatter(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return formatEur(n);
}

const PALETTE = [
  "#2BA8E0", // tb-blue
  "#10B981", // tb-success
  "#2B2D8E", // tb-purple
  "#F472B6", // pink
  "#38BDF8", // sky
  "#A78BFA", // violet
];

// Recharts Line doesn't natively do "dotted for some segments, solid for
// others." We render two overlapping Lines per series: a solid one for the
// disclosed points, and a dotted one that only shows values where the point
// is Beacon™. At the seams, we also drop a ReferenceDot styled orange.
export function MetricTimeseries({
  data,
  series,
  beaconFlags,
  height = 280,
  yLabel,
  valueFormatter = defaultFormatter,
}: {
  data: TimeseriesPoint[];
  series: { key: string; label: string }[];
  beaconFlags?: BeaconFlags;
  height?: number;
  yLabel?: string;
  // T2 small-fix 1: currency-aware Y-axis + tooltip formatter. Default is
  // EUR-compact (€3.6B); callers pass a custom formatter for pct/USD/etc.
  valueFormatter?: (v: unknown) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--tb-border)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="period"
          tick={{ fill: "var(--tb-text-muted)", fontSize: 10, fontFamily: "JetBrains Mono" }}
          axisLine={{ stroke: "var(--tb-border)" }}
          tickLine={false}
          // Suppress synthesised gap-row labels — fillCadenceGaps in
          // lib/queries/analytics inserts placeholder periods named
          // "gap-N" so the line breaks visibly at missing periods
          // (Recharts connectNulls={false}). The placeholder kept its
          // literal name in the x-axis tick — Flutter / BetMGM /
          // Betsson / Better Collective charts all rendered the
          // string "gap-0" between data points. Format ticks: empty
          // string for any gap label.
          tickFormatter={(t: unknown) => {
            const s = typeof t === "string" ? t : String(t ?? "");
            return s.startsWith("gap-") ? "" : s;
          }}
          // Tooltip cursor likewise needs to skip gap rows so hover
          // doesn't show a tooltip at a synthetic period.
        />
        <YAxis
          tick={{ fill: "var(--tb-text-muted)", fontSize: 10, fontFamily: "JetBrains Mono" }}
          axisLine={{ stroke: "var(--tb-border)" }}
          tickLine={false}
          tickFormatter={valueFormatter}
          width={62}
          label={
            yLabel
              ? {
                  value: yLabel,
                  angle: -90,
                  position: "insideLeft",
                  style: {
                    fill: "var(--tb-text-muted)",
                    fontSize: 10,
                    textAnchor: "middle",
                  },
                }
              : undefined
          }
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
          cursor={{ stroke: "var(--tb-blue)", strokeOpacity: 0.3 }}
          // Same gap-row guard as the x-axis tick formatter: when the
          // hovered row is a synthesised "gap-N" placeholder, drop the
          // label so the tooltip doesn't show the literal string.
          labelFormatter={(label: unknown) => {
            const s = typeof label === "string" ? label : String(label ?? "");
            return s.startsWith("gap-") ? "" : s;
          }}
          formatter={(value: unknown, name: string, payload) => {
            const key = (payload as { dataKey?: string })?.dataKey;
            const periodCode = (payload as { payload?: { period: string } })
              ?.payload?.period;
            if (typeof periodCode === "string" && periodCode.startsWith("gap-")) {
              return ["", ""];
            }
            // Suppress the companion line's null entry so the user doesn't
            // see two Tooltip rows for the same period.
            if (value == null) return ["", ""];
            const baseKey =
              typeof key === "string"
                ? key.replace(/__(solid|beacon)$/, "")
                : key;
            const bf = baseKey ? beaconFlags?.[baseKey] : undefined;
            const isBeacon =
              !!(bf && typeof bf.has === "function" && periodCode && bf.has(periodCode));
            return [
              `${valueFormatter(value)}${isBeacon ? " ™" : ""}`,
              name,
            ];
          }}
        />
        {/* Single-series charts don't need a legend (the axis title /
            panel header already names the series). Showing one is
            visually noisy and was the source of the QA-reported
            "duplicate Q1-25 / Q2-25 labels" on Betsson + Kambi —
            Recharts under certain narrow-width conditions echoed an
            x-axis tick into the legend slot. Render only when
            multiple series are present. */}
        {series.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 10, color: "var(--tb-text-muted)" }}
            iconType="plainline"
          />
        )}
        {series.flatMap((s, i) => {
          // Round 10 Fix 3: Recharts can't do per-segment dash on a single
          // Line. Render two overlapping Lines — solid skips Beacon™ points
          // (line breaks via connectNulls=false), dotted fills the "Beacon
          // zone" (the Beacon point + its immediate neighbours). At shared
          // points (zone edges), the dot renderer picks one line's dot.
          const color = PALETTE[i % PALETTE.length];
          const bf = beaconFlags?.[s.key];
          const bhas = (p?: string) =>
            !!(bf && typeof bf.has === "function" && p && bf.has(p));
          const inZone = (idx: number) =>
            bhas(data[idx]?.period) ||
            bhas(data[idx - 1]?.period) ||
            bhas(data[idx + 1]?.period);
          const mkDot = (beaconLine: boolean) => (props: {
            cx?: number; cy?: number; payload?: { period: string }; index?: number;
          }) => {
            const { cx, cy, payload, index } = props;
            if (cx == null || cy == null || !payload) {
              return <g key={`${s.key}-${beaconLine ? "b" : "s"}-${index ?? "na"}`} />;
            }
            const here = bhas(payload.period);
            if (beaconLine !== here) {
              return <g key={`${s.key}-skip-${payload.period}`} />;
            }
            return (
              <circle
                key={`${s.key}-${beaconLine ? "b" : "s"}-${payload.period}`}
                cx={cx} cy={cy} r={here ? 3 : 2.5}
                fill={here ? "var(--tb-beacon)" : color}
                stroke={here ? "var(--tb-beacon)" : color}
                strokeWidth={here ? 1 : 0}
              />
            );
          };
          return [
            <Line
              key={`${s.key}__solid`} type="monotone" name={s.label}
              dataKey={(row: TimeseriesPoint) =>
                bhas(row.period) ? null : row[s.key]
              }
              stroke={color} strokeWidth={1.5} connectNulls={false}
              dot={mkDot(false)} activeDot={{ r: 4, fill: color }}
            />,
            <Line
              key={`${s.key}__beacon`} type="monotone" name={s.label}
              dataKey={(row: TimeseriesPoint, idx?: number) => {
                const i2 = typeof idx === "number" ? idx : data.findIndex((d) => d.period === row.period);
                return inZone(i2) ? row[s.key] : null;
              }}
              stroke={color} strokeWidth={1.5} strokeDasharray="4 3"
              connectNulls={false}
              dot={mkDot(true)} activeDot={{ r: 4, fill: "var(--tb-beacon)" }}
              legendType="none"
            />,
          ];
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}
