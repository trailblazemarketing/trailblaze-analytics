import Link from "next/link";
import {
  listCompanies,
  getEntityTypeCountsAll,
  getCompaniesAggregateKpis,
} from "@/lib/queries/companies";
import { getEntityLeaderboard } from "@/lib/queries/analytics";
import {
  listPopulatedPeriods,
  groupPeriodsForSelector,
} from "@/lib/queries/periods";
import { adaptEntityLeaderboardRows } from "@/lib/adapters";
import { Leaderboard } from "@/components/primitives/leaderboard";
import { PeriodSelector } from "@/components/layout/period-selector";
import { Input } from "@/components/ui/input";
import { formatEur } from "@/lib/format";
import {
  CompanyTreemap,
  type TreemapCell,
} from "@/components/charts/company-treemap";

export const dynamic = "force-dynamic";

const METRIC_OPTIONS = [
  { code: "revenue", label: "Revenue" },
  { code: "ngr", label: "NGR" },
  { code: "ebitda", label: "EBITDA" },
  { code: "active_customers", label: "Active Users" },
];

export default async function CompaniesIndexPage({
  searchParams,
}: {
  searchParams: {
    q?: string;
    type?: string;
    country?: string;
    exchange?: string;
    metric?: string;
    period?: string;
    pending?: "true";
  };
}) {
  const metric =
    METRIC_OPTIONS.find((m) => m.code === searchParams.metric) ??
    METRIC_OPTIONS[0];
  const typeCode = searchParams.type || undefined;
  const periodCode = searchParams.period ?? null;
  const includePending = searchParams.pending === "true";

  const [lbRaw, companies, typeCounts, populatedPeriods, kpis] =
    await Promise.all([
      getEntityLeaderboard({
        metricCode: metric.code,
        entityTypeCode: typeCode,
        periodCode,
        limit: 120,
        includePending,
      }),
      listCompanies({
        search: searchParams.q,
        entity_type: searchParams.type,
        country: searchParams.country,
        exchange: searchParams.exchange,
        include_pending: includePending,
      }),
      getEntityTypeCountsAll(),
      listPopulatedPeriods(),
      getCompaniesAggregateKpis(),
    ]);
  const periodGroups = groupPeriodsForSelector(populatedPeriods);

  // Narrow the leaderboard by the filter-applied company set
  const allowed = new Set(companies.map((c) => c.id));
  const filtered = lbRaw.filter((r) => allowed.has(r.entity_id));
  const lb = adaptEntityLeaderboardRows(filtered);

  const countries = Array.from(
    new Set(companies.map((c) => c.headquarters_country).filter(Boolean)),
  ).sort();
  const exchanges = Array.from(
    new Set(companies.map((c) => c.exchange).filter(Boolean)),
  ).sort();

  return (
    <div className="space-y-3">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold">Companies</h1>
          <p className="text-xs text-tb-muted">
            {companies.length.toLocaleString()} active ·{" "}
            {typeCounts
              .filter((t) => t.count > 0)
              .map((t) => `${t.count} ${t.code}`)
              .join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector groups={periodGroups} currentCode={periodCode} />
          <Link
            href="/companies/compare"
            className="text-xs text-tb-blue hover:underline"
          >
            Compare →
          </Link>
        </div>
      </header>

      {/* C1: Aggregate KPI strip — 4 primary tiles */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-tb-border bg-tb-border md:grid-cols-4">
        <KpiAggTile
          label="Total tracked companies"
          value={kpis.total_companies.toLocaleString()}
        />
        <KpiAggTile
          label="Total combined revenue (LTM)"
          value={formatEur(kpis.combined_revenue_eur)}
          hint="Sum of latest-period revenue, EUR-converted"
        />
        <KpiAggTile
          label="Avg EBITDA margin"
          value={
            kpis.weighted_ebitda_margin != null
              ? `${kpis.weighted_ebitda_margin.toFixed(1)}%`
              : "—"
          }
          hint="Weighted by revenue"
        />
        <KpiAggTile
          label="Listed vs private"
          value={`${kpis.listed} · ${kpis.private_count}`}
          hint={`${kpis.listed} listed · ${kpis.private_count} private`}
        />
      </div>

      {/* C2: Industry snapshot — 4 secondary tiles, smaller visual weight */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-tb-border bg-tb-border md:grid-cols-4">
        <KpiAggTile
          small
          label="Total active customers"
          value={
            kpis.total_active_customers != null
              ? abbreviate(kpis.total_active_customers)
              : "—"
          }
          hint="Sum of latest-period disclosed active customers"
        />
        <KpiAggTile
          small
          label="Blended ARPU"
          value={
            kpis.blended_arpu_eur != null
              ? formatEur(kpis.blended_arpu_eur)
              : "—"
          }
          hint="Revenue ÷ active customers, weighted"
        />
        <KpiAggTile
          small
          label="Top-5 revenue concentration"
          value={
            kpis.top5_concentration_pct != null
              ? `${kpis.top5_concentration_pct.toFixed(1)}%`
              : "—"
          }
          hint="Share of revenue held by the 5 largest companies"
        />
        <KpiAggTile
          small
          label="Companies reporting this period"
          value={kpis.companies_reporting.toLocaleString()}
          hint="Entities with metric_values in the latest period"
        />
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/companies">
        <Input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Name, slug, ticker…"
          className="max-w-xs"
        />
        <TypeChips current={searchParams.type} counts={typeCounts} />
        {countries.length > 0 && (
          <select
            name="country"
            defaultValue={searchParams.country ?? ""}
            className="h-8 rounded-md border border-tb-border bg-tb-surface px-2 text-xs text-tb-text focus:border-tb-blue focus:outline-none"
          >
            <option value="">All HQ countries</option>
            {countries.map((c) => (
              <option key={c} value={c!}>
                {c}
              </option>
            ))}
          </select>
        )}
        {exchanges.length > 0 && (
          <select
            name="exchange"
            defaultValue={searchParams.exchange ?? ""}
            className="h-8 rounded-md border border-tb-border bg-tb-surface px-2 text-xs text-tb-text focus:border-tb-blue focus:outline-none"
          >
            <option value="">All exchanges</option>
            {exchanges.map((e) => (
              <option key={e} value={e!}>
                {e}
              </option>
            ))}
          </select>
        )}
        <select
          name="metric"
          defaultValue={metric.code}
          className="h-8 rounded-md border border-tb-border bg-tb-surface px-2 text-xs text-tb-text focus:border-tb-blue focus:outline-none"
        >
          {METRIC_OPTIONS.map((m) => (
            <option key={m.code} value={m.code}>
              Metric: {m.label}
            </option>
          ))}
        </select>
        <label
          className={
            "inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border px-2 text-[10px] uppercase tracking-wider transition-colors " +
            (includePending
              ? "border-tb-beacon bg-tb-beacon/15 text-tb-beacon"
              : "border-tb-border bg-tb-surface text-tb-muted hover:border-tb-blue/60")
          }
          title="Include auto-added entities pending manual curation"
        >
          <input
            type="checkbox"
            name="pending"
            value="true"
            defaultChecked={includePending}
            className="hidden"
          />
          Show pending
        </label>
        <button
          type="submit"
          className="h-8 rounded-md bg-tb-blue px-3 text-xs font-medium text-white hover:brightness-110"
        >
          Apply
        </button>
        {(searchParams.q ||
          searchParams.type ||
          searchParams.country ||
          searchParams.exchange ||
          searchParams.metric ||
          includePending) && (
          <Link
            href="/companies"
            className="h-8 px-3 text-xs text-tb-muted hover:text-tb-text"
          >
            Clear
          </Link>
        )}
      </form>

      {/* C3: Revenue treemap — sized by revenue (EUR), colored by entity type.
          Only meaningful when the selected metric is currency-typed; skipped
          for counts like active users. */}
      {metric.code === "revenue" && lb.rows.some((r) => (r.value ?? 0) > 0) && (
        <div className="rounded-md border border-tb-border bg-tb-surface">
          <div className="flex items-center justify-between border-b border-tb-border px-3 py-2">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                Revenue treemap — sized by revenue · colored by type
              </h3>
              <p className="mt-0.5 text-[10px] text-tb-muted">
                OP blue · B2B stone · AFF green · LOT violet · DFS amber
              </p>
            </div>
            <span className="font-mono text-[10px] text-tb-muted">EUR</span>
          </div>
          <CompanyTreemap
            cells={lb.rows.slice(0, 40).map(
              (r): TreemapCell => ({
                id: r.id,
                name: r.name,
                slug: r.href?.split("/").pop() ?? r.id,
                value: r.value,
                typeCode: r.typeChip ?? null,
                ticker: r.ticker ?? null,
                disclosureStatus: r.disclosureStatus,
              }),
            )}
          />
        </div>
      )}

      <Leaderboard
        title={`Companies — ${metric.label}`}
        subtitle={
          typeCode
            ? `Filtered to type: ${typeCode}`
            : "All active companies with reported values"
        }
        valueLabel={metric.label.toUpperCase()}
        rows={lb.rows}
        total={lb.total}
        columns={[
          "rank",
          "name",
          "value",
          "share",
          "yoy",
          "sparkline",
          "ticker",
        ]}
        maxRows={60}
      />
    </div>
  );
}

function KpiAggTile({
  label,
  value,
  hint,
  small,
}: {
  label: string;
  value: string;
  hint?: string;
  small?: boolean;
}) {
  return (
    <div
      className={
        "flex flex-col gap-1 bg-tb-surface " +
        (small ? "px-3 py-2" : "px-4 py-3")
      }
    >
      <span
        className={
          "uppercase tracking-wider text-tb-muted " +
          (small ? "text-[9px]" : "text-[10px]")
        }
      >
        {label}
      </span>
      <span
        className={
          "font-mono font-semibold text-tb-text " +
          (small ? "text-sm" : "text-lg")
        }
      >
        {value}
      </span>
      {hint && (
        <span
          className={
            "text-tb-muted " + (small ? "text-[9px]" : "text-[10px]")
          }
        >
          {hint}
        </span>
      )}
    </div>
  );
}

function abbreviate(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function TypeChips({
  current,
  counts,
}: {
  current: string | undefined;
  counts: { code: string; count: number }[];
}) {
  const active = current ?? "";
  return (
    <div className="flex flex-wrap items-center gap-1">
      {counts.map((o) => {
        const isActive = active === o.code;
        return (
          <label
            key={o.code}
            className={`cursor-pointer rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider transition-colors ${
              isActive
                ? "border-tb-blue bg-tb-blue/15 text-tb-blue"
                : "border-tb-border bg-tb-surface text-tb-muted hover:border-tb-blue/60"
            }`}
          >
            <input
              type="radio"
              name="type"
              value={o.code}
              defaultChecked={isActive}
              className="hidden"
            />
            {o.code} ({o.count})
          </label>
        );
      })}
    </div>
  );
}
