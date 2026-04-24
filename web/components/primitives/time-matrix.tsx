"use client";
import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DeltaChip } from "@/components/beacon/delta-chip";
import { Download, Thermometer, Percent } from "lucide-react";
import type { DisclosureStatus, SourceType } from "@/lib/types";

export type TimeMatrixCell = {
  value: number | null;
  valueFormatted: string;
  disclosureStatus?: DisclosureStatus;
  source?: SourceType | null;
};

export type TimeMatrixRow = {
  id: string;
  name: string;
  typeChip?: string | null;
  href?: string | null;
  cells: Record<string, TimeMatrixCell | null>; // keyed by period code
  total?: TimeMatrixCell | null;
  yoy?: number | null;
};

export function TimeMatrix({
  title,
  periods,
  periodLabels,
  rows,
  totals,
  showYoyRow,
  heatMapByColumn = true,
  className,
  valueLabel,
  csvFilename,
  onCellClick,
  onRowHeaderClick,
}: {
  title: string;
  periods: string[]; // period codes, ordered oldest → newest
  periodLabels?: Record<string, string>;
  rows: TimeMatrixRow[];
  totals?: Record<string, TimeMatrixCell | null> | null;
  showYoyRow?: boolean;
  heatMapByColumn?: boolean;
  className?: string;
  valueLabel?: string;
  csvFilename?: string;
  // UI_SPEC_1 Primitive 2 drill-down hooks. When provided, the matrix
  // becomes interactive: cell clicks open a value panel, header clicks
  // drill into the entity/market. When omitted, existing href-based
  // navigation on the row name still works.
  onCellClick?: (rowKey: string, period: string) => void;
  onRowHeaderClick?: (rowKey: string) => void;
}) {
  const [heatOn, setHeatOn] = React.useState(false);
  const [mode, setMode] = React.useState<"absolute" | "yoy" | "qoq">(
    "absolute",
  );

  // Per-column min/max for heat coloring
  const colRange = React.useMemo(() => {
    const map: Record<string, { min: number; max: number }> = {};
    for (const p of periods) {
      let min = Infinity,
        max = -Infinity;
      for (const r of rows) {
        const v = r.cells[p]?.value;
        if (v != null && Number.isFinite(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
        map[p] = { min, max };
      }
    }
    return map;
  }, [periods, rows]);

  // Derived cell values depending on mode (YoY / QoQ %)
  function derivedValue(
    row: TimeMatrixRow,
    pIdx: number,
  ): { text: string; raw: number | null; cell: TimeMatrixCell | null } {
    const p = periods[pIdx];
    const cell = row.cells[p] ?? null;
    if (!cell) return { text: "—", raw: null, cell: null };
    if (mode === "absolute")
      return { text: cell.valueFormatted, raw: cell.value, cell };
    // YoY: compare to 4 positions back (assumed quarterly) or to period 12-back for monthly — here we simplify to "12-period-back" if it exists, else 4-back.
    const lookback = mode === "yoy" ? 4 : 1;
    const prevIdx = pIdx - lookback;
    if (prevIdx < 0) return { text: "—", raw: null, cell };
    const prev = row.cells[periods[prevIdx]];
    if (!prev || prev.value == null || cell.value == null || prev.value === 0)
      return { text: "—", raw: null, cell };
    const pct = ((cell.value - prev.value) / Math.abs(prev.value)) * 100;
    return { text: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`, raw: pct, cell };
  }

  function downloadCsv() {
    const header = ["Entity", ...periods.map((p) => periodLabels?.[p] ?? p)];
    const lines = [header.join(",")];
    for (const r of rows) {
      const vals = periods.map((p) => {
        const c = r.cells[p];
        return c?.value != null ? String(c.value) : "";
      });
      lines.push([csvEscape(r.name), ...vals].join(","));
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename ?? `${title.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className={cn(
        "rounded-md border border-tb-border bg-tb-surface",
        className,
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tb-border px-3 py-2">
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
        <div className="flex items-center gap-1">
          <ModeButton active={mode === "absolute"} onClick={() => setMode("absolute")}>
            Abs
          </ModeButton>
          <ModeButton active={mode === "yoy"} onClick={() => setMode("yoy")}>
            YoY %
          </ModeButton>
          <ModeButton active={mode === "qoq"} onClick={() => setMode("qoq")}>
            QoQ %
          </ModeButton>
          <button
            onClick={() => setHeatOn((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors",
              heatOn
                ? "bg-tb-blue/15 text-tb-blue"
                : "text-tb-muted hover:text-tb-text",
            )}
            title="Toggle heat map"
          >
            <Thermometer className="h-3 w-3" />
            Heat
          </button>
          <button
            onClick={downloadCsv}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-tb-muted transition-colors hover:text-tb-text"
            title="Export CSV"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
        </div>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-tb-border text-[10px] font-semibold uppercase tracking-wide text-tb-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-tb-surface px-3 py-1.5 text-left">
                Row
              </th>
              {periods.map((p) => (
                <th
                  key={p}
                  className="whitespace-nowrap px-2 py-1.5 text-right font-mono"
                >
                  {periodLabels?.[p] ?? p}
                </th>
              ))}
              {mode === "absolute" && (
                <th className="px-3 py-1.5 text-right">YoY</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-tb-border/50">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={periods.length + 2}
                  className="px-3 py-8 text-center text-[11px] text-tb-muted"
                >
                  No data.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="group hover:bg-tb-border/20">
                <td className="sticky left-0 z-10 bg-tb-surface px-3 py-1.5 group-hover:bg-tb-surface">
                  <div className="flex items-center gap-1.5">
                    {r.typeChip && (
                      <Badge variant="muted" className="shrink-0">
                        {r.typeChip}
                      </Badge>
                    )}
                    {onRowHeaderClick ? (
                      <button
                        type="button"
                        onClick={() => onRowHeaderClick(r.id)}
                        className="truncate text-left text-tb-text hover:text-tb-blue"
                      >
                        {r.name}
                      </button>
                    ) : r.href ? (
                      <Link
                        href={r.href}
                        className="truncate text-tb-text hover:text-tb-blue"
                      >
                        {r.name}
                      </Link>
                    ) : (
                      <span className="truncate">{r.name}</span>
                    )}
                  </div>
                </td>
                {periods.map((p, pIdx) => {
                  const { text, raw, cell } = derivedValue(r, pIdx);
                  const isBeacon =
                    cell &&
                    (cell.disclosureStatus === "beacon_estimate" ||
                      cell.disclosureStatus === "derived");
                  const heat =
                    heatOn && colRange[p] && cell?.value != null
                      ? (cell.value - colRange[p].min) /
                        (colRange[p].max - colRange[p].min)
                      : null;
                  return (
                    <td
                      key={p}
                      onClick={
                        onCellClick && cell?.value != null
                          ? () => onCellClick(r.id, p)
                          : undefined
                      }
                      className={cn(
                        "whitespace-nowrap px-2 py-1.5 text-right font-mono",
                        isBeacon && "border-l-2 border-l-tb-beacon",
                        onCellClick && cell?.value != null && "cursor-pointer hover:bg-tb-border/40",
                      )}
                      style={
                        heat != null
                          ? {
                              background: `color-mix(in srgb, var(--tb-blue) ${(heat * 35).toFixed(0)}%, transparent)`,
                            }
                          : undefined
                      }
                    >
                      <span
                        className={cn(
                          cell?.value == null
                            ? "text-tb-muted"
                            : mode !== "absolute" && raw != null
                            ? raw > 0
                              ? "text-tb-success"
                              : raw < 0
                              ? "text-tb-danger"
                              : "text-tb-muted"
                            : "text-tb-text",
                        )}
                        title={cell?.source ?? undefined}
                      >
                        {text}
                        {isBeacon && cell?.value != null && (
                          <sup className="beacon-tm">™</sup>
                        )}
                      </span>
                    </td>
                  );
                })}
                {mode === "absolute" && (
                  <td className="px-3 py-1.5 text-right">
                    <DeltaChip pct={r.yoy} />
                  </td>
                )}
              </tr>
            ))}

            {/* Totals row */}
            {totals && mode === "absolute" && (
              <tr className="border-t-2 border-tb-border bg-tb-bg/40">
                <td className="sticky left-0 z-10 bg-tb-bg/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-tb-muted">
                  Total
                </td>
                {periods.map((p) => {
                  const c = totals[p];
                  return (
                    <td
                      key={p}
                      className="whitespace-nowrap px-2 py-1.5 text-right font-mono font-semibold"
                    >
                      {c ? c.valueFormatted : "—"}
                    </td>
                  );
                })}
                <td />
              </tr>
            )}

            {showYoyRow && totals && mode === "absolute" && (
              <tr className="bg-tb-bg/40">
                <td className="sticky left-0 z-10 bg-tb-bg/40 px-3 py-1.5 text-[10px] text-tb-muted">
                  YoY
                </td>
                {periods.map((p, pIdx) => {
                  const cur = totals[p];
                  const prev = pIdx >= 4 ? totals[periods[pIdx - 4]] : null;
                  if (!cur || !prev || prev.value == null || cur.value == null || prev.value === 0)
                    return (
                      <td key={p} className="px-2 py-1.5 text-right font-mono text-tb-muted">
                        —
                      </td>
                    );
                  const pct =
                    ((cur.value - prev.value) / Math.abs(prev.value)) * 100;
                  return (
                    <td key={p} className="px-2 py-1.5 text-right">
                      <DeltaChip pct={pct} size="xs" />
                    </td>
                  );
                })}
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] transition-colors",
        active ? "bg-tb-blue/15 text-tb-blue" : "text-tb-muted hover:text-tb-text",
      )}
    >
      {children}
    </button>
  );
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
