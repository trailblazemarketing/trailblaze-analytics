// POST /api/auth/login — demo-grade login.
//
// Behaviour per the pilot brief:
//   * unknown username   → create it on the fly with the given password
//                          (zero-friction demo gate)
//   * known + correct    → 200 { ok: true, redirect: '/overview' } + cookie
//   * known + wrong      → 401 { ok: false, error: 'bad_password' }
//
// NOT production auth. Supabase is the Phase 7 target.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query, queryOne } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

type Body = { username?: unknown; password?: unknown };

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

  const user = await queryOne<{ id: string; password_hash: string }>(
    `SELECT id, password_hash FROM users WHERE username = $1`,
    [username],
  );

  if (user) {
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "bad_password" }, { status: 401 });
    }
    await createSession(user.id);
    await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
    return NextResponse.json({ ok: true, redirect: "/overview" });
  }

  // New username — create on the fly (pilot behaviour: zero friction).
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
  return NextResponse.json({ ok: true, redirect: "/overview" });
}
