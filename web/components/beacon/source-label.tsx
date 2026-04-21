import { cn } from "@/lib/utils";
import type { SourceType } from "@/lib/types";

// Friendly source labels, ordered by our provenance hierarchy:
// Trailblaze Report > Regulator > Company IR > Stock API > Industry > Beacon™
const LABELS: Record<SourceType, { label: string; emphasis?: "beacon" | "success" }> = {
  trailblaze_pdf: { label: "Trailblaze Report", emphasis: "success" },
  regulator_filing: { label: "Regulator" },
  sec_filing: { label: "SEC" },
  company_ir: { label: "Company IR" },
  stock_api: { label: "Yahoo Finance" },
  industry_trade: { label: "Industry Trade" },
  social_media: { label: "Social" },
  beacon_estimate: { label: "Trailblaze Beacon™", emphasis: "beacon" },
  manual_entry: { label: "Manual" },
};

export function SourceLabel({
  source,
  sourceName,
  className,
}: {
  source: SourceType;
  sourceName?: string | null;
  className?: string;
}) {
  const meta = LABELS[source] ?? { label: source };
  const color =
    meta.emphasis === "beacon"
      ? "text-tb-beacon"
      : meta.emphasis === "success"
      ? "text-tb-success"
      : "text-tb-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider",
        color,
        className,
      )}
      title={sourceName ?? meta.label}
    >
      <span className="h-1 w-1 rounded-full bg-current opacity-80" />
      {meta.label}
    </span>
  );
}
