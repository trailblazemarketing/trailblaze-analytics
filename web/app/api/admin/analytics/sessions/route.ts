// Admin: /api/admin/analytics/sessions — session event analytics.
//
// Query params:
//   ?days=30            — look-back window (default 30, clamped 1..365)
//   ?limit=100          — max event rows returned (default 100, clamped 1..500)
//
// Response:
//   {
//     ok: true,
//     range_days, summary: { unique_users, total_sessions, top_country,
//                             peak_hour_utc },
//     events: [{ username, event_type, ip_address, country, created_at }, ...],
//     per_day: [{ date, sessions }, ...]
//   }

import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

async function requireAdmin() {
  const session = await getSessionUser();
  if (!session) return { err: 401 as const };
  const row = await queryOne<{ role: string }>(
    `SELECT role FROM users WHERE id = $1`,
    [session.userId],
  );
  if (!row || row.role !== "admin") return { err: 403 as const };
  return { session };
}

export async function GET(req: Request) {
  const check = await requireAdmin();
  if ("err" in check) return NextResponse.json({ ok: false }, { status: check.err });

  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(365, Number(searchParams.get("days") ?? 30)));
  const limit = Math.max(1, Math.min(500, Number(searchParams.get("limit") ?? 100)));

  // Summary
  const summary = await queryOne<{
    unique_users: number;
    total_sessions: number;
    top_country: string | null;
    peak_hour: number | null;
  }>(
    `WITH win AS (
       SELECT * FROM user_sessions_log
       WHERE created_at > NOW() - ($1 || ' days')::interval
     ),
     country_counts AS (
       SELECT country, COUNT(*)::int AS n
       FROM win
       WHERE country IS NOT NULL AND event_type = 'login'
       GROUP BY country
       ORDER BY n DESC NULLS LAST
       LIMIT 1
     ),
     peak AS (
       SELECT EXTRACT(HOUR FROM created_at)::int AS h, COUNT(*)::int AS n
       FROM win WHERE event_type = 'login'
       GROUP BY 1
       ORDER BY n DESC, h ASC
       LIMIT 1
     )
     SELECT
       (SELECT COUNT(DISTINCT user_id)::int FROM win) AS unique_users,
       (SELECT COUNT(*)::int FROM win WHERE event_type = 'login') AS total_sessions,
       (SELECT country FROM country_counts) AS top_country,
       (SELECT h FROM peak) AS peak_hour`,
    [days],
  );

  // Recent event rows
  const events = await query<{
    username: string;
    event_type: string;
    ip_address: string | null;
    country: string | null;
    user_agent: string | null;
    created_at: string;
  }>(
    `SELECT u.username, l.event_type, l.ip_address, l.country,
            l.user_agent, l.created_at
     FROM user_sessions_log l
     JOIN users u ON u.id = l.user_id
     WHERE l.created_at > NOW() - ($1 || ' days')::interval
     ORDER BY l.created_at DESC
     LIMIT $2`,
    [days, limit],
  );

  // Per-day session count for the chart
  const per_day = await query<{ date: string; sessions: number }>(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date,
            COUNT(*)::int AS sessions
     FROM user_sessions_log
     WHERE created_at > NOW() - ($1 || ' days')::interval
       AND event_type = 'login'
     GROUP BY 1
     ORDER BY 1 ASC`,
    [days],
  );

  return NextResponse.json({
    ok: true,
    range_days: days,
    summary: summary ?? {
      unique_users: 0,
      total_sessions: 0,
      top_country: null,
      peak_hour: null,
    },
    events,
    per_day,
  });
}
