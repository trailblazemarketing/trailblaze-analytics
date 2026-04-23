import { ArrowUp, ArrowDown, Minus } from "lucide-react";

// Compact KPI tile for the redesigned Overview hero band. Six of these
// render across the top of the page (Companies / Markets / Total Rev /
// Online GGR / Casino GGR / Sportsbook GGR). Big number, small trend
// arrow with delta when YoY is computable, secondary subtitle when
// the metric carries one (e.g. "countries + US states").
export function HeroTile({
  label,
  value,
  subtitle,
  yoyPct,
}: {
  label: string;
  value: string;
  subtitle?: string | null;
  yoyPct?: number | null;
}) {
  const yoyValid =
    yoyPct != null && Number.isFinite(yoyPct) && Math.abs(yoyPct) <= 80;
  const Icon = !yoyValid
    ? Minus
    : Math.abs(yoyPct) < 0.05
      ? Minus
      : yoyPct > 0
        ? ArrowUp
        : ArrowDown;
  const color = !yoyValid
    ? "text-tb-muted"
    : Math.abs(yoyPct) < 0.05
      ? "text-tb-muted"
      : yoyPct > 0
        ? "text-tb-success"
        : "text-tb-danger";
  return (
    <div className="flex flex-col gap-1 rounded-md border border-tb-border bg-tb-surface px-4 py-3">
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-tb-muted">
        <span className="truncate">{label}</span>
        <span aria-hidden>—</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold text-tb-text">
          {value}
        </span>
        <span
          className={`inline-flex items-center gap-0.5 font-mono text-[10px] ${color}`}
        >
          <Icon className="h-2.5 w-2.5" aria-hidden />
          {yoyValid && Math.abs(yoyPct) >= 0.05
            ? `${yoyPct > 0 ? "+" : ""}${yoyPct.toFixed(1)}%`
            : ""}
        </span>
      </div>
      {subtitle && (
        <span className="truncate text-[10px] text-tb-muted">{subtitle}</span>
      )}
    </div>
  );
}
