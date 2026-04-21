"use client";
import * as React from "react";
import Link from "next/link";
import { X, ExternalLink, Loader2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ValueCell } from "@/components/beacon/value-cell";
import { formatDate } from "@/lib/format";
import type {
  MetricValueRow,
  BeaconEstimate,
  Narrative,
  Report,
} from "@/lib/types";

type Meta = {
  report: Report;
  values: MetricValueRow[];
  narratives: Narrative[];
  entities: { id: string; name: string; slug: string; is_primary: boolean }[];
  markets: { id: string; name: string; slug: string; is_primary: boolean }[];
  beacon: Record<string, BeaconEstimate>;
};

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

export function ReportViewerModal({
  reportId,
  onClose,
}: {
  reportId: string;
  onClose: () => void;
}) {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // Close on Escape
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch metadata
  React.useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setErr(null);
    fetch(`/api/reports/${reportId}/meta`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as Meta;
        if (!cancelled) setMeta(data);
      })
      .catch((e) => !cancelled && setErr(String(e)));
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const pdfUrl = `/api/reports/${reportId}/pdf`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 animate-fade-in md:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex h-[95vh] w-[96vw] max-w-[1600px] flex-col overflow-hidden rounded-lg border border-tb-border bg-tb-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-tb-border bg-tb-surface px-4 py-2.5">
          <FileText className="h-4 w-4 shrink-0 text-tb-blue" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {meta?.report.filename ?? "Loading…"}
            </div>
            {meta?.report && (
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-tb-muted">
                <Badge variant="muted">{meta.report.document_type}</Badge>
                <span className="font-mono">
                  {formatDate(meta.report.published_timestamp)}
                </span>
                <ReportStatus status={meta.report.parse_status} />
              </div>
            )}
          </div>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-tb-border px-2.5 py-1 text-xs text-tb-text transition-colors hover:border-tb-blue hover:text-tb-blue"
            title="Open raw PDF in a new tab"
          >
            <ExternalLink className="h-3 w-3" />
            Open in new tab
          </a>
          <Link
            href={`/reports/${reportId}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-tb-border px-2.5 py-1 text-xs text-tb-text transition-colors hover:border-tb-blue hover:text-tb-blue"
            title="Open the standalone report page"
          >
            Full page →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-tb-muted hover:bg-tb-border/40 hover:text-tb-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body: PDF left, metadata right */}
        <div className="flex min-h-0 flex-1">
          {/* PDF viewer */}
          <div className="flex-1 bg-black/30">
            <iframe
              key={reportId}
              src={pdfUrl}
              className="h-full w-full"
              title="Report PDF"
            />
          </div>

          {/* Sidebar */}
          <aside className="flex w-[420px] shrink-0 flex-col border-l border-tb-border bg-tb-surface">
            {err ? (
              <div className="p-4 text-xs text-tb-danger">
                Failed to load metadata: {err}
              </div>
            ) : !meta ? (
              <div className="flex flex-1 items-center justify-center text-xs text-tb-muted">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading metadata…
              </div>
            ) : (
              <MetadataPanel meta={meta} />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function MetadataPanel({ meta }: { meta: Meta }) {
  const disclosedCount = meta.values.filter(
    (v) => v.disclosure_status === "disclosed",
  ).length;
  const beaconCount = meta.values.filter(
    (v) =>
      v.disclosure_status === "beacon_estimate" ||
      v.disclosure_status === "derived",
  ).length;

  // Bucket values by metric for the Metrics tab
  const byMetric = new Map<
    string,
    { code: string; name: string; rows: MetricValueRow[] }
  >();
  for (const v of meta.values) {
    if (!byMetric.has(v.metric_code))
      byMetric.set(v.metric_code, {
        code: v.metric_code,
        name: v.metric_display_name,
        rows: [],
      });
    byMetric.get(v.metric_code)!.rows.push(v);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Subjects */}
      {(meta.entities.length > 0 || meta.markets.length > 0) && (
        <div className="shrink-0 border-b border-tb-border p-3">
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-tb-muted">
            Subjects
          </div>
          <div className="flex flex-wrap gap-1">
            {meta.entities.map((e) => (
              <Link
                key={e.id}
                href={`/companies/${e.slug}`}
                className={`truncate rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
                  e.is_primary
                    ? "border-tb-blue/40 bg-tb-blue/10 text-tb-blue"
                    : "border-tb-border text-tb-text hover:border-tb-blue/60"
                }`}
              >
                {e.name}
              </Link>
            ))}
            {meta.markets.map((m) => (
              <Link
                key={m.id}
                href={`/markets/${m.slug}`}
                className={`truncate rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
                  m.is_primary
                    ? "border-tb-blue/40 bg-tb-blue/10 text-tb-blue"
                    : "border-tb-border text-tb-text hover:border-tb-blue/60"
                }`}
              >
                {m.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Stat strip */}
      <div className="grid shrink-0 grid-cols-3 gap-px border-b border-tb-border bg-tb-border text-center">
        <StatMini label="Disclosed" value={disclosedCount} />
        <StatMini label="Beacon™" value={beaconCount} emphasis="beacon" />
        <StatMini label="Narratives" value={meta.narratives.length} />
      </div>

      {/* Tabs */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Tabs defaultValue="metrics" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="shrink-0 px-3">
            <TabsTrigger value="metrics">
              Metrics ({meta.values.length})
            </TabsTrigger>
            <TabsTrigger value="narratives">
              Narratives ({meta.narratives.length})
            </TabsTrigger>
            <TabsTrigger value="source">Source</TabsTrigger>
          </TabsList>

          <TabsContent
            value="metrics"
            className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
          >
            {meta.values.length === 0 ? (
              <p className="py-6 text-center text-xs text-tb-muted">
                No metrics extracted.
              </p>
            ) : (
              <div className="space-y-2">
                {Array.from(byMetric.values()).map((g) => (
                  <div
                    key={g.code}
                    className="rounded-md border border-tb-border bg-tb-bg p-2"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-medium">
                        {g.name}
                      </span>
                      <code className="shrink-0 font-mono text-[9px] text-tb-muted">
                        {g.code}
                      </code>
                    </div>
                    <ul className="space-y-0.5">
                      {g.rows.map((r) => (
                        <li
                          key={r.metric_value_id}
                          className="flex items-center justify-between gap-2 text-[11px]"
                        >
                          <span className="font-mono text-tb-muted">
                            {r.period_display_name ?? r.period_code}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <ValueCell
                              v={r}
                              beacon={meta.beacon[r.metric_value_id] ?? null}
                              className="text-[11px]"
                            />
                            <DisclosureDot status={r.disclosure_status} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="narratives"
            className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
          >
            {meta.narratives.length === 0 ? (
              <p className="py-6 text-center text-xs text-tb-muted">
                No narrative sections.
              </p>
            ) : (
              <div className="space-y-3">
                {meta.narratives.map((n) => (
                  <div key={n.id}>
                    <div className="mb-1 text-[10px] uppercase tracking-wider text-tb-muted">
                      {SECTION_LABEL[n.section_code] ?? n.section_code}
                    </div>
                    <p className="whitespace-pre-line text-[11px] leading-relaxed text-tb-text">
                      {n.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="source"
            className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 text-xs"
          >
            <dl className="space-y-2">
              <Field label="Filename" value={meta.report.filename} mono />
              <Field
                label="Document type"
                value={meta.report.document_type}
              />
              <Field
                label="Published"
                value={formatDate(meta.report.published_timestamp)}
                mono
              />
              <Field
                label="Parsed at"
                value={formatDate(meta.report.parsed_at)}
                mono
              />
              <Field
                label="Parser version"
                value={meta.report.parser_version ?? "—"}
                mono
              />
              <Field
                label="Metric count"
                value={String(meta.report.metric_count ?? "—")}
                mono
              />
              <Field label="Parse status" value={meta.report.parse_status} />
              <Field label="Report ID" value={meta.report.id} mono />
            </dl>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatMini({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: "beacon";
}) {
  const color = emphasis === "beacon" ? "text-tb-beacon" : "text-tb-text";
  return (
    <div className="bg-tb-surface px-2 py-2">
      <div className="text-[9px] uppercase tracking-wider text-tb-muted">
        {label}
      </div>
      <div className={`font-mono text-sm font-semibold ${color}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wider text-tb-muted">
        {label}
      </dt>
      <dd className={`text-[11px] text-tb-text ${mono ? "font-mono break-all" : ""}`}>
        {value}
      </dd>
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

function DisclosureDot({ status }: { status: string }) {
  const color =
    status === "disclosed"
      ? "bg-tb-success"
      : status === "beacon_estimate" || status === "derived"
      ? "bg-tb-beacon"
      : "bg-tb-border";
  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`}
      title={status}
    />
  );
}
