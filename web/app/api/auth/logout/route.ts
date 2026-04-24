// POST /api/auth/logout — tears down the current session row + cookies,
// writes a 'logout' event to user_sessions_log.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, getSessionUser } from "@/lib/auth/session";
import {
  ROLE_COOKIE,
  extractIp,
  logSessionEvent,
} from "@/lib/auth/session-log";

export async function POST(req: Request) {
  // Capture the user-id BEFORE we destroy the session — after destroy,
  // getSessionUser() returns null and the log row can't be attributed.
  const session = await getSessionUser();
  if (session) {
    await logSessionEvent({
      userId: session.userId,
      sessionId: null,
      eventType: "logout",
      ip: extractIp(req),
      userAgent: req.headers.get("user-agent"),
      country: null, // skip country lookup on logout to keep it fast
    });
  }
  await destroySession();
  cookies().delete(ROLE_COOKIE);
  return NextResponse.json({ ok: true });
}
