import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TickerRow } from "@/lib/queries/stocks";

export function TickerStrip({ rows }: { rows: TickerRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto border-b border-tb-border bg-tb-surface">
      <div className="flex items-center gap-4 px-3 py-1.5 text-[10px]">
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-tb-muted">
          LIVE
        </span>
        <div className="flex items-center gap-4 font-mono whitespace-nowrap">
          {rows.map((t) => {
            const up = (t.day_change_pct ?? 0) > 0.05;
            const down = (t.day_change_pct ?? 0) < -0.05;
            const color = up
              ? "text-tb-success"
              : down
              ? "text-tb-danger"
              : "text-tb-muted";
            const arrow = up ? "▲" : down ? "▼" : "·";
            return (
              <Link
                key={t.ticker}
                href={`/companies/${t.slug}`}
                className="inline-flex items-center gap-1.5 hover:text-tb-text"
                title={t.name}
              >
                <span className="text-tb-text">{t.ticker}</span>
                <span className="text-tb-muted">
                  {t.currency === "USD" ? "$" : ""}
                  {t.price.toFixed(2)}
                </span>
                {t.day_change_pct != null && (
                  <span className={cn("flex items-center gap-0.5", color)}>
                    {arrow}
                    {Math.abs(t.day_change_pct).toFixed(1)}%
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
