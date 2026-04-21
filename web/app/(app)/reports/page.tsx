import Link from "next/link";
import { listReports, getReportTypeCounts } from "@/lib/queries/reports";
import { ReportLink } from "@/components/reports/report-link";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TH, TD, TR } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

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
  searchParams: {
    q?: string;
    type?: string;
    status?: string;
    sort?: "newest" | "oldest";
  };
}) {
  const sort = searchParams.sort === "oldest" ? "oldest" : "newest";

  const [reports, typeCounts] = await Promise.all([
    listReports({
      search: searchParams.q,
      document_type: searchParams.type,
      parse_status: searchParams.status,
      sort,
    }),
    getReportTypeCounts(),
  ]);

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-lg font-semibold">Reports</h1>
        <p className="text-xs text-tb-muted">
          {reports.length.toLocaleString()} reports · click any row to open in
          overlay · arrow links open raw PDF
        </p>
      </header>

      {/* R1: filter chips per document type + sort toggle */}
      <form className="space-y-2" action="/reports">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Filter by filename…"
            className="max-w-xs"
          />
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
          <SortToggle current={sort} />
          <button
            type="submit"
            className="h-8 rounded-md bg-tb-blue px-3 text-xs font-medium text-white hover:brightness-110"
          >
            Apply
          </button>
          {(searchParams.q ||
            searchParams.type ||
            searchParams.status ||
            searchParams.sort === "oldest") && (
            <Link
              href="/reports"
              className="h-8 px-3 text-xs text-tb-muted hover:text-tb-text"
            >
              Clear
            </Link>
          )}
        </div>

        <DocTypeChips current={searchParams.type} counts={typeCounts} />
      </form>

      <div className="panel">
        <Table>
          <THead>
            <tr>
              <TH className="w-[110px]">Published</TH>
              <TH>Filename</TH>
              <TH className="w-[140px]">Type</TH>
              <TH className="w-[80px]">Parser</TH>
              <TH className="w-[110px]">Status</TH>
              <TH className="w-[70px] text-right">Metrics</TH>
            </tr>
          </THead>
          <TBody>
            {reports.length === 0 && (
              <TR>
                <TD colSpan={6} className="py-8 text-center text-tb-muted">
                  No reports match those filters.
                </TD>
              </TR>
            )}
            {reports.map((r) => (
              <TR key={r.id}>
                <TD className="py-1 font-mono text-[11px] text-tb-muted">
                  {formatDate(r.published_timestamp)}
                </TD>
                <TD className="py-1">
                  <ReportLink
                    reportId={r.id}
                    className="text-tb-text hover:text-tb-blue"
                  >
                    {r.filename}
                  </ReportLink>
                </TD>
                <TD className="py-1">
                  <Badge variant="muted">{r.document_type}</Badge>
                </TD>
                <TD className="py-1 font-mono text-[10px] text-tb-muted">
                  {r.parser_version ?? "—"}
                </TD>
                <TD className="py-1">
                  <ReportStatus status={r.parse_status} />
                </TD>
                <TD className="py-1 text-right font-mono">
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

function DocTypeChips({
  current,
  counts,
}: {
  current: string | undefined;
  counts: { document_type: string; count: number }[];
}) {
  if (counts.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[10px] uppercase tracking-wider text-tb-muted">
        Type:
      </span>
      {counts.map((o) => {
        const isActive = current === o.document_type;
        return (
          <label
            key={o.document_type}
            className={
              "cursor-pointer rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider transition-colors " +
              (isActive
                ? "border-tb-blue bg-tb-blue/15 text-tb-blue"
                : "border-tb-border bg-tb-surface text-tb-muted hover:border-tb-blue/60")
            }
          >
            <input
              type="radio"
              name="type"
              value={o.document_type}
              defaultChecked={isActive}
              className="hidden"
            />
            {o.document_type} ({o.count})
          </label>
        );
      })}
    </div>
  );
}

function SortToggle({ current }: { current: "newest" | "oldest" }) {
  return (
    <div className="flex items-center gap-0 rounded-md border border-tb-border bg-tb-surface text-[10px]">
      {(["newest", "oldest"] as const).map((s) => (
        <label
          key={s}
          className={
            "cursor-pointer px-2 py-1 uppercase tracking-wider transition-colors " +
            (current === s
              ? "bg-tb-blue/15 text-tb-blue"
              : "text-tb-muted hover:text-tb-text")
          }
        >
          <input
            type="radio"
            name="sort"
            value={s}
            defaultChecked={current === s}
            className="hidden"
          />
          {s === "newest" ? "Newest" : "Oldest"}
        </label>
      ))}
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
