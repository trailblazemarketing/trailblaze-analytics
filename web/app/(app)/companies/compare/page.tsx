import Link from "next/link";
import { query } from "@/lib/db";
import { getCompanyBySlug } from "@/lib/queries/companies";
import { getBeaconEstimatesForValues } from "@/lib/queries/markets";
import type { Entity, MetricValueRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TH, TD, TR } from "@/components/ui/table";
import { ValueCell } from "@/components/beacon/value-cell";
import { MetricTimeseries } from "@/components/charts/metric-timeseries";
import { pivotTimeseries } from "@/lib/pivot";
import { CompanyPickerForm } from "./picker-form";

export const dynamic = "force-dynamic";

export default async function CompaniesComparePage({
  searchParams,
}: {
  searchParams: { slugs?: string };
}) {
  const slugs = (searchParams.slugs ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const all = await query<{ slug: string; name: string; ticker: string | null }>(
    "SELECT slug, name, ticker FROM entities WHERE is_active = true ORDER BY name",
  );

  const selected = await Promise.all(
    slugs.map((s) => getCompanyBySlug(s)),
  ).then((arr) => arr.filter((c): c is Entity => c !== null));

  const ids = selected.map((c) => c.id);
  let values: MetricValueRow[] = [];
  if (ids.length > 0) {
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
       WHERE mvc.entity_id = ANY($1::uuid[])
       ORDER BY m.display_name, p.start_date DESC`,
      [ids],
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

  const HEADLINE = ["revenue", "ngr", "ggr", "ebitda", "active_users"];
  const sortedMetrics = Array.from(byMetric.values()).sort((a, b) => {
    const ai = HEADLINE.indexOf(a.code);
    const bi = HEADLINE.indexOf(b.code);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Compare companies</h1>
        <p className="text-xs text-tb-muted">
          Pick up to 6 companies for side-by-side metrics. Beacon™ estimates
          appear as dotted lines.
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

      {selected.length === 0 ? (
        <div className="panel p-6 text-xs text-tb-muted">
          Select companies above to begin the comparison.
        </div>
      ) : sortedMetrics.length === 0 ? (
        <div className="panel p-6 text-xs text-tb-muted">
          No canonical metric values for those companies yet.
        </div>
      ) : (
        <div className="space-y-4">
          {sortedMetrics.map((mg) => {
            const pivot = pivotTimeseries(
              mg.rows,
              (v) => companyById.get(v.entity_id ?? "")?.slug ?? "unknown",
              (v) => companyById.get(v.entity_id ?? "")?.name ?? "unknown",
            );
            const periods = Array.from(
              new Set(mg.rows.map((r) => r.period_code)),
            )
              .sort()
              .reverse();
            const cellFor = (p: string, eid: string) =>
              mg.rows.find(
                (r) => r.period_code === p && r.entity_id === eid,
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
                          <TD className="font-mono text-tb-muted">{p}</TD>
                          {selected.map((c) => {
                            const cell = cellFor(p, c.id);
                            return (
                              <TD key={c.id} className="text-right">
                                {cell ? (
                                  <ValueCell
                                    v={cell}
                                    beacon={
                                      beaconMap.get(cell.metric_value_id) ??
                                      null
                                    }
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
        <Link href="/companies" className="hover:text-tb-text">
          ← Back to companies
        </Link>
      </p>
    </div>
  );
}
