"use client";
import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/beacon/sparkline";
import { DeltaChip } from "@/components/beacon/delta-chip";
import { Badge } from "@/components/ui/badge";
import { SourceLabel } from "@/components/beacon/source-label";
import type { DisclosureStatus, SourceType } from "@/lib/types";

export type LeaderboardRow = {
  id: string;
  href?: string;
  name: string;
  typeChip?: string | null;
  value: number | null;
  valueFormatted: string; // caller formats (currency/count/etc.)
  nativeTooltip?: string | null; // e.g. "$3.79B @ 1.077 USD/EUR" — shown on hover
  share?: number | null; // 0-100
  yoy?: number | null;
  qoq?: number | null;
  sparkline?: (number | null)[] | null;
  beaconMask?: boolean[];
  ticker?: string | null;
  tickerDeltaPct?: number | null;
  disclosureStatus?: DisclosureStatus;
  beaconCoveragePct?: number | null; // for market leaderboards
  extra?: React.ReactNode;
  // M3/M4: set on country rows that roll up sub-market values, or any row
  // whose market has children — renders a chevron next to the name.
  hasChildren?: boolean;
  isRollup?: boolean;
};

export type LeaderboardColumn =
  | "rank"
  | "name"
  | "value"
  | "share"
  | "yoy"
  | "qoq"
  | "sparkline"
  | "ticker"
  | "beacon_coverage"
  | "extra";

export function Leaderboard({
  title,
  subtitle,
  period,
  source,
  rows,
  columns = ["rank", "name", "value", "share", "yoy", "sparkline", "ticker"],
  total,
  valueLabel,
  nameLabel = "Entity",
  maxRows,
  showViewAll,
  viewAllHref,
  className,
  extraHeader,
  forceBeaconColumn,
}: {
  title: string;
  subtitle?: string;
  period?: string;
  source?: SourceType | null;
  rows: LeaderboardRow[];
  columns?: LeaderboardColumn[];
  total?: {
    valueFormatted: string;
    yoy?: number | null;
    // When the operator-sum is implausibly small (<1%) or large (>110%)
    // versus the disclosed market-level total, the page passes a
    // human-readable warning string. We render a ⚠ badge next to the
    // Total label rather than hiding the widget — the relative ranking
    // is still useful when absolute scale is off.
    scaleWarning?: string | null;
  } | null;
  valueLabel?: string;
  nameLabel?: string; // M1: column header for the primary label (Entity | Market)
  maxRows?: number;
  showViewAll?: boolean;
  viewAllHref?: string;
  className?: string;
  extraHeader?: React.ReactNode;
  forceBeaconColumn?: boolean; // G3: keep beacon_coverage visible even when all-zero
}) {
  const maxShare =
    rows.reduce((m, r) => Math.max(m, r.share ?? 0), 0) || 100;
  const visible = maxRows ? rows.slice(0, maxRows) : rows;

  // G3: auto-hide beacon_coverage when every visible row reports 0 (or null).
  // Keeps the architecture — caller passes `forceBeaconColumn` on surfaces
  // where coverage is itself the primary signal (Market detail).
  const hasBeaconSignal = visible.some(
    (r) => r.beaconCoveragePct != null && r.beaconCoveragePct > 0,
  );
  const effectiveColumns = columns.filter((c) =>
    c === "beacon_coverage" && !forceBeaconColumn && !hasBeaconSignal
      ? false
      : true,
  );

  return (
    <div
      className={cn(
        "rounded-md border border-tb-border bg-tb-surface",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-tb-border px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
              {title}
            </h3>
            {valueLabel && (
              <code className="font-mono text-[10px] text-tb-muted">
                {valueLabel}
              </code>
            )}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-[10px] text-tb-muted">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-tb-muted">
          {period && <span className="font-mono">{period}</span>}
          {source && <SourceLabel source={source} />}
          {extraHeader}
        </div>
      </div>

      {/* Table — G1: tight row height (py-1) so 10-12 rows fit a viewport */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-tb-border text-[10px] font-semibold uppercase tracking-wide text-tb-muted">
            <tr>
              {effectiveColumns.includes("rank") && (
                <th className="w-8 px-3 py-1 text-left">#</th>
              )}
              {effectiveColumns.includes("name") && (
                <th className="px-3 py-1 text-left">{nameLabel}</th>
              )}
              {effectiveColumns.includes("value") && (
                <th className="w-[140px] px-3 py-1 text-right">
                  {valueLabel ?? "Value"}
                </th>
              )}
              {effectiveColumns.includes("share") && (
                <th className="w-[110px] px-3 py-1 text-right">Share</th>
              )}
              {effectiveColumns.includes("yoy") && (
                <th className="w-[80px] px-3 py-1 text-right">YoY</th>
              )}
              {effectiveColumns.includes("qoq") && (
                <th className="w-[80px] px-3 py-1 text-right">QoQ</th>
              )}
              {effectiveColumns.includes("sparkline") && (
                <th className="w-[76px] px-3 py-1 text-left">Trend</th>
              )}
              {effectiveColumns.includes("ticker") && (
                <th className="w-[70px] px-3 py-1 text-right">Ticker</th>
              )}
              {effectiveColumns.includes("beacon_coverage") && (
                <th className="w-[60px] px-3 py-1 text-right">Beacon™</th>
              )}
              {effectiveColumns.includes("extra") && (
                <th className="px-3 py-1 text-right" />
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-tb-border/60">
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={effectiveColumns.length}
                  className="px-3 py-6 text-center text-[11px] text-tb-muted"
                >
                  No data.
                </td>
              </tr>
            )}
            {visible.map((row, i) => (
              <tr
                key={row.id}
                className="group transition-colors hover:bg-tb-border/25"
              >
                {effectiveColumns.includes("rank") && (
                  <td className="px-3 py-1 font-mono text-[11px] text-tb-muted">
                    {i + 1}
                  </td>
                )}
                {effectiveColumns.includes("name") && (
                  <td className="max-w-[260px] px-3 py-1">
                    <div className="flex items-center gap-2">
                      {row.typeChip && (
                        <EntityTypeChip code={row.typeChip} />
                      )}
                      {row.href ? (
                        <Link
                          href={row.href}
                          className="truncate text-tb-text hover:text-tb-blue"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        <span className="truncate">{row.name}</span>
                      )}
                      {row.hasChildren && (
                        <span
                          className="font-mono text-[9px] text-tb-muted"
                          title="Has sub-markets — click to drill in"
                        >
                          ›
                        </span>
                      )}
                      {row.isRollup && (
                        <span
                          className="rounded border border-tb-border px-1 text-[8px] uppercase tracking-wider text-tb-muted"
                          title="Rolled up from sub-markets"
                        >
                          Σ
                        </span>
                      )}
                    </div>
                  </td>
                )}
                {effectiveColumns.includes("value") && (
                  <td
                    className="whitespace-nowrap px-3 py-1 text-right font-mono text-tb-text"
                    title={row.nativeTooltip ?? undefined}
                  >
                    {row.valueFormatted}
                    {(row.disclosureStatus === "beacon_estimate" ||
                      row.disclosureStatus === "derived") && (
                      <sup className="beacon-tm">™</sup>
                    )}
                  </td>
                )}
                {effectiveColumns.includes("share") && (
                  <td className="px-3 py-1 text-right">
                    {row.share != null ? (
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <span
                          className="h-1.5 rounded-sm bg-tb-blue/30"
                          style={{
                            width: `${Math.max(4, (row.share / maxShare) * 50)}px`,
                          }}
                        />
                        <span className="w-[42px] text-right font-mono text-[10px] tabular-nums text-tb-muted">
                          {row.share.toFixed(1)}%
                        </span>
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-tb-muted">—</span>
                    )}
                  </td>
                )}
                {effectiveColumns.includes("yoy") && (
                  <td className="px-3 py-1 text-right">
                    <DeltaChip pct={row.yoy} />
                  </td>
                )}
                {effectiveColumns.includes("qoq") && (
                  <td className="px-3 py-1 text-right">
                    <DeltaChip pct={row.qoq} />
                  </td>
                )}
                {effectiveColumns.includes("sparkline") && (
                  <td className="px-3 py-1">
                    {/* G2: require ≥3 real points (brief rule) before drawing */}
                    {row.sparkline &&
                    row.sparkline.filter((v) => v != null && Number.isFinite(v))
                      .length >= 3 ? (
                      <Sparkline
                        values={row.sparkline}
                        beaconMask={row.beaconMask}
                        width={60}
                        height={20}
                      />
                    ) : (
                      <span className="font-mono text-[10px] text-tb-muted">—</span>
                    )}
                  </td>
                )}
                {effectiveColumns.includes("ticker") && (
                  <td className="whitespace-nowrap px-3 py-1 text-right">
                    {row.ticker ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px]">
                        <span className="text-tb-text">{row.ticker}</span>
                        {row.tickerDeltaPct != null && (
                          <DeltaChip pct={row.tickerDeltaPct} size="xs" />
                        )}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-tb-muted">—</span>
                    )}
                  </td>
                )}
                {effectiveColumns.includes("beacon_coverage") && (
                  <td className="px-3 py-1 text-right font-mono text-[10px]">
                    {row.beaconCoveragePct != null ? (
                      <span
                        className={
                          row.beaconCoveragePct > 50
                            ? "text-tb-beacon"
                            : row.beaconCoveragePct > 0
                            ? "text-tb-muted"
                            : "text-tb-muted/60"
                        }
                      >
                        {row.beaconCoveragePct.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-tb-muted">—</span>
                    )}
                  </td>
                )}
                {effectiveColumns.includes("extra") && (
                  <td className="px-3 py-1 text-right text-[10px] text-tb-muted">
                    {row.extra ?? null}
                  </td>
                )}
              </tr>
            ))}
            {total && (
              <tr className="border-t-2 border-tb-border bg-tb-bg/40">
                <td
                  colSpan={
                    (effectiveColumns.includes("rank") ? 1 : 0) +
                    (effectiveColumns.includes("name") ? 1 : 0)
                  }
                  className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-tb-muted"
                >
                  <span className="inline-flex items-center gap-1.5">
                    Total
                    {total.scaleWarning && (
                      <span
                        className="cursor-help rounded border border-tb-beacon/40 bg-tb-beacon/10 px-1 font-normal normal-case tracking-normal text-tb-beacon"
                        title={total.scaleWarning}
                      >
                        ⚠ scale
                      </span>
                    )}
                  </span>
                </td>
                {effectiveColumns.includes("value") && (
                  <td className="px-3 py-1 text-right font-mono font-semibold text-tb-text">
                    {total.valueFormatted}
                  </td>
                )}
                {effectiveColumns.includes("share") && (
                  <td className="px-3 py-1 text-right font-mono text-[10px] tabular-nums text-tb-muted">
                    100.0%
                  </td>
                )}
                {effectiveColumns.includes("yoy") && (
                  <td className="px-3 py-1 text-right">
                    <DeltaChip pct={total.yoy} />
                  </td>
                )}
                {effectiveColumns
                  .filter(
                    (c) =>
                      c !== "rank" &&
                      c !== "name" &&
                      c !== "value" &&
                      c !== "share" &&
                      c !== "yoy",
                  )
                  .map((c) => (
                    <td key={c} className="px-3 py-1" />
                  ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {showViewAll && viewAllHref && (
        <div className="border-t border-tb-border px-3 py-1 text-right">
          <Link
            href={viewAllHref}
            className="text-[10px] text-tb-blue hover:underline"
          >
            View all →
          </Link>
        </div>
      )}
    </div>
  );
}

// C2: entity-type chip with subtle background tone per type. Shared across
// every leaderboard so scanability is uniform.
function EntityTypeChip({ code }: { code: string }) {
  const style = chipStyle(code);
  const isDefault = style.bg === "transparent";
  return (
    <span
      className={
        "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide" +
        (isDefault ? " border border-tb-border" : "")
      }
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {code}
    </span>
  );
}

function chipStyle(code: string): { bg: string; fg: string } {
  const c = code.toUpperCase();
  // Market-type chips come through here too ("NATIONAL", "US_STATE", etc.)
  // We only theme the five entity-type codes called out in the brief.
  if (c === "OP" || c === "OPERATOR")
    return { bg: "#1A2433", fg: "#CBD5E1" };
  if (c === "B2B" || c === "B2B_PLATFORM" || c === "B2B_SUPPLIER")
    return { bg: "#242121", fg: "#D6D3D1" };
  if (c === "AFF" || c === "AFFILIATE")
    return { bg: "#1A2820", fg: "#BBF7D0" };
  if (c === "LOT" || c === "LOTTERY")
    return { bg: "#22192D", fg: "#DDD6FE" };
  if (c === "DFS") return { bg: "#2A2418", fg: "#FCD34D" };
  // default muted chip
  return { bg: "transparent", fg: "#9CA3AF" };
}
