import { getSessionUser } from "@/lib/supabase/server";
import { ReportViewerProvider } from "@/components/reports/viewer-context";
import { AppShell } from "./app-shell";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  const email = user?.email ?? null;

  return (
    <ReportViewerProvider>
      <AppShell email={email}>{children}</AppShell>
    </ReportViewerProvider>
  );
}
