import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// YoY/QoQ delta chip. Colored per magnitude direction with an arrow icon.
export function DeltaChip({
  pct,
  size = "sm",
  className,
}: {
  pct: number | string | null | undefined;
  size?: "xs" | "sm";
  className?: string;
}) {
  if (pct == null)
    return (
      <span className={cn("font-mono text-tb-muted", className)}>—</span>
    );
  const n = typeof pct === "string" ? Number(pct) : pct;
  if (!Number.isFinite(n))
    return (
      <span className={cn("font-mono text-tb-muted", className)}>—</span>
    );
  const color =
    Math.abs(n) < 0.05
      ? "text-tb-muted"
      : n > 0
      ? "text-tb-success"
      : "text-tb-danger";
  const Icon =
    Math.abs(n) < 0.05 ? Minus : n > 0 ? ArrowUp : ArrowDown;
  const sign = n > 0 ? "+" : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono",
        size === "xs" ? "text-[10px]" : "text-[11px]",
        color,
        className,
      )}
    >
      <Icon className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {sign}
      {n.toFixed(1)}%
    </span>
  );
}
