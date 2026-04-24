"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";

export function AppShell({
  username,
  role,
  children,
}: {
  username: string | null;
  role: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    startTransition(() => {
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-tb-bg">
      <AppHeader username={username} role={role} onSignOut={signOut} />
      <main className="flex-1 px-6 py-3">{children}</main>
    </div>
  );
}
