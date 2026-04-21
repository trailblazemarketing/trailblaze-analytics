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
  maxRows,
  showViewAll,
  viewAllHref,
  className,
  extraHeader,
}: {
  title: string;
  subtitle?: string;
  period?: string;
  source?: SourceType | null;
  rows: LeaderboardRow[];
  columns?: LeaderboardColumn[];
  total?: { valueFormatted: string; yoy?: number | null } | null;
  valueLabel?: string;
  maxRows?: number;
  showViewAll?: boolean;
  viewAllHref?: string;
  className?: string;
  extraHeader?: React.ReactNode;
}) {
  const maxShare =
    rows.reduce((m, r) => Math.max(m, r.share ?? 0), 0) || 100;
  const visible = maxRows ? rows.slice(0, maxRows) : rows;

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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-tb-border text-[10px] font-semibold uppercase tracking-wide text-tb-muted">
            <tr>
              {columns.includes("rank") && (
                <th className="w-8 px-3 py-1.5 text-left">#</th>
              )}
              {columns.includes("name") && (
                <th className="px-3 py-1.5 text-left">Entity</th>
              )}
              {columns.includes("value") && (
                <th className="px-3 py-1.5 text-right">
                  {valueLabel ?? "Value"}
                </th>
              )}
              {columns.includes("share") && (
                <th className="w-[100px] px-3 py-1.5 text-left">Share</th>
              )}
              {columns.includes("yoy") && (
                <th className="w-[80px] px-3 py-1.5 text-right">YoY</th>
              )}
              {columns.includes("qoq") && (
                <th className="w-[80px] px-3 py-1.5 text-right">QoQ</th>
              )}
              {columns.includes("sparkline") && (
                <th className="w-[80px] px-3 py-1.5 text-left">Trend</th>
              )}
              {columns.includes("ticker") && (
                <th className="w-[70px] px-3 py-1.5 text-right">Ticker</th>
              )}
              {columns.includes("beacon_coverage") && (
                <th className="w-[60px] px-3 py-1.5 text-right">Beacon™</th>
              )}
              {columns.includes("extra") && (
                <th className="px-3 py-1.5 text-right" />
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-tb-border/60">
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-[11px] text-tb-muted"
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
                {columns.includes("rank") && (
                  <td className="px-3 py-1.5 font-mono text-[11px] text-tb-muted">
                    {i + 1}
                  </td>
                )}
                {columns.includes("name") && (
                  <td className="max-w-[260px] px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      {row.typeChip && (
                        <Badge variant="muted" className="shrink-0">
                          {row.typeChip}
                        </Badge>
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
                    </div>
                  </td>
                )}
                {columns.includes("value") && (
                  <td
                    className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-tb-text"
                    title={row.nativeTooltip ?? undefined}
                  >
                    {row.valueFormatted}
                    {(row.disclosureStatus === "beacon_estimate" ||
                      row.disclosureStatus === "derived") && (
                      <sup className="beacon-tm">™</sup>
                    )}
                  </td>
                )}
                {columns.includes("share") && (
                  <td className="px-3 py-1.5">
                    {row.share != null ? (
                      <div className="flex items-center gap-1.5">
                        <div
                          className="h-1.5 rounded-sm bg-tb-blue/30"
                          style={{
                            width: `${Math.max(4, (row.share / maxShare) * 60)}px`,
                          }}
                        />
                        <span className="font-mono text-[10px] text-tb-muted">
                          {row.share.toFixed(1)}%
                        </span>
                      </div>
                    ) : (
                      <span className="font-mono text-[10px] text-tb-muted">—</span>
                    )}
                  </td>
                )}
                {columns.includes("yoy") && (
                  <td className="px-3 py-1.5 text-right">
                    <DeltaChip pct={row.yoy} />
                  </td>
                )}
                {columns.includes("qoq") && (
                  <td className="px-3 py-1.5 text-right">
                    <DeltaChip pct={row.qoq} />
                  </td>
                )}
                {columns.includes("sparkline") && (
                  <td className="px-3 py-1.5">
                    {row.sparkline && row.sparkline.length >= 2 ? (
                      <Sparkline
                        values={row.sparkline}
                        beaconMask={row.beaconMask}
                        width={64}
                        height={16}
                      />
                    ) : (
                      <span className="font-mono text-[10px] text-tb-muted">—</span>
                    )}
                  </td>
                )}
                {columns.includes("ticker") && (
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
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
                {columns.includes("beacon_coverage") && (
                  <td className="px-3 py-1.5 text-right font-mono text-[10px]">
                    {row.beaconCoveragePct != null ? (
                      <span
                        className={
                          row.beaconCoveragePct > 50
                            ? "text-tb-beacon"
                            : "text-tb-muted"
                        }
                      >
                        {row.beaconCoveragePct.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-tb-muted">—</span>
                    )}
                  </td>
                )}
                {columns.includes("extra") && (
                  <td className="px-3 py-1.5 text-right text-[10px] text-tb-muted">
                    {row.extra ?? null}
                  </td>
                )}
              </tr>
            ))}
            {total && (
              <tr className="border-t-2 border-tb-border bg-tb-bg/40">
                <td
                  colSpan={
                    (columns.includes("rank") ? 1 : 0) +
                    (columns.includes("name") ? 1 : 0)
                  }
                  className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-tb-muted"
                >
                  Total
                </td>
                {columns.includes("value") && (
                  <td className="px-3 py-1.5 text-right font-mono font-semibold text-tb-text">
                    {total.valueFormatted}
                  </td>
                )}
                {columns.includes("share") && (
                  <td className="px-3 py-1.5 font-mono text-[10px] text-tb-muted">
                    100.0%
                  </td>
                )}
                {columns.includes("yoy") && (
                  <td className="px-3 py-1.5 text-right">
                    <DeltaChip pct={total.yoy} />
                  </td>
                )}
                {columns
                  .filter(
                    (c) =>
                      c !== "rank" &&
                      c !== "name" &&
                      c !== "value" &&
                      c !== "share" &&
                      c !== "yoy",
                  )
                  .map((c) => (
                    <td key={c} className="px-3 py-1.5" />
                  ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {showViewAll && viewAllHref && (
        <div className="border-t border-tb-border px-3 py-1.5 text-right">
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
