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
  };
}) {
  const metric =
    METRIC_OPTIONS.find((m) => m.code === searchParams.metric) ??
    METRIC_OPTIONS[0];
  const typeCode = searchParams.type || undefined;
  const periodCode = searchParams.period ?? null;

  const [lbRaw, companies, typeCounts, populatedPeriods, kpis] =
    await Promise.all([
      getEntityLeaderboard({
        metricCode: metric.code,
        entityTypeCode: typeCode,
        periodCode,
        limit: 120,
      }),
      listCompanies({
        search: searchParams.q,
        entity_type: searchParams.type,
        country: searchParams.country,
        exchange: searchParams.exchange,
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

      {/* C1: Aggregate KPI strip — 4 tiles */}
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
          searchParams.metric) && (
          <Link
            href="/companies"
            className="h-8 px-3 text-xs text-tb-muted hover:text-tb-text"
          >
            Clear
          </Link>
        )}
      </form>

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
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 bg-tb-surface px-4 py-3">
      <span className="text-[10px] uppercase tracking-wider text-tb-muted">
        {label}
      </span>
      <span className="font-mono text-lg font-semibold text-tb-text">
        {value}
      </span>
      {hint && <span className="text-[10px] text-tb-muted">{hint}</span>}
    </div>
  );
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
