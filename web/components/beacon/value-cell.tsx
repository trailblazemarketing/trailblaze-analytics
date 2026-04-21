import Link from "next/link";
import { formatValue, isBeacon, isNotDisclosed } from "@/lib/format";
import type { BeaconEstimate, MetricValueRow } from "@/lib/types";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Render a metric value with full disclosure context:
//  - disclosed → plain monospace number
//  - beacon_estimate/derived → number + orange ™ superscript + hover card
//    explaining the methodology, with a deep-link to /methodology#<code>
//  - not_disclosed → em-dash
export function ValueCell({
  v,
  beacon,
  className,
}: {
  v: MetricValueRow;
  beacon?: BeaconEstimate | null;
  className?: string;
}) {
  if (isNotDisclosed(v)) {
    return (
      <span
        className={cn("font-mono text-tb-muted", className)}
        title="Not disclosed"
      >
        —
      </span>
    );
  }

  const formatted = formatValue(v);

  if (!isBeacon(v)) {
    return (
      <span className={cn("font-mono text-tb-text", className)}>
        {formatted}
      </span>
    );
  }

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            "cursor-help font-mono text-tb-text decoration-dotted underline-offset-4 hover:underline",
            className,
          )}
        >
          {formatted}
          <sup className="beacon-tm">™</sup>
        </span>
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="beacon">Beacon™</Badge>
          <span className="text-[10px] uppercase tracking-wider text-tb-muted">
            {v.disclosure_status === "derived" ? "Derived" : "Estimate"}
          </span>
        </div>
        {beacon ? (
          <div className="space-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-tb-muted">
                Methodology
              </div>
              <div className="font-mono text-xs text-tb-text">
                {beacon.methodology_code}
              </div>
            </div>
            {beacon.confidence_score && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-tb-muted">
                  Confidence
                </div>
                <div className="font-mono text-xs text-tb-text">
                  {(Number(beacon.confidence_score) * 100).toFixed(0)}%
                  {beacon.confidence_band_low &&
                    beacon.confidence_band_high && (
                      <span className="ml-2 text-tb-muted">
                        ±{" "}
                        {Number(beacon.confidence_band_low).toLocaleString()}–
                        {Number(beacon.confidence_band_high).toLocaleString()}
                      </span>
                    )}
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
        ) : (
          <div className="space-y-2 text-[11px] text-tb-muted">
            <p>This value is a Trailblaze Beacon™ estimate.</p>
            <Link
              href="/methodology"
              className="block text-[10px] text-tb-blue hover:underline"
            >
              Read methodology →
            </Link>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
