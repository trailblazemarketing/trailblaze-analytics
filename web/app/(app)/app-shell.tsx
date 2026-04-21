"use client";
import { useTransition } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { signOutAction } from "@/app/login/actions";

export function AppShell({
  email,
  children,
}: {
  email: string | null;
  children: React.ReactNode;
}) {
  const [, startTransition] = useTransition();
  return (
    <div className="flex min-h-screen flex-col bg-tb-bg">
      <AppHeader
        email={email}
        onSignOut={() => startTransition(() => signOutAction())}
      />
      <main className="flex-1 px-6 py-5">{children}</main>
    </div>
  );
}
