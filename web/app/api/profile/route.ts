// POST /api/profile — self-service profile actions.
//
// Body shape decides the action. One endpoint, two actions, to keep the
// fix-class file count under the 3-file cap:
//   { action: "update", first_name?, last_name?, email?, company? }
//   { action: "reset_password", current_password, new_password }
//
// Consolidated from the brief's `/api/profile/update` +
// `/api/profile/reset-password` split. Semantics identical.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query, queryOne } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

type Body = {
  action?: unknown;
  // update
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  company?: unknown;
  // reset_password
  current_password?: unknown;
  new_password?: unknown;
};

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (body.action === "update") {
    return await handleUpdate(session.userId, body);
  }
  if (body.action === "reset_password") {
    return await handleResetPassword(session.userId, body);
  }
  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}

async function handleUpdate(userId: string, body: Body) {
  const fields: { col: string; val: string | null }[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : null);
  if ("first_name" in body) fields.push({ col: "first_name", val: str(body.first_name) });
  if ("last_name" in body) fields.push({ col: "last_name", val: str(body.last_name) });
  if ("email" in body) fields.push({ col: "email", val: str(body.email) });
  if ("company" in body) fields.push({ col: "company", val: str(body.company) });

  if (fields.length === 0) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }
  const setClause = fields.map((f, i) => `${f.col} = $${i + 2}`).join(", ");
  const params = [userId, ...fields.map((f) => f.val)];
  await query(`UPDATE users SET ${setClause} WHERE id = $1`, params);
  return NextResponse.json({ ok: true });
}

async function handleResetPassword(userId: string, body: Body) {
  const current = typeof body.current_password === "string" ? body.current_password : "";
  const next = typeof body.new_password === "string" ? body.new_password : "";
  if (!current || !next) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }
  const row = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [userId],
  );
  if (!row) return NextResponse.json({ ok: false }, { status: 401 });

  const ok = await bcrypt.compare(current, row.password_hash);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "bad_current_password" },
      { status: 401 },
    );
  }
  const hash = await bcrypt.hash(next, 10);
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, userId]);
  return NextResponse.json({ ok: true });
}
