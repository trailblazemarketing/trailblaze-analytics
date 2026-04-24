// Admin: /api/admin/users — list (GET) + create (POST). Admin-only.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
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

export async function GET() {
  const check = await requireAdmin();
  if ("err" in check) return NextResponse.json({ ok: false }, { status: check.err });

  const rows = await query<{
    id: string;
    username: string;
    role: string;
    state: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    profile_picture_path: string | null;
    created_at: string;
    last_login_at: string | null;
  }>(
    `SELECT id, username, role, state, email, first_name, last_name, company,
            profile_picture_path, created_at, last_login_at
     FROM users
     ORDER BY last_login_at DESC NULLS LAST, username ASC`,
  );
  return NextResponse.json({ ok: true, users: rows });
}

export async function POST(req: Request) {
  const check = await requireAdmin();
  if ("err" in check) return NextResponse.json({ ok: false }, { status: check.err });

  type Body = {
    username?: unknown;
    password?: unknown;
    email?: unknown;
    first_name?: unknown;
    last_name?: unknown;
    company?: unknown;
    role?: unknown;
    state?: unknown;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : null);
  const username = str(body.username)?.toLowerCase() ?? "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = str(body.role) ?? "user";
  const state = str(body.state) ?? "dormant";
  if (!username || !password) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }
  if (!["admin", "user"].includes(role)) {
    return NextResponse.json({ ok: false, error: "bad_role" }, { status: 400 });
  }
  if (!["dormant", "subscription", "admin"].includes(state)) {
    return NextResponse.json({ ok: false, error: "bad_state" }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 10);
  const created = await queryOne<{ id: string }>(
    `INSERT INTO users (username, password_hash, role, state, email, first_name, last_name, company)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (username) DO NOTHING
     RETURNING id`,
    [
      username,
      hash,
      role,
      state,
      str(body.email),
      str(body.first_name),
      str(body.last_name),
      str(body.company),
    ],
  );
  if (!created) {
    return NextResponse.json(
      { ok: false, error: "username_taken" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, id: created.id });
}
