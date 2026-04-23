import { getSessionUser } from "@/lib/auth/session";
import { ReportViewerProvider } from "@/components/reports/viewer-context";
import { AppShell } from "./app-shell";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  const username = user?.username ?? null;

  return (
    <ReportViewerProvider>
      <AppShell username={username}>{children}</AppShell>
    </ReportViewerProvider>
  );
}
