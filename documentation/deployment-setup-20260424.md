# Deployment setup — 2026-04-24

Production gate stood up: GitHub → Vercel + Neon. Custom domain pending
DNS propagation.

## Phase 0 — Pre-flight

* `.gitignore` tightened: `.env.*` (with `!.env.example`), repo-root
  `.next/` + `node_modules/`, `documentation/demo-requests.log`.
* `.env.example` rewritten — every var the code reads via `os.getenv`,
  pydantic `Field(alias=…)`, or `process.env.*` documented, with
  Python-vs-Node scheme notes for DATABASE_URL.
* Secrets scan clean: only env-var references and localhost-fallback
  defaults in tracked code.
* DB backup: `backups/pre-deploy-20260424-144744.dump` (custom format,
  3.0 MB). Row counts at backup: metric_values 21154, reports 175,
  entities 575, metric_value_canonical 12906, metric_narratives 70,
  fx_rates 224718, users 4.
* Commit: `c1f6ea9` Docs: .env.example + gitignore hygiene before GitHub push

## Phase 1 — GitHub push

* Repo: <https://github.com/trailblazemarketing/trailblaze-analytics>
  (private)
* `git remote add origin …` + `git push -u origin main` →
  168 commits pushed (all main history preserved; rejected GitHub's
  `git init` + "first commit" quickstart).

## Phase 2 — Neon

* Project: `trailblaze-analytics`, region `eu-central-1` (Frankfurt),
  Postgres 16.12.
* Alembic upgrade failed mid-chain at 0006 (`fx_rates` table referenced
  by the matview but seeded outside alembic). Switched to
  single-shot `pg_restore --no-owner --no-acl --clean --if-exists`
  from the Phase-0 dump. Clean restore, exit 0.
* Post-restore row counts on Neon **match local exactly** across all 8
  probed tables (including metric_value_canonical and user_sessions_log).
* Alembic head: `0010`.
* No Neon connection string or password committed to git.

## Phase 3 — Vercel

* Project: `trailblaze-analytics`
* Root directory: `web`
* Framework: Next.js 14.2.18 → 14.2.35 during deploy chase
* Env vars on Vercel (Production + Preview + Development scopes):
  `DATABASE_URL`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`,
  `NEXT_PUBLIC_SITE_URL`
* Production URL: <https://trailblaze-analytics.vercel.app>

### Deploy-chase chronology (five pushes)

| Commit | What it tried | Why it failed |
|---|---|---|
| `3f1ac48` | Bump Next 14.2.18 → 14.2.35 (also addresses npm security advisory) | Runtime still 500'd with `ReferenceError: __dirname is not defined` on every request |
| `3aa042a` | Runtime `globalThis.__dirname = "/"` polyfill at top of `middleware.ts` | ES imports evaluate before user code — the polyfill never fired before the crash |
| `1ac7cf2` | Webpack DefinePlugin to substitute `__dirname` → `"/"` at compile time for the Edge bundle | `ua-parser-js` (the source of the `__dirname` reference) lives inside `next/dist/compiled/`, pre-compiled by Next before user webpack config runs. DefinePlugin couldn't intercept. |
| `3a97849` | **Option A (the one that worked)**: delete `middleware.ts` entirely; move auth-gate into `app/(app)/layout.tsx` + a new `app/(app)/admin/layout.tsx`; splash redirects logged-in users server-side; unguarded `/api/*` routes (`/api/narratives`, `/api/reports/[id]/{meta,pdf}`, `/api/search`) each got an inline `getSessionUser()` check | No more middleware chunk to crash. Build green. |
| `a3fa254` | Add explicit `ssl: { rejectUnauthorized: false }` to the pg Pool for non-localhost connection strings | Neon + node-postgres don't reliably honour `sslmode=require` in the URL alone |

### Environment-variable debugging

After `a3fa254` login still 500'd with `ENOTFOUND ep-square-mouse-allzbtrw.c-3.eu-central-1.aws.neon.t\n  ech`.
Cause: the `DATABASE_URL` value pasted into Vercel had a literal
newline + indent in the middle of the hostname (Vercel's UI wrapped
the long string and the paste preserved the wrap). Fix: re-paste as
plain-text into the env-var textarea, verify the whitespace-warning
triangle was gone, redeploy.

### Final ship gate (vs production alias)

| Check | Result |
|---|---|
| `GET /` | 200 (splash) |
| `GET /login` | 200 |
| `GET /overview` (no cookie) | 307 → `/login` |
| `POST /api/auth/login` admin/0000 | 200 + `tb_session` cookie (HttpOnly, Secure, SameSite=lax, 30d) + `tb_role=admin` cookie |

**Production works.**

## Phase 4 — Custom domain

* Added `insight.trailblaze-marketing.com` in Vercel → Settings →
  Domains.
* CNAME target: `00d4b33298080ce4.vercel-dns-017.com.`
* Handed to developer for Cloudflare record creation. Cloudflare proxy
  status MUST be DNS-only (grey cloud) — Vercel provisions its own
  TLS cert.
* Verification plan once developer confirms:
  ```
  nslookup insight.trailblaze-marketing.com
  curl -s -o /dev/null -w "%{http_code}\n" https://insight.trailblaze-marketing.com/
  ```

## Deferred / TODO

1. **Rotate Neon password.** `npg_j9FibDeXNv3h` appeared in chat
   history. Neon dashboard → project → Settings → Reset password →
   update Vercel `DATABASE_URL`. Old password invalidates instantly.
2. **Custom domain DNS propagation.** Awaiting developer.
3. **Middleware restoration on Next 15.** Option A auth-gates at the
   server-component layout level instead of Edge middleware. Works but
   adds a small DB round-trip per page render. Flagged as Workstream 1
   deliverable: `ua-parser-js` got swapped for an Edge-safe detector
   in Next 15 — once migrated, restore `middleware.ts` and drop the
   layout-level checks.
4. **Profile picture uploads.** `public/uploads/profile-pictures/`
   writes don't persist on Vercel serverless — files vanish between
   deploys. Need object storage (Cloudflare R2 / S3 / Vercel Blob)
   before profile pictures are usable on prod.
5. **Python backend on Vercel.** Parser + Beacon + narrative extractor
   all run locally, writing to Neon. Vercel's Python runtime wasn't
   configured for this repo and isn't needed for the Next.js surface.
   Document the pattern — analysts run ingest locally, prod reads from
   Neon.
6. **Gmail scraping credentials.** `GMAIL_CREDENTIALS_PATH` + the
   `secrets/gmail-*.json` files are local-only. The Gmail-ingest CLI
   runs only on Andrew's machine.
7. **Next.js security advisory.** 14.2.18 had one; bumped to 14.2.35
   which is patched. Keep an eye on future advisories — `npm audit`
   periodically.

## Commits in this session

```
a3fa254 Deploy: enable TLS in the pg pool for non-localhost DATABASE_URL
3a97849 Deploy Option A: delete middleware, auth-gate at layout level
1ac7cf2 Deploy: replace runtime polyfill with webpack DefinePlugin for Edge
3aa042a Deploy: polyfill __dirname in middleware for Vercel Edge runtime
3f1ac48 Deploy: bump Next.js 14.2.18 → 14.2.35 to fix middleware Edge runtime crash
c1f6ea9 Docs: .env.example + gitignore hygiene before GitHub push
```
