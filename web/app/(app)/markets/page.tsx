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
  getCountryRollupValues,
  getParentMarketIds,
} from "@/lib/queries/markets";
import { Leaderboard } from "@/components/primitives/leaderboard";
import type { LeaderboardRow } from "@/components/primitives/leaderboard";
import { PeriodSelector } from "@/components/layout/period-selector";
import { Input } from "@/components/ui/input";
import { formatEur } from "@/lib/format";

export const dynamic = "force-dynamic";

// M2 (T2 polish pass 3): revert default to online_ggr — it's the primary
// Markets KPI per UI_SPEC_2 Panel 7. Lower coverage (9 markets) is acceptable
// given the coverage-helper text below; country-scope rollup (M4) augments US
// and Canada via children sums. Sportsbook GGR remains in the dropdown.
const METRIC_OPTIONS = [
  { code: "online_ggr", label: "Online GGR" },
  { code: "sportsbook_ggr", label: "Sportsbook GGR" },
  { code: "sportsbook_handle", label: "Sportsbook Handle" },
  { code: "ggr", label: "Total GGR" },
  { code: "casino_ggr", label: "Casino GGR" },
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

  // M3: default scope is "country" — acts as a scope switcher, not a free
  // filter. Users pick STATE/REGION/PROVINCE to step into that tier.
  const scope = searchParams.type ?? "country";

  const [lbRaw, markets, typeCounts, populatedPeriods, rollupRaw, parentIds] =
    await Promise.all([
      getMarketLeaderboard({
        metricCode: metric.code,
        periodCode,
        limit: 120,
      }),
      listMarkets({
        search: searchParams.q,
        market_type: scope,
        iso_country: searchParams.country,
        is_regulated: searchParams.regulated,
      }),
      getMarketTypesWithCounts(),
      listPopulatedPeriods(),
      // M4: country rollup — only meaningful when scope is country.
      scope === "country"
        ? getCountryRollupValues({ metricCode: metric.code })
        : Promise.resolve([]),
      getParentMarketIds(),
    ]);
  const periodGroups = groupPeriodsForSelector(populatedPeriods);

  // Filter the leaderboard rows by the current filter set using `markets` as
  // the allow-list (listMarkets applies the filters).
  const allowed = new Set(markets.map((m) => m.id));
  const filtered = lbRaw.filter((r) => allowed.has(r.market_id));
  const lb = adaptMarketLeaderboardRows(filtered);

  // M4: merge country rollups into the leaderboard. For countries absent from
  // `lb` (no native country-level value for this metric), add a synthetic row
  // using the children's summed EUR value. Rollup rows carry an explicit
  // "rolled up from N sub-markets" hint on the `extra` column and append the
  // chevron "→" to indicate they're aggregates.
  if (scope === "country" && rollupRaw.length > 0) {
    const existing = new Set(lb.rows.map((r) => r.id));
    const rollupRows: LeaderboardRow[] = rollupRaw
      .filter((r) => !existing.has(r.market_id))
      .filter((r) => allowed.has(r.market_id))
      .map((r) => ({
        id: r.market_id,
        href: `/markets/${r.slug}`,
        name: r.name,
        typeChip: "country",
        value: r.latest_value_eur,
        valueFormatted:
          r.latest_value_eur != null ? formatEur(r.latest_value_eur) : "—",
        nativeTooltip: null,
        share: null, // recomputed below after merge
        yoy: null, // rollup YoY not computed (prior-year rollup is future work)
        sparkline: null,
        beaconMask: undefined,
        disclosureStatus: "disclosed",
        beaconCoveragePct: null,
        extra: `rollup · ${r.child_count} sub-market${r.child_count === 1 ? "" : "s"}`,
        isRollup: true,
      }));
    const mergedRows = [...lb.rows, ...rollupRows];
    // Re-rank by value desc (EUR for currency, raw otherwise)
    mergedRows.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    // Recompute share against new denominator
    const denom = mergedRows.reduce((s, r) => s + (r.value ?? 0), 0);
    if (denom > 0) {
      for (const r of mergedRows) {
        r.share = r.value != null ? (r.value / denom) * 100 : null;
      }
    }
    lb.rows = mergedRows;
    lb.total = lb.total
      ? { ...lb.total, valueFormatted: formatEur(denom) }
      : lb.total;
  }

  // M3: flag rows whose market has sub-markets so the UI can show a chevron.
  for (const r of lb.rows) {
    (r as { hasChildren?: boolean }).hasChildren = parentIds.has(r.id);
  }

  // M3: helper context — total markets in the filter-narrowed universe
  const totalInUniverse = markets.length;

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
        {/* M3: scope switcher — default is COUNTRY. Chips act as scope, not filter. */}
        <FilterChips
          name="type"
          current={scope}
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

      {/* M3: coverage context for the selected metric + scope */}
      <p className="-mt-1 text-[10px] text-tb-muted">
        Scope: <span className="text-tb-text">{scope.toUpperCase()}</span> ·
        showing {lb.rows.length} of {totalInUniverse} {scope} rows with data for{" "}
        <span className="text-tb-text">{metric.label}</span>
        {scope === "country" && rollupRaw.length > 0 ? (
          <> · Σ = rolled up from sub-markets</>
        ) : null}
        {periodCode ? (
          <> · period <span className="font-mono">{periodCode}</span></>
        ) : null}
      </p>

      <Leaderboard
        title={`Markets — ${metric.label}`}
        subtitle="Latest reported period per market. Beacon™ coverage shows how much of the market's data is modeled."
        valueLabel={metric.label.toUpperCase()}
        nameLabel="Market"
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
