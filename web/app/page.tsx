// Public splash / landing page at `/`.
//
// Adapted from Gemini's HTML structure. CDN Tailwind and Google Fonts are
// swapped for the project's existing Tailwind build + design tokens. Values
// in the "Live citation stream" panel are placeholders for now — wiring
// them to live DB values is a follow-up (see TODO below).
//
// Logged-in users never land here: middleware at /middleware.ts redirects
// `/` → `/overview` when a tb_session cookie is present.

import Link from "next/link";
import { DemoRequestForm } from "@/components/marketing/demo-request-form";

export default function SplashPage() {
  return (
    <div className="min-h-screen bg-tb-bg text-tb-text">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-tb-border px-6 py-5 md:px-10 md:py-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-sm bg-tb-blue" aria-hidden />
          <span className="text-lg font-bold uppercase tracking-tight">
            Trailblaze <span className="font-light text-tb-muted">Analytics</span>
          </span>
        </div>
        <nav className="hidden items-center gap-8 md:flex">
          <span className="cursor-default text-[10px] uppercase tracking-[0.2em] text-tb-muted">
            Markets
          </span>
          <span className="cursor-default text-[10px] uppercase tracking-[0.2em] text-tb-muted">
            Entities
          </span>
          <span className="cursor-default text-[10px] uppercase tracking-[0.2em] text-tb-muted">
            Methodology
          </span>
          <Link
            href="/login"
            className="text-[10px] uppercase tracking-[0.2em] text-tb-beacon hover:text-tb-text"
          >
            Terminal Login
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 py-20 text-center md:px-10 md:py-28">
          <h1 className="text-5xl font-bold tracking-tight md:text-7xl lg:text-8xl">
            RAW DATA.
            <br />
            <span className="text-tb-blue">CITED INTELLIGENCE.</span>
          </h1>
          <p className="mt-6 font-mono text-xs uppercase tracking-[0.25em] text-tb-muted md:text-sm">
            The primary-source terminal for iGaming executives.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <Link
              href="/login"
              className="border border-tb-blue px-6 py-3 text-[11px] uppercase tracking-[0.2em] text-tb-blue transition-all hover:bg-tb-blue hover:text-tb-bg hover:shadow-[0_0_20px_rgba(43,168,224,0.4)]"
            >
              Enter Terminal
            </Link>
            <a
              href="mailto:christian@trailblaze-marketing.com?subject=Trailblaze%20briefing%20request"
              className="px-6 py-3 text-[11px] uppercase tracking-[0.2em] text-tb-muted transition-colors hover:text-tb-text"
            >
              Book a Briefing
            </a>
          </div>
        </section>

        {/* Bento grid — info panels */}
        <section className="grid grid-cols-12 gap-px border-y border-tb-border bg-tb-border">
          <div className="col-span-12 bg-tb-bg p-8 md:col-span-4">
            <span className="mb-4 block font-mono text-[10px] uppercase tracking-wider text-tb-muted">
              Market Coverage
            </span>
            <div className="font-mono text-5xl leading-none text-tb-text">
              76<span className="ml-2 text-sm text-tb-blue">Jurisdictions</span>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-tb-muted">
              Full GGR transparency across US states, Latin America, and European
              regulated markets.
            </p>
          </div>

          <div className="col-span-12 bg-tb-bg p-8 md:col-span-8">
            <span className="mb-4 block font-mono text-[10px] uppercase tracking-wider text-tb-muted">
              Live Citation Stream
            </span>
            {/* TODO: wire to real metric_value_canonical rows once the splash
                gets a server-component pass (pulls from live DB on each
                render; for now the numbers are placeholders matching the
                Gemini mockup so design doesn't drift). */}
            <ul className="space-y-3">
              <CitationRow
                subject="DraftKings Inc."
                qualifier="Q3 Rev Estimate"
                value="$2.14B"
                source="SOURCE: 10-Q PG.14"
              />
              <CitationRow
                subject="Betsson AB"
                qualifier="CEECA Market Share"
                value="18.4%"
                source="SOURCE: ANALYST DAY"
              />
            </ul>
          </div>

          <div className="col-span-12 bg-tb-bg p-8 md:col-span-6">
            <h3 className="mb-4 text-lg font-bold uppercase tracking-tight text-tb-blue">
              Every number has a receipt.
            </h3>
            <p className="mb-6 text-sm leading-relaxed text-tb-muted">
              We ingest sellside research, regulator reports, and operator filings.
              Unlike black-box data providers, we show you the exact document and
              page where every data point originated.
            </p>
            <div className="rounded-sm border border-tb-border bg-tb-surface p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-tb-blue" aria-hidden />
                <span className="font-mono text-[10px] uppercase">
                  Beacon™ Estimates Active
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden bg-tb-border">
                <div className="h-full w-[88%] bg-tb-blue" />
              </div>
            </div>
          </div>

          <div className="col-span-12 bg-tb-bg p-8 md:col-span-6">
            <h3 className="mb-4 text-lg font-bold uppercase tracking-tight">
              Eliminate Spreadsheet Fatigue.
            </h3>
            <ul className="space-y-4 font-mono text-xs text-tb-muted">
              <li>[01] DAILY SELLSIDE INGESTION</li>
              <li>[02] CROSS-OPERATOR COMPARABLES</li>
              <li>[03] REGULATORY CHANGE LOGS</li>
              <li>[04] DOWNLOAD READY-TO-USE CSVs</li>
            </ul>
          </div>
        </section>

        {/* CTA: demo request */}
        <section className="px-6 py-24 text-center md:px-10 md:py-32">
          <h2 className="mb-8 text-3xl font-bold uppercase tracking-tight">
            Stop guessing. <span className="text-tb-blue">Start citing.</span>
          </h2>
          <DemoRequestForm />
        </section>
      </main>

      {/* Footer */}
      <footer className="flex flex-col items-center justify-between gap-4 border-t border-tb-border px-6 py-8 font-mono text-[10px] uppercase tracking-wider text-tb-muted md:flex-row md:px-10 md:py-10">
        <div>© 2026 Trailblaze Analytics · Built in Estepona</div>
        <div className="flex gap-6">
          <span className="cursor-default">Privacy</span>
          <span className="cursor-default">Methodology</span>
          <span className="cursor-default">Terms</span>
        </div>
      </footer>
    </div>
  );
}

function CitationRow({
  subject,
  qualifier,
  value,
  source,
}: {
  subject: string;
  qualifier: string;
  value: string;
  source: string;
}) {
  return (
    <li className="flex items-center justify-between border-b border-tb-border pb-2">
      <span className="text-xs">
        {subject} <span className="text-tb-muted">{qualifier}</span>
      </span>
      <span className="font-mono text-tb-blue">
        {value}
        <span className="ml-2 inline-block border border-tb-border px-1.5 py-0.5 text-[9px] text-tb-muted">
          {source}
        </span>
      </span>
    </li>
  );
}
