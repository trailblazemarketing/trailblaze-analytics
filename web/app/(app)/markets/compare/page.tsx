import Link from "next/link";
import { query } from "@/lib/db";
import {
  getMarketBySlug,
  getBeaconEstimatesForValues,
} from "@/lib/queries/markets";
import type { MetricValueRow, Market } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TH, TD, TR } from "@/components/ui/table";
import { ValueCell } from "@/components/beacon/value-cell";
import { MetricTimeseries } from "@/components/charts/metric-timeseries";
import { pivotTimeseries } from "@/lib/pivot";
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

  // Group by metric
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

  const HEADLINE = ["ggr", "ngr", "active_users", "gaming_tax_revenue", "revenue"];
  const sortedMetrics = Array.from(byMetric.values()).sort((a, b) => {
    const ai = HEADLINE.indexOf(a.code);
    const bi = HEADLINE.indexOf(b.code);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Compare markets</h1>
        <p className="text-xs text-tb-muted">
          Pick up to 6 markets to view side by side. Canonical values shown;
          Beacon™ estimates appear as dotted lines.
        </p>
      </header>

      <MarketPickerForm
        all={allMarkets.map((m) => ({ slug: m.slug, name: m.name }))}
        selected={slugs}
      />

      {selected.length === 0 ? (
        <div className="panel p-6 text-xs text-tb-muted">
          Select markets above to begin the comparison.
        </div>
      ) : sortedMetrics.length === 0 ? (
        <div className="panel p-6 text-xs text-tb-muted">
          No canonical metric values for those markets yet.
        </div>
      ) : (
        <div className="space-y-4">
          {sortedMetrics.map((mg) => {
            const pivot = pivotTimeseries(
              mg.rows,
              (v) => marketById.get(v.market_id ?? "")?.slug ?? "unknown",
              (v) => marketById.get(v.market_id ?? "")?.name ?? "unknown",
            );
            // Side-by-side table: rows = periods, cols = markets
            const periodSet = new Set(mg.rows.map((r) => r.period_code));
            const periods = Array.from(periodSet).sort().reverse();
            const cellFor = (periodCode: string, marketId: string) =>
              mg.rows.find(
                (r) => r.period_code === periodCode && r.market_id === marketId,
              ) ?? null;
            return (
              <Card key={mg.code}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>{mg.name}</CardTitle>
                    <code className="font-mono text-[10px] text-tb-muted">
                      {mg.code}
                    </code>
                  </div>
                  <Badge variant="muted">
                    {mg.rows[0]?.metric_unit_type ?? ""}
                  </Badge>
                </CardHeader>
                <CardContent>
                  {pivot.data.length > 0 && (
                    <div className="mb-3">
                      <MetricTimeseries
                        data={pivot.data}
                        series={pivot.series}
                        beaconFlags={pivot.beaconFlags}
                        height={220}
                      />
                    </div>
                  )}
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
                          <TD className="font-mono text-tb-muted">{p}</TD>
                          {selected.map((m) => {
                            const c = cellFor(p, m.id);
                            return (
                              <TD key={m.id} className="text-right">
                                {c ? (
                                  <ValueCell
                                    v={c}
                                    beacon={beaconMap.get(c.metric_value_id) ?? null}
                                  />
                                ) : (
                                  <span className="font-mono text-tb-muted">—</span>
                                )}
                              </TD>
                            );
                          })}
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </CardContent>
              </Card>
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
