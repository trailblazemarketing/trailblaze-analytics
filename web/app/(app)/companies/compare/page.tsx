import Link from "next/link";
import { query } from "@/lib/db";
import { getCompanyBySlug } from "@/lib/queries/companies";
import {
  getScorecardSeries,
  nativeToEur,
  toRawNumeric,
} from "@/lib/queries/analytics";
import { getBeaconEstimatesForValues } from "@/lib/queries/markets";
import type { Entity, MetricValueRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TH, TD, TR } from "@/components/ui/table";
import { DeltaChip } from "@/components/beacon/delta-chip";
import { Sparkline } from "@/components/beacon/sparkline";
import { ValueCell } from "@/components/beacon/value-cell";
import {
  MetricTimeseries,
  type TimeseriesPoint,
  type BeaconFlags,
} from "@/components/charts/metric-timeseries";
import { PANELS, buildPanelTiles, type PanelKind } from "@/lib/scorecard-builder";
import { pivotTimeseries } from "@/lib/pivot";
import { formatEur } from "@/lib/format";
import { CompanyPickerForm } from "./picker-form";

export const dynamic = "force-dynamic";

// Which entity kind to use for the shared panel. When two entities of
// different kinds are compared, we fall back to 'operator' so the panel
// still produces the common headline KPIs (revenue, EBITDA margin, etc.).
function sharedKind(entities: Entity[]): PanelKind {
  const kinds = entities.map((e) => {
    const c = e.entity_type_codes ?? [];
    if (c.includes("operator")) return "operator" as PanelKind;
    if (c.includes("affiliate")) return "affiliate" as PanelKind;
    if (c.includes("b2b_platform")) return "b2b_platform" as PanelKind;
    if (c.includes("b2b_supplier")) return "b2b_supplier" as PanelKind;
    if (c.includes("lottery")) return "lottery" as PanelKind;
    if (c.includes("dfs")) return "dfs" as PanelKind;
    return "operator" as PanelKind;
  });
  const uniq = Array.from(new Set(kinds));
  return uniq.length === 1 ? uniq[0] : "operator";
}

export default async function CompaniesComparePage({
  searchParams,
}: {
  searchParams: { slugs?: string };
}) {
  const slugs = (searchParams.slugs ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const all = await query<{
    slug: string;
    name: string;
    ticker: string | null;
  }>(
    "SELECT slug, name, ticker FROM entities WHERE is_active = true ORDER BY name",
  );

  const selected = await Promise.all(
    slugs.map((s) => getCompanyBySlug(s)),
  ).then((arr) => arr.filter((c): c is Entity => c !== null));

  const kind = sharedKind(selected);
  const panel = PANELS[kind];
  const scorecardCodes = [
    ...panel.primary.map((r) => r.code),
    ...panel.secondary.map((r) => r.code),
  ];

  // Per-entity scorecard series
  const perEntityTiles = await Promise.all(
    selected.map(async (e) => {
      const byCode = await getScorecardSeries({
        entityId: e.id,
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
      return { entity: e, tiles: buildPanelTiles(kind, byCode, beacon) };
    }),
  );

  // Bulk metric values for the table + overlay chart
  const ids = selected.map((c) => c.id);
  const values: MetricValueRow[] =
    ids.length > 0
      ? await query<MetricValueRow>(
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
           WHERE mvc.entity_id = ANY($1::uuid[])
             AND mvc.market_id IS NULL
           ORDER BY m.display_name, p.start_date DESC`,
          [ids],
        )
      : [];

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
    { code: string; name: string; rows: MetricValueRow[] }
  >();
  const companyById = new Map(selected.map((c) => [c.id, c]));
  for (const v of values) {
    if (!byMetric.has(v.metric_code))
      byMetric.set(v.metric_code, {
        code: v.metric_code,
        name: v.metric_display_name,
        rows: [],
      });
    byMetric.get(v.metric_code)!.rows.push(v);
  }

  // Revenue overlay chart (last 12 periods)
  const revRows = byMetric.get("revenue")?.rows ?? [];
  const revPivot = pivotTimeseries(
    revRows,
    (v) => companyById.get(v.entity_id ?? "")?.slug ?? "unknown",
    (v) => companyById.get(v.entity_id ?? "")?.name ?? "unknown",
  );

  // EBITDA margin overlay chart
  const marginRows = byMetric.get("ebitda_margin")?.rows ?? [];
  const marginPivot = pivotTimeseries(
    marginRows,
    (v) => companyById.get(v.entity_id ?? "")?.slug ?? "unknown",
    (v) => companyById.get(v.entity_id ?? "")?.name ?? "unknown",
  );

  const HEADLINE = [
    "revenue",
    "ngr",
    "ebitda",
    "ebitda_margin",
    "active_customers",
    "arpu",
    "ftd",
    "ndc",
  ];
  const tableMetrics = Array.from(byMetric.values())
    .filter((m) => HEADLINE.includes(m.code))
    .sort((a, b) => HEADLINE.indexOf(a.code) - HEADLINE.indexOf(b.code));

  const isPair = selected.length === 2;
  const isMulti = selected.length > 2;

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-lg font-semibold">Compare companies</h1>
        <p className="text-xs text-tb-muted">
          {selected.length === 0
            ? "Pick 2-6 companies for side-by-side KPIs, charts, and quarterly tables."
            : `Comparing ${selected.length} ${selected.length === 1 ? "company" : "companies"} · Beacon™ estimates shown with dotted series and amber borders.`}
        </p>
      </header>

      <CompanyPickerForm
        all={all.map((c) => ({
          slug: c.slug,
          name: c.name,
          ticker: c.ticker,
        }))}
        selected={slugs}
      />

      {selected.length === 0 && (
        <div className="panel p-6 text-xs text-tb-muted">
          Select companies above to begin the comparison.
        </div>
      )}

      {/* Pair / multi header strip */}
      {selected.length > 0 && (
        <div
          className={
            "grid gap-px overflow-hidden rounded-md border border-tb-border bg-tb-border " +
            (isPair
              ? "grid-cols-1 md:grid-cols-2"
              : "grid-cols-2 md:grid-cols-3 lg:grid-cols-" +
                Math.min(6, selected.length))
          }
        >
          {selected.map((e) => (
            <div
              key={e.id}
              className="flex flex-col gap-1 bg-tb-surface px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {e.entity_type_codes?.slice(0, 1).map((c) => (
                  <Badge key={c} variant="blue">
                    {c.toUpperCase()}
                  </Badge>
                ))}
                {e.ticker ? (
                  <Badge variant="blue" className="font-mono">
                    {e.exchange ? `${e.exchange}:` : ""}
                    {e.ticker}
                  </Badge>
                ) : (
                  <Badge variant="muted">PRIVATE</Badge>
                )}
              </div>
              <Link
                href={`/companies/${e.slug}`}
                className="truncate text-lg font-semibold text-tb-text hover:text-tb-blue"
              >
                {e.name}
              </Link>
              <p className="text-[10px] text-tb-muted">
                {e.headquarters_country
                  ? `HQ ${e.headquarters_country}`
                  : "—"}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Side-by-side primary KPI tiles (per metric, per company) */}
      {selected.length > 0 && (
        <div className="rounded-md border border-tb-border bg-tb-surface">
          <div className="border-b border-tb-border px-3 py-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
              Primary KPIs · {kind.replace(/_/g, " ")} panel
            </h3>
          </div>
          <div className="divide-y divide-tb-border/60">
            {panel.primary.map((r) => {
              return (
                <div
                  key={r.code}
                  className="grid items-center gap-px bg-tb-border"
                  style={{
                    gridTemplateColumns: `minmax(120px, 160px) repeat(${selected.length}, minmax(0, 1fr))${isPair ? " 120px" : ""}`,
                  }}
                >
                  <div className="bg-tb-surface px-3 py-2 text-[10px] uppercase tracking-wider text-tb-muted">
                    {r.label}
                  </div>
                  {perEntityTiles.map(({ entity, tiles }) => {
                    const t = tiles.primary.find((x) => x.code === r.code);
                    const v = t?.valueFormatted ?? null;
                    const yoy = t?.yoy ?? null;
                    return (
                      <div
                        key={entity.id}
                        className="flex items-center justify-between gap-2 bg-tb-surface px-3 py-2"
                      >
                        <span className="flex items-baseline gap-1">
                          <span
                            className={
                              "font-mono text-base font-semibold " +
                              (v ? "text-tb-text" : "text-tb-muted")
                            }
                          >
                            {v ?? "—"}
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
                        <DeltaChip pct={yoy} size="xs" />
                      </div>
                    );
                  })}
                  {isPair && (
                    <PairDeltaCell
                      a={perEntityTiles[0].tiles.primary.find(
                        (x) => x.code === r.code,
                      )}
                      b={perEntityTiles[1].tiles.primary.find(
                        (x) => x.code === r.code,
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Overlay charts — revenue + margin */}
      {selected.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {revPivot.data.length > 0 && (
            <div className="rounded-md border border-tb-border bg-tb-surface">
              <div className="border-b border-tb-border px-3 py-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                  Revenue — last 12 periods
                </h3>
              </div>
              <div className="p-2">
                <MetricTimeseries
                  data={revPivot.data as TimeseriesPoint[]}
                  series={revPivot.series}
                  beaconFlags={revPivot.beaconFlags as BeaconFlags}
                  height={220}
                />
              </div>
            </div>
          )}
          {marginPivot.data.length > 0 && (
            <div className="rounded-md border border-tb-border bg-tb-surface">
              <div className="border-b border-tb-border px-3 py-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-tb-text">
                  EBITDA margin — last 12 periods
                </h3>
              </div>
              <div className="p-2">
                <MetricTimeseries
                  data={marginPivot.data as TimeseriesPoint[]}
                  series={marginPivot.series}
                  beaconFlags={marginPivot.beaconFlags as BeaconFlags}
                  height={220}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-metric quarterly tables (headline metrics only) */}
      {isMulti || isPair ? (
        <div className="space-y-3">
          {tableMetrics.map((mg) => {
            const periods = Array.from(
              new Set(mg.rows.map((r) => r.period_code)),
            )
              .sort()
              .reverse()
              .slice(0, 8);
            const cellFor = (p: string, eid: string) =>
              mg.rows.find((r) => r.period_code === p && r.entity_id === eid) ??
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
                      {selected.map((c) => (
                        <TH key={c.id} className="text-right">
                          {c.name}
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
                        {selected.map((c) => {
                          const cell = cellFor(p, c.id);
                          return (
                            <TD
                              key={c.id}
                              className="py-1 text-right"
                            >
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
      ) : null}

      <p className="text-[10px] text-tb-muted">
        <Link href="/companies" className="hover:text-tb-text">
          ← Back to companies
        </Link>
      </p>
    </div>
  );
}

// When exactly two companies are compared, surface an A vs B delta.
// For monetary tiles this is (EUR value A − EUR value B); for pct tiles
// it's (pct_A − pct_B). When either side is missing, show em-dash.
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
        <span className="text-[9px] uppercase tracking-wider text-tb-muted">
          Δ
        </span>
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
          (diff > 0 ? "text-tb-success" : diff < 0 ? "text-tb-danger" : "text-tb-muted")
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
  // Last non-null point
  for (let i = t.spark.length - 1; i >= 0; i--) {
    const v = t.spark[i];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}
