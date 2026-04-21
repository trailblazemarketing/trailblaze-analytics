import Link from "next/link";
import { TrailblazeLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function DeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="panel w-full max-w-md p-8">
        <div className="mb-6 flex items-center justify-between">
          <TrailblazeLogo />
          <span className="text-[10px] uppercase tracking-[0.18em] text-tb-danger">
            Access denied
          </span>
        </div>
        <h1 className="mb-1 text-lg font-semibold">Not on the allowlist</h1>
        <p className="mb-6 text-xs text-tb-muted">
          Your sign-in succeeded, but your email isn't authorized for this
          platform. Contact Andrew to request access.
        </p>
        <Button asChild variant="secondary">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    </main>
  );
}
