import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { queryOne } from "@/lib/db";
import { ReportViewerProvider } from "@/components/reports/viewer-context";
import { AppShell } from "./app-shell";

// Auth gate for everything under (app): /overview, /companies, /markets,
// /operators, /affiliates, /reports, /methodology, /profile, /admin.
// Previously handled in middleware.ts — moved here when middleware was
// dropped due to a Next 14.2.x Edge-runtime ua-parser-js crash on
// Vercel. Workstream 1 will re-add edge middleware once Next 15 lands.

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();
  if (!session) {
    // Session missing or expired — gate the entire (app) tree.
    redirect("/login");
  }

  // DB-authoritative role lookup — feeds both the Admin link visibility
  // in the header and the admin layout's secondary gate.
  const row = await queryOne<{ role: string }>(
    `SELECT role FROM users WHERE id = $1`,
    [session.userId],
  );
  const role = row?.role ?? "user";

  return (
    <ReportViewerProvider>
      <AppShell username={session.username} role={role}>
        {children}
      </AppShell>
    </ReportViewerProvider>
  );
}
