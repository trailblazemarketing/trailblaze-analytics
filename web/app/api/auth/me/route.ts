// GET /api/auth/me — returns the current user's full profile, or 401.
//
// Role + state are included so the client can render role-gated UI (admin
// link, analytics panel access, etc.). Password hash is never returned.

import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const row = await queryOne<{
    username: string;
    role: string;
    state: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    profile_picture_path: string | null;
  }>(
    `SELECT username, role, state, email, first_name, last_name,
            company, profile_picture_path
     FROM users WHERE id = $1`,
    [session.userId],
  );
  if (!row) return NextResponse.json({ ok: false }, { status: 401 });

  return NextResponse.json({ ok: true, ...row });
}
