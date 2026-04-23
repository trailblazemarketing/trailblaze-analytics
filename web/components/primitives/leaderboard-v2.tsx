"use client";
import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/beacon/sparkline";
import { DeltaChip } from "@/components/beacon/delta-chip";
import { SourceLabel } from "@/components/beacon/source-label";
import type { DisclosureStatus, SourceType } from "@/lib/types";

// Leaderboard v2 — entity-agnostic analytical primitive.
// UI_SPEC_1 Primitive 1. Ranks entities (or markets) by a single metric.
// Sibling file `leaderboard.tsx` is owned by round 8a (markets-page
// period-aware row labels, Competitive Position tweaks); v2 is the
// clean primitive the brief calls for.
//
// Usage example:
//   <LeaderboardV2
//     title="US iGaming GGR"
//     primaryMetricLabel="Handle $m"
//     variant="ranked"
//     columns={["rank","entity","value","share","yoy","sparkline","ticker"]}
//     rows={[
//       { id: "fanduel", entity: { name: "FanDuel", typeChip: "OP",
//         href: "/companies/fanduel", ticker: "FLUT",
//         tickerDeltaPct: 2.4 },
//         value: { formatted: "241.8", raw: 241.8 },
//         share: 34.5, yoy: -25.8,
//         sparkline: [310,298,280,260,252,248,245,241.8],
//         beacon: false },
//       ...
//     ]}
//     onRowClick={(id) => router.push(`/operators/${id}`)}
//   />

export type LeaderboardV2Column =
  | "rank"
  | "entity"
  | "value"
  | "share"
  | "yoy"
  | "sparkline"
  | "ticker";

export type LeaderboardV2Row = {
  id: string;
  entity: {
    name: string;
    typeChip?: string | null; // "OP" | "AFF" | "B2B" | "LOT" | "DFS" | etc.
    href?: string | null;
    ticker?: string | null;
    tickerDeltaPct?: number | null;
  };
  value: {
    raw: number | null;
    formatted: string; // caller formats for unit consistency
    nativeTooltip?: string | null;
  };
  share?: number | null; // 0–100, % of aggregate
  yoy?: number | null;
  sparkline?: (number | null)[] | null;
  beaconMask?: boolean[] | null;
  beacon?: boolean; // short-hand: "mark the value as a Beacon™ estimate"
  disclosureStatus?: DisclosureStatus;
  // For grouped variant: row belongs to this group (e.g., "OPERATORS").
  groupKey?: string | null;
};

export type LeaderboardV2Total = {
  formattedValue: string;
  yoy?: number | null;
  rowLabel?: string; // default "Total"
  suppressShare?: boolean;
};

export type LeaderboardV2GroupMeta = {
  key: string;
  label: string;
  subtitle?: string | null;
};

export function LeaderboardV2({
  title,
  subtitle,
  period,
  source,
  primaryMetricLabel,
  rows,
  columns = ["rank", "entity", "value", "share", "yoy", "sparkline", "ticker"],
  variant = "ranked",
  groups,
  total,
  maxRows,
  showViewAll,
  viewAllHref,
  onRowClick,
  className,
  emptyMessage = "No data.",
}: {
  title: string;
  subtitle?: string | null;
  period?: string | null;
  source?: SourceType | null;
  primaryMetricLabel: string;
  rows: LeaderboardV2Row[];
  columns?: LeaderboardV2Column[];
  variant?: "ranked" | "flat" | "grouped";
  groups?: LeaderboardV2GroupMeta[]; // required for variant="grouped"
  total?: LeaderboardV2Total | null;
  maxRows?: number;
  showViewAll?: boolean;
  viewAllHref?: string;
  onRowClick?: (rowId: string) => void;
  className?: string;
  emptyMessage?: string;
}) {
  const maxShare = rows.reduce((m, r) => Math.max(m, r.share ?? 0), 0) || 100;
  const visibleRows = maxRows ? rows.slice(0, maxRows) : rows;

  // Grouped layout: partition rows by groupKey preserving incoming order.
  const grouped: { meta: LeaderboardV2GroupMeta; rows: LeaderboardV2Row[] }[] =
    React.useMemo(() => {
      if (variant !== "grouped" || !groups || groups.length === 0) return [];
      const bucket = new Map<string, LeaderboardV2Row[]>();
      for (const g of groups) bucket.set(g.key, []);
      for (const r of visibleRows) {
        const key = r.groupKey ?? groups[0].key;
        if (!bucket.has(key)) bucket.set(key, []);
        bucket.get(key)!.push(r);
      }
      return groups.map((g) => ({ meta: g, rows: bucket.get(g.key) ?? [] }));
    }, [variant, groups, visibleRows]);

  return (
    <div
      className={cn(
        "rounded-md border border-tb-border bg-tb-surface",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-tb-border px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
              {title}
            </h3>
            <code className="font-mono text-[10px] text-tb-muted">
              {primaryMetricLabel}
            </code>
          </div>
          {subtitle && (
            <p className="mt-0.5 text-[10px] text-tb-muted">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-tb-muted">
          {period && <span className="font-mono">{period}</span>}
          {source && <SourceLabel source={source} />}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-tb-border text-[10px] font-semibold uppercase tracking-wide text-tb-muted">
            <tr>
              {columns.includes("rank") && (
                <th className="w-8 px-3 py-1 text-left">#</th>
              )}
              {columns.includes("entity") && (
                <th className="px-3 py-1 text-left">Entity</th>
              )}
              {columns.includes("value") && (
                <th className="w-[140px] px-3 py-1 text-right">
                  {primaryMetricLabel}
                </th>
              )}
              {columns.includes("share") && (
                <th className="w-[110px] px-3 py-1 text-right">Share</th>
              )}
              {columns.includes("yoy") && (
                <th className="w-[80px] px-3 py-1 text-right">YoY</th>
              )}
              {columns.includes("sparkline") && (
                <th className="w-[76px] px-3 py-1 text-left">Trend</th>
              )}
              {columns.includes("ticker") && (
                <th className="w-[80px] px-3 py-1 text-right">Ticker</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-tb-border/60">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-6 text-center text-[11px] text-tb-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}

            {variant === "grouped" && grouped.length > 0
              ? grouped.flatMap((g) => {
                  const header = (
                    <tr key={`hdr-${g.meta.key}`} className="bg-tb-bg/30">
                      <td
                        colSpan={columns.length}
                        className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-tb-muted"
                      >
                        {g.meta.label}
                        {g.meta.subtitle && (
                          <span className="ml-2 font-normal normal-case text-[9px] text-tb-muted/70">
                            {g.meta.subtitle}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                  const rowEls = g.rows.map((row, i) =>
                    renderRow(row, i, columns, maxShare, onRowClick),
                  );
                  return [header, ...rowEls];
                })
              : visibleRows.map((row, i) =>
                  renderRow(row, i, columns, maxShare, onRowClick),
                )}

            {total && (
              <tr className="border-t-2 border-tb-border bg-tb-bg/40">
                <td
                  colSpan={
                    (columns.includes("rank") ? 1 : 0) +
                    (columns.includes("entity") ? 1 : 0)
                  }
                  className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-tb-muted"
                >
                  {total.rowLabel ?? "Total"}
                </td>
                {columns.includes("value") && (
                  <td className="px-3 py-1 text-right font-mono font-semibold text-tb-text">
                    {total.formattedValue}
                  </td>
                )}
                {columns.includes("share") && (
                  <td className="px-3 py-1 text-right font-mono text-[10px] tabular-nums text-tb-muted">
                    {total.suppressShare ? "—" : "100.0%"}
                  </td>
                )}
                {columns.includes("yoy") && (
                  <td className="px-3 py-1 text-right">
                    <DeltaChip pct={total.yoy} />
                  </td>
                )}
                {columns
                  .filter(
                    (c) =>
                      c !== "rank" &&
                      c !== "entity" &&
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

function renderRow(
  row: LeaderboardV2Row,
  i: number,
  columns: LeaderboardV2Column[],
  maxShare: number,
  onRowClick?: (id: string) => void,
): React.ReactElement {
  const isBeacon =
    row.beacon === true ||
    row.disclosureStatus === "beacon_estimate" ||
    row.disclosureStatus === "derived";

  const clickable = Boolean(onRowClick);
  const handleClick = clickable ? () => onRowClick!(row.id) : undefined;

  return (
    <tr
      key={row.id}
      onClick={handleClick}
      className={cn(
        "group transition-colors hover:bg-tb-border/25",
        clickable && "cursor-pointer",
      )}
    >
      {columns.includes("rank") && (
        <td className="px-3 py-1 font-mono text-[11px] text-tb-muted">
          {i + 1}
        </td>
      )}
      {columns.includes("entity") && (
        <td className="max-w-[260px] px-3 py-1">
          <div className="flex items-center gap-2">
            {row.entity.typeChip && (
              <EntityTypeChip code={row.entity.typeChip} />
            )}
            {row.entity.href ? (
              <Link
                href={row.entity.href}
                onClick={(e) => e.stopPropagation()}
                className="truncate text-tb-text hover:text-tb-blue"
              >
                {row.entity.name}
              </Link>
            ) : (
              <span className="truncate">{row.entity.name}</span>
            )}
          </div>
        </td>
      )}
      {columns.includes("value") && (
        <td
          className="whitespace-nowrap px-3 py-1 text-right font-mono text-tb-text"
          title={row.value.nativeTooltip ?? undefined}
        >
          {row.value.formatted}
          {isBeacon && <sup className="beacon-tm">™</sup>}
        </td>
      )}
      {columns.includes("share") && (
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
      {columns.includes("yoy") && (
        <td className="px-3 py-1 text-right">
          <DeltaChip pct={row.yoy} />
        </td>
      )}
      {columns.includes("sparkline") && (
        <td className="px-3 py-1">
          {row.sparkline &&
          row.sparkline.filter((v) => v != null && Number.isFinite(v))
            .length >= 3 ? (
            <Sparkline
              values={row.sparkline}
              beaconMask={row.beaconMask ?? undefined}
              width={60}
              height={20}
            />
          ) : (
            <span className="font-mono text-[10px] text-tb-muted">—</span>
          )}
        </td>
      )}
      {columns.includes("ticker") && (
        <td className="whitespace-nowrap px-3 py-1 text-right">
          {row.entity.ticker ? (
            <span className="inline-flex items-center gap-1 font-mono text-[10px]">
              <span className="text-tb-text">{row.entity.ticker}</span>
              {row.entity.tickerDeltaPct != null && (
                <DeltaChip pct={row.entity.tickerDeltaPct} size="xs" />
              )}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-tb-muted">—</span>
          )}
        </td>
      )}
    </tr>
  );
}

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
  if (c === "OP" || c === "OPERATOR")
    return { bg: "#1A2433", fg: "#CBD5E1" };
  if (c === "B2B" || c === "B2B_PLATFORM" || c === "B2B_SUPPLIER")
    return { bg: "#242121", fg: "#D6D3D1" };
  if (c === "AFF" || c === "AFFILIATE")
    return { bg: "#1A2820", fg: "#BBF7D0" };
  if (c === "LOT" || c === "LOTTERY")
    return { bg: "#22192D", fg: "#DDD6FE" };
  if (c === "DFS") return { bg: "#2A2418", fg: "#FCD34D" };
  return { bg: "transparent", fg: "#9CA3AF" };
}
