// POST /api/auth/login — demo-grade login.
//
// Behaviour per the pilot brief:
//   * unknown username   → create it on the fly with the given password
//                          (zero-friction demo gate)
//   * known + correct    → 200 { ok: true, redirect: '/overview' } + cookie
//   * known + wrong      → 401 { ok: false, error: 'bad_password' }
//
// Side effects on success:
//   * `tb_session` cookie (HttpOnly, 30d)
//   * `tb_role`    cookie (HttpOnly, 30d) — middleware reads this to gate
//                  /admin/* without a DB round-trip. Spoofable but harmless:
//                  admin API routes re-verify role from the DB on every call.
//   * row in user_sessions_log with IP + country (best-effort).
//
// NOT production auth. Supabase is the Phase 7 target.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { query, queryOne } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import {
  ROLE_COOKIE,
  extractIp,
  logSessionEvent,
  lookupCountry,
} from "@/lib/auth/session-log";

type Body = { username?: unknown; password?: unknown };

const ROLE_COOKIE_DAYS = 30;

function setRoleCookie(role: string): void {
  cookies().set({
    name: ROLE_COOKIE,
    value: role,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + ROLE_COOKIE_DAYS * 86400 * 1000),
  });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  const user = await queryOne<{ id: string; password_hash: string; role: string }>(
    `SELECT id, password_hash, role FROM users WHERE username = $1`,
    [username],
  );

  const ip = extractIp(req);
  const ua = req.headers.get("user-agent");

  if (user) {
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "bad_password" }, { status: 401 });
    }
    await createSession(user.id);
    setRoleCookie(user.role);
    await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
    const country = await lookupCountry(ip);
    await logSessionEvent({
      userId: user.id,
      sessionId: null,
      eventType: "login",
      ip,
      userAgent: ua,
      country,
    });
    return NextResponse.json({ ok: true, redirect: "/overview" });
  }

  // New username — create on the fly. Role + state default to 'user' /
  // 'dormant' (matches the migration 0009 column defaults).
  const hash = await bcrypt.hash(password, 10);
  const created = await queryOne<{ id: string }>(
    `INSERT INTO users (username, password_hash, last_login_at)
     VALUES ($1, $2, NOW())
     RETURNING id`,
    [username, hash],
  );
  if (!created) {
    return NextResponse.json({ ok: false, error: "create_failed" }, { status: 500 });
  }
  await createSession(created.id);
  setRoleCookie("user");
  const country = await lookupCountry(ip);
  await logSessionEvent({
    userId: created.id,
    sessionId: null,
    eventType: "login",
    ip,
    userAgent: ua,
    country,
  });
  return NextResponse.json({ ok: true, redirect: "/overview" });
}
