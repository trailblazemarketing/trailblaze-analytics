import Link from "next/link";
import { listReports } from "@/lib/queries/reports";
import { ReportLink } from "@/components/reports/report-link";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TH, TD, TR } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const DOC_TYPES = [
  "market_update",
  "company_report",
  "presentation",
  "trading_update",
  "analyst_call",
  "capital_markets_day",
  "ma_announcement",
  "regulatory_update",
];
const STATUSES = [
  "parsed_clean",
  "parsed_with_warnings",
  "parsed_shell",
  "pending",
  "failed",
];

export default async function ReportsIndexPage({
  searchParams,
}: {
  searchParams: { q?: string; type?: string; status?: string };
}) {
  const reports = await listReports({
    search: searchParams.q,
    document_type: searchParams.type,
    parse_status: searchParams.status,
  });
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">Reports</h1>
        <p className="text-xs text-tb-muted">
          {reports.length.toLocaleString()} reports
        </p>
      </header>

      <form className="flex flex-wrap items-center gap-2" action="/reports">
        <Input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Filter by filename…"
          className="max-w-xs"
        />
        <select
          name="type"
          defaultValue={searchParams.type ?? ""}
          className="h-8 rounded-md border border-tb-border bg-tb-surface px-2 text-xs text-tb-text focus:border-tb-blue focus:outline-none"
        >
          <option value="">All types</option>
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={searchParams.status ?? ""}
          className="h-8 rounded-md border border-tb-border bg-tb-surface px-2 text-xs text-tb-text focus:border-tb-blue focus:outline-none"
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-8 rounded-md bg-tb-blue px-3 text-xs font-medium text-white hover:brightness-110"
        >
          Apply
        </button>
        {(searchParams.q || searchParams.type || searchParams.status) && (
          <Link
            href="/reports"
            className="h-8 px-3 text-xs text-tb-muted hover:text-tb-text"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="panel">
        <Table>
          <THead>
            <tr>
              <TH>Published</TH>
              <TH>Filename</TH>
              <TH>Type</TH>
              <TH>Parser</TH>
              <TH>Status</TH>
              <TH className="text-right">Metrics</TH>
            </tr>
          </THead>
          <TBody>
            {reports.length === 0 && (
              <TR>
                <TD colSpan={6} className="py-10 text-center text-tb-muted">
                  No reports match those filters.
                </TD>
              </TR>
            )}
            {reports.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-[11px] text-tb-muted">
                  {formatDate(r.published_timestamp)}
                </TD>
                <TD>
                  <ReportLink
                    reportId={r.id}
                    className="text-tb-text hover:text-tb-blue"
                  >
                    {r.filename}
                  </ReportLink>
                </TD>
                <TD>
                  <Badge variant="muted">{r.document_type}</Badge>
                </TD>
                <TD className="font-mono text-[10px] text-tb-muted">
                  {r.parser_version ?? "—"}
                </TD>
                <TD>
                  <ReportStatus status={r.parse_status} />
                </TD>
                <TD className="text-right font-mono">
                  {r.metric_count ?? "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
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
