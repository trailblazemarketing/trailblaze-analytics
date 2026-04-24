// Admin: /api/admin/users/[id] — PATCH update + DELETE. Admin-only.
//
// PATCH accepts any subset of: role, state, email, first_name, last_name,
// company, and (deviation from brief to keep file count ≤ 3)
// new_password — when provided, admin force-resets that user's password.
// Brief's separate /api/admin/users/[id]/reset-password is merged here.

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

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const check = await requireAdmin();
  if ("err" in check) return NextResponse.json({ ok: false }, { status: check.err });

  type Body = {
    role?: unknown;
    state?: unknown;
    email?: unknown;
    first_name?: unknown;
    last_name?: unknown;
    company?: unknown;
    new_password?: unknown;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : null);

  const fields: { col: string; val: string | null }[] = [];
  if ("role" in body) {
    const v = str(body.role);
    if (v && !["admin", "user"].includes(v)) {
      return NextResponse.json({ ok: false, error: "bad_role" }, { status: 400 });
    }
    fields.push({ col: "role", val: v });
  }
  if ("state" in body) {
    const v = str(body.state);
    if (v && !["dormant", "subscription", "admin"].includes(v)) {
      return NextResponse.json({ ok: false, error: "bad_state" }, { status: 400 });
    }
    fields.push({ col: "state", val: v });
  }
  if ("email" in body) fields.push({ col: "email", val: str(body.email) });
  if ("first_name" in body) fields.push({ col: "first_name", val: str(body.first_name) });
  if ("last_name" in body) fields.push({ col: "last_name", val: str(body.last_name) });
  if ("company" in body) fields.push({ col: "company", val: str(body.company) });

  if ("new_password" in body) {
    const pw = typeof body.new_password === "string" ? body.new_password : "";
    if (!pw) {
      return NextResponse.json(
        { ok: false, error: "empty_password" },
        { status: 400 },
      );
    }
    fields.push({ col: "password_hash", val: await bcrypt.hash(pw, 10) });
  }

  if (fields.length === 0) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }
  const setClause = fields.map((f, i) => `${f.col} = $${i + 2}`).join(", ");
  await query(
    `UPDATE users SET ${setClause} WHERE id = $1`,
    [params.id, ...fields.map((f) => f.val)],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const check = await requireAdmin();
  if ("err" in check) return NextResponse.json({ ok: false }, { status: check.err });

  if (params.id === check.session.userId) {
    return NextResponse.json(
      { ok: false, error: "cannot_delete_self" },
      { status: 400 },
    );
  }
  await query(`DELETE FROM users WHERE id = $1`, [params.id]);
  return NextResponse.json({ ok: true });
}
