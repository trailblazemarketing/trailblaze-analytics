# Trailblaze Analytics — Web

Dark-mode dashboard for the Trailblaze Analytics Platform. Next.js 14 App
Router, TypeScript, Tailwind, shadcn-style UI primitives, Recharts. Reads
directly from the local Postgres that the Python parser writes into.

## Run locally

```bash
cd web
cp .env.local.example .env.local   # already seeded with local Postgres creds
npm install
npm run dev
# → http://localhost:3000
```

### Environment variables

| var                              | what                                                   |
| -------------------------------- | ------------------------------------------------------ |
| `DATABASE_URL`                   | Postgres connection string. Defaults to local dev DB.  |
| `NEXT_PUBLIC_SUPABASE_URL`       | Supabase project URL — needed for magic-link login.    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Supabase anon key.                                     |
| `NEXT_PUBLIC_SITE_URL`           | Public URL for callback redirects. Default localhost.  |

If Supabase env vars are unset, the app **skips** auth gating and the login
page shows a configuration notice. This keeps the UI usable while Supabase is
being set up.

## Auth & allowlist

Magic-link sign-in via Supabase. The email allowlist is hardcoded in
`lib/auth/allowlist.ts`. To add more emails, append to the `ALLOWED_EMAILS`
set — the TODO comment in that file also describes how to migrate to an env
var or DB table.

The allowlist is enforced in three places:

1. Pre-send in the server action (`app/login/actions.ts`)
2. Post-callback in `/auth/callback` (signs the user out if denied)
3. On every request in `middleware.ts`

## Branding / design tokens

Brand CSS variables live in `app/globals.css` and are exposed to Tailwind as
`tb-blue`, `tb-purple`, `tb-beacon`, `tb-success`, etc. `--tb-beacon`
(`#F59E0B`) is reserved for anything Trailblaze Beacon™ — dotted chart lines,
™ superscripts, methodology hover badges.

## Structure

```
web/
├── app/
│   ├── (app)/                 — authenticated shell (sidebar + topbar)
│   │   ├── page.tsx           — home: stats, recent reports, discrepancies
│   │   ├── markets/           — index, [slug], compare
│   │   ├── companies/         — index, [slug], compare
│   │   ├── reports/           — index, [id]
│   │   └── methodology/       — Beacon™ methodology (placeholder copy)
│   ├── login/                 — magic-link form + server action
│   ├── auth/callback/         — Supabase OTP exchange + allowlist gate
│   ├── auth/denied/           — shown to non-allowlisted users
│   └── api/search/            — omnibox JSON endpoint
├── components/
│   ├── ui/                    — button, input, card, table, tabs, etc.
│   ├── layout/                — sidebar, topbar
│   ├── search/omnibox.tsx     — ⌘K omnibox
│   ├── beacon/value-cell.tsx  — Beacon™ value renderer + hover card
│   ├── charts/metric-timeseries.tsx
│   └── brand/logo.tsx
└── lib/
    ├── db.ts                  — pg pool (singleton)
    ├── supabase/              — server + browser + middleware clients
    ├── auth/allowlist.ts
    ├── queries/               — markets.ts, companies.ts, reports.ts, search.ts
    ├── types.ts               — shared DB row types
    ├── format.ts              — value formatting (currency, %, etc.)
    └── pivot.ts               — timeseries pivot helper
```

## DB access

All server queries go through `lib/db.ts` (`pg` pool, stashed on globalThis so
Next.js hot-reload doesn't leak connections). Reads happen in Server
Components — no client-side DB access. The canonical-value materialized view
(`metric_value_canonical`) is the default read target; per-source detail
pulls from `metric_values` directly when needed.

## Beacon™ treatment

Where `disclosure_status in ('beacon_estimate','derived')`:

- `<ValueCell />` renders the formatted number with an orange `™` superscript
  and a hover card pulling `methodology_code`, `methodology_notes`, and
  `confidence_score` from `beacon_estimates`. It deep-links to
  `/methodology#<methodology_code>`.
- Charts dot the line segments (per-point colored dots; whole-line dashed
  when the entire series is Beacon™).
- `not_disclosed` values render as em-dash — deliberately visible, not hidden.

## Next up

1. Have Andrew create the Supabase project and paste creds into `.env.local`.
2. Replace the placeholder methodology copy in `app/(app)/methodology/page.tsx`.
3. Tune `--tb-blue` to the exact brand hex once rendered in-browser.
