// Demo-grade auth gate.
//
// Checks the `tb_session` cookie's presence (not its DB validity — that's
// verified in server components via lib/auth/session.ts). Cookie expiry is
// enforced client-side by the cookie's own `expires` attribute; tampering
// is caught at render time when getSessionUser hits the DB.
//
// Public:
//   /                   — splash for logged-out users; redirects to
//                         /overview for logged-in users
//   /login              — sign-in form
//   /api/auth/*         — login/logout/me
//   /api/demo-request   — splash email capture
//   /auth/*             — Supabase scaffolding (Phase 7 target), left
//                         accessible so the migration path later is clean
//
// Gated (require tb_session):
//   /overview, /companies/*, /markets/*, /operators, /reports/*,
//   /methodology — the (app) group
//   all other /api/* endpoints
//
// Supabase (Phase 7) replaces this whole file.

import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "tb_session";
const ROLE_COOKIE = "tb_role";

// Path-prefix shortcuts (starts-with matches).
const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/demo-request",
  "/auth/", // legacy Supabase callbacks
];

const GATED_PREFIXES = [
  "/overview",
  "/companies",
  "/markets",
  "/operators",
  "/affiliates",
  "/reports",
  "/methodology",
  "/profile",
];

// /admin and /api/admin additionally require role='admin'. The role is
// inferred from the tb_role cookie set at login. The cookie is a
// middleware-cheap hint only — every admin API route re-verifies role
// via the DB so a spoofed cookie can't actually access admin data.
const ADMIN_PREFIXES = ["/admin", "/api/admin"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;

  // Always-public prefixes (auth endpoints, demo capture, Supabase callbacks).
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // `/` — splash for logged-out; redirect to /overview for logged-in.
  if (pathname === "/") {
    if (hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = "/overview";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // `/login` — accessible either way (logged-in users can reach it, harmless).
  if (pathname === "/login") return NextResponse.next();

  // Gated (app) routes + all other API routes.
  const isGatedApp = GATED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const isGatedApi = pathname.startsWith("/api/");

  if ((isGatedApp || isGatedApi) && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    if (!isGatedApi) url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Admin-only prefixes. Non-admin users (or users with a missing role
  // cookie) are 302'd to /overview for page routes and 403'd for API
  // routes. The admin API itself re-verifies against the DB.
  const isAdminRoute = ADMIN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isAdminRoute) {
    const role = req.cookies.get(ROLE_COOKIE)?.value;
    if (role !== "admin") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { ok: false, error: "forbidden" },
          { status: 403 },
        );
      }
      const url = req.nextUrl.clone();
      url.pathname = "/overview";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Same as before — skip Next internals + static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)).*)",
  ],
};
