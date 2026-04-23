// Demo-grade session helpers. NOT production auth — Supabase (scaffolded
// under lib/supabase/) remains the Phase 7 target. This lives behind a
// single HttpOnly cookie + DB-backed session row, no JWT, no rotation.

import "server-only";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { query, queryOne } from "@/lib/db";

export const SESSION_COOKIE = "tb_session";
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export type SessionUser = {
  userId: string;
  username: string;
};

// Issue a fresh 32-byte-hex token, persist it against `user_id`, set the
// cookie on the current response. Called from POST /api/auth/login.
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MS);

  await query(
    `INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [userId, token, expiresAt],
  );

  cookies().set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

// Look up the session cookie → users row. Touches `last_seen_at` as a side
// effect so we can reason about session freshness later.
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await queryOne<{ user_id: string; username: string; expired: boolean }>(
    `SELECT s.user_id, u.username, (s.expires_at <= NOW()) AS expired
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1`,
    [token],
  );
  if (!row || row.expired) return null;

  // Touch last_seen_at. Fire-and-forget; a failed update is non-fatal.
  query(`UPDATE sessions SET last_seen_at = NOW() WHERE token = $1`, [token])
    .catch(() => {});

  return { userId: row.user_id, username: row.username };
}

// Destroy the current session (DB row + cookie). Idempotent.
export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await query(`DELETE FROM sessions WHERE token = $1`, [token]).catch(() => {});
  }
  cookies().delete(SESSION_COOKIE);
}
