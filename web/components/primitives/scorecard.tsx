"use client";
import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/beacon/sparkline";
import { DeltaChip } from "@/components/beacon/delta-chip";
import { Badge } from "@/components/ui/badge";
import { SourceLabel } from "@/components/beacon/source-label";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { BeaconEstimate, DisclosureStatus, SourceType } from "@/lib/types";

export type KpiTile = {
  code: string;
  label: string;
  valueFormatted: string | null; // null → em-dash tile
  nativeTooltip?: string | null; // native-currency hint e.g. "$3.79B @ 1.077 USD/EUR"
  yoy?: number | null;
  spark?: (number | null)[];
  beaconMask?: boolean[];
  source?: SourceType | null;
  disclosureStatus?: DisclosureStatus;
  beacon?: BeaconEstimate | null;
  drillHref?: string | null;
  unitHint?: string | null; // e.g., "$m", "%", "#"
};

export function Scorecard({
  name,
  typeChip,
  ticker,
  exchange,
  subtitle,
  period,
  periodSource,
  primary,
  secondary,
  className,
  actions,
}: {
  name: string;
  typeChip?: string | null;
  ticker?: string | null;
  exchange?: string | null;
  subtitle?: string;
  period?: string;
  periodSource?: string;
  primary: KpiTile[];
  secondary?: KpiTile[];
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-tb-border bg-tb-surface",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-tb-border px-4 py-3">
        <div className="min-w-0">
          <div className="mb-0.5 flex items-center gap-2">
            {typeChip && <Badge variant="blue">{typeChip}</Badge>}
            {ticker && (
              <span className="font-mono text-[11px] text-tb-muted">
                {exchange ? `${exchange}:` : ""}
                {ticker}
              </span>
            )}
          </div>
          <h1 className="truncate text-lg font-semibold text-tb-text">
            {name}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-tb-muted">{subtitle}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {period && (
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wider text-tb-muted">
                As of
              </div>
              <div className="font-mono text-xs text-tb-text">{period}</div>
              {periodSource && (
                <div className="text-[9px] text-tb-muted">{periodSource}</div>
              )}
            </div>
          )}
          {actions}
        </div>
      </div>

      {/* Primary tiles */}
      <div className="grid grid-cols-2 gap-px border-b border-tb-border bg-tb-border md:grid-cols-4">
        {primary.map((kpi) => (
          <PrimaryTile key={kpi.code} kpi={kpi} />
        ))}
      </div>

      {/* Secondary tiles */}
      {secondary && secondary.length > 0 && (
        <div className="grid grid-cols-2 gap-px bg-tb-border sm:grid-cols-4 lg:grid-cols-4">
          {secondary.map((kpi) => (
            <SecondaryTile key={kpi.code} kpi={kpi} />
          ))}
        </div>
      )}
    </div>
  );
}

function PrimaryTile({ kpi }: { kpi: KpiTile }) {
  const isBeacon =
    kpi.disclosureStatus === "beacon_estimate" ||
    kpi.disclosureStatus === "derived";
  const body = (
    <div
      className={cn(
        "group flex h-full flex-col gap-1 bg-tb-surface px-4 py-3 transition-colors",
        kpi.drillHref && "cursor-pointer hover:bg-tb-border/40",
        isBeacon && "border-l-2 border-tb-beacon",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-tb-muted">
          {kpi.label}
        </span>
        {kpi.unitHint && (
          <span className="font-mono text-[9px] text-tb-muted">
            {kpi.unitHint}
          </span>
        )}
      </div>
      <div
        className="flex items-baseline gap-1.5"
        title={kpi.nativeTooltip ?? undefined}
      >
        <span
          className={cn(
            "font-mono text-xl font-semibold",
            kpi.valueFormatted ? "text-tb-text" : "text-tb-muted",
          )}
        >
          {kpi.valueFormatted ?? "—"}
        </span>
        {isBeacon && kpi.valueFormatted && (
          <sup className="beacon-tm">™</sup>
        )}
      </div>
      <div className="flex items-center justify-between text-[10px]">
        {kpi.valueFormatted == null ? (
          <span className="text-tb-muted">No data</span>
        ) : (
          <DeltaChip pct={kpi.yoy} />
        )}
        {kpi.spark && kpi.spark.length >= 2 && (
          <Sparkline
            values={kpi.spark}
            beaconMask={kpi.beaconMask}
            width={48}
            height={14}
          />
        )}
      </div>
      {kpi.source && (
        <div className="mt-1">
          <SourceLabel source={kpi.source} />
        </div>
      )}
    </div>
  );

  const wrapped = kpi.drillHref ? (
    <Link href={kpi.drillHref} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );

  if (!isBeacon || !kpi.beacon) return wrapped;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{wrapped}</HoverCardTrigger>
      <HoverCardContent>
        <BeaconExplainer beacon={kpi.beacon} />
      </HoverCardContent>
    </HoverCard>
  );
}

function SecondaryTile({ kpi }: { kpi: KpiTile }) {
  const isBeacon =
    kpi.disclosureStatus === "beacon_estimate" ||
    kpi.disclosureStatus === "derived";
  const content = (
    <div
      className={cn(
        "flex h-full flex-col justify-between gap-0.5 bg-tb-surface px-3 py-2 transition-colors",
        kpi.drillHref && "cursor-pointer hover:bg-tb-border/40",
        isBeacon && "border-l-2 border-tb-beacon",
      )}
    >
      <span className="text-[9px] uppercase tracking-wider text-tb-muted">
        {kpi.label}
      </span>
      <div
        className="flex items-baseline gap-1"
        title={kpi.nativeTooltip ?? undefined}
      >
        <span
          className={cn(
            "font-mono text-sm font-semibold",
            kpi.valueFormatted ? "text-tb-text" : "text-tb-muted",
          )}
        >
          {kpi.valueFormatted ?? "—"}
        </span>
        {isBeacon && kpi.valueFormatted && (
          <sup className="beacon-tm text-[8px]">™</sup>
        )}
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <DeltaChip pct={kpi.yoy} size="xs" />
        {kpi.source && <SourceLabel source={kpi.source} />}
      </div>
    </div>
  );
  const wrapped = kpi.drillHref ? (
    <Link href={kpi.drillHref} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
  if (!isBeacon || !kpi.beacon) return wrapped;
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{wrapped}</HoverCardTrigger>
      <HoverCardContent>
        <BeaconExplainer beacon={kpi.beacon} />
      </HoverCardContent>
    </HoverCard>
  );
}

function BeaconExplainer({ beacon }: { beacon: BeaconEstimate }) {
  return (
    <div className="space-y-2">
      <div className="mb-1 flex items-center gap-2">
        <Badge variant="beacon">Beacon™</Badge>
        <span className="text-[10px] uppercase tracking-wider text-tb-muted">
          Estimate
        </span>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-tb-muted">
          Methodology
        </div>
        <div className="font-mono text-xs">{beacon.methodology_code}</div>
      </div>
      {beacon.confidence_score && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-tb-muted">
            Confidence
          </div>
          <div className="font-mono text-xs">
            {(Number(beacon.confidence_score) * 100).toFixed(0)}%
          </div>
        </div>
      )}
      {beacon.methodology_notes && (
        <p className="text-[11px] leading-relaxed text-tb-muted">
          {beacon.methodology_notes}
        </p>
      )}
      <Link
        href={`/methodology#${beacon.methodology_code.replace(/_/g, "-")}`}
        className="block pt-1 text-[10px] text-tb-blue hover:underline"
      >
        Read full methodology →
      </Link>
    </div>
  );
}
