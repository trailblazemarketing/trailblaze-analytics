"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TrailblazeLogo } from "@/components/brand/logo";
import { Omnibox } from "@/components/search/omnibox";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/overview", label: "Overview", match: (p: string) => p === "/overview" },
  {
    href: "/markets",
    label: "Markets",
    match: (p: string) => p.startsWith("/markets"),
  },
  {
    href: "/companies",
    label: "Companies",
    match: (p: string) => p.startsWith("/companies"),
  },
  {
    href: "/operators",
    label: "Operators",
    match: (p: string) => p.startsWith("/operators"),
  },
  {
    href: "/reports",
    label: "Reports",
    match: (p: string) => p.startsWith("/reports"),
  },
  {
    href: "/methodology",
    label: "Methodology",
    match: (p: string) => p.startsWith("/methodology"),
  },
];

export function AppHeader({
  username,
  onSignOut,
}: {
  username: string | null;
  onSignOut: () => void;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-4 border-b border-tb-border bg-tb-bg/90 px-4 backdrop-blur">
      <Link href="/overview" className="shrink-0">
        <TrailblazeLogo />
      </Link>
      <nav className="ml-2 flex items-center gap-0.5">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "relative px-3 py-2 text-[11px] font-medium transition-colors",
                active ? "text-tb-text" : "text-tb-muted hover:text-tb-text",
              )}
            >
              {t.label}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 bg-tb-blue" />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto w-full max-w-md">
        <Omnibox />
      </div>
      <div className="flex shrink-0 items-center gap-2 font-mono text-[10px] text-tb-muted">
        {username && (
          <span className="truncate text-tb-muted">{username}</span>
        )}
        <span aria-hidden>·</span>
        <button
          onClick={onSignOut}
          className="text-tb-muted hover:text-tb-text"
        >
          sign out
        </button>
      </div>
    </header>
  );
}
