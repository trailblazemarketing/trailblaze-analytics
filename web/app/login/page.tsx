import { LoginForm } from "./login-form";
import { TrailblazeLogo } from "@/components/brand/logo";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string; redirect?: string };
}) {
  const supabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("REPLACE-ME");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="panel w-full max-w-md p-8">
        <div className="mb-6 flex items-center justify-between">
          <TrailblazeLogo />
          <span className="text-[10px] uppercase tracking-[0.18em] text-tb-muted">
            Sign in
          </span>
        </div>
        <h1 className="mb-1 text-lg font-semibold">
          Trailblaze Analytics Platform
        </h1>
        <p className="mb-6 text-xs text-tb-muted">
          Magic-link sign in. Access is restricted to allowlisted addresses.
        </p>

        {!supabaseConfigured ? (
          <div className="rounded-md border border-tb-beacon/40 bg-tb-beacon/10 p-3 text-xs text-tb-beacon">
            <strong className="font-semibold">Supabase not configured.</strong>{" "}
            Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
            <code className="font-mono">web/.env.local</code> and restart.
          </div>
        ) : (
          <LoginForm
            sent={searchParams.sent === "1"}
            error={searchParams.error}
            redirect={searchParams.redirect}
          />
        )}
      </div>
    </main>
  );
}
