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
import type {
  BeaconEstimate,
  DisclosureStatus,
  SourceType,
} from "@/lib/types";

// Scorecard v2 — entity-agnostic KPI panel primitive.
// UI_SPEC_1 Primitive 3. Sibling `scorecard.tsx` is owned by round 8a
// (Hero period suffix rollout). v2 is the clean brief-spec primitive.
//
// Usage example:
//   <ScorecardV2
//     entity={{ name: "Better Collective", type: "AFFILIATE",
//       ticker: "BETCO", exchange: "STO", markets: ["Europe","US"] }}
//     period={{ code: "2025Q4", label: "Q4 2025" }}
//     primaryKpis={[
//       { label: "Total Revenue", value: "€95.1m", unit: "LTM",
//         yoy: 18.4, sparkline: [65,72,78,85,91,93,94,95.1],
//         sourceLabel: "Trailblaze Report", beacon: false },
//       ...
//     ]}
//     secondaryKpis={[...]}
//     onKpiClick={(code) => router.push(`/metric/${code}`)}
//   />

export type KpiTileV2 = {
  code: string; // internal key (metric_code)
  label: string;
  value: string | null; // null → em-dash tile
  unit?: string | null; // e.g. "$m", "%", "#", "LTM"
  yoy?: number | null;
  sparkline?: (number | null)[];
  beaconMask?: boolean[];
  sourceLabel?: string | null; // friendly text override
  source?: SourceType | null;
  disclosureStatus?: DisclosureStatus;
  beacon?: boolean | BeaconEstimate | null; // boolean for shorthand; object for hover-card
  nativeTooltip?: string | null;
  period?: string | null; // per-tile period label for scope transparency
  drillHref?: string | null;
};

export type ScorecardV2Entity = {
  name: string;
  type?: string | null; // chip label, e.g. "AFFILIATE"
  ticker?: string | null;
  exchange?: string | null;
  markets?: string[]; // primary market names
  subtitle?: string | null; // free-form subtitle override
};

export type ScorecardV2Period = {
  code: string;
  label: string;
  source?: string | null; // e.g. "Published Q4 2025"
};

export function ScorecardV2({
  entity,
  period,
  primaryKpis,
  secondaryKpis,
  onKpiClick,
  actions,
  className,
}: {
  entity: ScorecardV2Entity;
  period?: ScorecardV2Period | null;
  primaryKpis: KpiTileV2[];
  secondaryKpis?: KpiTileV2[];
  onKpiClick?: (metricCode: string) => void;
  actions?: React.ReactNode;
  className?: string;
}) {
  const subtitle =
    entity.subtitle ??
    buildSubtitle({
      type: entity.type,
      ticker: entity.ticker,
      exchange: entity.exchange,
      markets: entity.markets,
    });

  return (
    <div
      className={cn(
        "rounded-md border border-tb-border bg-tb-surface",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-tb-border px-4 py-3">
        <div className="min-w-0">
          <div className="mb-0.5 flex items-center gap-2">
            {entity.type && <Badge variant="blue">{entity.type}</Badge>}
            {entity.ticker && (
              <span className="font-mono text-[11px] text-tb-muted">
                {entity.exchange ? `${entity.exchange}:` : ""}
                {entity.ticker}
              </span>
            )}
          </div>
          <h1 className="truncate text-lg font-semibold text-tb-text">
            {entity.name}
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
              <div className="font-mono text-xs text-tb-text">
                {period.label}
              </div>
              {period.source && (
                <div className="text-[9px] text-tb-muted">{period.source}</div>
              )}
            </div>
          )}
          {actions}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-tb-border bg-tb-border md:grid-cols-4">
        {primaryKpis.map((kpi) => (
          <PrimaryTile key={kpi.code} kpi={kpi} onClick={onKpiClick} />
        ))}
      </div>

      {secondaryKpis && secondaryKpis.length > 0 && (
        <div className="grid grid-cols-2 gap-px bg-tb-border sm:grid-cols-4 lg:grid-cols-4">
          {secondaryKpis.map((kpi) => (
            <SecondaryTile key={kpi.code} kpi={kpi} onClick={onKpiClick} />
          ))}
        </div>
      )}
    </div>
  );
}

function buildSubtitle({
  type,
  ticker,
  exchange,
  markets,
}: {
  type?: string | null;
  ticker?: string | null;
  exchange?: string | null;
  markets?: string[];
}): string | null {
  const parts: string[] = [];
  if (type) parts.push(humanType(type));
  if (ticker) parts.push(`${exchange ? exchange + ":" : ""}${ticker}`);
  if (markets && markets.length > 0)
    parts.push(markets.slice(0, 4).join(", "));
  return parts.length === 0 ? null : parts.join(" · ");
}

function humanType(code: string): string {
  const c = code.toUpperCase();
  if (c === "AFFILIATE") return "Affiliate";
  if (c === "OPERATOR") return "B2C Operator";
  if (c === "B2B_PLATFORM") return "B2B Platform";
  if (c === "B2B_SUPPLIER") return "B2B Supplier";
  if (c === "LOTTERY") return "Lottery";
  if (c === "DFS") return "DFS / Prediction";
  return code;
}

function PrimaryTile({
  kpi,
  onClick,
}: {
  kpi: KpiTileV2;
  onClick?: (code: string) => void;
}) {
  const isBeacon =
    kpi.beacon === true ||
    (typeof kpi.beacon === "object" && kpi.beacon !== null) ||
    kpi.disclosureStatus === "beacon_estimate" ||
    kpi.disclosureStatus === "derived";

  const clickable = Boolean(onClick) || Boolean(kpi.drillHref);
  const handleClick = () => onClick?.(kpi.code);

  const body = (
    <div
      className={cn(
        "group flex h-full flex-col gap-1 bg-tb-surface px-4 py-3 transition-colors",
        clickable && "cursor-pointer hover:bg-tb-border/40",
        isBeacon && "border-l-2 border-tb-beacon",
      )}
      onClick={onClick ? handleClick : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-tb-muted">
          {kpi.label}
        </span>
        {kpi.unit && (
          <span className="font-mono text-[9px] text-tb-muted">
            {kpi.unit}
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
            kpi.value ? "text-tb-text" : "text-tb-muted",
          )}
        >
          {kpi.value ?? "—"}
        </span>
        {isBeacon && kpi.value && <sup className="beacon-tm">™</sup>}
      </div>
      {kpi.period && kpi.value && (
        <div className="font-mono text-[9px] text-tb-muted">{kpi.period}</div>
      )}
      <div className="flex items-center justify-between text-[10px]">
        {kpi.value == null ? (
          <span className="text-tb-muted">No data</span>
        ) : (
          <DeltaChip pct={kpi.yoy} />
        )}
        {kpi.sparkline && kpi.sparkline.length >= 2 && (
          <Sparkline
            values={kpi.sparkline}
            beaconMask={kpi.beaconMask}
            width={48}
            height={14}
          />
        )}
      </div>
      {(kpi.source || kpi.sourceLabel) && (
        <div className="mt-1">
          {kpi.source ? (
            <SourceLabel source={kpi.source} />
          ) : (
            <span className="font-mono text-[9px] uppercase tracking-wider text-tb-muted">
              {kpi.sourceLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );

  const linked = kpi.drillHref ? (
    <Link href={kpi.drillHref} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );

  if (!isBeacon || !kpi.beacon || typeof kpi.beacon !== "object") return linked;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{linked}</HoverCardTrigger>
      <HoverCardContent>
        <BeaconExplainer beacon={kpi.beacon} />
      </HoverCardContent>
    </HoverCard>
  );
}

function SecondaryTile({
  kpi,
  onClick,
}: {
  kpi: KpiTileV2;
  onClick?: (code: string) => void;
}) {
  const isBeacon =
    kpi.beacon === true ||
    (typeof kpi.beacon === "object" && kpi.beacon !== null) ||
    kpi.disclosureStatus === "beacon_estimate" ||
    kpi.disclosureStatus === "derived";

  const clickable = Boolean(onClick) || Boolean(kpi.drillHref);
  const body = (
    <div
      className={cn(
        "flex h-full flex-col justify-between gap-0.5 bg-tb-surface px-3 py-2 transition-colors",
        clickable && "cursor-pointer hover:bg-tb-border/40",
        isBeacon && "border-l-2 border-tb-beacon",
      )}
      onClick={onClick ? () => onClick(kpi.code) : undefined}
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
            kpi.value ? "text-tb-text" : "text-tb-muted",
          )}
        >
          {kpi.value ?? "—"}
        </span>
        {isBeacon && kpi.value && (
          <sup className="beacon-tm text-[8px]">™</sup>
        )}
      </div>
      {kpi.period && kpi.value && (
        <div className="font-mono text-[8px] text-tb-muted">{kpi.period}</div>
      )}
      <div className="flex items-center justify-end text-[10px]">
        <DeltaChip pct={kpi.yoy} size="xs" />
      </div>
    </div>
  );

  const linked = kpi.drillHref ? (
    <Link href={kpi.drillHref} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );

  if (!isBeacon || !kpi.beacon || typeof kpi.beacon !== "object") return linked;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{linked}</HoverCardTrigger>
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
