// /admin/analytics — session analytics panel, admin-only (middleware).
// Fetches /api/admin/analytics/sessions with a configurable days range;
// renders summary tiles, a per-day sessions bar chart, and the most
// recent event rows.

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

type Payload = {
  range_days: number;
  summary: {
    unique_users: number;
    total_sessions: number;
    top_country: string | null;
    peak_hour: number | null;
  };
  events: {
    username: string;
    event_type: string;
    ip_address: string | null;
    country: string | null;
    user_agent: string | null;
    created_at: string;
  }[];
  per_day: { date: string; sessions: number }[];
};

const RANGES = [7, 14, 30, 90] as const;

export default function AnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    fetch(`/api/admin/analytics/sessions?days=${days}&limit=100`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.ok && setData(j));
  }, [days]);

  return (
    <div className="space-y-4 px-6 py-4 text-[12px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Admin</h1>
          <div className="mt-1 flex gap-3 text-[11px]">
            <Link href="/admin" className="text-tb-muted hover:text-tb-text">Users</Link>
            <span className="border-b-2 border-tb-blue pb-0.5 text-tb-text">Analytics</span>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded border border-tb-border bg-tb-surface p-0.5 text-[10px]">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setDays(r)}
              className={"rounded px-2 py-1 " + (days === r ? "bg-tb-blue text-tb-bg" : "text-tb-muted hover:text-tb-text")}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="p-8 text-center text-tb-muted">loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Tile label="Unique users" value={data.summary.unique_users.toLocaleString()} />
            <Tile label="Total sessions" value={data.summary.total_sessions.toLocaleString()} />
            <Tile label="Top country" value={data.summary.top_country ?? "—"} />
            <Tile label="Peak hour (UTC)" value={data.summary.peak_hour != null ? `${data.summary.peak_hour}:00` : "—"} />
          </div>

          <div className="rounded-md border border-tb-border bg-tb-surface p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-tb-muted">
              sessions per day — last {data.range_days} days
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.per_day} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid stroke="var(--tb-border)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "var(--tb-text-muted)", fontSize: 9 }} axisLine={{ stroke: "var(--tb-border)" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--tb-text-muted)", fontSize: 9 }} axisLine={{ stroke: "var(--tb-border)" }} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--tb-surface)", border: "1px solid var(--tb-border)", fontSize: 11 }} />
                <Bar dataKey="sessions" fill="#2BA8E0" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto rounded-md border border-tb-border bg-tb-surface">
            <div className="border-b border-tb-border bg-tb-bg/40 px-3 py-2 text-[10px] uppercase tracking-wider text-tb-muted">
              recent events ({data.events.length})
            </div>
            <table className="w-full text-[12px]">
              <thead className="border-b border-tb-border text-[10px] uppercase tracking-wider text-tb-muted">
                <tr>
                  {["When","User","Event","IP","Country","User-agent"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tb-border/60">
                {data.events.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-tb-muted">no events in range</td></tr>}
                {data.events.map((e, i) => (
                  <tr key={i} className="hover:bg-tb-border/30">
                    <td className="px-3 py-1.5 font-mono text-[10px] text-tb-muted">{e.created_at.slice(0, 19).replace("T", " ")}</td>
                    <td className="px-3 py-1.5 font-mono">{e.username}</td>
                    <td className="px-3 py-1.5">
                      <span className={"rounded border px-2 py-0.5 text-[10px] uppercase " + (e.event_type === "login" ? "border-tb-success/40 text-tb-success" : "border-tb-border text-tb-muted")}>
                        {e.event_type}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[10px] text-tb-muted">{e.ip_address ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[11px]">{e.country ?? "—"}</td>
                    <td className="px-3 py-1.5 truncate text-[10px] text-tb-muted" style={{ maxWidth: 280 }}>{e.user_agent ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-tb-border bg-tb-surface p-3">
      <div className="text-[10px] uppercase tracking-wider text-tb-muted">{label}</div>
      <div className="mt-1 font-mono text-lg text-tb-text">{value}</div>
    </div>
  );
}
