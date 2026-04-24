import { getSessionUser } from "@/lib/auth/session";
import { queryOne } from "@/lib/db";
import { ReportViewerProvider } from "@/components/reports/viewer-context";
import { AppShell } from "./app-shell";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();
  let username: string | null = null;
  let role: string | null = null;
  if (session) {
    username = session.username;
    // DB-authoritative role lookup — the tb_role cookie is a middleware
    // hint only; UI chrome (admin link visibility) should reflect the
    // actual row.
    const row = await queryOne<{ role: string }>(
      `SELECT role FROM users WHERE id = $1`,
      [session.userId],
    );
    role = row?.role ?? "user";
  }

  return (
    <ReportViewerProvider>
      <AppShell username={username} role={role}>{children}</AppShell>
    </ReportViewerProvider>
  );
}
