// Session-event logging helper. Writes a row to user_sessions_log on
// login / logout. Country is best-effort via ipapi.co with a 2-second
// timeout — if the lookup fails we store country=NULL and don't block
// the auth flow.

import "server-only";
import { query } from "@/lib/db";

const ROLE_COOKIE = "tb_role";

export function extractIp(req: Request): string | null {
  // Trust the usual proxy headers first, then fall back to the socket
  // address (not available on Request in Next.js; we accept null).
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

export async function lookupCountry(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  // Skip for local / private addresses — ipapi returns nothing useful.
  if (
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip === "::1" ||
    ip === "localhost"
  ) {
    return "local";
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country_name/`, {
      signal: controller.signal,
      headers: { "User-Agent": "trailblaze-analytics/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const txt = (await res.text()).trim();
    // ipapi returns an error-shaped JSON when throttled; treat as null.
    if (!txt || txt.toLowerCase().includes("error") || txt.length > 80) return null;
    return txt;
  } catch {
    return null;
  }
}

export async function logSessionEvent(opts: {
  userId: string;
  sessionId: string | null;
  eventType: "login" | "logout";
  ip: string | null;
  userAgent: string | null;
  country: string | null;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO user_sessions_log
         (user_id, session_id, event_type, ip_address, user_agent, country)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [opts.userId, opts.sessionId, opts.eventType, opts.ip, opts.userAgent, opts.country],
    );
  } catch {
    // Analytics log must never break auth. Swallow errors.
  }
}

export { ROLE_COOKIE };
