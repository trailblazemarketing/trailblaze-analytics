import Link from "next/link";
import { getMarketLeaderboard } from "@/lib/queries/analytics";
import {
  listPopulatedPeriods,
  groupPeriodsForSelector,
} from "@/lib/queries/periods";
import { adaptMarketLeaderboardRows } from "@/lib/adapters";
import {
  listMarkets,
  getMarketTypesWithCounts,
} from "@/lib/queries/markets";
import { Leaderboard } from "@/components/primitives/leaderboard";
import { PeriodSelector } from "@/components/layout/period-selector";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

// Ordered by coverage — default is sportsbook_ggr (37 markets post-T1 Cat A).
// Previously online_ggr was default but only 9 markets have it, which is the
// main cause of "only 7 markets visible" reported in the T2 wire-up brief.
const METRIC_OPTIONS = [
  { code: "sportsbook_ggr", label: "Sportsbook GGR" },
  { code: "sportsbook_handle", label: "Sportsbook Handle" },
  { code: "ggr", label: "Total GGR" },
  { code: "casino_ggr", label: "Casino GGR" },
  { code: "online_ggr", label: "Online GGR" },
  { code: "sportsbook_revenue", label: "Sportsbook Rev" },
  { code: "online_revenue", label: "Online Rev" },
];

export default async function MarketsIndexPage({
  searchParams,
}: {
  searchParams: {
    q?: string;
    type?: string;
    country?: string;
    regulated?: "true" | "false";
    metric?: string;
    period?: string;
  };
}) {
  const metric =
    METRIC_OPTIONS.find((m) => m.code === searchParams.metric) ??
    METRIC_OPTIONS[0];
  const periodCode = searchParams.period ?? null;

  const [lbRaw, markets, typeCounts, populatedPeriods] = await Promise.all([
    getMarketLeaderboard({
      metricCode: metric.code,
      periodCode,
      limit: 120,
    }),
    listMarkets({
      search: searchParams.q,
      market_type: searchParams.type,
      iso_country: searchParams.country,
      is_regulated: searchParams.regulated,
    }),
    getMarketTypesWithCounts(),
    listPopulatedPeriods(),
  ]);
  const periodGroups = groupPeriodsForSelector(populatedPeriods);

  // Filter the leaderboard rows by the current filter set using `markets` as
  // the allow-list (listMarkets applies the filters).
  const allowed = new Set(markets.map((m) => m.id));
  const filtered = lbRaw.filter((r) => allowed.has(r.market_id));
  const lb = adaptMarketLeaderboardRows(filtered);

  // M3: helper context — total markets in the filter-narrowed universe vs
  // how many have data for the currently-selected metric this period.
  const totalInUniverse = markets.length;
  const withData = lb.rows.length;

  const countries = Array.from(
    new Set(markets.map((m) => m.iso_country).filter(Boolean)),
  ).sort();

  return (
    <div className="space-y-3">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold">Markets</h1>
          <p className="text-xs text-tb-muted">
            {markets.length.toLocaleString()} markets · {lb.rows.length} with
            data this period ·{" "}
            {typeCounts.map((t) => `${t.count} ${t.market_type}`).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector groups={periodGroups} currentCode={periodCode} />
          <Link
            href="/markets/compare"
            className="text-xs text-tb-blue hover:underline"
          >
            Compare →
          </Link>
        </div>
      </header>

      {/* Filters */}
      <form className="flex flex-wrap items-center gap-2" action="/markets">
        <Input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Filter by name…"
          className="max-w-xs"
        />
        <FilterChips
          name="type"
          current={searchParams.type}
          options={typeCounts.map((t) => ({
            value: t.market_type,
            label: `${t.market_type} (${t.count})`,
          }))}
        />
        <FilterChips
          name="regulated"
          current={searchParams.regulated}
          options={[
            { value: "true", label: "Regulated" },
            { value: "false", label: "Pre-regulation" },
          ]}
        />
        {countries.length > 0 && (
          <select
            name="country"
            defaultValue={searchParams.country ?? ""}
            className="h-8 rounded-md border border-tb-border bg-tb-surface px-2 text-xs text-tb-text focus:border-tb-blue focus:outline-none"
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c!}>
                {c}
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
          searchParams.regulated ||
          searchParams.metric) && (
          <Link
            href="/markets"
            className="h-8 px-3 text-xs text-tb-muted hover:text-tb-text"
          >
            Clear
          </Link>
        )}
      </form>

      {/* M3: coverage context for the selected metric */}
      <p className="-mt-1 text-[10px] text-tb-muted">
        Showing {withData} of {totalInUniverse} markets with data for{" "}
        <span className="text-tb-text">{metric.label}</span>
        {periodCode ? (
          <> · period <span className="font-mono">{periodCode}</span></>
        ) : null}
      </p>

      <Leaderboard
        title={`Markets — ${metric.label}`}
        subtitle="Latest reported period per market. Beacon™ coverage shows how much of the market's data is modeled."
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
          "beacon_coverage",
          "extra",
        ]}
        maxRows={60}
      />
    </div>
  );
}

function FilterChips({
  name,
  current,
  options,
}: {
  name: string;
  current: string | undefined;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((o) => {
        const active = current === o.value;
        return (
          <label
            key={o.value}
            className={`cursor-pointer rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider transition-colors ${
              active
                ? "border-tb-blue bg-tb-blue/15 text-tb-blue"
                : "border-tb-border bg-tb-surface text-tb-muted hover:border-tb-blue/60"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={active}
              className="hidden"
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
