import Link from "next/link";
import { DeltaChip } from "@/components/beacon/delta-chip";
import { ReportLink } from "@/components/reports/report-link";
import { formatDate } from "@/lib/format";
import type { MoverRow } from "@/lib/queries/movers";

// Biggest Revenue Growers / Margin Expansion Leaders / Recent Commentary —
// the 3-column composition that closes Overview and Operators pages.

export function MoversRow({
  growers,
  marginLeaders,
  commentary,
}: {
  growers: MoverRow[];
  marginLeaders: MoverRow[];
  commentary: {
    narrative_id: string;
    section_code: string;
    content: string;
    entity_name: string | null;
    entity_slug: string | null;
    report_id: string;
    published_timestamp: string | null;
  }[];
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <MoverCard
        title="Biggest revenue growers"
        subtitle="YoY revenue growth, latest disclosed period"
        rows={growers.map((g) => ({
          name: g.name,
          slug: g.slug,
          right: <DeltaChip pct={g.value_pct} />,
          period: g.period_code,
        }))}
      />
      <MoverCard
        title="Margin expansion leaders"
        subtitle="Δ EBITDA margin (pp), YoY"
        rows={marginLeaders.map((m) => ({
          name: m.name,
          slug: m.slug,
          right: (
            <span
              className={
                "font-mono text-[11px] " +
                (m.value_pct != null && m.value_pct > 0
                  ? "text-tb-success"
                  : m.value_pct != null && m.value_pct < 0
                  ? "text-tb-danger"
                  : "text-tb-muted")
              }
            >
              {m.value_pct != null
                ? `${m.value_pct > 0 ? "+" : ""}${m.value_pct.toFixed(1)}pp`
                : "—"}
            </span>
          ),
          period: m.period_code,
        }))}
      />
      <CommentaryCard rows={commentary} />
    </div>
  );
}

function MoverCard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle?: string;
  rows: {
    name: string;
    slug: string;
    right: React.ReactNode;
    period: string | null;
  }[];
}) {
  return (
    <div className="rounded-md border border-tb-border bg-tb-surface">
      <div className="border-b border-tb-border px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-0.5 text-[10px] text-tb-muted">{subtitle}</p>
        )}
      </div>
      <ul className="divide-y divide-tb-border/60">
        {rows.length === 0 && (
          <li className="p-3 text-[11px] text-tb-muted">No data yet.</li>
        )}
        {rows.map((r, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-2 px-3 py-1"
          >
            <Link
              href={`/companies/${r.slug}`}
              className="min-w-0 truncate text-[11px] text-tb-text hover:text-tb-blue"
            >
              {r.name}
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              {r.period && (
                <span className="font-mono text-[9px] text-tb-muted">
                  {r.period}
                </span>
              )}
              {r.right}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommentaryCard({
  rows,
}: {
  rows: {
    narrative_id: string;
    section_code: string;
    content: string;
    entity_name: string | null;
    entity_slug: string | null;
    report_id: string;
    published_timestamp: string | null;
  }[];
}) {
  return (
    <div className="rounded-md border border-tb-border bg-tb-surface">
      <div className="border-b border-tb-border px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
          Recent commentary
        </h3>
        <p className="mt-0.5 text-[10px] text-tb-muted">
          Latest Forecast & Investment View excerpts — source: Trailblaze
          reports
        </p>
      </div>
      <ul className="divide-y divide-tb-border/60">
        {rows.length === 0 && (
          <li className="p-3 text-[11px] text-tb-muted">
            No commentary yet.
          </li>
        )}
        {rows.map((r) => {
          const oneLine = r.content
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 160);
          return (
            <li key={r.narrative_id} className="px-3 py-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] font-medium text-tb-text">
                  {r.entity_slug ? (
                    <Link
                      href={`/companies/${r.entity_slug}`}
                      className="hover:text-tb-blue"
                    >
                      {r.entity_name}
                    </Link>
                  ) : (
                    <span>{r.entity_name ?? "—"}</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[9px] text-tb-muted">
                  {formatDate(r.published_timestamp)}
                </span>
              </div>
              <ReportLink
                reportId={r.report_id}
                className="mt-0.5 block truncate text-[10px] text-tb-muted hover:text-tb-blue"
              >
                {oneLine}
                {oneLine.length >= 160 ? "…" : ""}
              </ReportLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
