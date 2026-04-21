import Link from "next/link";
import { query } from "@/lib/db";
import {
  getMarketBySlug,
  getBeaconEstimatesForValues,
} from "@/lib/queries/markets";
import { getScorecardSeries } from "@/lib/queries/analytics";
import { buildPanelTiles, PANELS } from "@/lib/scorecard-builder";
import type { MetricValueRow, Market } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TH, TD, TR } from "@/components/ui/table";
import { ValueCell } from "@/components/beacon/value-cell";
import { Sparkline } from "@/components/beacon/sparkline";
import { DeltaChip } from "@/components/beacon/delta-chip";
import {
  MetricTimeseries,
  type TimeseriesPoint,
  type BeaconFlags,
} from "@/components/charts/metric-timeseries";
import { pivotTimeseries } from "@/lib/pivot";
import { formatEur } from "@/lib/format";
import { MarketPickerForm } from "./picker-form";

export const dynamic = "force-dynamic";

export default async function MarketsComparePage({
  searchParams,
}: {
  searchParams: { slugs?: string };
}) {
  const slugs = (searchParams.slugs ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allMarkets = await query<Pick<Market, "slug" | "name">>(
    "SELECT slug, name FROM markets ORDER BY name",
  );

  const selected = await Promise.all(
    slugs.map((s) => getMarketBySlug(s)),
  ).then((arr) => arr.filter((m): m is Market => m !== null));

  const marketIds = selected.map((m) => m.id);

  // Per-market scorecard (Panel 7 primary) so we can render side-by-side tiles
  const panel = PANELS.market;
  const scorecardCodes = [
    ...panel.primary.map((r) => r.code),
    ...panel.secondary.map((r) => r.code),
  ];
  const perMarketTiles = await Promise.all(
    selected.map(async (m) => {
      const byCode = await getScorecardSeries({
        marketId: m.id,
        metricCodes: scorecardCodes,
      });
      const beaconIds: string[] = [];
      byCode.forEach((rows) =>
        rows.forEach((r) => {
          if (
            r.disclosure_status === "beacon_estimate" ||
            r.disclosure_status === "derived"
          )
            beaconIds.push(r.metric_value_id);
        }),
      );
      const beacon = await getBeaconEstimatesForValues(beaconIds);
      return { market: m, tiles: buildPanelTiles("market", byCode, beacon) };
    }),
  );

  let values: MetricValueRow[] = [];
  if (marketIds.length > 0) {
    values = await query<MetricValueRow>(
      `SELECT mvc.metric_value_id, mvc.entity_id, mvc.market_id,
              mvc.metric_id, m.code AS metric_code, m.display_name AS metric_display_name,
              m.unit_type AS metric_unit_type,
              mvc.period_id, p.code AS period_code, p.display_name AS period_display_name,
              p.start_date AS period_start, p.end_date AS period_end,
              mvc.report_id, mvc.source_type, mvc.value_numeric, mvc.value_text,
              mvc.currency, mvc.unit_multiplier, mvc.disclosure_status,
              mvc.confidence_score, mvc.published_timestamp
       FROM metric_value_canonical mvc
       JOIN metrics m ON m.id = mvc.metric_id
       JOIN periods p ON p.id = mvc.period_id
       WHERE mvc.market_id = ANY($1::uuid[]) AND mvc.entity_id IS NULL
       ORDER BY m.display_name, p.start_date DESC`,
      [marketIds],
    );
  }

  const beaconMap = await getBeaconEstimatesForValues(
    values
      .filter(
        (v) =>
          v.disclosure_status === "beacon_estimate" ||
          v.disclosure_status === "derived",
      )
      .map((v) => v.metric_value_id),
  );

  const byMetric = new Map<
    string,
    {
      code: string;
      name: string;
      rows: MetricValueRow[];
    }
  >();
  const marketById = new Map(selected.map((m) => [m.id, m]));
  for (const v of values) {
    if (!byMetric.has(v.metric_code)) {
      byMetric.set(v.metric_code, {
        code: v.metric_code,
        name: v.metric_display_name,
        rows: [],
      });
    }
    byMetric.get(v.metric_code)!.rows.push(v);
  }

  const ggrPivot = pivotTimeseries(
    byMetric.get("online_ggr")?.rows ??
      byMetric.get("ggr")?.rows ??
      byMetric.get("sportsbook_ggr")?.rows ??
      [],
    (v) => marketById.get(v.market_id ?? "")?.slug ?? "unknown",
    (v) => marketById.get(v.market_id ?? "")?.name ?? "unknown",
  );
  const handlePivot = pivotTimeseries(
    byMetric.get("sportsbook_handle")?.rows ?? [],
    (v) => marketById.get(v.market_id ?? "")?.slug ?? "unknown",
    (v) => marketById.get(v.market_id ?? "")?.name ?? "unknown",
  );

  const HEADLINE = [
    "online_ggr",
    "ggr",
    "sportsbook_handle",
    "sportsbook_ggr",
    "casino_ggr",
    "ngr",
  ];
  const tableMetrics = Array.from(byMetric.values())
    .filter((m) => HEADLINE.includes(m.code))
    .sort((a, b) => HEADLINE.indexOf(a.code) - HEADLINE.indexOf(b.code));

  const isPair = selected.length === 2;

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-lg font-semibold">Compare markets</h1>
        <p className="text-xs text-tb-muted">
          {selected.length === 0
            ? "Pick 2-6 markets for side-by-side KPIs, charts, and quarterly tables."
            : `Comparing ${selected.length} ${selected.length === 1 ? "market" : "markets"}.`}
        </p>
      </header>

      <MarketPickerForm
        all={allMarkets.map((m) => ({ slug: m.slug, name: m.name }))}
        selected={slugs}
      />

      {selected.length === 0 && (
        <div className="panel p-6 text-xs text-tb-muted">
          Select markets above to begin the comparison.
        </div>
      )}

      {/* Header strip */}
      {selected.length > 0 && (
        <div className="grid gap-px overflow-hidden rounded-md border border-tb-border bg-tb-border md:grid-cols-2 lg:grid-cols-3">
          {selected.map((m) => (
            <div key={m.id} className="flex flex-col gap-1 bg-tb-surface px-4 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="blue">{m.market_type.toUpperCase()}</Badge>
                {m.iso_country && (
                  <Badge variant="muted">{m.iso_country}</Badge>
                )}
                {m.is_regulated ? (
                  <Badge variant="success">Regulated</Badge>
                ) : (
                  <Badge variant="muted">Pre-reg</Badge>
                )}
              </div>
              <Link
                href={`/markets/${m.slug}`}
                className="truncate text-lg font-semibold text-tb-text hover:text-tb-blue"
              >
                {m.name}
              </Link>
              <p className="text-[10px] text-tb-muted">
                {m.tax_rate_igaming != null
                  ? `iGaming tax ${Number(m.tax_rate_igaming).toFixed(1)}%`
                  : "—"}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Per-metric primary KPI grid */}
      {selected.length > 0 && (
        <div className="rounded-md border border-tb-border bg-tb-surface">
          <div className="border-b border-tb-border px-3 py-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
              Primary KPIs · market panel
            </h3>
          </div>
          <div className="divide-y divide-tb-border/60">
            {panel.primary.map((r) => (
              <div
                key={r.code}
                className="grid items-center gap-px bg-tb-border"
                style={{
                  gridTemplateColumns: `minmax(140px, 180px) repeat(${selected.length}, minmax(0, 1fr))${isPair ? " 120px" : ""}`,
                }}
              >
                <div className="bg-tb-surface px-3 py-2 text-[10px] uppercase tracking-wider text-tb-muted">
                  {r.label}
                </div>
                {perMarketTiles.map(({ market, tiles }) => {
                  const t = tiles.primary.find((x) => x.code === r.code);
                  return (
                    <div
                      key={market.id}
                      className="flex items-center justify-between gap-2 bg-tb-surface px-3 py-2"
                    >
                      <span className="flex items-baseline gap-1">
                        <span
                          className={
                            "font-mono text-base font-semibold " +
                            (t?.valueFormatted ? "text-tb-text" : "text-tb-muted")
                          }
                        >
                          {t?.valueFormatted ?? "—"}
                        </span>
                        {t?.spark && t.spark.length >= 2 && (
                          <Sparkline
                            values={t.spark}
                            beaconMask={t.beaconMask}
                            width={48}
                            height={14}
                          />
                        )}
                      </span>
                      <DeltaChip pct={t?.yoy ?? null} size="xs" />
                    </div>
                  );
                })}
                {isPair && (
                  <PairDeltaCell
                    a={perMarketTiles[0].tiles.primary.find((x) => x.code === r.code)}
                    b={perMarketTiles[1].tiles.primary.find((x) => x.code === r.code)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overlay charts */}
      {selected.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {ggrPivot.data.length > 0 && (
            <div className="rounded-md border border-tb-border bg-tb-surface">
              <div className="border-b border-tb-border px-3 py-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                  GGR — side by side
                </h3>
              </div>
              <div className="p-2">
                <MetricTimeseries
                  data={ggrPivot.data as TimeseriesPoint[]}
                  series={ggrPivot.series}
                  beaconFlags={ggrPivot.beaconFlags as BeaconFlags}
                  height={220}
                />
              </div>
            </div>
          )}
          {handlePivot.data.length > 0 && (
            <div className="rounded-md border border-tb-border bg-tb-surface">
              <div className="border-b border-tb-border px-3 py-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                  Sportsbook handle — side by side
                </h3>
              </div>
              <div className="p-2">
                <MetricTimeseries
                  data={handlePivot.data as TimeseriesPoint[]}
                  series={handlePivot.series}
                  beaconFlags={handlePivot.beaconFlags as BeaconFlags}
                  height={220}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-metric quarterly tables */}
      {selected.length > 0 && tableMetrics.length > 0 && (
        <div className="space-y-3">
          {tableMetrics.map((mg) => {
            const periods = Array.from(new Set(mg.rows.map((r) => r.period_code)))
              .sort()
              .reverse()
              .slice(0, 8);
            const cellFor = (p: string, mid: string) =>
              mg.rows.find((r) => r.period_code === p && r.market_id === mid) ??
              null;
            return (
              <div
                key={mg.code}
                className="rounded-md border border-tb-border bg-tb-surface"
              >
                <div className="flex items-center justify-between border-b border-tb-border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                      {mg.name}
                    </h3>
                    <code className="font-mono text-[10px] text-tb-muted">
                      {mg.code}
                    </code>
                  </div>
                  <Badge variant="muted">{mg.rows[0]?.metric_unit_type}</Badge>
                </div>
                <Table>
                  <THead>
                    <tr>
                      <TH>Period</TH>
                      {selected.map((m) => (
                        <TH key={m.id} className="text-right">
                          {m.name}
                        </TH>
                      ))}
                    </tr>
                  </THead>
                  <TBody>
                    {periods.map((p) => (
                      <TR key={p}>
                        <TD className="py-1 font-mono text-[11px] text-tb-muted">
                          {p}
                        </TD>
                        {selected.map((m) => {
                          const cell = cellFor(p, m.id);
                          return (
                            <TD key={m.id} className="py-1 text-right">
                              {cell ? (
                                <ValueCell
                                  v={cell}
                                  beacon={
                                    beaconMap.get(cell.metric_value_id) ?? null
                                  }
                                />
                              ) : (
                                <span className="font-mono text-tb-muted">
                                  —
                                </span>
                              )}
                            </TD>
                          );
                        })}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-tb-muted">
        <Link href="/markets" className="hover:text-tb-text">
          ← Back to markets
        </Link>
      </p>
    </div>
  );
}

function PairDeltaCell({
  a,
  b,
}: {
  a: import("@/components/primitives/scorecard").KpiTile | undefined;
  b: import("@/components/primitives/scorecard").KpiTile | undefined;
}) {
  const aVal = valueFor(a);
  const bVal = valueFor(b);
  if (aVal == null || bVal == null) {
    return (
      <div className="flex flex-col items-end justify-center bg-tb-surface px-3 py-2">
        <span className="text-[9px] uppercase tracking-wider text-tb-muted">Δ</span>
        <span className="font-mono text-xs text-tb-muted">—</span>
      </div>
    );
  }
  const diff = aVal - bVal;
  const isPct = a?.unitHint === "%";
  const label = isPct
    ? `${diff > 0 ? "+" : ""}${diff.toFixed(1)}pp`
    : formatEur(diff);
  return (
    <div className="flex flex-col items-end justify-center bg-tb-surface px-3 py-2">
      <span className="text-[9px] uppercase tracking-wider text-tb-muted">
        Δ A − B
      </span>
      <span
        className={
          "font-mono text-xs " +
          (diff > 0
            ? "text-tb-success"
            : diff < 0
            ? "text-tb-danger"
            : "text-tb-muted")
        }
      >
        {label}
      </span>
    </div>
  );
}

function valueFor(
  t: import("@/components/primitives/scorecard").KpiTile | undefined,
): number | null {
  if (!t || !t.spark || t.spark.length === 0) return null;
  for (let i = t.spark.length - 1; i >= 0; i--) {
    const v = t.spark[i];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}
