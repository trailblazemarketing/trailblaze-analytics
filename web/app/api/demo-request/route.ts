// POST /api/demo-request — appends email-capture submissions to
// documentation/demo-requests.log. No DB table yet; Calendly / CRM wiring
// later. Accepts { email } and records timestamp + email + request UA.

import { NextResponse } from "next/server";
import { appendFile, mkdir } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

// repo-root / documentation / demo-requests.log — resolved from CWD which
// Next runs from the `web/` dir in dev and prod.
const LOG_PATH = path.resolve(process.cwd(), "..", "documentation", "demo-requests.log");

export async function POST(req: Request) {
  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "bad_email" }, { status: 400 });
  }

  const ua = req.headers.get("user-agent") ?? "-";
  const line = `${new Date().toISOString()}\t${email}\t${ua}\n`;

  try {
    await mkdir(path.dirname(LOG_PATH), { recursive: true });
    await appendFile(LOG_PATH, line, "utf8");
  } catch (e) {
    console.error("demo-request log write failed:", e);
    return NextResponse.json({ ok: false, error: "log_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
