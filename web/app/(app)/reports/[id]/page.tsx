import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getReportById,
  getReportMetricValues,
  getReportNarratives,
  getReportAssociations,
} from "@/lib/queries/reports";
import { getBeaconEstimatesForValues } from "@/lib/queries/markets";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TH, TD, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ValueCell } from "@/components/beacon/value-cell";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const SECTION_LABEL: Record<string, string> = {
  executive_summary: "Executive summary",
  company_insights_interpretation: "Insights & interpretation",
  market_deep_dive: "Market deep-dive",
  affiliate_benchmarking: "Affiliate benchmarking",
  forecast_strategy: "Forecast & strategy",
  investment_view: "Investment view",
  valuation_downside: "Valuation — downside",
  valuation_base: "Valuation — base",
  valuation_upside: "Valuation — upside",
};

export default async function ReportDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const report = await getReportById(params.id);
  if (!report) notFound();

  const [values, narratives, { entities, markets }] = await Promise.all([
    getReportMetricValues(report.id),
    getReportNarratives(report.id),
    getReportAssociations(report.id),
  ]);

  const beaconMap = await getBeaconEstimatesForValues(
    values
      .filter(
        (v) =>
          v.disclosure_status === "beacon_estimate" ||
          v.disclosure_status === "derived",
      )
      .map((v) => v.metric_value_id),
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="muted">{report.document_type}</Badge>
            <ReportStatus status={report.parse_status} />
          </div>
          <h1 className="truncate text-lg font-semibold">{report.filename}</h1>
          <p className="mt-1 text-xs text-tb-muted">
            Published {formatDate(report.published_timestamp)}
            {report.parser_version && (
              <>
                {" · "}
                parser <span className="font-mono">{report.parser_version}</span>
              </>
            )}
            {" · "}
            {report.metric_count ?? "—"} metrics
          </p>
        </div>
      </header>

      {(entities.length > 0 || markets.length > 0) && (
        <div className="panel p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-tb-muted">
            Subjects
          </div>
          <div className="flex flex-wrap gap-1.5">
            {entities.map((e) => (
              <Link
                key={e.id}
                href={`/companies/${e.slug}`}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  e.is_primary
                    ? "border-tb-blue/40 bg-tb-blue/10 text-tb-blue"
                    : "border-tb-border text-tb-text hover:border-tb-blue/60"
                }`}
              >
                🏢 {e.name}
              </Link>
            ))}
            {markets.map((m) => (
              <Link
                key={m.id}
                href={`/markets/${m.slug}`}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  m.is_primary
                    ? "border-tb-blue/40 bg-tb-blue/10 text-tb-blue"
                    : "border-tb-border text-tb-text hover:border-tb-blue/60"
                }`}
              >
                🌐 {m.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <Tabs defaultValue="metrics">
        <TabsList>
          <TabsTrigger value="metrics">Metrics ({values.length})</TabsTrigger>
          <TabsTrigger value="narratives">
            Narratives ({narratives.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metrics">
          {values.length === 0 ? (
            <div className="panel p-6 text-xs text-tb-muted">
              No metric values extracted from this report.
            </div>
          ) : (
            <div className="panel">
              <Table>
                <THead>
                  <tr>
                    <TH>Metric</TH>
                    <TH>Period</TH>
                    <TH className="text-right">Value</TH>
                    <TH>Disclosure</TH>
                    <TH>Source</TH>
                  </tr>
                </THead>
                <TBody>
                  {values.map((v) => (
                    <TR key={v.metric_value_id}>
                      <TD>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{v.metric_display_name}</span>
                          <code className="font-mono text-[10px] text-tb-muted">
                            {v.metric_code}
                          </code>
                        </div>
                      </TD>
                      <TD className="font-mono text-tb-muted">
                        {v.period_display_name ?? v.period_code}
                      </TD>
                      <TD className="text-right">
                        <ValueCell
                          v={v}
                          beacon={beaconMap.get(v.metric_value_id) ?? null}
                        />
                      </TD>
                      <TD>
                        <DisclosureBadge status={v.disclosure_status} />
                      </TD>
                      <TD>
                        <Badge variant="muted">{v.source_type}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="narratives">
          {narratives.length === 0 ? (
            <div className="panel p-6 text-xs text-tb-muted">
              No narrative sections on this report.
            </div>
          ) : (
            <div className="space-y-3">
              {narratives.map((n) => (
                <Card key={n.id}>
                  <CardHeader>
                    <CardTitle>
                      {SECTION_LABEL[n.section_code] ?? n.section_code}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-tb-text">
                      {n.content}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportStatus({ status }: { status: string }) {
  if (status === "parsed_clean")
    return <Badge variant="success">clean</Badge>;
  if (status === "parsed_with_warnings")
    return <Badge variant="beacon">warnings</Badge>;
  if (status === "parsed_shell")
    return <Badge variant="muted">shell</Badge>;
  if (status === "failed") return <Badge variant="danger">failed</Badge>;
  return <Badge variant="muted">{status}</Badge>;
}

function DisclosureBadge({ status }: { status: string }) {
  if (status === "disclosed")
    return <Badge variant="success">disclosed</Badge>;
  if (status === "beacon_estimate")
    return <Badge variant="beacon">Beacon™</Badge>;
  if (status === "derived") return <Badge variant="beacon">derived</Badge>;
  if (status === "not_disclosed")
    return <Badge variant="muted">not disclosed</Badge>;
  if (status === "partially_disclosed")
    return <Badge variant="muted">partial</Badge>;
  return <Badge variant="muted">{status}</Badge>;
}
