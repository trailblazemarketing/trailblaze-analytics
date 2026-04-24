import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { queryOne } from "@/lib/db";

// Admin-only gate for /admin and /admin/analytics. Non-admins (or
// unauthenticated users the outer (app) layout missed) land on
// /overview. Admin API routes under /api/admin/* already re-verify
// role from the DB per-request.

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const row = await queryOne<{ role: string }>(
    `SELECT role FROM users WHERE id = $1`,
    [session.userId],
  );
  if (row?.role !== "admin") redirect("/overview");

  return <>{children}</>;
}
