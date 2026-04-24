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
  Area,
  ComposedChart,
  ReferenceLine,
} from "recharts";
import Link from "next/link";
import { truncateAtSentence } from "@/lib/format";
import { displayReportFilename } from "@/lib/formatters/reportFilename";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SourceLabel } from "@/components/beacon/source-label";
import { DeltaChip } from "@/components/beacon/delta-chip";
import { ReportLink } from "@/components/reports/report-link";
import type {
  BeaconEstimate,
  DisclosureStatus,
  SourceType,
} from "@/lib/types";

export type DeepDivePoint = {
  period: string; // period code
  periodLabel: string;
  periodStart: string;
  value: number | null;
  valueFormatted: string;
  disclosureStatus: DisclosureStatus;
  source: SourceType;
  confidence: number | null; // 0-1
  yoy?: number | null;
  qoq?: number | null;
  band_low?: number | null;
  band_high?: number | null;
  report_id?: string | null;
};

export type DeepDiveNarrative = {
  section: string;
  content: string;
  report_id: string;
  report_filename?: string;
};

export function DeepDive({
  title,
  subtitle,
  series,
  narratives = [],
  sourceReports = [],
  beaconByPeriod = {},
  onComparisonAdd,
  className,
}: {
  title: string;
  subtitle?: string;
  series: DeepDivePoint[];
  narratives?: DeepDiveNarrative[];
  sourceReports?: { id: string; filename: string; published: string | null }[];
  beaconByPeriod?: Record<string, BeaconEstimate>;
  // UI_SPEC_1 Primitive 4 — "Add comparison" overlay another entity's
  // series on the chart. When handler is provided, renders the action
  // button in the header. When omitted, header stays clean.
  onComparisonAdd?: () => void;
  className?: string;
}) {
  const ordered = React.useMemo(
    () =>
      [...series].sort((a, b) =>
        a.periodStart.localeCompare(b.periodStart),
      ),
    [series],
  );

  // Chart data
  const chartData = ordered.map((p) => ({
    period: p.period,
    periodLabel: p.periodLabel,
    disclosed:
      p.disclosureStatus === "disclosed" && p.value != null ? p.value : null,
    estimate:
      p.disclosureStatus !== "disclosed" && p.value != null ? p.value : null,
    band_low: p.band_low ?? null,
    band_high: p.band_high ?? null,
  }));

  const hasBand = chartData.some(
    (d) => d.band_low != null && d.band_high != null,
  );

  // For table — show newest first
  const tableRows = [...ordered].reverse();

  return (
    <div
      className={cn(
        "rounded-md border border-tb-border bg-tb-surface",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-tb-border px-4 py-3">
        <div>
          <div className="mb-0.5 flex items-center gap-2">
            <Badge variant="blue">Deep Dive</Badge>
          </div>
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-tb-muted">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-tb-muted">
          <LegendDot label="Disclosed" color="var(--tb-blue)" />
          <LegendDot label="Beacon™" color="var(--tb-beacon)" dashed />
          {onComparisonAdd && (
            <button
              type="button"
              onClick={onComparisonAdd}
              className="rounded border border-tb-border px-2 py-0.5 text-[10px] text-tb-text transition-colors hover:border-tb-blue hover:text-tb-blue"
              title="Overlay another entity's series on this chart"
            >
              + Add comparison
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-px bg-tb-border lg:grid-cols-5">
        {/* Chart */}
        <div className="bg-tb-surface p-3 lg:col-span-3">
          <div className="h-[260px]">
            {ordered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[11px] text-tb-muted">
                No data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="var(--tb-border)"
                    strokeDasharray="2 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="periodLabel"
                    tick={{
                      fill: "var(--tb-text-muted)",
                      fontSize: 10,
                      fontFamily: "JetBrains Mono",
                    }}
                    axisLine={{ stroke: "var(--tb-border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{
                      fill: "var(--tb-text-muted)",
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
                    cursor={{
                      stroke: "var(--tb-blue)",
                      strokeOpacity: 0.3,
                    }}
                  />
                  {hasBand && (
                    <>
                      <Area
                        type="monotone"
                        dataKey="band_high"
                        stroke="none"
                        fill="var(--tb-beacon)"
                        fillOpacity={0.08}
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="band_low"
                        stroke="none"
                        fill="var(--tb-bg)"
                        fillOpacity={0.0}
                        isAnimationActive={false}
                      />
                    </>
                  )}
                  <Line
                    type="monotone"
                    dataKey="disclosed"
                    stroke="var(--tb-blue)"
                    strokeWidth={1.75}
                    dot={{ r: 2.5, fill: "var(--tb-blue)" }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                    name="Disclosed"
                  />
                  <Line
                    type="monotone"
                    dataKey="estimate"
                    stroke="var(--tb-beacon)"
                    strokeWidth={1.75}
                    strokeDasharray="4 3"
                    dot={{ r: 2.5, fill: "var(--tb-beacon)" }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                    name="Beacon™"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Narratives */}
        <div className="min-w-0 bg-tb-surface p-3 lg:col-span-2">
          {narratives.length === 0 ? (
            <div className="text-[11px] text-tb-muted">
              No narrative sections yet.
            </div>
          ) : (
            <div className="space-y-3">
              {narratives.slice(0, 3).map((n, i) => (
                <div key={`${n.section}-${i}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-tb-muted">
                      {humaniseSection(n.section)}
                    </div>
                    {n.report_id && (
                      <ReportLink
                        reportId={n.report_id}
                        className="text-[10px] text-tb-blue hover:underline"
                      >
                        source →
                      </ReportLink>
                    )}
                  </div>
                  <p className="whitespace-pre-line text-[11px] leading-relaxed text-tb-text">
                    {truncateAtSentence(n.content, 320)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border-t border-tb-border">
        <table className="w-full text-xs">
          <thead className="border-b border-tb-border text-[10px] font-semibold uppercase tracking-wide text-tb-muted">
            <tr>
              <th className="px-3 py-1.5 text-left">Period</th>
              <th className="px-3 py-1.5 text-right">Value</th>
              <th className="px-3 py-1.5 text-right">YoY</th>
              <th className="px-3 py-1.5 text-right">QoQ</th>
              <th className="px-3 py-1.5 text-left">Source</th>
              <th className="px-3 py-1.5 text-left">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tb-border/60">
            {tableRows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-[11px] text-tb-muted"
                >
                  No values recorded.
                </td>
              </tr>
            )}
            {tableRows.map((p) => {
              const isBeacon =
                p.disclosureStatus === "beacon_estimate" ||
                p.disclosureStatus === "derived";
              return (
                <tr key={p.period} className="hover:bg-tb-border/25">
                  <td className="px-3 py-1.5 font-mono text-tb-muted">
                    {p.periodLabel}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-1.5 text-right font-mono",
                      isBeacon && "border-l-2 border-l-tb-beacon",
                    )}
                  >
                    {p.valueFormatted}
                    {isBeacon && <sup className="beacon-tm">™</sup>}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <DeltaChip pct={p.yoy} />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <DeltaChip pct={p.qoq} />
                  </td>
                  <td className="px-3 py-1.5">
                    <SourceLabel source={p.source} />
                  </td>
                  <td className="px-3 py-1.5">
                    {p.confidence != null ? (
                      <span
                        className={cn(
                          "font-mono text-[10px]",
                          p.confidence > 0.85
                            ? "text-tb-success"
                            : p.confidence > 0.5
                            ? "text-tb-beacon"
                            : "text-tb-muted",
                        )}
                      >
                        {p.disclosureStatus === "disclosed"
                          ? "Verified"
                          : `Modeled (${(p.confidence * 100).toFixed(0)}%)`}
                      </span>
                    ) : p.disclosureStatus === "disclosed" ? (
                      <span className="font-mono text-[10px] text-tb-success">
                        Verified
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-tb-muted">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Source reports */}
      {sourceReports.length > 0 && (
        <div className="border-t border-tb-border px-3 py-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-tb-muted">
            Source reports ({sourceReports.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sourceReports.slice(0, 10).map((r) => (
              <ReportLink
                key={r.id}
                reportId={r.id}
                className="truncate rounded border border-tb-border px-2 py-0.5 text-[10px] text-tb-text transition-colors hover:border-tb-blue hover:text-tb-blue"
              >
                {displayReportFilename(r.filename)}
              </ReportLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LegendDot({
  label,
  color,
  dashed,
}: {
  label: string;
  color: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="14" height="4" aria-hidden="true">
        <line
          x1="0"
          y1="2"
          x2="14"
          y2="2"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray={dashed ? "3 2" : undefined}
        />
      </svg>
      {label}
    </span>
  );
}

function humaniseSection(code: string): string {
  const map: Record<string, string> = {
    executive_summary: "Executive summary",
    company_insights_interpretation: "Insights & interpretation",
    market_deep_dive: "Market deep-dive",
    affiliate_benchmarking: "Affiliate benchmarking",
    forecast_strategy: "Forecast & strategy",
    investment_view: "Investment view",
    valuation_downside: "Valuation — downside",
    valuation_base: "Valuation — base",
    valuation_upside: "Valuation — upside",
  };
  return map[code] ?? code.replace(/_/g, " ");
}
